# Changelog

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-08-27

### Removed

- 移除油猴菜单命令（`GM_registerMenuCommand`），仅保留页面右下角按钮；`@grant` 改回 `none`。

## [0.2.0] - 2026-08-27

### Added

- 支持双向切换：网址包含 `from` 时切到 `to`，包含 `to` 时反向切到 `from`。
- 按钮/菜单文案支持模板 `{from} → {to}`，自动体现当前切换方向（如 `gitcode → atomgit`）。

### Changed

- `BUTTON_TEXT` 默认值由 `'打开替换网址'` 改为 `'{from} → {to}'`。

## [0.1.0] - 2026-08-27

### Added

- 初始版本：检测当前网址是否包含指定字符串，替换后通过右下角按钮在新标签页打开替换后的网址。
- 支持多组替换规则、按钮文案与打开方式配置。
- 新增油猴菜单命令：扩展图标下拉菜单中点击「打开替换网址」同样打开替换后的网址。
- 默认替换规则设为 `gitcode` → `atomgit`（例：`https://gitcode.com/xxx` → `https://atomgit.com/xxx`）。
