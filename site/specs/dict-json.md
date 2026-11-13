---
name: dict-json
description: 业务枚举字典按一字典一文件维护在 public/dict/<key>.json、兼容聚合 public/dict.json、DictionaryService.getList/translate、enum+dict 同步。
tags: [dictionary, enum]
group: 横切能力
---

# 业务字典

业务枚举字典优先按「一字典一文件」维护在 `public/dict/<key>.json`（分片形态），兼容历史聚合文件 `public/dict.json`。通过 `DictionaryService` 提供下拉项与 code→text/path 翻译。

## 字典文件

```text
public/
  dict/
    object-active-status.json    # 推荐分片：文件名即 key，禁止一文件塞多字典
    xxx-status.json
  dict.json                      # 兼容聚合，逐步迁移到分片
```

```json
// public/dict/object-active-status.json
[
  { "code": "ACTIVE", "text": "启用", "path": ["启用"] },
  { "code": "DISABLED", "text": "停用", "path": ["停用"] }
]
```

## enum + dict 同步

业务枚举需同时维护 TS enum 与字典文件：

```typescript
export enum ObjectActiveStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED' }
```

## DictionaryService

```typescript
const list = await this.dictionaryService.getList('object-active-status');   // 下拉项
const text = await this.dictionaryService.translate('object-active-status', 'ACTIVE');  // code -> text
```

Service 返回实体 + 字典翻译的聚合对象，由 vo-transform 组装（Service 不构造展示态，见 [Service 层范式](./service-paradigm)）。

> ⚠️ 关键约束：一个文件一个字典，文件名即 key，禁止一个文件塞多个字典；新增枚举必须同时维护 enum + dict 文件。

## 字典消费分层

字典翻译的组装发生在 vo-transform 层，Service 只返回实体 + code，不主动翻译：

```typescript
// Service 返回实体聚合（含 code 字段）
async findOne(id: string): Promise<XxxEntity & { statusText?: string }> { /* ... */ }

// vo-transform 装配 text
export async function toXxxVo(data, dictService) {
  const vo = plainToInstance(XxxVo, data, { excludeExtraneousValues: true });
  vo.statusText = await dictService.translate('xxx-status', data.status);
  return vo;
}
```

聚合文件 `public/dict.json` 兼容历史调用，新增字典一律走分片 `public/dict/<key>.json`，逐步迁移。

## 规范要点

| 场景 | 做法 |
| - | - |
| 字典存储 | `public/dict/<key>.json`（分片，优先） |
| 聚合文件 | `public/dict.json`（兼容，逐步迁移） |
| 业务枚举 | TS enum + dict 同步 |
| 翻译 | `DictionaryService.getList` / `translate` |

## 权威源

- skill：[`dict-json`](../skills/atomic/dict-json)
- 开发文档：`docs/development/guide-line.md`（<a href="../raw/docs/development/guide-line.md" target="_blank" rel="noopener">原文</a>）
- 相关页：[实体基类与 Mixin](./entity-base)、[序列化与 VO](./serialization-vo)
