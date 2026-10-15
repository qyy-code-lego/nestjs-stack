# OSS Web SDK

本库是纯浏览器 TypeScript SDK，仅依赖 `fetch`、`File`、`Blob`、
`AbortController` 等 Web 标准。NestJS 后端不会引用本库，前端可通过
`@qyy-code-lego/nestjs/web/oss` 直接引用源码并交给自身构建器打包。

> **存储位置由服务端决定。** 服务端注册 `OssUploadPolicy` 后，前端只传 `purpose`，
> 不要在前端配置或拼接 `ossConfigCode`、桶前缀、对象键。约定见
> [docs/development/oss-upload.md](../../docs/development/oss-upload.md)。下文示例均为策略模式；
> `key` / `ossConfigCode` 参数仅为未注册策略的旧工程保留（已废弃）。

## 普通直传与访问链接

```typescript
import { OssWebSdk } from '@qyy-code-lego/nestjs/web/oss';

const sdk = new OssWebSdk({
  baseUrl: '/api/v1',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
  multipartThreshold: 20 * 1024 * 1024,
});

const record = await sdk.upload({ file, purpose: 'attachment' });

const accessUrl = await sdk.getAccessUrl({
  fileId: record.id,
  expiresIn: 600,
});
```

`upload` 会先创建未完成的 `sys_file` 上传任务，再取得绑定文件大小和
`Content-MD5` 的 PUT 地址。直传完成后 SDK 自动调用 `/files/oss/callback`，
后端通过 `HeadObject` 核对对象大小，并以 OSS 返回的 MIME 和访问地址完成
建档。对象键由服务端策略生成；同一上传人对同一内容（hash + 大小 + 用途）的
未完成任务会被复用以续传。

## 自动选择直传或分片

`createUploadProcess` 默认使用 `auto` 策略：文件大小达到阈值时使用 multipart，
低于阈值时使用普通 PUT 直传。SDK 默认阈值为 10 MiB，也可以在 SDK 全局或
单次 Process 中覆盖；单次配置优先级更高。

```typescript
const process = sdk.createUploadProcess({
  file,
  purpose: 'video',
  multipartThreshold: 50 * 1024 * 1024,
  concurrency: 4,
  retries: 2,
  signal: abortController.signal,
  onProgress: ({ percent }) => console.log(percent),
  onError: console.error,
});

console.log(process.mode); // direct 或 multipart

const resultPromise = process.start();
// 上传进入 uploading 状态后可调用 process.pause()，随后 await process.resume()
// await process.stop(); // 主动终止并清理 OSS 服务端分片
const result = await resultPromise;
```

需要绕过自动判断时，可显式设置 `uploadMode: 'direct'` 或
`uploadMode: 'multipart'`。直传模式没有可续传的 Part；调用 `pause()` 会中断
当前 PUT，`resume()` 后从头重传该文件。分片模式则只重传尚未完成的 Part。

也可以直接实例化流程并替换适配器。未提供 `directUpload` 时，
`FileUploadProcess` 保持原有行为并始终使用 multipart：

```typescript
import {
  FileUploadProcess,
  S3MultipartUploadAdapter,
} from '@qyy-code-lego/nestjs/web/oss';

const process = new FileUploadProcess({
  file,
  purpose: 'video',
  adapter: new S3MultipartUploadAdapter({ client: sdk.client }),
});
```

`start()` 返回的 Promise 会持续到上传最终完成；暂停不会让它提前结束。
重新调用 init 时，后端依据“上传人 + hash + 大小 + 用途”找到未完成任务并返回已上传分片。
SDK 默认 hash 会组合文件元信息及首部、中部、尾部内容样本，避免用户误选
同名同大小文件后拼接旧分片；要求全文件强一致或跨重命名续传时，可注入
增量 MD5/SHA 实现作为 `hashProvider`。

默认适配器会为普通直传和每个分片计算 `Content-MD5`。MD5 会同时参与预签名
和 PUT 请求，OSS/S3 在接收时校验传输内容；服务端在 Complete 前核对分片
编号、分片大小和总文件大小，完成后再次通过 `HeadObject` 核对对象大小。

`fetch` 没有标准的请求体上传进度事件，因此默认 S3 适配器在每个分片完成
后更新进度，而不是报告单个 PUT 内部的字节进度。若需要更细粒度进度，可
实现 `MultipartUploadAdapter` 替换默认适配器。

## 配套后端接口

| 接口                                  | 作用                           |
| ------------------------------------- | ------------------------------ |
| `POST /files/oss/sign/put`            | 获取普通 PUT 直传地址          |
| `POST /files/oss/sign/get`            | 获取对象访问地址               |
| `POST /files/oss/callback`            | 校验对象并保存 `sys_file` 映射 |
| `POST /files/oss/multipart/init`      | 初始化或恢复分片任务           |
| `POST /files/oss/multipart/sign-part` | 获取单个分片的 PUT 地址        |
| `POST /files/oss/multipart/complete`  | 服务端核对分片、合并并完成映射 |
| `POST /files/oss/multipart/abort`     | 主动终止并清理服务端分片       |

所有路径都可通过 `OssWebSdkOptions.endpoints` 覆盖，以适配不同项目的
Controller 路由。

## OSS CORS 要求

Bucket 必须允许前端来源执行 `PUT`，允许请求头至少包含
`Content-Type`、`Content-MD5`，并暴露响应头 `ETag`。后端 API 域名也需要允许前端来源
访问。预签名 URL 过期后，流程会按 `retries` 重新请求签名。
