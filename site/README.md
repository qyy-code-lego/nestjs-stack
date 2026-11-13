# qyy-code-lego NestJS 文档站

本目录是 qyy-code-lego NestJS Boilerplate 的统一文档站源码，基于 [VitePress](https://vitepress.dev/) 构建，面向**人类**（渲染页面）与 **AI Agent**（机器可读端点）双阅读模式。

## 目录

```text
site/
├── .vitepress/config.ts        # VitePress 配置（中文 nav/sidebar/search/footer）
├── index.md                    # 站点首页
├── specs/                      # 规范页（人类撰写，含 frontmatter）
├── guide/                      # 快速上手、新建工程、改造工程、模块速查
├── agent/index.md              # Agent 落地说明（三步检索法）
├── scripts/sync.mjs            # 同步脚本（核心，复用 skills/bin/skill-lib.mjs）
├── package.json                # sync / dev / build / preview 脚本
└── public/                     # 由 sync 生成：raw/ 原文、llms.txt、agent/index.json
```

`site/skills/*`、`site/guide/install-skills.md`、`site/public/*` 由 sync 在构建时再生，**不提交**（见 `site/.gitignore`）。

## 本地开发

```bash
cd site
pnpm install          # 安装 vitepress
pnpm dev              # 先 sync 再启动 dev server
```

## 构建

```bash
cd site
pnpm build            # sync + vitepress build → .vitepress/dist
pnpm preview          # 本地预览构建产物
```

部署到 GitHub Pages 时设置 `SITE_BASE=/nestjs-stack/`（仓库名），见 `.github/workflows/deploy-site.yml`。

## 生成新 skill / spec 后

skill 与 spec 变更后，重新运行 sync 即可全量再生 Agent 端点：

```bash
cd site && node scripts/sync.mjs
```
