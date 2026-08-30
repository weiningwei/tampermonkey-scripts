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

## Adding a new script

1. Create a new folder named after the script
2. Add `<name>.user.js`, `README.md`, `CHANGELOG.md`
3. Follow Keep a Changelog format in CHANGELOG.md
4. Add a row to the root `README.md` script table
5. No build, lint, or CI — manual review only

## Testing

- `auto-linkify` has a Node CLI test suite (jsdom): `cd auto-linkify && npm install && npm test`
  - Equivalent to `node test.js`; `--verbose` for detailed output, `--bail` to stop on first failure
  - Exit codes: `0` = all pass / `1` = failures / `2` = runtime error
  - Note: `test.js` duplicates the script's core logic rather than importing it — keep `test.js` in sync when changing `.user.js`
- Other scripts (e.g. `url-replace`) have no automated tests: install the `.user.js` into Tampermonkey/Violentmonkey and verify behavior on real pages.

## Git

- Single-project repo, not a monorepo; default branch is `main`
- No branch conventions established yet
