# OSS 文件上传约定

新工程的文件统一走“浏览器经 Web SDK 直传 OSS → 业务接口按 `fileId` 绑定”。**写入哪个 OSS 配置、对象键、ACL 一律由服务端决定**，前端只声明用途 `purpose`，不得配置或拼接 `ossConfigCode`、桶前缀、对象键。

## 1. 角色分工

| 层 | 职责 |
| --- | --- |
| `sys_oss_config`（`OssConfigService`） | OSS 连接配置（端点、桶、凭证、域名），按 `code` 管理；只在服务端使用 |
| `OssStorageSettingService` | 默认 OSS 选择、根前缀、版本更新与安全业务路径拼接；由后台动态配置 |
| `OssUploadPolicy`（消费工程实现） | 按 `purpose` + 上传人决定 `{ ossConfigCode, key, acl?, meta? }`，校验用途与权限 |
| `MultipartUploadService` | 创建 `sys_file` 上传任务、签名直传 / 分片、回调核对对象、续传 |
| Web SDK（`@qyy-code-lego/nestjs/web/oss`） | 浏览器计算 MD5、直传或分片、回调；只传 `file` + `purpose` |
| 业务接口 | 接收 `fileId`，校验文件（存在、已完成、上传人、`meta.uploadPurpose`），建立业务关联 |

## 2. 服务端：注册上传策略

```typescript
@Injectable()
export class AppUploadPolicy extends OssUploadPolicy {
  constructor(private readonly storage: OssStorageSettingService) {
    super();
  }

  async resolve(input: OssUploadPolicyInput): Promise<OssUploadTarget> {
    const rule = PURPOSES[input.purpose ?? ''];
    if (!rule) throw new BizError('不支持的上传用途').codeAs(400);
    const ext = extOf(input.filename);
    const target = await this.storage.resolvePath(`${rule.dir}/${yyyyMM()}/${randomUUID()}.${ext}`);
    return {
      ossConfigCode: target.ossConfigCode,
      key: target.key,
      acl: rule.acl,
    };
  }
}

@Module({
  imports: [CoreFileManagementModule, S3StorageModule, OssStorageSettingModule],
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

## 默认存储与根前缀（框架统一管理）

`OssStorageSettingModule` 提供纯服务；使用框架后台身份时可显式导入 `OssStorageAdminModule`。二者均为可选模块，现有 `CoreFileManagementModule` / `SharedFileUploadModule` 不自动启用此功能，不新增控制器或查询运行时配置。显式导入后，该 app 共享同一存储配置服务。无需每个项目再写存储选择配置服务，也无需 `OSS_CONFIG_CODE` / `OSS_KEY_PREFIX` env。

- `GET /file-storage`：`{ ossConfigCode: string | null, keyPrefix: string, version: number }`，权限 `oss-config:list`。
- `PUT /file-storage`：`{ ossConfigCode, keyPrefix?, version }`，权限 `oss-config:update`；限定 `OP_USER`，返回更新后完整对象。
- 默认目标保存于 `sys_runtime_config` 的 `file.storage`，同库跨 app 共享缓存，不含密钥；连接与凭据仍在 `sys_oss_config`。不需要新增表或 DDL。
- 首次未设置时返回 `{ ossConfigCode: null, keyPrefix: '', version: 0 }`。必须由管理员选择 OSS 后才能上传，否则返回 503；不自动选第一个桶，不读取旧 env，也不回退本地磁盘。
- `keyPrefix` 非必填：首次保存省略时默认为空，`resolvePath` 原样返回业务子路径，不添加斜线或目录；更新时省略则保留现有值，显式传空串可关闭前缀。非空根前缀最多 64 字符，只允许字母、数字、下划线、中划线组成的目录段；首尾斜线、重复斜线、点路径均拒绝。
- 版本是数据库记录版本；PostgreSQL 事务锁覆盖首次创建与更新，同版本并发修改仅一方成功，其余返回 409。停用后禁止上传，重新保存后启用。
- 策略使用 `resolvePath(serverGeneratedBusinessPath)` 返回 `{ ossConfigCode, keyPrefix, key }`；例如后台配置 `my-project/prod`，业务传 `avatars/202610/<uuid>.png`，最终得到 `my-project/prod/avatars/202610/<uuid>.png`。禁止将客户端路径直接传入；路径拒绝绝对路径、空段、反斜线、编码穿越及 `.` / `..` 段。
- 每条 `sys_file` 保留实际 `ossConfigCode` / 对象键；切换默认配置只影响新任务，续传、完成和读取必须使用原任务快照。使用框架 `OssConfigService` 时不能删除当前选中的配置，含软删除文件记录的配置也不能删除。
- `keyPrefix` 不修改远端桶策略或 ACL。若远端按前缀开放读取，应先配置对应策略，再修改后台前缀；公开读取、CORS、CDN 及探测由部署与业务策略处理。

采用自定义鉴权和审计的工程可只导入纯服务模块，在薄控制器检查本工程权限后调用服务；不导入默认管理控制器。`set(input, { manager, actor })` 接收已有事务管理器，可将审计放在同一事务；**外部事务提交后必须调用 `invalidate()`**，处理事务期间读方回填旧值的情况。独立调用 `set` 自行管理事务与提交后失效。

旧工程若已有运行时配置项，可用 `OssStorageSettingModule.forRoot({ configCode: 'existing-storage-code' })` 保留原值和版本；这只是配置项名称兼容，不是 OSS code 或前缀的代码默认值。同一 app 对此模块只选择一种注册方式；使用该兼容模式时采用自定义管理控制器，不再同时导入默认 `OssStorageAdminModule`，避免两套服务指向不同配置项。项目特有的环境前缀隔离、业务权限、内容校验及审计仍留在消费工程。

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

兼容边界：未导入新模块的旧工程继续按原 `OssUploadPolicy`（或过渡期旧上传模式）运行，不会自动读取/覆盖旧 env，也不会给 `S3StorageService` 的对象键追加前缀。只有调用新的 `resolvePath` 才进行可选的根目录拼接。
