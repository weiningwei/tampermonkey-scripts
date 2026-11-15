import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (path) => readFileSync(path, 'utf8');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const safeName = /^[a-z0-9][a-z0-9-]*$/;

export function discoverScripts(root = '.') {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter(entry => {
      const dir = resolve(root, entry.name);
      return readdirSync(dir).some(name => name.endsWith('.user.js'))
        || (existsSync(resolve(dir, 'README.md')) && existsSync(resolve(dir, 'CHANGELOG.md')));
    })
    .map(entry => {
      assert.match(entry.name, safeName, '脚本目录只能包含小写字母、数字和连字符');
      return entry.name;
    }).sort();
}

export function selectScripts(scripts, files, full = false) {
  // 根目录文件与 CI 配置属于公共约定；脚本内任何文件的变化只影响该脚本。
  if (full || files.some(file => !file.includes('/') || file.startsWith('.github/'))) return [...scripts];
  const changedDirs = new Set(files.map(file => file.split('/')[0]));
  return scripts.filter(script => changedDirs.has(script));
}

export function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(version);
  assert.ok(match, `版本号必须符合 semver：${version}`);
  const prerelease = match[4]?.split('.') ?? [];
  assert.ok(!prerelease.some(part => /^0\d+$/.test(part)), '预发布版本的数字标识不能有前导零');
  return { core: match.slice(1, 4).map(BigInt), prerelease };
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  const compare = (x, y) => x < y ? -1 : x > y ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    const result = compare(a.core[i], b.core[i]);
    if (result) return result;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return compare(Number(!a.prerelease.length), Number(!b.prerelease.length));
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i];
    if (x === undefined || y === undefined) return compare(a.prerelease.length, b.prerelease.length);
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    const result = nx && ny ? compare(BigInt(x), BigInt(y))
      : nx !== ny ? (nx ? -1 : 1) : compare(x, y);
    if (result) return result;
  }
  return 0;
}

function metadata(source) {
  const block = /^\uFEFF?\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m.exec(source);
  assert.ok(block, '缺少完整的 userscript 文件头');
  const fields = new Map();
  for (const match of block[1].matchAll(/^\/\/[ \t]+@(\S+)(?:[ \t]+([^\r\n]+))?$/gm)) {
    fields.set(match[1], [...(fields.get(match[1]) ?? []), match[2]?.trim() ?? '']);
  }
  return { fields, body: source.slice(block.index + block[0].length) };
}

export function validateScript(source, changelog, previousSource = null, previousChangelog = '') {
  const { fields, body } = metadata(source);
  for (const field of ['name', 'namespace', 'version', 'description', 'author', 'match', 'run-at', 'license', 'icon']) {
    assert.ok(fields.get(field)?.length, `缺少 @${field}`);
    if (field !== 'match') assert.equal(fields.get(field).length, 1, `@${field} 不能重复`);
  }
  const version = fields.get('version')[0];
  parseVersion(version);
  assert.equal(fields.get('run-at')[0], 'document-idle', '@run-at 必须为 document-idle');
  assert.equal(fields.get('license')[0], 'MIT', '@license 必须为 MIT');
  assert.match(fields.get('icon')[0], /^https:\/\/[^\s]*twemoji[^\s]*\.png$/, '@icon 必须使用 Twemoji PNG');
  const grants = fields.get('grant') ?? [];
  assert.ok(grants.every(grant => /^GM_\w+$/.test(grant)), '@grant 只能声明具体 GM_* API');
  assert.equal(new Set(grants).size, grants.length, '@grant 不能重复');
  const used = new Set([...body.matchAll(/\b(GM_\w+)\s*\(/g)].map(match => match[1]));
  assert.deepEqual(new Set(grants), used, '@grant 必须与实际调用的 GM_* API 一致');
  assert.match(body, /\bconst\s+CONFIG\s*=\s*\{/, '缺少 CONFIG 对象');
  assert.match(body, /\(function\s*\(\)\s*\{[\s\S]*\}\)\(\);\s*$/, '脚本必须使用独立 IIFE');

  const latest = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/m.exec(changelog);
  assert.ok(latest, 'CHANGELOG 缺少带日期的版本条目');
  assert.equal(latest[1], version, '最新 CHANGELOG 版本与 @version 不一致');
  const entry = changelog.slice(latest.index + latest[0].length).split(/^## /m)[0];
  assert.match(entry, /^### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*$/m, '变更记录缺少 Keep a Changelog 分类');
  assert.match(entry, /^- \S.+/m, '变更记录缺少具体内容');

  // 仅 PR 比较完整差异；不逐条检查中间提交，允许代码与版本升级分开提交。
  if (previousSource !== null && source.replaceAll('\r\n', '\n') !== previousSource.replaceAll('\r\n', '\n')) {
    const oldVersion = metadata(previousSource).fields.get('version')?.[0];
    assert.ok(oldVersion, '基线脚本缺少版本号');
    assert.ok(compareVersions(version, oldVersion) > 0, `脚本修改后必须升级版本：原版本 ${oldVersion}`);
    assert.ok(!previousChangelog.includes(`## [${version}]`), '新版本必须新增 CHANGELOG 条目');
  }
  return version;
}

export function checkScript(script, versionBase = '', root = '.') {
  assert.match(script, safeName, '脚本目录名称非法');
  const sourcePath = `${script}/${script}.user.js`;
  const changelogPath = `${script}/CHANGELOG.md`;
  for (const path of [sourcePath, changelogPath, `${script}/README.md`]) {
    assert.ok(existsSync(resolve(root, path)), `缺少 ${path}`);
  }
  let oldSource = null, oldChangelog = '';
  if (versionBase) {
    const oldFiles = git('ls-tree', '-r', '--name-only', versionBase, '--', sourcePath).trim();
    if (oldFiles) {
      oldSource = git('show', `${versionBase}:${sourcePath}`);
      oldChangelog = git('show', `${versionBase}:${changelogPath}`);
    }
  }
  const version = validateScript(read(resolve(root, sourcePath)), read(resolve(root, changelogPath)), oldSource, oldChangelog);
  execFileSync(process.execPath, ['--check', resolve(root, sourcePath)], { stdio: 'inherit' });
  const overview = read(resolve(root, 'README.md')).split(/\r?\n/);
  assert.ok(overview.some(line => line.startsWith('|') && line.includes(`(./${script}/)`)
    && /https:\/\/greasyfork\.org\/[^\s)]*scripts\/\d+/.test(line)), '根 README 缺少脚本目录与 GreasyFork 安装链接');
  console.log(`${script} ${version}：结构、元数据、语法及版本检查通过`);
}

export function eventRange(eventName, event) {
  if (eventName === 'pull_request') {
    const base = git('merge-base', event.pull_request.base.sha, event.pull_request.head.sha).trim();
    return { base, head: event.pull_request.head.sha, versionBase: base };
  }
  // 推送按本次范围 before..after 检查，要求推送后的净结果已升级版本；首次推送没有基线。
  if (eventName === 'push' && event.before && !/^0+$/.test(event.before)) {
    return { base: event.before, head: event.after, versionBase: event.before };
  }
  return { base: '', head: 'HEAD', versionBase: '' };
}

function plan() {
  assert.match(read('LICENSE'), /^MIT License/m, '根 LICENSE 必须为 MIT');
  const scripts = discoverScripts();
  assert.ok(scripts.length, '仓库中没有找到脚本目录');
  for (const row of read('README.md').split(/\r?\n/).filter(line => line.startsWith('|'))) {
    for (const match of row.matchAll(/\(\.\/([^/]+)\/\)/g)) {
      assert.ok(scripts.includes(match[1]), `根 README 引用了不存在的脚本目录：${match[1]}`);
    }
  }
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(read(process.env.GITHUB_EVENT_PATH)) : {};
  const range = eventRange(process.env.GITHUB_EVENT_NAME, event);
  // 首次推送、手动或本地运行执行全量；基线缺失时显式失败，避免静默漏检。
  const files = range.base ? git('diff', '--name-only', '--no-renames', '-z', range.base, range.head, '--').split('\0').filter(Boolean) : [];
  const selected = selectScripts(scripts, files, !range.base);
  const outputs = {
    scripts: JSON.stringify(selected),
    'has-scripts': String(selected.length > 0),
    'version-base': range.versionBase,
  };
  console.log(`检查目录：${selected.join('、') || '无变更脚本'}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'plan') plan();
    else if (process.argv[2] === 'check') checkScript(process.argv[3] ?? '', process.env.VERSION_BASE);
    else throw new Error('用法：node .github/scripts/ci.mjs plan | check <脚本目录>');
  } catch (error) {
    console.error(`检查失败：${error.message}`);
    process.exitCode = 1;
  }
}
