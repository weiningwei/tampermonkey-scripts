# PR Comments Expander（PR 评论全部展开）

打开 GitCode / AtomGit 的 PR 页面时，自动连续点击讨论区里的折叠块（「此处折叠了 N 条消息 … **查看更多**」），把被折叠的评论一次性全部展开，无需手动一个个点。

## 功能特性

- **自动全部展开**：进入 PR 页面后自动扫描并逐个点击折叠块，展开后若又出现新的折叠块（嵌套折叠）会继续展开，直到页面上没有折叠块为止。
- **适配异步加载**：折叠内容由接口异步返回，脚本按轮次扫描并配合 `MutationObserver` 监听 DOM 变化，内容加载出来后会继续处理。
- **不会死循环**：已点击过的元素会被标记，接口失败或点击无效的按钮不会被反复点击；单次任务还有总时长上限。
- **右下角手动按钮**：显示「展开全部评论」按钮与状态（`展开中…` / `已展开 N 处` / `暂无折叠内容`），随时可手动再跑一次。
- **自动开关持久化**：油猴菜单「自动展开评论：开 / 关」可切换是否自动展开，状态通过 `GM_setValue` 持久化；关闭后仍可用右下角按钮手动展开。
- **适配 SPA**：GitCode / AtomGit 是 Nuxt 单页应用，脚本监听 `popstate` / `hashchange` / `pushState` / `replaceState`，站内跳转到另一个 PR 后会重新扫描。
- **文案兜底**：若站点改版导致折叠块选择器失效，会自动改为在评论 / 讨论区域内按文案（查看更多、展开更多、加载更多、Show more…）匹配并点击；可在 `CONFIG.FALLBACK_TEXTS` 设为 `null` 关闭。
- 仅顶层页面运行（`@noframes`），避免 iframe 内重复注入。

## 安装

- GreasyFork 安装：[PR Comments Expander（PR 评论全部展开）](https://greasyfork.org/zh-CN/scripts/593763-pr-comments-expander-pr-%E8%AF%84%E8%AE%BA%E5%85%A8%E9%83%A8%E5%B1%95%E5%BC%80)。
- 手动安装：打开本目录的 `pr-comments-expander.user.js`，油猴会自动提示安装；通用步骤见[根目录 README](../README.md)。

## 适用范围

`@match` 匹配 GitCode / AtomGit 整站：

```
// @match        *://gitcode.com/*
// @match        *://atomgit.com/*
```

是否真正生效由 `CONFIG.PR_PATH`（默认 `/^\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#].*)?$/`）判断，即形如 `https://gitcode.com/Cangjie/cangjie_test/pull/2091` 的 PR 详情页（含其子路径与查询串）。

**为什么匹配整站而不是只匹配 PR 页**：GitCode / AtomGit 是 Nuxt 单页应用，从 PR 列表页点击进入 PR 详情页属于站内前端路由跳转，不会产生新文档，油猴脚本也不会重新注入。若只匹配 PR 页，脚本在跳转来源页（列表页、仓库首页等）根本没有注入，跳转后自然不生效，只有 F5 整页刷新才会展开。匹配整站后，脚本在来源页就已注入，跳转进入 PR 页时立即开始工作；右下角按钮也只在 PR 页显示。

同一个折叠组件在 Issue 详情页也存在，如需一并生效，把 `CONFIG.PR_PATH` 改为：

```js
PR_PATH: /^\/[^/]+\/[^/]+\/(pull|issues)\/\d+(?:[/?#].*)?$/,
```

## 可配置项

脚本顶部 `CONFIG` 对象支持修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `AUTO_EXPAND` | `true` | 打开页面时是否自动展开；油猴菜单可切换，切换结果优先于此默认值 |
| `PR_PATH` | `/^\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#].*)?$/` | 在哪些路径下工作（PR 详情页）；`@match` 是整站，实际生效范围由此正则判断 |
| `COLLAPSE_SELECTOR` | `'.collapse-btn'` | 折叠块容器选择器 |
| `CLICK_SELECTORS` | `['.collapse-btn__more', '.collapse-btn-content']` | 容器内优先点击的元素（从内到外）；点击子元素会冒泡，父级上的事件处理同样能触发 |
| `FALLBACK_TEXTS` | `/查看更多\|查看全部\|展开全部\|展开更多\|加载更多\|显示更多\|show more\|load more\|expand all/i` | 兜底文案正则；设为 `null` 关闭兜底 |
| `FALLBACK_ROOTS` | `'[class*="comment"], [class*="discussion"], main'` | 兜底时的查找范围，避免误点导航等无关按钮 |
| `FALLBACK_TAGS` | `'button, a, [role="button"], div, span'` | 兜底时被视为可点击的标签 |
| `CLICK_INTERVAL_MS` | `150` | 同一轮内两次点击的间隔，给前端框架留出响应时间 |
| `ROUND_INTERVAL_MS` | `600` | 一轮结束到重新扫描的间隔，等待异步接口返回 |
| `MAX_ROUNDS` | `60` | 最多扫描轮数 |
| `MAX_RUN_MS` | `30000` | 单次展开任务的总时长上限（毫秒） |
| `DEBOUNCE_MS` | `400` | DOM 变化后的防抖间隔 |
| `SHOW_PANEL` | `true` | 是否显示右下角按钮 |

## 使用说明

1. 安装脚本后打开任意 GitCode / AtomGit 的 PR 页面，脚本会自动展开所有折叠评论，右下角显示「已展开 N 处」。
2. 若内容较多、展开过程中页面又加载了新的折叠块，脚本会继续处理；也可点击右下角「展开全部评论」再跑一次。
3. 不想自动展开时，在油猴扩展菜单里点击「自动展开评论：开」切换为「关」。

## 注意事项

- 展开依赖页面自身的接口返回，评论特别多时耗时取决于网络；`ROUND_INTERVAL_MS` 与 `MAX_RUN_MS` 可适当调大。
- 脚本通过元素上的 `data-pce-done` 属性记录已点击的折叠块，站内跳转时会自动清除该标记并重新扫描。
- 站点改版后若选择器失效，脚本文案兜底仍可工作；如要精确适配，改 `COLLAPSE_SELECTOR` / `CLICK_SELECTORS` 即可。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。
