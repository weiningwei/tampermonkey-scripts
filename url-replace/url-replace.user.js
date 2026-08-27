// ==UserScript==
// @name         URL Replace（网址替换新标签打开）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.1.0
// @description  当网址包含指定字符串时，将其替换为另一字符串，并通过按钮在新标签页打开替换后的网址。
// @author       weiningwei
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 替换规则：数组。当前网址只要包含某项的 from，就把其中的 from 全部替换为 to。
    // 按数组顺序取第一个命中的规则。
    REPLACEMENTS: [
      // 例：https://gitcode.com/xxx → https://atomgit.com/xxx
      { from: 'gitcode', to: 'atomgit' },
    ],
    // 按钮显示文案
    BUTTON_TEXT: '打开替换网址',
    // 是否在无匹配时也显示按钮（false：仅当存在匹配规则时才显示）
    ALWAYS_SHOW: false,
    // 是否在新标签页打开（true）；false 则在当前页跳转
    OPEN_IN_NEW_TAB: true,
  };
  /* ------------------------------------------------------------------- */

  // 计算替换后的网址；无匹配返回 null
  function getReplacedUrl() {
    const href = location.href;
    for (const rule of CONFIG.REPLACEMENTS) {
      if (!rule || typeof rule.from !== 'string' || rule.from === '') continue;
      if (href.includes(rule.from)) {
        return href.replaceAll(rule.from, rule.to);
      }
    }
    return null;
  }

  // 打开替换后的网址（无匹配时提示）
  function openReplaced() {
    const url = getReplacedUrl();
    if (!url) {
      alert('当前网址未命中任何替换规则。');
      return;
    }
    if (CONFIG.OPEN_IN_NEW_TAB) {
      window.open(url, '_blank');
    } else {
      location.href = url;
    }
  }

  function createButton(url) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = CONFIG.BUTTON_TEXT;
    btn.title = url;
    btn.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'padding:10px 16px',
      'font-size:14px',
      'line-height:1',
      'color:#fff',
      'background:#1a73e8',
      'border:none',
      'border-radius:6px',
      'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,.25)',
    ].join(';');
    btn.addEventListener('click', openReplaced);
    return btn;
  }

  function registerMenuCommand() {
    GM_registerMenuCommand(CONFIG.BUTTON_TEXT, openReplaced);
  }

  function init() {
    if (!document.body) return;
    registerMenuCommand();
    const url = getReplacedUrl();
    if (!url && !CONFIG.ALWAYS_SHOW) return;
    document.body.appendChild(createButton(url || location.href));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
