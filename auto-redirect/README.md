# Auto Redirect（外链直达）

跳过各平台的外链提醒页（「继续访问」「即将离开 xx」之类提示页）。点击外链后脚本自动直达真实目标网址，不再需要多点一次。

## 功能特性

- **参数型直达**：知乎、掘金、CSDN、Gitee、开源中国、简书、QQ 邮箱等平台的提醒页网址自带目标参数（如 `link.zhihu.com/?target=...`），脚本解析出真实网址后用 `location.replace` 直达——不污染历史记录，浏览器后退仍回到点出链接的原页面，而不是提醒页。
- **按钮型自动点击**：部分平台提醒页网址不含目标参数，只能等「继续访问」按钮渲染后自动点击。脚本内置该机制（`CLICK_RULES`），默认未配置站点，按需添加（见下文「扩展规则」）。
- **安全性**：目标网址最多解两次 URL 编码（部分平台双重编码），且只接受 `http://` / `https://` 开头的地址，其余一律不跳转。
- **全局开关**：油猴扩展菜单「关闭/开启外链直达」，想停留查看某个提醒页时可临时关闭；状态持久化。
- **零打扰**：未命中任何规则的页面不做任何事，不注入界面。
- 仅顶层页面运行（`@noframes`）。

## 安装

- GreasyFork 安装：[Auto Redirect（外链直达）](https://greasyfork.org/zh-CN/scripts/605804-auto-redirect-%E5%A4%96%E9%93%BE%E7%9B%B4%E8%BE%BE)。
- 手动安装：安装本仓库 `auto-redirect/auto-redirect.user.js`，通用步骤见[根目录 README](../README.md)。

## 适用范围

默认 `@match *://*/*`（需要覆盖各平台提醒页域名），实际只对 `CONFIG` 规则命中的页面生效。

## 内置规则

| 平台 | 提醒页域名 | 目标参数 | 路径限定 |
|------|-----------|---------|---------|
| 知乎 | `link.zhihu.com` | `target` | - |
| 掘金 | `link.juejin.cn` | `target` | - |
| CSDN | `link.csdn.net` | `target` | - |
| Gitee | `gitee.com` | `target` | `/link` |
| 开源中国 | `www.oschina.net` | `url` | `/action/GoToLink` |
| 简书 | `www.jianshu.com` | `to` | `/go` |
| QQ 邮箱 | `mail.qq.com` | `url` | `/cgi-bin/readtemplate` |

## 扩展规则

脚本顶部 `CONFIG` 支持增改：

**参数型**（推荐，目标网址在提醒页 URL 的查询参数里）：

```js
{ host: 'link.example.com', param: 'target', pathPrefix: '/go' } // pathPrefix 可选
```

**按钮型**（提醒页 URL 不含目标参数，需自动点「继续访问」按钮）：

```js
{ host: 'www.example.com', selectors: ['#continue-btn', '.btn-continue'] }
```

按钮型规则会先直接找按钮，找不到再监听 DOM 渲染（MutationObserver），并每 500ms 轮询兜底约 10 秒，异步渲染的按钮也能点到。

## 注意事项

- 想临时停留在提醒页（查看提示内容）时，用油猴菜单「关闭外链直达」。
- 个别平台提醒页参数格式特殊或频繁改版，命中失败时按「扩展规则」补充即可。
