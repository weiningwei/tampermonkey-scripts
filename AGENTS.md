# Agents.md

## Structure

- Each script lives in its own folder: `<name>/<name>.user.js`, `README.md`, `CHANGELOG.md`
- Root `README.md` lists all scripts with a table (including the GreasyFork install link)
- `.user.js` is the distributable — no bundler, no build step
- Scripts are self-contained IIFEs with no shared modules between them

## Script conventions

- Userscript header declares only the specific `GM_*` APIs it uses (e.g. `GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`); do not use `@grant none` or a broad grant
- `@match *://*/*` by default; respect per-script `@match` if present
- `@run-at document-idle`
- `@license MIT` in script header; root `LICENSE` also MIT
- Header declares an `@icon` (Twemoji PNG URL) so the script shows an icon in the manager UI
- Config exposed as a `CONFIG` object near the top of each script
- All documentation is in Chinese

## Versioning

- `@version` is semver; every `.user.js` change must bump `@version` and add a Keep a Changelog entry in that script's `CHANGELOG.md`
- Do not add emojis or change versions in CHANGELOG/README without a corresponding `.user.js` change
- 代码及说明修复与版本号、CHANGELOG 更新分开提交；CI 在 PR 中按完整差异检查版本递增，不要求每个中间提交都升级版本。

## Adding a new script

1. Create a new folder named after the script
2. Add `<name>.user.js`, `README.md`, `CHANGELOG.md`
3. Follow Keep a Changelog format in CHANGELOG.md
4. Add a row to the root `README.md` script table
5. 无构建步骤；通过目录级 CI 检查，并在真实页面手动验证。新增脚本会自动纳入 CI，无需修改工作流目录列表。

## Testing

- `auto-linkify` has a Node CLI test suite (jsdom): `cd auto-linkify && npm install && npm test`
  - Equivalent to `node test.js`; `--verbose` for detailed output, `--bail` to stop on first failure
  - Exit codes: `0` = all pass / `1` = failures / `2` = runtime error
  - `test.js` 的核心函数测试保留独立实现，修改 `.user.js` 时须保持同步；另外有直接加载分发脚本的 MutationObserver 回归测试。
- Other scripts (e.g. `url-replace`) have no automated tests: install the `.user.js` into Tampermonkey/Violentmonkey and verify behavior on real pages.
- GitHub Actions 在 PR、推送到 `main` 和手动触发时运行。脚本目录内的变更只检查对应脚本；根目录文件或 `.github/` 变更检查全部，手动触发也检查全部。
- CI 检查目录结构、userscript 元数据、GM 授权、JavaScript 语法、根 README 安装链接、版本与 CHANGELOG 对应关系；带 `package.json` 的脚本额外执行 `npm ci` 和 `npm test`，须提交锁文件。
- PR 按共同祖先至 PR 分支最新状态检查版本递增；推送到 `main` 只检查当前版本与 CHANGELOG 对应，不检查每次提交的版本递增。自动检查无法替代真实站点的安装与行为验证。
- 本地检查：`node --test .github/scripts/ci.test.mjs`；`node .github/scripts/ci.mjs plan`；`node .github/scripts/ci.mjs check <脚本目录>`。

## Git

- Single-project repo, not a monorepo; default branch is `main`
- No branch conventions established yet
- 每个脚本的改动单独提交，不将多个脚本的修改混入同一个提交；公共 CI 与仓库文档使用独立提交。
