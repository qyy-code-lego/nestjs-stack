---
name: implement-file-upload
description: 实现文件上传 — OSS 走 Web SDK 直传 + 服务端 OssUploadPolicy 决定存储位置，业务接口按 fileId 绑定；本地存储走 FileInterceptor + LocalUploadService；详情接口 FileService.translateIds 翻译 ID。
type: composite
tags: [file, upload]
when_to_use: 关键词 — file, upload, oss, 直传, OssUploadPolicy, OssWebSdk, purpose, fileId, multer, FileInterceptor, LocalUploadService
---


# 实现文件上传 / 文件展示

## 0. OSS 直传（新工程默认）

1. 服务端：实现 `OssUploadPolicy`（按 `purpose` 校验权限并返回 `ossConfigCode`、含 UUID 的 `key`、`acl`），在提供 `MultipartUploadService` 的模块注册 `{ provide: OssUploadPolicy, useClass: ... }`；挂载 `/files/oss/*` 控制器。
2. 前端：`new OssWebSdk({ baseUrl, headers })`，`sdk.upload({ file, purpose })` 或 `sdk.createUploadProcess({ file, purpose })`；**不传** `ossConfigCode` / `key`。
3. 业务接口：只收 `fileId`；校验 `completed`、`createdBy`、`meta.uploadPurpose`；内容类型以服务端读取的字节为准。
4. 详见 `docs/development/oss-upload.md`。不要再写“服务端返回 key / ossConfigCode 给前端”的接口。

## 1. 本地存储上传接口

```typescript
@Post('upload')
@IdentityRequired('hospital_admin')
@UseInterceptors(FileInterceptor('file'))
async upload(@UploadedFile() file: Express.Multer.File) {
  const identity = this.threadLocal.getStore()?.identity as AccountIdentity;
  const object = `${identity.hospitalAdmin.uscCode}/attachments/avatar/${Date.now()}_${file.originalname}`;
  const record = await this.localUploadService.saveLocalFile(
    file, object, identity.identityType, identity.id,
  );
  return ApiResBody.of(record);
}
```

要点：

- Object 路径携带业务前缀 + 时间戳，避免冲突；遵循 `file-management` 的预设路径
- 校验 mime/大小：在 Controller 用 `ParseFilePipeBuilder` 或自定义校验

## 2. 业务表存储

业务表通常只存 `fileId` 或逗号分隔的多 ID 字符串。**禁止冗余存 fullUrl**（路径会随域名/前缀变化）。

## 3. 详情接口翻译

```typescript
async getDetail(id: string): Promise<DetailVO> {
  const entity = await this.repo.findOne({ where: { id } });
  const fileIds = entity.attachments?.split(',').filter(Boolean) ?? [];
  const files = await this.fileService.translateIds(fileIds);
  return toDetailVO(entity, files);
}
```

`translateIds` 内部走 Redis 缓存（`file:translate:map`），适合高频读。

## 相关 skill

- `file-management` — 服务能力与配置
- `auth-identity-public` — identity 来源
- `serialization-vo` — VO 字段组装
