# URL Replace（网址替换新标签打开）

当浏览器当前网页的网址中包含指定字符串时，将其替换为另一字符串，并在页面右下角显示一个按钮；点击按钮后，在新标签页打开替换后的网址。

## 功能特性

- 检测当前网址（`location.href`）是否包含指定字符串 `from`，若包含则替换为 `to`。
- 支持多组替换规则，按数组顺序取第一个命中的规则。
- 仅在存在匹配时显示按钮（可配置为始终显示），按钮悬浮于页面右下角。
- 鼠标悬停按钮可预览替换后的完整网址。
- 点击按钮在新标签页打开（`window.open`，可配置为当前页跳转）。
- 同时注册油猴菜单命令（Tampermonkey / Violentmonkey 扩展图标下拉菜单），点击菜单同样打开替换后的网址。
- 仅依赖 `GM_registerMenuCommand`，兼容 Tampermonkey / Violentmonkey。

## 安装

1. 安装浏览器油猴扩展（[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）。
2. 点击扩展图标 → 「新建脚本」，将本仓库 `url-replace/url-replace.user.js` 的内容粘贴保存；
   或直接访问该 `.user.js` 文件地址，油猴会自动提示安装。
3. 也可从 GreasyFork 一键安装：<https://greasyfork.org/zh-CN/scripts/593213-url-replace-%E7%BD%91%E5%9D%80%E6%9B%BF%E6%8D%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E6%89%93%E5%BC%80>。
4. 刷新网页即可生效。

## 适用范围

默认 `@match *://*/*`，即所有 http/https 页面均可生效。如需限定域名，修改脚本头部的 `@match` 即可。

## 可配置项

脚本顶部 `CONFIG` 对象支持修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `REPLACEMENTS` | `[{ from: 'gitcode', to: 'atomgit' }]` | 替换规则数组；命中即用 `to` 替换网址中的所有 `from` |
| `BUTTON_TEXT` | `'打开替换网址'` | 按钮显示文案 |
| `ALWAYS_SHOW` | `false` | 无匹配时是否仍显示按钮 |
| `OPEN_IN_NEW_TAB` | `true` | 是否在新标签页打开（`false` 则当前页跳转） |

### 替换规则示例

将 `gitcode` 替换为 `atomgit`（默认规则）：

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

## 注意事项

- 替换为字符串级别的「包含即替换」，`from` 中出现多次会被全部替换（`String.prototype.replaceAll`）。
- 默认只在网址命中规则时显示按钮，避免无谓的页面元素注入。
- 若某页网址不含任何规则的 `from` 且 `ALWAYS_SHOW` 为 `false`，则不会注入按钮。

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。
