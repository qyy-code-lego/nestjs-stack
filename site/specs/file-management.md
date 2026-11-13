---
name: file-management
description: OSS 直传服务端决定存储位置、本地存储 LocalUploadService.saveLocalFile、FileService.translateIds 翻译 fileId、禁止冗余 fullUrl。
tags: [file, upload, oss]
group: 横切能力
---

# 文件上传与管理

文件存储分两条路径：**OSS 直传**（服务端 `OssUploadPolicy` 决定存储位置，前端只传 `purpose`）与**本地存储**（`LocalUploadService` 物理落盘）。业务表只存 `fileId`，详情接口用 `FileService.translateIds` 批量翻译。

## OSS 直传

服务端实现 `OssUploadPolicy` 决定存储位置，前端不传 `ossConfigCode` / `key`，只传 `file` + `purpose`。存储路径预设：`/avatar/`、`/logo/`、`/attachments/` 等。

## 本地存储

```typescript
@Post('/upload')
@UseInterceptors(FileInterceptor('file'))
async upload(@UploadedFile() file: Express.Multer.File) {
  const fileId = await this.localUploadService.saveLocalFile(file);  // 物理落盘 + 写 sys_file 元数据
  return ApiResBody.of({ fileId });
}
```

## 详情接口翻译 fileId

```typescript
const list = await this.xxxService.findList(param);
const enriched = await this.fileService.translateIds(list, 'avatarFileId');  // 内部走 Redis 缓存（file:translate:map）
return ApiResBody.of(enriched);
```

| 能力 | 说明 |
| - | - |
| `LocalUploadService.saveLocalFile` | 物理落盘 + 写 `sys_file` 元数据 |
| `FileService.translateIds` | 批量把 fileId 翻译为带 fullUrl 的实体（Redis 缓存） |
| 存储路径预设 | `/avatar/` `/logo/` `/attachments/` 等 |

> ⚠️ 关键约束：业务表只存 `fileId`，禁止冗余存 `fullUrl`（fullUrl 由 `translateIds` 在出口装配，避免存储变更牵连业务表）。

## 常见误用

```typescript
// ❌ 业务表冗余存 fullUrl，存储迁移时牵连大量业务表
@Column() avatarFullUrl?: string;

// ✅ 只存 fileId，出口统一翻译
@Column({ type: 'bigint', nullable: true }) avatarFileId?: string;

// ❌ 前端直传 ossConfigCode/key，绕过服务端策略
// ✅ 前端只传 file + purpose，服务端 OssUploadPolicy 决定位置
```

OSS 与本地存储可共存：通过 `purpose` 路由到不同存储策略，业务层只感知 `fileId`，不感知底层存储介质。

## 规范要点

| 场景 | 做法 |
| - | - |
| OSS 直传 | 服务端 OssUploadPolicy 决定位置，前端只传 purpose |
| 本地存储 | `LocalUploadService.saveLocalFile` |
| 业务表 | 只存 fileId |
| 详情接口 | `FileService.translateIds` 批量翻译 |

## 权威源

- skill：[`file-management`](../skills/atomic/file-management)、[`implement-file-upload`](../skills/composite/implement-file-upload)
- 开发文档：`docs/development/oss-upload.md`（<a href="../raw/docs/development/oss-upload.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[业务模块组织与实现](./module-organization)、[可观测性](./observability)
