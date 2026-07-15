# Changelog

本项目所有脚本的变更记录遵循 [Keep a Changelog](https://keepachangelog.com/) 风格。

## [1.1.0] - 2026-07-15

### Changed
- 性能优化：`MutationObserver` 触发后仅处理发生变动的子树，不再每次全量扫描整页 DOM，降低动态页面（SPA、无限滚动、实时内容）上的开销。

## [1.0.0] - 2026-07-15

### Added
- 自动将网页文本中的 `http/https` URL 转为可点击链接。
- 支持动态加载内容（`MutationObserver` + 防抖）。
- 可配置是否在新标签页打开。
- 智能跳过代码块、输入框、已有链接等区域，避免误改。
