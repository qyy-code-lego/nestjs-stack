---
name: use-doc-site
description: 文档站总入口 skill。Agent 遇到本栈（qyy-code-lego NestJS）规范问题时，按「抓 llms.txt → 抓 agent/index.json 匹配 description/tags/when_to_use → 抓 raw_url 取纯净原文」三步定位，禁止凭训练记忆编造，离线回退到本地 skills/ 与 docs/。
type: composite
tags: [doc-site, retrieval, agent, llms]
when_to_use: 关键词 — 规范, 文档, doc-site, llms.txt, agent/index.json, raw, 检索, 怎么写, 约定, 装饰器, ApiResBody, BizError, ThreadLocal, Service 范式, DTO, 实体, 权限
---

# 文档站总入口（use-doc-site）

本工程在 `site/` 下建设了统一文档站，同时面向人类（VitePress 页面）与 AI Agent（机器可读端点）。遇到本栈规范问题时，**必须**按三步检索法定位，禁止凭训练记忆编造。

## 三步检索法

### 1. 抓 llms.txt

站点根 `llms.txt` 提供全貌摘要、端点清单与 skill/spec/doc 清单。先抓它了解有哪些主题。

```text
<BASE>/llms.txt
```

### 2. 抓 agent/index.json，按字段匹配

全量机器目录 `agent/index.json`，每条目含：

- `description` — 一句话说明
- `tags` — 关键词数组
- `when_to_use` — 命中场景关键词
- `page_url` — 人类页（渲染后）
- `raw_url` — Agent 纯净原文（去 frontmatter/脚注）

按问题关键词匹配 `description` / `tags` / `when_to_use`，命中目标条目。

```text
<BASE>/agent/index.json
```

### 3. 抓 raw_url 取纯净原文作答

抓取命中的 `raw_url`，据实作答。装饰器名、类名、文件路径、方法签名必须来自原文。

```text
<BASE>/raw/skills/<group>/<name>.md      # skill 原文
<BASE>/raw/specs/<name>.md               # 规范页原文
<BASE>/raw/docs/development/<name>.md    # 开发文档原文
```

## 离线回退

无法访问站点时，回退到消费工程内本地副本：

- `skills/<group>/<name>/SKILL.md`
- `docs/development/*.md`

通过 `node skills/bin/install-skills.mjs --target=<t>` 把 skill 安装到工程内。

## 关键约束

> ⚠️ 禁止凭训练记忆编造装饰器/类/路径/签名；不确定就标「未找到」或抓 raw 确认。本栈的具体名称（ApiResBody、BizError、ThreadLocal、EntityWithIdAndTimeTrace、connectGlobalGuards 等）必须来自原文。

## 相关 skill

- `app-bootstrap-main` — 启动写法
- `app-module-composition` — 根 Module 组合
- `response-apiresbody` / `biz-error` — 响应与异常
- `service-paradigm` / `type-safety` — Service 范式
- `dto-validation` / `restful-style` / `pagination-and-list` — 接口规范
- `entity-base` / `design-sql-query` — 数据层
- 全部 skill 见站点 `/skills/` 或 `agent/index.json`
