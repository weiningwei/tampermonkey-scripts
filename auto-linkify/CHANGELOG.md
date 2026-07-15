# Changelog

本项目所有脚本的变更记录遵循 [Keep a Changelog](https://keepachangelog.com/) 风格。

## [1.4.0] - 2026-07-15

### Added
- 扩展菜单新增统计命令，显示已转换链接数量和累计转换耗时。使用 `GM_registerMenuCommand` 实现，无需注入页面元素。

## [1.3.0] - 2026-07-15

### Changed
- 性能优化：`observeShadowsOf` 和 `collectTextNodes` 用 TreeWalker 惰性遍历替代 `querySelectorAll('*')`，避免一次性创建大量元素临时数组。
- `collectTextNodes` 将文本节点收集与 shadow root 发现合并为单个 TreeWalker，消除同一棵 DOM 树的两次遍历。
- `linkifyTextNode` 在 `collectTextNodes` 路径跳过冗余的 `isInSkipZone` 检查（TreeWalker 过滤器已做过滤），减少祖先链遍历。

## [1.2.0] - 2026-07-15

### Fixed
- 支持 Shadow DOM：现在能正确识别位于 `<bili-rich-text>` 等自定义元素 shadow root 内的链接（如 B 站评论区）。`linkify` 会遍历节点自身及其后代（含嵌套）的 shadow root，并在初始化与新增元素时把各 shadow root 纳入 `MutationObserver` 观察。
- 修正 URL 正则过度匹配：字符类排除中日韩文字与全角标点（如全角逗号“，”），避免把 URL 后的中文一并吞入，生成错误链接。

## [1.1.0] - 2026-07-15

### Changed
- 性能优化：`MutationObserver` 触发后仅处理发生变动的子树，不再每次全量扫描整页 DOM，降低动态页面（SPA、无限滚动、实时内容）上的开销。

## [1.0.0] - 2026-07-15

### Added
- 自动将网页文本中的 `http/https` URL 转为可点击链接。
- 支持动态加载内容（`MutationObserver` + 防抖）。
- 可配置是否在新标签页打开。
- 智能跳过代码块、输入框、已有链接等区域，避免误改。
