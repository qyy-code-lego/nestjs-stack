// skills 公共库：frontmatter 解析 + skill 发现 + README 索引解析。
// install-skills.mjs / validate-skills.mjs / site/scripts/sync.mjs 共用，禁止重造等价实现。
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILLS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_GROUPS = ['atomic', 'composite'];

/**
 * 轻量 YAML frontmatter 解析（仅取 key: value，支持 string / boolean / array）。
 * @param {string} raw
 * @returns {{ meta: Record<string, any>, body: string }}
 */
export function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw };
  const fmText = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^[\r\n]+/, '');
  const meta = {};
  for (const line of fmText.split(/\r?\n/)) {
    const m = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    }
    meta[m[1]] = val;
  }
  return { meta, body };
}

/**
 * 发现并解析 skills/{atomic,composite}/<name>/SKILL.md。
 * @returns {Promise<Array<{
 *   group: string, dir: string, name: string, description: string,
 *   type: string, tags: string[], strict: boolean, when_to_use: string,
 *   sourceDir: string, path: string, raw: string, body: string, meta: Record<string, any>
 * }>>}
 */
export async function discoverSkills() {
  const skills = [];
  for (const group of SKILL_GROUPS) {
    const groupDir = join(SKILLS_ROOT, group);
    if (!existsSync(groupDir)) continue;
    const entries = await readdir(groupDir);
    for (const entry of entries) {
      const skillFile = join(groupDir, entry, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      const raw = await readFile(skillFile, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      skills.push({
        group,
        dir: entry,
        name: meta.name || entry,
        description: meta.description || '',
        type: meta.type || group,
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        strict: !!meta.strict,
        when_to_use: meta.when_to_use || '',
        sourceDir: join(groupDir, entry),
        path: skillFile,
        raw,
        body,
        meta,
      });
    }
  }
  return skills;
}

/**
 * 从 README 的某个 `### <sectionTitle>` 表格中提取 skill 名（行首 `| `name``）。
 */
export function extractTableSkillNames(readme, sectionTitle) {
  const marker = `### ${sectionTitle}`;
  const idx = readme.indexOf(marker);
  if (idx === -1) return [];
  const nextHeaderIdx = readme.indexOf('\n### ', idx + marker.length);
  const nextMajorIdx = readme.indexOf('\n## ', idx + marker.length);
  let end = readme.length;
  if (nextHeaderIdx !== -1) end = Math.min(end, nextHeaderIdx);
  if (nextMajorIdx !== -1) end = Math.min(end, nextMajorIdx);
  const section = readme.slice(idx, end);
  const names = [];
  const rowRe = /^\|\s*`([^`]+)`/gm;
  let m;
  while ((m = rowRe.exec(section)) !== null) names.push(m[1]);
  return names;
}

/** skill 正文是否含「## 相关 skill」段落。 */
export function checkRelatedSkillSection(skill) {
  return /##\s*相关 skill/i.test(skill.body);
}
