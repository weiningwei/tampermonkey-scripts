# Auto Linkify（网页文本转链接）

自动将网页中以纯文本形式出现的 URL（如 `https://example.com`）转换为可点击的链接，无需手动选中或手动加链接。支持动态加载的页面（SPA）。

## 功能特性

- 自动识别网页正文中的 `http/https` 链接并转为可点击的 `<a>` 标签。
- 可选在新标签页打开（`target="_blank"`，并附带 `rel="noopener noreferrer"`）。
- 通过 `MutationObserver` 监听 DOM 变化，自动适配动态加载 / 无限滚动 / 单页应用。
- 安全：仅使用 DOM API 创建节点，不使用 `innerHTML` 拼接；仅允许 `http/https` 协议，防止伪协议 XSS。
- 智能跳过：不会处理 `<script>`、`<style>`、`<textarea>`、`<input>`、`<a>`、`<code>`、`<pre>` 等元素内的文本，避免破坏代码、表单与已有链接。

## 安装

1. 安装浏览器油猴扩展（[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）。
2. 点击扩展图标 → 「新建脚本」，将本仓库 `auto-linkify/auto-linkify.user.js` 的内容粘贴保存；
   或直接访问该 `.user.js` 文件地址，油猴会自动提示安装。
3. 也可从 GreasyFork 一键安装：<https://greasyfork.org/zh-CN/scripts/587142-auto-linkify-%E7%BD%91%E9%A1%B5%E6%96%87%E6%9C%AC%E8%BD%AC%E9%93%BE%E6%8E%A5>。
4. 刷新网页即可生效。

## 适用范围

默认 `@match *://*/*`，即所有 http/https 页面均可生效。如需限定域名，修改脚本头部的 `@match` 即可。

## 可配置项

脚本顶部 `CONFIG` 对象支持修改：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `OPEN_IN_NEW_TAB` | `true` | 链接是否在新标签页打开 |
| `DEBOUNCE_MS` | `300` | 动态内容处理的防抖间隔（毫秒） |
| `PATTERNS` | URL 正则 | 需要识别的文本模式数组，可扩展邮箱等 |
| `SKIP_TAGS` | 见源码 | 不处理的标签集合 |

### 扩展识别类型（示例）

将邮箱也转为链接，把 `PATTERNS` 改为：

```js
PATTERNS: [
  /https?:\/\/[^\s<>"']+/gi,
  /[\w.+-]+@[\w-]+\.[\w.-]+/gi,
],
```

并在 `makeLink` 中为邮箱拼接 `mailto:` 前缀（当前仅处理 http/https）。

## 注意事项

- 不会处理代码块、输入框、已有链接内的文本。
- 识别基于文本正则，无法理解语义（例如把"网址"两个字变成链接）；只转换字面出现的 URL 文本。
- 若页面频繁大量变动，防抖间隔 `DEBOUNCE_MS` 可调大以降低开销。

## 测试

项目提供两套测试方案，共 28 个用例覆盖 7 大类：

| 方式 | 文件 | 说明 |
|------|------|------|
| 浏览器 | `test.html` | 直接打开，点击按钮检查结果 |
| 命令行 | `test.js` | `npm install && npm test`，支持 `--verbose` / `--bail` |

### 测试覆盖

| 类别 | 用例数 | 内容 |
|------|--------|------|
| 基础 URL 识别 | 3 | HTTP、HTTPS、多 URL |
| URL 与中文混合 | 4 | 前后中文、全角逗号、多 URL+标点 |
| Skip Zone | 7 | `<a>`, `<code>`, `<pre>`, `<textarea>`, `<button>`, `<pre><code>`, `<input>` |
| Shadow DOM | 3 | 单层、嵌套、三层嵌套 |
| 边界情况 | 5 | 无 URL、email/ftp、javascript:、锚点、端口号 |
| 动态内容 | 2 | 增量 linkify、characterData 变动 |
| 内部工具函数 | 4 | pruneRoots 去重/断开/空集/兄弟节点 |

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。
