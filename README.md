# tampermonkey-scripts

个人油猴（Tampermonkey / Violentmonkey）脚本集合。每个脚本是一个独立文件夹，内含脚本实现 `*.user.js`、说明 `README.md` 与变更记录 `CHANGELOG.md`。

## 脚本总览

| 脚本 | 版本 | 说明 | 路径 | GreasyFork |
|------|------|------|------|-----------|
| auto-linkify | 1.5.4 | 自动将网页文本中的 URL 转为可点击链接，支持动态内容 | [`auto-linkify/`](./auto-linkify/) | [安装](https://greasyfork.org/zh-CN/scripts/587142-auto-linkify-%E7%BD%91%E9%A1%B5%E6%96%87%E6%9C%AC%E8%BD%AC%E9%93%BE%E6%8E%A5) |
| url-replace | 0.19.5 | 网址包含指定字符串时替换并新标签页打开 | [`url-replace/`](./url-replace/) | [安装](https://greasyfork.org/zh-CN/scripts/593213-url-replace-%E7%BD%91%E5%9D%80%E6%9B%BF%E6%8D%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E6%89%93%E5%BC%80) |
| pr-comments-expander | 0.3.6 | GitCode / AtomGit 的 PR 页面自动展开被折叠的评论 | [`pr-comments-expander/`](./pr-comments-expander/) | [安装](https://greasyfork.org/zh-CN/scripts/593763-pr-comments-expander-pr-%E8%AF%84%E8%AE%BA%E5%85%A8%E9%83%A8%E5%B1%95%E5%BC%80) |
| background-color | 0.10.0 | 网页背景色一键切换：预设护眼配色与自定义 RGB 颜色（实时预览） | [`background-color/`](./background-color/) | [安装](https://greasyfork.org/zh-CN/scripts/605797-background-color-%E7%BD%91%E9%A1%B5%E8%83%8C%E6%99%AF%E8%89%B2%E8%87%AA%E5%AE%9A%E4%B9%89) |
| auto-redirect | 0.1.0 | 跳过平台外链提醒页（继续访问提示），自动直达目标网址 | [`auto-redirect/`](./auto-redirect/) | [安装](https://greasyfork.org/zh-CN/scripts/605804-auto-redirect-%E5%A4%96%E9%93%BE%E7%9B%B4%E8%BE%BE) |

> 「版本」列为脚本头部 `@version` 的当前值，与各脚本 `CHANGELOG.md` 的最新条目一致。

## 安装方式

1. 安装浏览器油猴扩展（[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）。
2. 进入对应脚本文件夹，打开 `*.user.js`，油猴会自动提示安装；或将脚本内容粘贴到「新建脚本」中保存。
3. 刷新网页即可生效。

> 各脚本也可从上表「脚本总览」的 GreasyFork 列直接安装。

## 质量检查

仓库通过 [GitHub Actions](./.github/workflows/ci.yml) 做基础质量检查，无需构建脚本：

运行环境固定为 Ubuntu 24.04 与 Node.js 24，操作系统大版本升级通过修改工作流显式进行，避免 `ubuntu-latest` 标签迁移时自动切换环境。

| 变更范围 | 检查范围 |
|----------|----------|
| 某个脚本目录中的代码、文档、测试或依赖文件 | 只检查该脚本；同时修改多个脚本时分别检查 |
| 根目录文件或 `.github/` | 检查全部脚本 |
| 手动运行工作流 | 检查全部脚本 |

工作流在 PR 和推送到 `main` 时触发，自动发现脚本目录，并按目录生成独立检查任务。PR 使用整个分支相对共同祖先的差异，推送使用本次推送前后的差异；首次推送执行全量检查。无相关脚本变更时跳过脚本任务，仍提供固定的 `CI` 汇总结果，可将其设为分支保护的必需检查。

各脚本均检查文件结构、userscript 头部、GM 授权、JavaScript 语法、根目录安装链接，以及当前版本与最新 CHANGELOG 的一致性；`plan` 还会比对根 README 脚本总览的版本列与各脚本 `@version`，脚本升版本后忘记同步表格会直接失败。有 `package.json` 的脚本还会通过锁文件安装依赖并运行 `npm test`；目前为 auto-linkify 的 31 项测试。CI 自身的目录选择和校验逻辑也有独立测试。

代码修复与版本升级可以分开提交。PR 在最终整体差异中要求修改过的 `.user.js` 升级版本并新增 CHANGELOG 条目；推送到 `main` 时检查当前状态，不要求每个中间提交都升级版本。直接推送代码时，仍需自行确保补齐版本升级提交。

使用 Node.js 24 可在本地运行：

```sh
node --test .github/scripts/ci.test.mjs
node .github/scripts/ci.mjs plan
node .github/scripts/ci.mjs check auto-linkify
cd auto-linkify
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`plan` 在本地默认列出全部脚本；`check` 检查指定脚本的结构、语法与当前版本，不执行行为测试。真实站点的选择器、油猴权限、SPA 跳转及触摸交互仍需人工验证。

## License

仓库整体采用 `LICENSE` 中声明的协议；单个脚本若另有声明，以脚本文件头 `@license` 为准。
