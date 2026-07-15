# Agents.md

## Structure

- Each script lives in its own folder: `<name>/<name>.user.js`, `README.md`, `CHANGELOG.md`
- Root `README.md` lists all scripts with a table
- `.user.js` is the distributable — no bundler, no build step, no package.json

## Script conventions

- Userscript header uses `@grant none` (no GM_* APIs available)
- `@match *://*/*` by default; respect per-script `@match` if present
- `@run-at document-idle`
- `@license MIT` in script header; root `LICENSE` also MIT
- Config exposed as a `CONFIG` object near the top of each script
- All documentation is in Chinese

## Adding a new script

1. Create a new folder named after the script
2. Add `<name>.user.js`, `README.md`, `CHANGELOG.md`
3. Follow Keep a Changelog format in CHANGELOG.md
4. Add a row to the root `README.md` script table
5. No build, lint, test, or CI — manual review only

## Testing

No test framework. Test by installing the `.user.js` into Tampermonkey/Violentmonkey and verifying behavior on real pages.

## Git

- Single-project repo, not a monorepo
- No branch conventions established yet (single commit as of writing)
