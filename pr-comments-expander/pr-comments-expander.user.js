// ==UserScript==
// @name         PR Comments Expander（PR 评论全部展开）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.2.0
// @description  GitCode / AtomGit 的 PR 页面自动展开被折叠的评论：连续点击「此处折叠了 N 条消息 … 查看更多」，直到没有折叠块为止。
// @author       weiningwei
// @match        *://gitcode.com/*
// @match        *://atomgit.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @license      MIT
// @icon         https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4ac.png
// ==/UserScript==
(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 打开 PR 页面时是否自动展开（可在油猴菜单中切换，状态持久化）
    AUTO_EXPAND: true,
    // 在哪些路径下工作：PR 详情页。
    // 注意 @match 是整站（脚本需在跳转「前」的页面就已注入，SPA 站内跳转不会再注入脚本），
    // 因此是否真正生效由本正则判断。默认覆盖 /<owner>/<repo>/pull/<n> 及其子路径与查询串。
    PR_PATH: /^\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#].*)?$/,
    // 折叠块容器选择器（GitCode / AtomGit PR 讨论区：此处折叠了 N 条消息 … 查看更多）
    COLLAPSE_SELECTOR: '.collapse-btn',
    // 容器内优先点击的元素（从内到外；点击子元素会冒泡，父级上的事件处理同样触发）
    CLICK_SELECTORS: ['.collapse-btn__more', '.collapse-btn-content'],
    // 兜底策略：当上面的选择器在页面上找不到任何元素时（页面改版），
    // 改为在 FALLBACK_ROOTS 内按文案匹配可点击元素。设为 null 可关闭兜底。
    FALLBACK_TEXTS: /查看更多|查看全部|展开全部|展开更多|加载更多|显示更多|show more|load more|expand all/i,
    FALLBACK_ROOTS: '[class*="comment"], [class*="discussion"], main',
    FALLBACK_TAGS: 'button, a, [role="button"], div, span',
    // 单轮内两次点击的间隔（毫秒），给 Vue 留出响应时间
    CLICK_INTERVAL_MS: 150,
    // 一轮结束到重新扫描的间隔（毫秒），等待异步接口返回
    ROUND_INTERVAL_MS: 600,
    // 最多扫描轮数
    MAX_ROUNDS: 60,
    // 单次展开任务的总时长上限（毫秒）
    MAX_RUN_MS: 30000,
    // DOM 变化后的防抖间隔（毫秒）
    DEBOUNCE_MS: 400,
    // 是否显示右下角「展开全部评论」按钮
    SHOW_PANEL: true,
  };
  /* ------------------------------------------------------------------- */

  const AUTO_KEY = 'prCommentsExpander.autoExpand';
  const DONE_ATTR = 'data-pce-done';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let autoExpand = CONFIG.AUTO_EXPAND;
  let running = false;
  let menuId = null;
  let panel = null;
  let statusEl = null;
  let debounceTimer = null;

  /* ------------------------------ 目标查找 ------------------------------ */

  // 当前是否处于 PR 详情页
  function isActive() {
    return CONFIG.PR_PATH.test(location.pathname);
  }

  function isVisible(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0;
  }

  function isDone(el) {
    return !!el && (el.hasAttribute(DONE_ATTR) || !!el.closest('[' + DONE_ATTR + ']'));
  }

  // 优先点击最内层元素：事件冒泡可覆盖父级上可能存在的点击处理
  function clickTargetOf(container) {
    for (const selector of CONFIG.CLICK_SELECTORS) {
      const inner = container.querySelector(selector);
      if (inner) return inner;
    }
    return container;
  }

  // 兜底：按文案在评论 / 讨论区域内找可点击元素
  function findByText() {
    if (!CONFIG.FALLBACK_TEXTS) return [];
    const found = [];
    const roots = document.querySelectorAll(CONFIG.FALLBACK_ROOTS);
    for (const root of roots) {
      const candidates = root.querySelectorAll(CONFIG.FALLBACK_TAGS);
      for (const el of candidates) {
        if (found.indexOf(el) !== -1) continue;
        const text = (el.textContent || '').trim();
        if (!text || text.length > 40) continue;
        if (!CONFIG.FALLBACK_TEXTS.test(text)) continue;
        if (!isVisible(el)) continue;
        found.push(el);
      }
    }
    return found;
  }

  function findTargets() {
    const containers = Array.prototype.filter.call(
      document.querySelectorAll(CONFIG.COLLAPSE_SELECTOR),
      isVisible
    );
    if (containers.length) return containers.map(clickTargetOf);
    return findByText();
  }

  /* ------------------------------ 展开流程 ------------------------------ */

  async function run() {
    if (running) return;
    running = true;
    setStatus('展开中…', 'busy');

    const startedAt = Date.now();
    let clicks = 0;

    try {
      for (let round = 0; round < CONFIG.MAX_ROUNDS; round++) {
        if (Date.now() - startedAt > CONFIG.MAX_RUN_MS) break;

        const targets = findTargets();
        let clickedInRound = 0;

        for (const target of targets) {
          if (Date.now() - startedAt > CONFIG.MAX_RUN_MS) break;
          if (!isVisible(target) || isDone(target)) continue;
          target.setAttribute(DONE_ATTR, '1');
          target.click();
          clicks++;
          clickedInRound++;
          await sleep(CONFIG.CLICK_INTERVAL_MS);
        }

        if (!clickedInRound) break;
        await sleep(CONFIG.ROUND_INTERVAL_MS);
      }
    } finally {
      running = false;
    }

    setStatus(clicks ? '已展开 ' + clicks + ' 处' : '暂无折叠内容', clicks ? 'ok' : 'idle');
  }

  function schedule() {
    if (!autoExpand || !isActive()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, CONFIG.DEBOUNCE_MS);
  }

  /* -------------------------------- 界面 -------------------------------- */

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color =
      kind === 'busy' ? '#ffd54f' : kind === 'ok' ? '#8bc34a' : 'rgba(255,255,255,.6)';
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'pr-comments-expander-panel';
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483000',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 10px',
      'border-radius:8px',
      'background:rgba(32,33,36,.92)',
      'color:#fff',
      'font:12px/1.4 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,.3)',
      'user-select:none',
    ].join(';');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '展开全部评论';
    btn.title = '展开本页所有被折叠的评论';
    btn.style.cssText = [
      'padding:5px 10px',
      'border:0',
      'border-radius:6px',
      'background:#4c8bf5',
      'color:#fff',
      'font:inherit',
      'cursor:pointer',
    ].join(';');
    btn.addEventListener('click', run);

    statusEl = document.createElement('span');
    setStatus('', 'idle');

    panel.appendChild(btn);
    panel.appendChild(statusEl);
    document.body.appendChild(panel);
  }

  // 面板只在 PR 详情页显示；站内跳转进出 PR 页时随之创建 / 隐藏
  function syncPanel() {
    if (!CONFIG.SHOW_PANEL) return;
    if (isActive()) {
      if (!panel && document.body) buildPanel();
      if (panel) panel.style.display = 'flex';
    } else if (panel) {
      panel.style.display = 'none';
    }
  }

  function refreshMenu() {
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') {
      GM_unregisterMenuCommand(menuId);
    }
    menuId = GM_registerMenuCommand('自动展开评论：' + (autoExpand ? '开' : '关'), () => {
      autoExpand = !autoExpand;
      GM_setValue(AUTO_KEY, autoExpand);
      refreshMenu();
      if (autoExpand) schedule();
    });
  }

  /* ---------------------------- SPA 与 DOM 监听 ---------------------------- */

  // 忽略脚本自身造成的 DOM 变化，避免「改状态文本 → 触发观察 → 再改状态」的空转
  function isSelfMutation(records) {
    return records.every((r) => {
      const node = r.target;
      return !!node && node.nodeType === 1 && (node === panel || (panel && panel.contains(node)));
    });
  }

  const observer = new MutationObserver((records) => {
    if (!autoExpand || isSelfMutation(records)) return;
    schedule();
  });

  // 站内跳转后重新扫描（Nuxt SPA 不会触发 load 事件）
  let lastHref = location.href;
  function checkUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const marked = document.querySelectorAll('[' + DONE_ATTR + ']');
    for (const el of marked) el.removeAttribute(DONE_ATTR);
    setStatus('', 'idle');
    syncPanel();
    schedule();
  }

  function hookHistory() {
    for (const name of ['pushState', 'replaceState']) {
      const original = history[name];
      if (typeof original !== 'function') continue;
      history[name] = function () {
        const result = original.apply(this, arguments);
        checkUrlChange();
        return result;
      };
    }
    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);
  }

  /* -------------------------------- 启动 -------------------------------- */

  function init() {
    autoExpand = GM_getValue(AUTO_KEY, CONFIG.AUTO_EXPAND) !== false;
    syncPanel();
    refreshMenu();
    hookHistory();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  }

  init();
})();
