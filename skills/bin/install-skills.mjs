#!/usr/bin/env node
// 把 skills/{atomic,composite} 下的 skill 目录安装到消费工程的 AI 工具目录。
// 用法：node packages/qyy-code-lego-nestjs/skills/bin/install-skills.mjs --target=claude-code|copilot|gemini|codex|trae|all [--out=path] [--dry-run] [--force] [--list]

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSkills } from './skill-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();

const VALID_TARGETS = ['claude-code', 'copilot', 'gemini', 'codex', 'trae'];

// ---------- arg parsing ----------
function parseArgs(argv) {
  const args = { target: null, out: null, dryRun: false, force: false, list: false };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes('=') ? raw.split('=') : [raw, true];
    switch (k) {
      case '--target': args.target = v; break;
      case '--out': args.out = v; break;
      case '--dry-run': args.dryRun = true; break;
      case '--force': args.force = true; break;
      case '--list': args.list = true; break;
      case '-h': case '--help': args.help = true; break;
      default:
        console.error(`未知参数: ${raw}`);
        process.exit(1);
    }
  }
  return args;
}

const HELP = `\nInstall skills CLI

用法:
  node skills/bin/install-skills.mjs --target=<claude-code|copilot|gemini|codex|trae|all> [选项]

选项:
  --target=<name>   目标 AI 工具 (claude-code / copilot / gemini / codex / trae / all)
                    claude-code, copilot → .claude/skills/
                    gemini, codex       → .agents/skills/
                    trae                → .trae/skills/
  --out=<path>      自定义输出根目录 (默认按工具约定)
  --list            列出所有 skill 后退出
  --dry-run         仅打印将要写的文件，不实际写入
  --force           覆盖已有同名文件 (默认跳过)
  -h, --help        显示本帮助

说明:
  安装时会复制整个 skill 目录，包括 SKILL.md 以及 scripts/、references/、assets/ 等资源。
`;

// ---------- frontmatter 解析与 skill 发现 ----------
// 复用 ./skill-lib.mjs 的 parseFrontmatter / discoverSkills，禁止在此重造。

// ---------- writers ----------
async function copyFileSafe(sourcePath, destPath, { dryRun, force }) {
  if (dryRun) {
    console.log(`[dry-run] write ${relative(CWD, destPath)}`);
    return 'dry-run';
  }
  if (existsSync(destPath) && !force) {
    console.log(`skip   ${relative(CWD, destPath)} (已存在, 用 --force 覆盖)`);
    return 'skipped';
  }
  await mkdir(dirname(destPath), { recursive: true });
  await copyFile(sourcePath, destPath);
  console.log(`write  ${relative(CWD, destPath)}`);
  return 'written';
}

async function copySkillDir(skill, destRoot, opts) {
  async function traverse(sourceDir, currentDestDir) {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name);
      const destPath = join(currentDestDir, entry.name);

      if (entry.isDirectory()) {
        await traverse(sourcePath, destPath);
        continue;
      }

      if (entry.isFile()) {
        await copyFileSafe(sourcePath, destPath, opts);
      }
    }
  }

  await traverse(skill.sourceDir, destRoot);
}

async function installClaudeCode(skills, opts) {
  // Claude Code 识别路径：<cwd>/.claude/skills/<name>/SKILL.md（扁平一级，不加 group 前缀）
  const outRoot = opts.out
    ? resolve(CWD, opts.out)
    : join(CWD, '.claude', 'skills');
  for (const s of skills) {
    await copySkillDir(s, join(outRoot, s.dir), opts);
  }
}

async function installCopilot(skills, opts) {
  // Copilot 与 claude-code 共用 .claude/skills/ 目录
  const outRoot = opts.out
    ? resolve(CWD, opts.out)
    : join(CWD, '.claude', 'skills');
  for (const s of skills) {
    await copySkillDir(s, join(outRoot, s.dir), opts);
  }
}

async function installAgentsDir(skills, opts) {
  // gemini / codex 共用 .agents/skills/ 目录
  const outRoot = opts.out
    ? resolve(CWD, opts.out)
    : join(CWD, '.agents', 'skills');
  for (const s of skills) {
    await copySkillDir(s, join(outRoot, s.dir), opts);
  }
}

async function installGemini(skills, opts) {
  await installAgentsDir(skills, opts);
}

async function installCodex(skills, opts) {
  await installAgentsDir(skills, opts);
}

async function installTrae(skills, opts) {
  const outRoot = opts.out
    ? resolve(CWD, opts.out)
    : join(CWD, '.trae', 'skills');
  for (const s of skills) {
    await copySkillDir(s, join(outRoot, s.dir), opts);
  }
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(HELP); return; }

  const skills = await discoverSkills();
  if (args.list) {
    console.log(`发现 ${skills.length} 个 skill:`);
    for (const s of skills) {
      const flag = s.strict ? ' ⚠️' : '';
      console.log(`  [${s.group}] ${s.name}${flag} — ${s.description}`);
    }
    return;
  }

  if (!args.target) { console.error('缺少 --target 参数\n' + HELP); process.exit(1); }

  const targets = args.target === 'all' ? VALID_TARGETS : [args.target];
  for (const t of targets) {
    if (!VALID_TARGETS.includes(t)) {
      console.error(`不支持的 target: ${t} (允许: ${VALID_TARGETS.join(', ')}, all)`);
      process.exit(1);
    }
  }

  const opts = { dryRun: args.dryRun, force: args.force, out: args.out };
  for (const t of targets) {
    console.log(`\n=== install target: ${t} ===`);
    if (t === 'claude-code') await installClaudeCode(skills, opts);
    else if (t === 'copilot') await installCopilot(skills, opts);
    else if (t === 'gemini') await installGemini(skills, opts);
    else if (t === 'codex') await installCodex(skills, opts);
    else if (t === 'trae') await installTrae(skills, opts);
  }
  console.log('\n完成。');
}

main().catch(e => { console.error(e); process.exit(1); });
