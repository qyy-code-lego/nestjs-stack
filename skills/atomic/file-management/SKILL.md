---
name: file-management
description: 文件存储约定——OSS 文件由浏览器经 Web SDK 直传、服务端 OssUploadPolicy 决定配置 / 对象键 / ACL，前端只传 purpose；本地存储用 LocalUploadService；接口返回时用 FileService.translateIds 翻译文件 ID。
type: atomic
tags: [file, upload]
when_to_use: 关键词 — file, upload, oss, 直传, OssUploadPolicy, OssWebSdk, ossConfigCode, LocalUploadService, FileService, translateIds, sys_file
---


# 文件上传与管理

## OSS 直传（新工程默认）

**存储位置只由服务端决定**：实现并注册 `OssUploadPolicy`（`@qyy-code-lego/nestjs/common`），按 `purpose` 返回 `{ ossConfigCode, key, acl?, meta? }`；前端 `OssWebSdk.upload({ file, purpose })` 直传，业务接口只收 `fileId`。禁止前端配置 / 拼接 `ossConfigCode`、桶前缀、对象键（`VITE_OSS_CONFIG_CODE` 一类做法已废弃）。OSS 配置写 `sys_oss_config`，存储选择放运行时配置。完整约定见 `docs/development/oss-upload.md`。

| 服务 | 职责 |
| - | - |
| `OssUploadPolicy` | 工程实现：用途校验、配置 / 对象键 / ACL |
| `MultipartUploadService` | 直传签名、分片、回调核对、续传（按上传人 + hash + 大小 + 用途） |
| `S3StorageService` | 服务端读写对象（`uploadObject` / `downloadObject` / `getObjectMetadata`） |

## 本地存储

## 核心服务

| 服务 | 职责 |
| - | - |
| `FileService` (`@qyy-code-lego/nestjs/core/nest/file-management`) | 元数据持久化（`sys_file`）、`translateIds` 批量 ID → 实体（Redis 缓存 `file:translate:map`）、审计 (`authorType`, `createdBy`) |
| `LocalUploadService` | 物理落盘（自动建子目录）、生成 `fullUrl`、调用 FileService 写元数据 |

## 上传流程

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async upload(@UploadedFile() file: Express.Multer.File) {
  const identity = this.threadLocal.getStore()?.identity;
  const object = `avatars/${identity.id}/${Date.now()}_${file.originalname}`;
  const record = await this.localUploadService.saveLocalFile(
    file, object, identity.identityType, identity.id,
  );
  return ApiResBody.of(record);
}
```

## 详情接口翻译 ID

业务表中通常只存文件 ID（或逗号分隔字符串）。返回前批量翻译：

```typescript
async getDetail(id: string) {
  const entity = await this.repo.findOne(id);
  const fileIds = entity.attachments ? entity.attachments.split(',') : [];
  const files = await this.fileService.translateIds(fileIds);
  return { ...entity, files };
}
```

## 存储路径预设

- 账号头像：`/{username}/avatar/{timestamp}_{filename}`
- 医院 Logo：`/{uscCode}/logo/{timestamp}_{filename}`
- 业务附件：`/{uscCode}/attachments/{type}/{timestamp}_{filename}`

## 配置

- `file.local.storageRoot`：默认 `./uploads`
- `file.local.serveRoot`：默认 `/files`

## 相关 skill

- `auth-identity-public` — 上传前的身份获取
- `serialization-vo` — 接口返回 VO 时的 files 字段组装
