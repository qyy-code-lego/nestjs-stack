# Skills — qyy-code-lego NestJS 公共子模块

本目录是「文档 → AI Skill」的权威源，按 [Anthropic Claude Code Skill](https://docs.anthropic.com/claude/docs) 风格组织：每个 skill 一个目录，内含 `SKILL.md`，frontmatter 包含 `name` / `description` / `type` / `tags`。

CLI 工具 [`bin/install-skills.mjs`](./bin/install-skills.mjs) 把源 skill 目录一键安装到消费工程的指定 AI 工具目录（claude-code / github-copilot / gemini / codex / trae）。

## 1. 分层

- **`atomic/`** — 元 skill。一个规范点为一个 skill（如 `dto-validation`、`biz-error`），用于精准匹配单一关注点
- **`composite/`** — 任务级 skill。围绕一个高层动作（如 `implement-controller`、`design-database-entity`）组合多个元 skill 的 checklist 与模板，便于「我要做 X」的整体指引

Composite 通过正文中的「相关 skill」段落引用 atomic，AI agent 可顺藤摸瓜按需精读。

## 2. Skill 索引

### Atomic（元）

| Skill | 关键词 |
| - | - |
| `app-bootstrap-main` | main.ts / NestFactory / AppConfig / connectGlobalGuards / apiPrefix |
| `app-module-composition` | 根 Module / configModuleImport / applyTypeOrmDs / GlobalModule |
| `env-config-conventions` | env/{appName}.env / .local 覆盖 / 变量前缀 / REDIS_KEY_PREFIX |
| `context-threadlocal` | ALS / Store / requestId / account / identity |
| `auth-identity-public` | `@IdentityRequired` / `@Public` / `jwt.whiteList` |
| `permission-rbac` | `@PermissionRequired` / PermissionGuard / 超管 |
| `data-scope` | WithScopeStrategy / DataScopeEngine / 行级权限 |
| `config-service` | ConfigService / AllConfig / registerAs / 内置配置 / 扩展命名空间 |
| `config-namespaces` | AllConfig / declare global（兼容入口，内容并入 `config-service`） |
| `runtime-config` | sys_runtime_config / RuntimeConfigService / 运行时业务配置（区别于 env 进程配置） |
| `cache-wrap` | `CacheService.wrap` / 防击穿 |
| `redis-kv` | RedisService set/get / 自动序列化 |
| `response-apiresbody` | ApiResBody / 全局过滤器 |
| `biz-error` | BizError / codeAs / httpStatusAs / dataAs |
| `dto-validation` | class-validator / `@ToDate` / `@EnsureNotBlank` / 嵌套 |
| `range-query` | `@ParseRange` / `@ParseDateTimeRange` |
| `entity-base` | `EntityWithIdAndTimeTrace` / extendable / `WithStatus` / `@Column.type` |
| `dict-json` | `public/dict/<key>.json` 分片（推荐）/ `public/dict.json` 兼容 / `DictionaryService` / code 翻译 / 业务枚举 |
| `service-paradigm` ⚠️ | 上下文无关 / interface 入参 / 对象参数 / 查询分层 |
| `pagination-and-list` ⚠️ | PaginationDTO / IPageData / ListLimitDto / simple-list |
| `restful-style` ⚠️ | Query 参数定位 / DTO 不携带 id / PATCH 返完整对象 |
| `type-safety` ⚠️ | 禁止 as any / 敏感信息独立 |
| `serialization-vo` ⚠️ | `@Exclude` / `@Expose` / `plainToInstance` / vo-transform / VO class |
| `file-management` | LocalUploadService / FileService / translateIds |
| `request-logging` | 请求日志 / access log / 持久化 / `@IgnoreRequestLog` / `@CaptureRequestLogBody` |
| `health-check` | HealthModule / `/health` / readiness / `@HealthIndicator` / 探活 |
| `log-file` | setupAppLogger / APP_LOG_FILE_* / 滚动落盘 / json·text |
| `skill-usage-tracking` | skill统计 / skill-usage / sessions / total.mjs |

### Composite（任务级）

| Skill | 用途 |
| - | - |
| `create-new-app` | 在 monorepo 内新增 app 全流程 |
| `implement-controller` | 实现 Controller 全流程 |
| `implement-service` | 实现 Service 全流程 |
| `design-database-entity` | 数据库实体设计 |
| `design-sql-query` | TypeORM 查询 / SQL 设计 |
| `implement-file-upload` | 文件上传 / 详情翻译 |
| `design-api-doc` | 接口文档（docs/api-schema/{端}/{模块}/index.md + types.ts） |
| `write-feat-design` | 功能设计文档（docs/feat-design/） |
| `write-ddl` | DDL 建表 SQL（docs/DDL/） |
| `organize-nestjs-module` | NestJS 模块目录规范 |

## 3. 安装到消费工程

在消费工程根目录（已通过 git submodule 引入本包，假设位于 `packages/qyy-code-lego-nestjs/`）执行：

```bash
node packages/qyy-code-lego-nestjs/skills/bin/install-skills.mjs --target=claude-code
node packages/qyy-code-lego-nestjs/skills/bin/install-skills.mjs --target=copilot
node packages/qyy-code-lego-nestjs/skills/bin/install-skills.mjs --target=gemini
node packages/qyy-code-lego-nestjs/skills/bin/install-skills.mjs --target=codex
node packages/qyy-code-lego-nestjs/skills/bin/install-skills.mjs --target=trae
```

可选参数：

- `--target=<claude-code|copilot|gemini|codex|trae|all>` — 必填（除非 `--list`）
- `--out=<path>` — 自定义输出根目录，默认按工具约定
- `--dry-run` — 仅打印将要写的文件
- `--list` — 列出本包所有可用 skill
- `--force` — 覆盖已有同名文件（默认会跳过）

各工具的输出位置：

| Target | 输出位置 |
| - | - |
| `claude-code` | `<cwd>/.claude/skills/<name>/` |
| `copilot` | `<cwd>/.claude/skills/<name>/` |
| `gemini` | `<cwd>/.agents/skills/<name>/` |
| `codex` | `<cwd>/.agents/skills/<name>/` |
| `trae` | `<cwd>/.trae/skills/<name>/` |

安装时会复制整个 skill 目录，包括 `SKILL.md` 和 `scripts/`、`references/`、`assets/` 等随 skill 提供的资源。

## 4. 编写 / 维护

新增 skill：

1. 选择层级（atomic / composite）建目录 `<name>/SKILL.md`
2. frontmatter 至少包含 `name`、`description`、`type`、`tags`；`description` **务必精简且关键词完整**（用于 AI 匹配）
3. 内容遵循「做什么 / 不做什么 / 示例 / 相关 skill」结构
4. 在 README 索引表增加条目

> Skill 的 `description` 是检索精度的核心，控制在 1-2 句、覆盖关键场景词。

维护约定：

- `name` 必须与目录名一致；`type` 必须与目录层级一致（`atomic` / `composite`）
- frontmatter 必填：`name` / `description` / `type` / `tags`
- 正文建议包含 `## 相关 skill` 段，便于组合链路检索
- import 示例建议统一优先写包对外别名（`@qyy-code-lego/nestjs/*`）；若示例使用内部别名（如 `@libs/*`），应保持同一 skill 内风格一致
- 组织约束（如 `restful-style`）建议在文案中明确“本工程规范”，避免被泛化为通用最佳实践

维护后建议执行：

```bash
pnpm skills:validate
```
