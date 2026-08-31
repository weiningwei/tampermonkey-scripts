# Changelog

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-08-31

### Added

- 初始版本：打开 GitCode / AtomGit 的 PR 页面时自动连续点击讨论区折叠块（「此处折叠了 N 条消息 … 查看更多」），一次性展开全部被折叠的评论。
- 按轮次扫描 + `MutationObserver` 监听 DOM 变化，适配折叠内容的异步加载与展开后新出现的嵌套折叠块。
- 已点击元素加 `data-pce-done` 标记，配合单次任务时长上限，避免接口失败时反复点击。
- 右下角「展开全部评论」按钮与状态提示（`展开中…` / `已展开 N 处` / `暂无折叠内容`），支持手动再跑一次。
- 油猴菜单「自动展开评论：开 / 关」切换自动展开，状态通过 `GM_getValue` / `GM_setValue` 持久化。
- 适配 Nuxt SPA：监听 `popstate` / `hashchange` / `pushState` / `replaceState`，站内跳转后重新扫描。
- 文案兜底：折叠块选择器失效时，改为在评论 / 讨论区域内按「查看更多 / 展开更多 / 加载更多 / Show more…」等文案匹配点击。
