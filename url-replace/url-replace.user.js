// ==UserScript==
// @name         URL Replace（网址替换新标签打开）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.2.0
// @description  网址包含指定字符串时双向切换，并通过按钮/菜单在新标签页打开切换后的网址。
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
    // 替换规则：数组。按数组顺序取第一个命中的规则。
    // 当前网址包含 from 时切换为 to；包含 to 时反向切换为 from（双向）。
    REPLACEMENTS: [
      // 例：https://gitcode.com/xxx ⇄ https://atomgit.com/xxx
      { from: 'gitcode', to: 'atomgit' },
    ],
    // 按钮文案模板：{from} 与 {to} 会被替换为当前切换方向的原串/目标串
    BUTTON_TEXT: '{from} → {to}',
    // 是否在无匹配时也显示按钮（false：仅当存在匹配规则时才显示）
    ALWAYS_SHOW: false,
    // 是否在新标签页打开（true）；false 则在当前页跳转
    OPEN_IN_NEW_TAB: true,
  };
  /* ------------------------------------------------------------------- */

  // 判断切换方向：返回 { from, to, url }，无匹配返回 null
  function detectSwitch() {
    const href = location.href;
    for (const rule of CONFIG.REPLACEMENTS) {
      if (!rule || typeof rule.from !== 'string' || typeof rule.to !== 'string') continue;
      if (rule.from === '' || rule.to === '') continue;
      // 正向：网址包含 from
      if (href.includes(rule.from)) {
        return { from: rule.from, to: rule.to, url: href.replaceAll(rule.from, rule.to) };
      }
      // 反向：网址包含 to
      if (href.includes(rule.to)) {
        return { from: rule.to, to: rule.from, url: href.replaceAll(rule.to, rule.from) };
      }
    }
    return null;
  }

  // 生成按钮/菜单文案：体现 from、to 与切换方向
  function formatLabel(sw) {
    return CONFIG.BUTTON_TEXT.replaceAll('{from}', sw.from).replaceAll('{to}', sw.to);
  }

  // 打开切换后的网址（无匹配时提示）
  function openReplaced() {
    const sw = detectSwitch();
    if (!sw) {
      alert('当前网址未命中任何替换规则。');
      return;
    }
    if (CONFIG.OPEN_IN_NEW_TAB) {
      window.open(sw.url, '_blank');
    } else {
      location.href = sw.url;
    }
  }

  function createButton(sw) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = formatLabel(sw);
    btn.title = sw.url;
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

  function registerMenuCommand(sw) {
    GM_registerMenuCommand(formatLabel(sw), openReplaced);
  }

  function init() {
    if (!document.body) return;
    const sw = detectSwitch();
    if (sw) {
      registerMenuCommand(sw);
      document.body.appendChild(createButton(sw));
    } else if (CONFIG.ALWAYS_SHOW) {
      // 无匹配仍显示：按钮文案退化为占位，点击时提示未命中
      const fallback = { from: '?', to: '?', url: '' };
      registerMenuCommand(fallback);
      document.body.appendChild(createButton(fallback));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
