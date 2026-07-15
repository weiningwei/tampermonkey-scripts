# tampermonkey-scripts

个人油猴（Tampermonkey / Violentmonkey）脚本集合。每个脚本是一个独立文件夹，内含脚本实现 `*.user.js`、说明 `README.md` 与变更记录 `CHANGELOG.md`。

## 脚本总览

| 脚本 | 说明 | 路径 |
|------|------|------|
| auto-linkify | 自动将网页文本中的 URL 转为可点击链接，支持动态内容 | [`auto-linkify/`](./auto-linkify/) |

## 安装方式

1. 安装浏览器油猴扩展（[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）。
2. 进入对应脚本文件夹，打开 `*.user.js`，油猴会自动提示安装；或将脚本内容粘贴到「新建脚本」中保存。

## License

仓库整体采用 `LICENSE` 中声明的协议；单个脚本若另有声明，以脚本文件头 `@license` 为准。
