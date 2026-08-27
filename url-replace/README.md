# URL Replace（网址替换新标签打开）

当浏览器当前网页的网址中包含指定字符串时，可双向切换到另一字符串，并在页面右下角显示一个按钮；点击按钮后，在新标签页打开切换后的网址。支持在页面内动态增删替换规则。

## 功能特性

- **双向切换**：网址包含 `from` 时切换到 `to`；网址包含 `to` 时反向切换到 `from`（例如 `gitcode` ⇄ `atomgit`）。
- 按钮文案体现 `from`、`to` 与切换方向（默认 `{from} → {to}`，如 `gitcode → atomgit`）。
- **动态增删规则**：点击齿轮按钮打开管理面板，可新增/删除 `from`、`to` 规则，变更即时生效并全局持久化。
- 支持多组替换规则，按数组顺序取第一个命中的规则。
- 仅在存在匹配时显示按钮（可配置为始终显示），按钮悬浮于页面右下角。
- 鼠标悬停按钮可预览切换后的完整网址。
- 点击按钮在新标签页打开（`window.open`，可配置为当前页跳转）。
- 依赖 `GM_getValue` / `GM_setValue` 实现跨站点持久化，兼容 Tampermonkey / Violentmonkey。

## 安装

1. 安装浏览器油猴扩展（[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）。
2. 点击扩展图标 → 「新建脚本」，将本仓库 `url-replace/url-replace.user.js` 的内容粘贴保存；
   或直接访问该 `.user.js` 文件地址，油猴会自动提示安装。
3. 也可从 GreasyFork 安装：[URL Replace（网址替换新标签打开）](https://greasyfork.org/zh-CN/scripts/593213-url-replace-%E7%BD%91%E5%9D%80%E6%9B%BF%E6%8D%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E6%89%93%E5%BC%80)。
4. 刷新网页即可生效。

## 适用范围

默认 `@match *://*/*`，即所有 http/https 页面均可生效。如需限定域名，修改脚本头部的 `@match` 即可。

## 可配置项

脚本顶部 `CONFIG` 对象支持修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `REPLACEMENTS` | `[{ from: 'gitcode', to: 'atomgit' }]` | 初始默认规则；仅在首次运行时写入存储，之后以页面内增删为准 |
| `BUTTON_TEXT` | `'{from} → {to}'` | 按钮文案模板；`{from}`、`{to}` 会被替换为当前方向的原串、目标串 |
| `ALWAYS_SHOW` | `false` | 无匹配时是否仍显示切换按钮 |
| `OPEN_IN_NEW_TAB` | `true` | 是否在新标签页打开（`false` 则当前页跳转） |

### 替换规则示例

将 `gitcode` 替换为 `atomgit`（默认规则，双向切换）：

```js
REPLACEMENTS: [
  { from: 'gitcode', to: 'atomgit' },
],
```

多组规则（按顺序匹配，先命中先生效）：

```js
REPLACEMENTS: [
  { from: 'http://', to: 'https://' },
  { from: 'www.', to: '' },
],
```

## 规则管理（动态增删）

- 页面右下角工具栏右侧有齿轮按钮（⚙），点击展开「规则管理」面板。
- 面板顶部为当前规则列表，每条规则右侧有「删除」按钮；下方两个输入框分别填写 `from` 与 `to`，点击「添加」（或回车）即可新增规则。
- 面板右上角「重置为默认」按钮：一键清空所有规则，恢复为 `CONFIG.REPLACEMENTS` 的默认值。
- 新增/删除/重置立即生效，并写入 `GM_setValue` 全局存储，跨站点（例如 gitcode.com 与 atomgit.com 之间）共享，刷新页面后仍然保留。
- `CONFIG.REPLACEMENTS` 仅在首次运行时作为初始规则写入；之后以页面内增删的结果为准。

## 注意事项

- 替换为字符串级别的「包含即替换」，`from`/`to` 中出现多次会被全部替换（`String.prototype.replaceAll`）。
- 双向切换按 `from` 优先判断：若网址同时包含 `from` 与 `to`，按 `from → to` 方向处理。
- 默认只在网址命中规则时显示按钮，避免无谓的页面元素注入。
- 若某页网址不含任何规则的 `from` 或 `to` 且 `ALWAYS_SHOW` 为 `false`，则不会注入按钮。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。
