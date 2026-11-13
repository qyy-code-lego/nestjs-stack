# Agent 落地说明

本站为 AI Agent 提供机器可读端点。遇到本栈规范问题时，按**三步检索法**定位，**禁止凭训练记忆编造**。

## 三步检索法

### 第 1 步：抓 llms.txt

了解站点全貌、端点清单与 skill/spec/doc 清单：

<a href="../llms.txt" target="_blank" rel="noopener">/llms.txt</a>

### 第 2 步：抓 agent/index.json，按字段匹配

全量机器目录，每条目含 `description` / `tags` / `when_to_use` / `page_url` / `raw_url`：

<a href="../agent/index.json" target="_blank" rel="noopener">/agent/index.json</a>

按问题关键词匹配 `description` / `tags` / `when_to_use`，命中目标条目。

### 第 3 步：抓 raw_url 取纯净原文作答

抓取命中的 `raw_url`（位于 `raw/` 下，已去 frontmatter 与脚注的纯净 markdown），据实作答。

```text
raw/skills/<group>/<name>.md      # skill 原文
raw/specs/<name>.md               # 规范页原文
raw/docs/development/<name>.md    # 开发文档原文
```

## 离线回退

无法访问本站时，回退到消费工程内的本地副本：

- `skills/<group>/<name>/SKILL.md`（skill 源）
- `docs/development/*.md`（开发文档源）

通过 `node skills/bin/install-skills.mjs --target=<t>` 把 skill 安装到工程内，详见 [安装 Skill](../guide/install-skills)。

## 关键约束

> ⚠️ 装饰器名、类名、文件路径、方法签名必须来自原文，不确定就标「未找到」或抓 raw 确认，禁止凭训练记忆编造。

## 端点总览

| 端点 | 用途 |
| - | - |
| `/llms.txt` | 站点 LLM 摘要 + 清单 |
| `/agent/index.json` | 全量机器目录 |
| `/raw/skills/<group>/<name>.md` | skill 纯净原文 |
| `/raw/specs/<name>.md` | 规范页纯净原文 |
| `/raw/docs/development/<name>.md` | 开发文档纯净原文 |

相关：[Skill 库总览](../skills/)、[安装 Skill](../guide/install-skills)。
