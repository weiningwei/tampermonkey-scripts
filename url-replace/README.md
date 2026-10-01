# URL Replace（网址替换新标签打开）

当浏览器当前网页的网址命中替换规则时，在页面右下角显示切换按钮；点击后在新标签页打开切换后的网址。支持一个来源配置多个目标（如 github → github1s / gitdiagram，命中时每个目标各一个按钮纵向堆叠显示），也可在页面内动态增删替换规则。

## 功能特性

- **双向切换**：网址**域名**包含 `from` 时切换到 `to`；包含 `to` 时反向切换到 `from`（例如 `gitcode` ⇄ `atomgit`）。仅替换域名，路径 / 查询 / 哈希保持不变。
- **一对多**：同一 `from` 可对应多个 `to`（如 `github` → `github1s` 与 `github` → `gitdiagram`），命中时纵向堆叠显示多个按钮，单击直达；在目标站（如 github1s.com）上则显示反向按钮返回来源。
- **子串智能判定**：互为子串的域名（github / github1s / gitdiagram）会取 hostname 命中的**最长者**作为当前站点，非最长者不参与渲染，避免误判。
- 按钮文案固定为规则的 `from`、`to` 原串，箭头体现切换方向：正向 `from → to`，反向 `from ← to`（默认模板 `{from} {arrow} {to}`）；目标串加粗高亮、当前串半透明弱化。
- **动态增删规则**：点击工具栏齿轮按钮（或右键工具栏、或油猴扩展菜单「管理规则」）打开管理面板，可新增/删除 `from`、`to` 规则，变更即时生效并全局持久化。
- 支持多组替换规则；同一来源的多个目标全部纵向堆叠显示为独立按钮。
- **零打扰原则**：仅在网址命中规则时注入工具栏（目标按钮 + 齿轮），其它页面完全不出现任何元素。
- **按钮位置可拖动**：按住工具栏拖动即可调整位置，位置持久化，刷新后保留；规则管理面板自动跟随工具栏显示。
- 鼠标悬停按钮可预览切换后的完整网址。
- 点击按钮在新标签页打开（`window.open`，可配置为当前页跳转）。
- **适配 SPA**：监听 `popstate` / `hashchange` / `pushState` / `replaceState`，站内跳转后按钮自动刷新。
- 仅顶层页面运行（`@noframes`），避免 iframe 内重复注入按钮。
- 依赖 `GM_getValue` / `GM_setValue` 实现跨站点持久化，兼容 Tampermonkey / Violentmonkey。

## 安装

- GreasyFork 安装：[URL Replace（网址替换新标签打开）](https://greasyfork.org/zh-CN/scripts/593213-url-replace-%E7%BD%91%E5%9D%80%E6%9B%BF%E6%8D%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E6%89%93%E5%BC%80)。
- 手动安装：安装本仓库 `url-replace/url-replace.user.js`，通用步骤见[根目录 README](../README.md)。

## 适用范围

默认 `@match *://*/*`，即所有 http/https 页面均可生效。如需限定域名，修改脚本头部的 `@match` 即可。

## 可配置项

脚本顶部 `CONFIG` 对象支持修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `REPLACEMENTS` | `[{ from: 'gitcode', to: 'atomgit' }, { from: 'github', to: 'github1s' }, { from: 'github', to: 'gitdiagram' }]` | 初始默认规则；首次运行时写入存储，脚本更新后新增的默认规则自动合并进存储（删除过的默认规则不会复活），其余以页面内增删为准 |
| `BUTTON_TEXT` | `'{from} {arrow} {to}'` | 按钮文案模板；`{from}`、`{to}` 为规则原串，`{arrow}` 为 `→`（正向）或 `←`（反向） |
| `OPEN_IN_NEW_TAB` | `true` | 是否在新标签页打开（`false` 则当前页跳转） |

### 替换规则示例

默认规则（双向切换 + 一对多）：

```js
REPLACEMENTS: [
  { from: 'gitcode', to: 'atomgit' },
  { from: 'github', to: 'github1s' },
  { from: 'github', to: 'gitdiagram' },
],
```

同一 `from` 写多条规则即为一对多：在 github.com 上会纵向堆叠显示「github → github1s」「github → gitdiagram」两个按钮。

## 规则管理（动态增删）

三个等价入口，任意页面均可用：

1. **齿轮按钮（⚙）**：命中规则的页面上工具栏右侧的齿轮，点击展开/收起「规则管理」面板。
2. **右键工具栏**：在命中页面的工具栏任意位置右键，即可打开/关闭面板。
3. **油猴扩展菜单**：Tampermonkey 图标菜单中的「管理规则」，未命中页面（工具栏不显示）也能打开。

面板交互：

- 面板顶部为当前规则列表，每条规则右侧有「删除」按钮；下方两个输入框分别填写 `from` 与 `to`，点击「添加」（或回车）即可新增规则。
- **点击面板与工具栏以外的任意位置，面板自动关闭**；再点一次 ⚙ / 右键也可关闭。
- 面板右上角「重置为默认」按钮：一键清空所有规则，恢复为 `CONFIG.REPLACEMENTS` 的默认值。
- 新增/删除/重置立即生效，并写入 `GM_setValue` 全局存储，跨站点（例如 gitcode.com 与 atomgit.com 之间）共享，刷新页面后仍然保留。
- `CONFIG.REPLACEMENTS` 在首次运行时作为初始规则写入；之后脚本更新时，CONFIG 中新增的默认规则会**自动合并**进存储（无需重置）——但你在页面上删除过的默认规则会被记住，不会自动复活；其余仍以页面内增删的结果为准。「重置为默认」会恢复全部默认规则并清空删除记录。

## 注意事项

- 匹配与替换仅针对域名（hostname），路径 / 查询 / 哈希不受影响（例如 `github.com/conwnet/github1s` → `github1s.com/conwnet/github1s`）。
- 域名中出现多次的 `from`/`to` 会被全部替换（`String.prototype.replaceAll`）。
- 当前站判定是**全局**的：汇总所有规则的 `from`/`to`，取 hostname 命中的最长者作为当前串；只有以当前串为一侧的规则会渲染按钮。因此 github.com 上不会出现 github1s / gitdiagram 的反向按钮，github1s.com 上也只显示「返回 github」而不会误显示「github → gitdiagram」。
- 网址未命中任何规则的页面**完全不注入**工具栏，零打扰；需要管理规则时用上面三个入口之一。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。
