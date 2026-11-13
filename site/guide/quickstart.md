# 快速上手

本指南面向首次接触 qyy-code-lego NestJS Boilerplate 的开发者，10 分钟跑通 playground 并定位规范。

## 1. 安装与启动

```bash
pnpm install
cp env/playground.env.example env/playground.env   # 演示应用
cp env/qyy-code-lego-app.env.example env/qyy-code-lego-app.env  # 业务应用（按需）
pnpm dev:play                                       # 启动 playground（watch + debug 9232）
pnpm dev:app                                        # 启动业务应用（watch + debug 9233）
```

启动后访问健康检查端点确认存活：`GET /health`（liveness）、`GET /health/ready`（readiness，含 DB/Redis 检查）。

## 2. 阅读顺序

| 顺序 | 页面 | 目的 |
| - | - | - |
| 1 | [工程结构与 Monorepo](../specs/architecture) | 了解 apps/libs 划分与路径别名 |
| 2 | [请求生命周期与上下文](../specs/request-lifecycle) | 了解 Filter/Pipe/Interceptor/Guard 链 |
| 3 | [统一响应体与异常](../specs/response-error) | ApiResBody 与 BizError |
| 4 | [业务模块组织与实现](../specs/module-organization) | 一个模块的标准目录与实现流程 |

## 3. 新增一个业务模块

按 [业务模块组织与实现](../specs/module-organization) 的目录约定，建 `dto/` + `vo/` + controller/service/vo-transform/module，复用全局基础设施，不重复造轮子。

## 4. 让 AI Agent 写代码

把 skill 库安装到你的 AI 工具，或让 Agent 按三步检索法取规范原文：

```bash
node skills/bin/install-skills.mjs --target=claude-code   # 见 安装 Skill
```

Agent 检索流程见 [Agent 落地说明](../agent/)。

## 5. 常用命令

| 命令 | 说明 |
| - | - |
| `pnpm dev:playground` | 启动 playground（watch + debug） |
| `pnpm build` | 编译 web lib 与 playground |
| `pnpm lint` / `pnpm format` | ESLint 校验修复 / Prettier 格式化 |
| `pnpm skills:validate` | 校验 skill frontmatter 与 README 索引一致 |

## 下一步

- 新建独立 app：[新建工程](./create-project)
- 接入既有工程：[改造现有工程](./transform-existing)
- 速查：[模块速查](./module-cheatsheet)
