# Changelog

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-08-27

### Added

- 初始版本：检测当前网址是否包含指定字符串，替换后通过右下角按钮在新标签页打开替换后的网址。
- 支持多组替换规则、按钮文案与打开方式配置。
- 新增油猴菜单命令：扩展图标下拉菜单中点击「打开替换网址」同样打开替换后的网址。
- 默认替换规则设为 `gitcode` → `atomgit`（例：`https://gitcode.com/xxx` → `https://atomgit.com/xxx`）。
