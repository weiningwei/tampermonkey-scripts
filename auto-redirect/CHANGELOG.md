# Changelog

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-11-16

### Added

- 首个版本：跳过平台外链提醒页，点击外链后自动直达目标网址。
- 参数型规则内置知乎、掘金、CSDN、Gitee、开源中国、简书、QQ 邮箱；`location.replace` 直达且不污染历史记录。
- 支持按钮型规则（自动点击「继续访问」按钮，含 MutationObserver 与轮询兜底），默认未配置站点，可在 `CONFIG.CLICK_RULES` 扩展。
- 目标网址最多解两次 URL 编码，仅接受 http/https 地址。
- 油猴扩展菜单提供全局开关，状态持久化。
