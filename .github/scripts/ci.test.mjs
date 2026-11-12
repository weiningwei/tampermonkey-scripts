import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, discoverScripts, selectScripts, validateScript } from './ci.mjs';

const scripts = ['auto-linkify', 'pr-comments-expander', 'url-replace'];
const source = `// ==UserScript==
// @name 示例脚本
// @namespace https://example.com/
// @version 1.0.0
// @description 测试脚本
// @author 示例作者
// @match *://*/*
// @run-at document-idle
// @noframes
// @grant GM_getValue
// @license MIT
// @icon https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f517.png
// ==/UserScript==
(function () {
  const CONFIG = {};
  GM_getValue('example');
})();
`;
const changelog = version => `# Changelog\n\n## [${version}] - 2026-11-12\n\n### Fixed\n\n- 修复示例行为。\n`;

test('只选择变更目录，包含文档、测试与依赖文件', () => {
  for (const file of ['url-replace.user.js', 'README.md', 'test.js', 'package-lock.json']) {
    assert.deepEqual(selectScripts(scripts, [`url-replace/${file}`]), ['url-replace']);
  }
  assert.deepEqual(selectScripts(scripts, ['auto-linkify/test.js', 'url-replace/README.md']), ['auto-linkify', 'url-replace']);
});

test('公共文件与手动运行检查全部，空变更及无关目录不运行脚本任务', () => {
  for (const file of ['README.md', 'AGENTS.md', 'LICENSE', '.github/workflows/ci.yml', '.github/scripts/ci.mjs']) {
    assert.deepEqual(selectScripts(scripts, [file]), scripts);
  }
  assert.deepEqual(selectScripts(scripts, [], true), scripts);
  assert.deepEqual(selectScripts(scripts, []), []);
  assert.deepEqual(selectScripts(scripts, ['other/note.md']), []);
  assert.deepEqual(selectScripts(scripts, ['removed/removed.user.js']), []);
});

test('semver 比较支持数字顺序、预发布与构建标识', () => {
  for (const [before, after] of [['1.9.9', '1.10.0'], ['1.0.0-alpha.2', '1.0.0-alpha.10'],
    ['1.0.0-1', '1.0.0-alpha'], ['1.0.0-alpha', '1.0.0-alpha.1'], ['1.0.0-rc.1', '1.0.0']]) {
    assert.equal(compareVersions(after, before), 1);
    assert.equal(compareVersions(before, after), -1);
  }
  assert.equal(compareVersions('1.0.0+build1', '1.0.0+build2'), 0);
  for (const invalid of ['01.0.0', '1.0', 'v1.0.0', '1.0.0-01']) {
    assert.throws(() => compareVersions(invalid, '1.0.0'));
  }
});

test('合法元数据及 CRLF 文件通过，不将无值 @noframes 吞作下一条 grant', () => {
  assert.equal(validateScript(source, changelog('1.0.0')), '1.0.0');
  assert.equal(validateScript(source.replaceAll('\n', '\r\n'), changelog('1.0.0')), '1.0.0');
  assert.equal(validateScript(source.replaceAll('\n', '\r\n'), changelog('1.0.0'), source), '1.0.0');
});

test('拒绝元数据缺失、过宽授权与多余或遗漏的授权', () => {
  for (const [from, to] of [
    ['// @license MIT\n', ''], ['// @grant GM_getValue', '// @grant none'],
    ['// @grant GM_getValue', '// @grant GM_getValue\n// @grant GM_setValue'],
    ['// @grant GM_getValue\n', ''], ['document-idle', 'document-start'],
    ['// @license MIT', '// @license GPL-3.0'], ['const CONFIG', 'const OPTIONS'],
  ]) {
    assert.throws(() => validateScript(source.replace(from, to), changelog('1.0.0')));
  }
});

test('拒绝版本不对应或没有具体分类及内容的变更记录', () => {
  assert.throws(() => validateScript(source, changelog('1.0.1')), /版本/);
  assert.throws(() => validateScript(source, changelog('1.0.0').replace('### Fixed', '### 其他')), /分类/);
  assert.throws(() => validateScript(source, changelog('1.0.0').replace('- 修复示例行为。', '')), /具体内容/);
});

test('PR 修改脚本必须升级版本，但文档修改不要求升级', () => {
  const changed = source.replace("'example'", "'changed'");
  assert.throws(() => validateScript(changed, changelog('1.0.0'), source, changelog('1.0.0')), /必须升级版本/);
  const upgraded = changed.replace('1.0.0', '1.0.1');
  assert.equal(validateScript(upgraded, changelog('1.0.1'), source, changelog('1.0.0')), '1.0.1');
  assert.throws(() => validateScript(upgraded, changelog('1.0.1'), source, changelog('1.0.1')), /新增 CHANGELOG/);
  assert.equal(validateScript(source, changelog('1.0.0'), source, changelog('1.0.0')), '1.0.0');
});

test('实际 Git 事件按整体差异选择脚本，支持拆分提交、首次推送与删除目录', () => {
  const tempRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(tempRoot, 'userscript-ci-'));
  const ciPath = fileURLToPath(new URL('./ci.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (path, content) => writeFileSync(join(root, path), content);
  const env = { ...process.env, GITHUB_EVENT_PATH: join(root, 'event.json'), GITHUB_OUTPUT: join(root, 'output') };
  const runPlan = (name, event) => {
    write('event.json', JSON.stringify(event));
    write('output', '');
    execFileSync(process.execPath, [ciPath, 'plan'], { cwd: root, env: { ...env, GITHUB_EVENT_NAME: name } });
    return Object.fromEntries(readFileSync(join(root, 'output'), 'utf8').trim().split('\n').map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
  };
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'CI 测试');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'core.autocrlf', 'false');
    write('LICENSE', 'MIT License\n');
    write('README.md', '| 示例 | [目录](./example/) | [安装](https://greasyfork.org/zh-CN/scripts/1) |\n');
    for (const script of ['example', 'another']) {
      mkdirSync(join(root, script));
      write(`${script}/${script}.user.js`, source);
      write(`${script}/README.md`, '# 示例\n');
      write(`${script}/CHANGELOG.md`, changelog('1.0.0'));
    }
    git('add', '.');
    git('commit', '-m', '初始版本');
    const base = git('rev-parse', 'HEAD');
    write('example/example.user.js', source.replace("'example'", "'changed'"));
    git('add', 'example');
    git('commit', '-m', '修复代码');
    const codeCommit = git('rev-parse', 'HEAD');
    write('example/example.user.js', source.replace('1.0.0', '1.0.1').replace("'example'", "'changed'"));
    write('example/CHANGELOG.md', changelog('1.0.1'));
    git('add', 'example');
    git('commit', '-m', '升级版本');
    const head = git('rev-parse', 'HEAD');
    const pr = runPlan('pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } });
    assert.deepEqual(JSON.parse(pr.scripts), ['example']);
    assert.equal(pr['version-base'], base);
    execFileSync(process.execPath, [ciPath, 'check', 'example'], { cwd: root, env: { ...env, VERSION_BASE: base } });
    const push = runPlan('push', { before: base, after: head });
    assert.deepEqual(JSON.parse(push.scripts), ['example']);
    assert.equal(push['version-base'], '');
    // 中间的代码提交可以单独推送，PR 最终状态仍会要求升级版本。
    assert.equal(runPlan('push', { before: base, after: codeCommit })['version-base'], '');
    assert.deepEqual(JSON.parse(runPlan('push', { before: '0'.repeat(40), after: head }).scripts), ['another', 'example']);
    assert.deepEqual(JSON.parse(runPlan('workflow_dispatch', {}).scripts), ['another', 'example']);
    git('rm', 'another/another.user.js');
    assert.ok(discoverScripts(root).includes('another'), '误删脚本但保留文档时仍需检查');
    git('rm', '-r', 'another');
    git('commit', '-m', '删除完整脚本目录');
    const deleted = runPlan('push', { before: head, after: git('rev-parse', 'HEAD') });
    assert.equal(deleted['has-scripts'], 'false');
    assert.deepEqual(JSON.parse(deleted.scripts), []);
  } finally {
    const target = realpathSync(root);
    assert.equal(dirname(target), tempRoot, '只清理本测试创建的临时目录');
    assert.ok(basename(target).startsWith('userscript-ci-'));
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
