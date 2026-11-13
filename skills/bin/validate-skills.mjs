#!/usr/bin/env node
// 校验 skills 元数据与 README 索引一致性。
// 用法：node skills/bin/validate-skills.mjs

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SKILLS_ROOT,
  discoverSkills,
  extractTableSkillNames,
  checkRelatedSkillSection,
} from './skill-lib.mjs';

const README_PATH = join(SKILLS_ROOT, 'README.md');

async function main() {
  const skills = await discoverSkills();
  const readme = await readFile(README_PATH, 'utf8');
  const errors = [];
  const warnings = [];

  for (const s of skills) {
    const required = ['name', 'description', 'type', 'tags'];
    for (const key of required) {
      if (!(key in s.meta)) errors.push(`${s.path}: frontmatter 缺少 ${key}`);
    }
    if (s.meta.name && s.meta.name !== s.dir) {
      errors.push(`${s.path}: name(${s.meta.name}) 必须与目录名(${s.dir})一致`);
    }
    if (s.meta.type && s.meta.type !== s.group) {
      errors.push(`${s.path}: type(${s.meta.type}) 必须与分组目录(${s.group})一致`);
    }
    if (s.meta.tags && !Array.isArray(s.meta.tags)) {
      errors.push(`${s.path}: tags 必须是数组形式，如 [a, b]`);
    }
    if (!checkRelatedSkillSection(s)) {
      warnings.push(`${s.path}: 缺少 "## 相关 skill" 段落`);
    }
  }

  const fsAtomic = new Set(skills.filter((s) => s.group === 'atomic').map((s) => s.dir));
  const fsComposite = new Set(skills.filter((s) => s.group === 'composite').map((s) => s.dir));
  const readmeAtomic = new Set(extractTableSkillNames(readme, 'Atomic（元）'));
  const readmeComposite = new Set(extractTableSkillNames(readme, 'Composite（任务级）'));

  for (const name of fsAtomic) {
    if (!readmeAtomic.has(name)) errors.push(`README Atomic 索引缺少: ${name}`);
  }
  for (const name of readmeAtomic) {
    if (!fsAtomic.has(name)) errors.push(`README Atomic 索引有多余项: ${name}`);
  }
  for (const name of fsComposite) {
    if (!readmeComposite.has(name)) errors.push(`README Composite 索引缺少: ${name}`);
  }
  for (const name of readmeComposite) {
    if (!fsComposite.has(name)) errors.push(`README Composite 索引有多余项: ${name}`);
  }

  if (errors.length > 0) {
    console.error(`❌ validate-skills failed (${errors.length} errors)`);
    for (const err of errors) console.error(`- ${err}`);
    if (warnings.length > 0) {
      console.error(`\n⚠ warnings (${warnings.length})`);
      for (const w of warnings) console.error(`- ${w}`);
    }
    process.exit(1);
  }

  console.log(`✅ validate-skills passed (${skills.length} skills checked)`);
  if (warnings.length > 0) {
    console.log(`⚠ warnings (${warnings.length})`);
    for (const w of warnings) console.log(`- ${w}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
