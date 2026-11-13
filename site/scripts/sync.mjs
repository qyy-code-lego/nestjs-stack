// site/scripts/sync.mjs
// 核心同步脚本：把 skills / specs / docs 同步为「人类页 + Agent 纯净原文」，
// 并生成 skills/index.md、guide/install-skills.md、public/llms.txt、public/agent/index.json。
// 复用 skills/bin/skill-lib.mjs 的 parseFrontmatter / discoverSkills，禁止重造。
import { readFile, readdir, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFrontmatter,
  discoverSkills,
  SKILLS_ROOT,
} from '../../skills/bin/skill-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(SITE_ROOT, '..');
const SPECS_DIR = join(SITE_ROOT, 'specs');
const DOCS_DEV_DIR = join(PROJECT_ROOT, 'docs', 'development');
const PUBLIC_DIR = join(SITE_ROOT, 'public');
const RAW_DIR = join(PUBLIC_DIR, 'raw');

// ---------- base 解析（--base > SITE_BASE > 默认 /） ----------
export function resolveBase() {
  const argBase = process.argv.find((a) => a.startsWith('--base='));
  if (argBase) {
    let b = argBase.slice('--base='.length);
    if (!b.startsWith('/')) b = '/' + b;
    if (!b.endsWith('/')) b = b + '/';
    return b;
  }
  const envBase = process.env.SITE_BASE;
  if (envBase) {
    let b = envBase;
    if (!b.startsWith('/')) b = '/' + b;
    if (!b.endsWith('/')) b = b + '/';
    return b;
  }
  return '/';
}
const BASE = resolveBase();

// ---------- 工具 ----------
async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function writeText(absPath, content) {
  await ensureDir(dirname(absPath));
  await writeFile(absPath, content, 'utf8');
}

/** 散文态转义 < >：代码围栏与行内代码之外的内容，< → &lt;、> → &gt;。raw 原文不经过此处理。 */
function escapeProse(md) {
  const lines = md.split(/\r?\n/);
  let inFence = false;
  const out = lines.map((line) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return escapeInlineCode(line);
  });
  return out.join('\n');
}

function escapeInlineCode(line) {
  const parts = line.split(/(`[^`]*`)/);
  return parts
    .map((p, i) => (i % 2 === 1 ? p : p.replace(/</g, '&lt;').replace(/>/g, '&gt;')))
    .join('');
}

/** 取正文第一行 H1 作为标题；取其后第一段非空非标题文本作为描述。 */
function extractTitleAndDesc(body) {
  const lines = body.split(/\r?\n/);
  let title = '';
  let desc = '';
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (!title) {
      const h1 = t.match(/^#\s+(.+)$/);
      if (h1) {
        title = h1[1].replace(/\s*⚠️.*$/,'').trim();
        continue;
      }
    }
    if (/^#{1,6}\s/.test(t)) continue;
    desc = t.replace(/[`*]/g, '').slice(0, 160);
    break;
  }
  return { title: title || '未命名', desc: desc || '未找到描述' };
}

// ---------- 同步 skills ----------
async function syncSkills() {
  const skills = await discoverSkills();
  for (const s of skills) {
    const relDir = `skills/${s.group}/${s.dir}`;
    // ① Agent 纯净原文（去 frontmatter，不转义）
    const rawPath = join(RAW_DIR, `${relDir}.md`);
    await writeText(rawPath, s.body);

    // ② 人类页（正文转义 + 安装/原文脚注）
    const humanPath = join(SITE_ROOT, 'skills', s.group, `${s.dir}.md`);
    const strictBadge = s.strict ? ' ⚠️ Strict' : '';
    const footnote = [
      '',
      '---',
      '',
      `> 安装到消费工程：见 [安装 Skill](../../guide/install-skills)。`,
      `> Agent 纯净原文：<a href="../../raw/${relDir}.md" target="_blank" rel="noopener">raw/${relDir}.md</a>`,
      '',
    ].join('\n');
    const human = `# ${s.name}${strictBadge}\n\n${escapeProse(s.body)}${footnote}`;
    await writeText(humanPath, human);
  }
  return skills;
}

// ---------- 同步 specs / docs 原文 ----------
async function syncSpecsRaw() {
  if (!existsSync(SPECS_DIR)) return [];
  const files = await readdir(SPECS_DIR);
  const specs = [];
  for (const f of files.filter((f) => f.endsWith('.md'))) {
    const raw = await readFile(join(SPECS_DIR, f), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const name = meta.name || f.replace(/\.md$/, '');
    const { title, desc } = extractTitleAndDesc(body);
    await writeText(join(RAW_DIR, 'specs', f), body);
    specs.push({
      name,
      title,
      description: meta.description || desc,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      group: meta.group || '',
      page_url: `${BASE}specs/${name}`,
      raw_url: `${BASE}raw/specs/${f}`,
    });
  }
  return specs;
}

async function syncDocsRaw() {
  if (!existsSync(DOCS_DEV_DIR)) return [];
  const files = await readdir(DOCS_DEV_DIR);
  const docs = [];
  for (const f of files.filter((f) => f.endsWith('.md'))) {
    const raw = await readFile(join(DOCS_DEV_DIR, f), 'utf8');
    const { body } = parseFrontmatter(raw);
    const name = f.replace(/\.md$/, '');
    const { title, desc } = extractTitleAndDesc(body);
    await writeText(join(RAW_DIR, 'docs', 'development', f), body);
    docs.push({
      name,
      title,
      description: desc,
      page_url: `${BASE}raw/docs/development/${f}`,
      raw_url: `${BASE}raw/docs/development/${f}`,
    });
  }
  return docs;
}

// ---------- 生成 skills/index.md ----------
async function writeSkillsIndex(skills) {
  const byGroup = { atomic: [], composite: [] };
  for (const s of skills) (byGroup[s.group] ||= []).push(s);

  const renderGroup = (group, title) => {
    const rows = byGroup[group]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => {
        const strict = s.strict ? '⚠️ ' : '';
        const tags = (s.tags || []).join(', ');
        return `| \`${s.name}\` ${strict}| ${tags} | ${s.description.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;')} |`;
      })
      .join('\n');
    return `## ${title}\n\n| Skill | tags | description |\n| - | - | - |\n${rows}\n`;
  };

  const content = `# Skill 库总览

> 本页由 \`site/scripts/sync.mjs\` 自动生成，请勿手工编辑。
> 共 ${skills.length} 个 skill（atomic ${byGroup.atomic.length} · composite ${byGroup.composite.length}），其中 ${skills.filter((s) => s.strict).length} 个为 ⚠️ Strict 强约束。
> 每个 skill 的 Agent 纯净原文位于 \`raw/skills/<group>/<name>.md\`，可用 [\`llms.txt\`](../llms.txt) 与 [\`agent/index.json\`](./index.json) 检索。

${renderGroup('atomic', 'Atomic（元 skill）')}

${renderGroup('composite', 'Composite（任务级 skill）')}

## 检索建议

- 人类：按上方表格关键词定位，点击 skill 名进入详情页。
- Agent：先抓 \`llms.txt\`，再抓 \`agent/index.json\` 按 \`description\`/\`tags\`/\`when_to_use\` 匹配，最后抓 \`raw_url\` 取纯净原文。详见 [Agent 落地说明](../agent/)。
`;
  await writeText(join(SITE_ROOT, 'skills', 'index.md'), content);
}

// ---------- 生成 guide/install-skills.md ----------
async function writeInstallSkillsGuide(skills) {
  const targets = [
    { target: 'claude-code', dir: '.claude/skills/<name>/' },
    { target: 'copilot', dir: '.claude/skills/<name>/' },
    { target: 'gemini', dir: '.agents/skills/<name>/' },
    { target: 'codex', dir: '.agents/skills/<name>/' },
    { target: 'trae', dir: '.trae/skills/<name>/' },
  ];

  const targetRows = targets
    .map((t) => `| \`${t.target}\` | \`${t.dir}\` |`)
    .join('\n');

  const content = `# 安装 Skill

> 本页由 \`site/scripts/sync.mjs\` 自动生成，请勿手工编辑。

skill 源位于本仓库 \`skills/\` 目录。通过 \`skills/bin/install-skills.mjs\` 一键复制到消费工程的 AI 工具目录。

## 一键全装

在 **本仓库根目录** 执行：

\`\`\`bash
# 安装到 Claude Code / Copilot
node skills/bin/install-skills.mjs --target=claude-code

# 安装到 Gemini / Codex
node skills/bin/install-skills.mjs --target=gemini

# 安装到 Trae
node skills/bin/install-skills.mjs --target=trae

# 全部目标
node skills/bin/install-skills.mjs --target=all
\`\`\`

消费工程以子模块形式引入时，路径改为 \`node packages/@qyy-code-lego/nestjs/skills/bin/install-skills.mjs --target=<t>\`。

## 常用选项

| 选项 | 说明 |
| - | - |
| \`--list\` | 列出全部 skill（含 strict 标记）后退出 |
| \`--dry-run\` | 仅打印将写入的文件，不实际写入 |
| \`--force\` | 覆盖已有同名文件（默认跳过） |
| \`--out=<path>\` | 自定义输出根目录 |

## 目标工具输出位置

| target | 输出目录 |
| - | - |
${targetRows}

安装时递归复制整个 skill 目录（含 \`SKILL.md\` 及 \`scripts/\`、\`references/\`、\`assets/\` 等资源），扁平一级，不加 group 前缀。

## 离线下载（Agent 直取纯净原文）

无法运行安装脚本时，可直接抓取 Agent 纯净原文：

- 全量目录：<a href="../llms.txt" target="_blank" rel="noopener">llms.txt</a>
- 机器可读索引：<a href="../agent/index.json" target="_blank" rel="noopener">agent/index.json</a>
- 单个 skill 原文：\`raw/skills/<group>/<name>.md\`（路径见 index.json 的 \`raw_url\`）

共 ${skills.length} 个 skill 可用。
`;
  await writeText(join(SITE_ROOT, 'guide', 'install-skills.md'), content);
}

// ---------- 生成 llms.txt ----------
async function writeLlmsTxt(skills, specs, docs) {
  const skillLines = skills
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- [skill:${s.name}](${BASE}raw/skills/${s.group}/${s.dir}.md): ${s.strict ? '[Strict] ' : ''}${s.description}`)
    .join('\n');

  const specLines = specs
    .map((s) => `- [spec:${s.name}](${BASE}raw/specs/${s.name}.md): ${s.description}`)
    .join('\n');

  const docLines = docs
    .map((d) => `- [doc:${d.name}](${BASE}raw/docs/development/${d.name}.md): ${d.description}`)
    .join('\n');

  const content = `# qyy-code-lego NestJS Boilerplate

> qyy-code-lego NestJS Monorepo 后端开发规范。面向人类（VitePress 站点）与 AI Agent（本文件 + index.json + raw 原文）双阅读模式。

## Agent 检索流程（三步）

1. 抓本文件 llms.txt 了解站点全貌与端点清单。
2. 抓 ${BASE}agent/index.json，按各条目的 description / tags / when_to_use 匹配目标。
3. 抓命中的 raw_url 取纯净原文作答，禁止凭训练记忆编造；离线回退到消费工程内 skills/ 与 docs/。

## 端点清单

- 机器目录：${BASE}agent/index.json
- 站点首页：${BASE}
- Skill 总览（人类）：${BASE}skills/
- 规范页（人类）：${BASE}specs/

## Skill 清单（${skills.length}）

${skillLines}

## 规范页清单（${specs.length}）

${specLines}

## 开发文档原文（${docs.length}）

${docLines}
`;
  await writeText(join(PUBLIC_DIR, 'llms.txt'), content);
}

// ---------- 生成 agent/index.json ----------
async function writeAgentIndex(skills, specs, docs) {
  const index = {
    site: {
      title: 'qyy-code-lego NestJS Boilerplate',
      base: BASE,
      description: 'qyy-code-lego NestJS Monorepo 后端开发规范文档站',
    },
    retrieval: [
      '1. 抓 llms.txt 了解全貌',
      '2. 抓 agent/index.json 按 description/tags/when_to_use 匹配',
      '3. 抓 raw_url 取纯净原文作答，禁止编造；离线回退到本地 skills/ 与 docs/',
    ],
    skills: skills
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        group: s.group,
        name: s.name,
        description: s.description,
        tags: s.tags,
        when_to_use: s.when_to_use,
        strict: s.strict,
        page_url: `${BASE}skills/${s.group}/${s.dir}`,
        raw_url: `${BASE}raw/skills/${s.group}/${s.dir}.md`,
      })),
    specs,
    docs,
  };
  await writeText(join(PUBLIC_DIR, 'agent', 'index.json'), JSON.stringify(index, null, 2));
}

// ---------- main ----------
async function main() {
  console.log(`sync: base=${BASE}`);
  // 清理旧生成产物（仅 raw / public 索引 / 生成页）
  await rm(RAW_DIR, { recursive: true, force: true });
  await rm(join(PUBLIC_DIR, 'llms.txt'), { force: true });
  await rm(join(PUBLIC_DIR, 'agent', 'index.json'), { force: true });

  const skills = await syncSkills();
  const specs = await syncSpecsRaw();
  const docs = await syncDocsRaw();

  await writeSkillsIndex(skills);
  await writeInstallSkillsGuide(skills);
  await writeLlmsTxt(skills, specs, docs);
  await writeAgentIndex(skills, specs, docs);

  console.log(`sync: ${skills.length} skills, ${specs.length} specs, ${docs.length} docs → done`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
