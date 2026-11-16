// ==UserScript==
// @name         Auto Redirect（外链直达）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.1.0
// @description  跳过各平台的外链提醒页（继续访问/即将离开提示），点击链接后自动直达真实目标网址，无需再点一次；内置常见平台规则，可在脚本顶部扩展。
// @author       weiningwei
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @icon         https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f517.png
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 参数型规则：提醒页网址的查询参数里带真实目标网址，命中后直接 location.replace 直达。
    // host 为精确域名；param 为目标网址所在的参数名；pathPrefix 可选，限定路径前缀。
    PARAM_RULES: [
      { host: 'link.zhihu.com', param: 'target' },
      { host: 'link.juejin.cn', param: 'target' },
      { host: 'link.csdn.net', param: 'target' },
      { host: 'gitee.com', param: 'target', pathPrefix: '/link' },
      { host: 'www.oschina.net', param: 'url', pathPrefix: '/action/GoToLink' },
      { host: 'www.jianshu.com', param: 'to', pathPrefix: '/go' },
      { host: 'mail.qq.com', param: 'url', pathPrefix: '/cgi-bin/readtemplate' },
    ],
    // 按钮型规则：提醒页网址里不含目标参数，只能等「继续访问」按钮渲染出来后自动点击。
    // selectors 为候选选择器列表，命中任一即点击；请按站点实测选择器填写。
    CLICK_RULES: [],
  };
  /* ------------------------------------------------------------------- */

  const ENABLED_KEY = 'auto-redirect.enabled';

  function isEnabled() {
    return GM_getValue(ENABLED_KEY, true) !== false;
  }

  // 解析目标网址：最多处理两次 URL 编码（部分平台双重编码），仅接受 http/https 地址
  function normalizeTarget(raw) {
    let value = raw;
    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch (e) {
        break;
      }
    }
    return /^https?:\/\//i.test(value) ? value : null;
  }

  // 命中参数型规则时返回目标网址，否则返回 null
  function matchParamTarget() {
    const rule = CONFIG.PARAM_RULES.find(r => r.host === location.hostname
      && (!r.pathPrefix || location.pathname.startsWith(r.pathPrefix)));
    if (!rule) return null;
    const raw = new URLSearchParams(location.search).get(rule.param);
    if (!raw) return null;
    return normalizeTarget(raw);
  }

  // 参数型提醒页：直接把当前页替换为目标网址（location.replace 不污染历史记录，
  // 后退仍回到点出链接的原页面而不是提醒页）
  function redirectByParam() {
    const target = matchParamTarget();
    if (target) {
      location.replace(target);
      return true;
    }
    return false;
  }

  // 按钮型提醒页：先直接找一次按钮，找不到再监听 DOM 渲染，另设定时器兜底
  // （部分站点按钮是异步渲染，MutationObserver 与轮询各覆盖一类场景）
  function clickByRule() {
    const rule = CONFIG.CLICK_RULES.find(r => r.host === location.hostname);
    if (!rule) return;
    const tryClick = () => {
      for (const selector of rule.selectors) {
        const el = document.querySelector(selector);
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    };
    if (tryClick()) return;
    const observer = new MutationObserver(() => {
      if (tryClick()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    let attempts = 0;
    const timer = setInterval(() => {
      if (tryClick() || ++attempts > 20) {
        clearInterval(timer);
        observer.disconnect();
      }
    }, 500);
  }

  // 油猴扩展菜单：全局开关（个别提醒页想停留查看时用）
  function toggleEnabled() {
    const next = !isEnabled();
    GM_setValue(ENABLED_KEY, next);
    alert(next ? '已开启外链直达：提醒页将自动跳转到目标网址。' : '已关闭外链直达：提醒页保持原样。');
  }

  function init() {
    if (isEnabled()) {
      GM_registerMenuCommand('关闭外链直达', toggleEnabled);
      if (!redirectByParam()) clickByRule();
    } else {
      GM_registerMenuCommand('开启外链直达', toggleEnabled);
    }
  }

  init();
})();
