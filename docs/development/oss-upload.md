# OSS 文件上传约定

新工程的文件统一走“浏览器经 Web SDK 直传 OSS → 业务接口按 `fileId` 绑定”。**写入哪个 OSS 配置、对象键、ACL 一律由服务端决定**，前端只声明用途 `purpose`，不得配置或拼接 `ossConfigCode`、桶前缀、对象键。

## 1. 角色分工

| 层 | 职责 |
| --- | --- |
| `sys_oss_config`（`OssConfigService`） | OSS 连接配置（端点、桶、凭证、域名），按 `code` 管理；只在服务端使用 |
| `OssUploadPolicy`（消费工程实现） | 按 `purpose` + 上传人决定 `{ ossConfigCode, key, acl?, meta? }`，校验用途与权限 |
| `MultipartUploadService` | 创建 `sys_file` 上传任务、签名直传 / 分片、回调核对对象、续传 |
| Web SDK（`@qyy-code-lego/nestjs/web/oss`） | 浏览器计算 MD5、直传或分片、回调；只传 `file` + `purpose` |
| 业务接口 | 接收 `fileId`，校验文件（存在、已完成、上传人、`meta.uploadPurpose`），建立业务关联 |

## 2. 服务端：注册上传策略

```typescript
@Injectable()
export class AppUploadPolicy extends OssUploadPolicy {
  constructor(private readonly runtimeConfig: RuntimeConfigService) {
    super();
  }

  async resolve(input: OssUploadPolicyInput): Promise<OssUploadTarget> {
    const rule = PURPOSES[input.purpose ?? ''];
    if (!rule) throw new BizError('不支持的上传用途').codeAs(400);
    // 存储选择建议放运行时配置（跨 app 共享缓存），不要写死在 env 或前端
    const { ossConfigCode, keyPrefix } = await this.storageSetting();
    const ext = extOf(input.filename);
    return {
      ossConfigCode,
      key: `${keyPrefix}/${rule.dir}/${yyyyMM()}/${randomUUID()}.${ext}`,
      acl: rule.acl,
    };
  }
}

@Module({
  imports: [CoreFileManagementModule, S3StorageModule],
  providers: [
    MultipartUploadService,
    { provide: OssUploadPolicy, useClass: AppUploadPolicy },
  ],
})
export class AppUploadModule {}
```

注册策略后：

1. `POST /files/oss/sign/put`、`POST /files/oss/multipart/init` 只接受 `purpose`；请求带 `ossConfigCode`、`key`、`acl`、`domain` 返回 400。
2. 上传任务的 `meta.uploadPurpose` 由框架写入（覆盖客户端同名字段），业务绑定时据此校验用途。
3. 续传：同一上传人 + 同一 `hash` + 同一大小 + 同一用途的未完成任务会被复用（对象键、分片），不会生成新对象。
4. 对象键必须含随机段（如 UUID），不要用原始文件名，避免冲突与路径注入。

控制器可直接挂载 `SharedFileUploadModule` 的 `FileController`（框架身份体系），也可由工程按自己的鉴权写薄控制器调用 `MultipartUploadService`；路由保持 SDK 默认路径（见 `libs/web/README.md`）即可零配置对接。

## 3. 前端：只传 purpose

```typescript
const sdk = new OssWebSdk({ baseUrl: '/api/client', headers: () => authHeaders() });

const record = await sdk.upload({ file, purpose: 'file' });           // 小文件
const process = sdk.createUploadProcess({ file, purpose: 'file' });   // 自动直传 / 分片、可暂停续传
const result = await process.start();

await bindMaterial({ fileId: record.id });                           // 业务接口按 fileId 绑定
```

前端工程通过 tsconfig `paths` 与 vite `alias` 把 `@qyy-code-lego/nestjs/web/oss` 指向子模块源码 `libs/web/src/oss`，不要复制源码。

## 4. 业务绑定接口

1. 只接收 `fileId`，不接收 URL 或对象键。
2. 校验 `completed`、`storageType = 'oss'`、`createdBy`（普通用户只能绑定自己上传的文件）、`meta.uploadPurpose`。
3. 内容类型以服务端读取的字节为准（可只读前若干 KiB 识别媒体类型），不要信任前端的 `contentType`。
4. 业务表只存 `fileId`，返回时用 `FileService.translateIds` 翻译地址。

## 5. 旧模式（已废弃）

未注册 `OssUploadPolicy` 时，SDK 仍可传 `ossConfigCode` + `key`，由客户端决定存储位置。该模式让前端掌握桶结构和配置 code，且客户端可写任意路径，仅为已有工程过渡保留；迁移步骤：

1. 服务端实现并注册 `OssUploadPolicy`，把原前端常量（配置 code、根前缀、目录）移入策略。
2. 前端改为只传 `purpose`，删除 `VITE_OSS_CONFIG_CODE` 一类配置与 key 拼接逻辑。
3. 服务端返回 key / 配置 code 给前端再上传的接口（如“申请上传路径”）一并删除。

## 6. 桶配置要求

Bucket CORS 允许前端来源 `PUT`，请求头至少 `Content-Type`、`Content-MD5`，暴露 `ETag`。对象级 ACL 由策略返回的 `acl` 决定，记录在上传任务的 `meta.uploadAcl`，直传回调或分片合并完成后由服务端调用 `S3StorageService.setObjectAcl` 设置（预签名 URL 中的 ACL 会被提升为查询参数，阿里云 OSS 等 S3 兼容服务不识别，不能依赖）。
