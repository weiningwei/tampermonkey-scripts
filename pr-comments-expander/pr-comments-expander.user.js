// ==UserScript==
// @name         PR Comments Expander（PR 评论全部展开）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.3.5
// @description  GitCode / AtomGit 的 PR 页面按轮次点击评论折叠块，尝试展开被折叠的评论，并显示已点击次数。
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
    // 是否显示右下角「展开评论」按钮
    SHOW_PANEL: true,
  };
  /* ------------------------------------------------------------------- */

  const AUTO_KEY = 'prCommentsExpander.autoExpand';
  const DONE_ATTR = 'data-pce-done';
  const PANEL_POS_KEY = 'prCommentsExpander.panelPos';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

  let autoExpand = CONFIG.AUTO_EXPAND;
  let running = false;
  // 当前页面累计已点击的折叠块数；不代表接口成功或实际展开的评论数。
  let clickedCount = 0;
  let menuId = null;
  let panel = null;
  let statusEl = null;
  let debounceTimer = null;
  let runGeneration = 0;
  let rerunRequested = false;

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
    // 多个 root 可能互相包含（如 main），用 Set 记录已访问元素，避免重复扫描与 O(n²) 去重
    const seen = new Set();
    const roots = document.querySelectorAll(CONFIG.FALLBACK_ROOTS);
    for (const root of roots) {
      const candidates = root.querySelectorAll(CONFIG.FALLBACK_TAGS);
      for (const el of candidates) {
        if (seen.has(el)) continue;
        seen.add(el);
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

  /* --------------------------- 滚动位置保护 --------------------------- */

  // 页面自身在展开后常把视口滚到刚展开的讨论处（scrollIntoView / scrollTo）。
  // 脚本代点的折叠块往往不在用户当前阅读位置，视口被带跑很打断阅读。
  // 在代点期间把这些编程式滚动 API 临时置为空操作，任务结束恢复原样。
  // 用户自己的滚轮 / 触摸 / 键盘滚动不走这些 API，不受影响。
  let scrollSuppressed = 0;
  let savedScrollApis = null;

  function suppressScroll() {
    if (scrollSuppressed++) return;
    const pairs = [];
    const mute = (obj, name) => {
      if (typeof obj[name] !== 'function') return;
      pairs.push([obj, name, obj[name]]);
      obj[name] = function () {};
    };
    mute(window, 'scrollTo');
    mute(window, 'scrollBy');
    mute(window, 'scroll');
    if (window.Element) {
      mute(window.Element.prototype, 'scrollIntoView');
      mute(window.Element.prototype, 'scrollTo');
      mute(window.Element.prototype, 'scrollBy');
      mute(window.Element.prototype, 'scroll');
    }
    savedScrollApis = pairs;
  }

  function restoreScrollApis() {
    if (scrollSuppressed > 0) scrollSuppressed--;
    if (scrollSuppressed > 0 || !savedScrollApis) return;
    for (const pair of savedScrollApis) pair[0][pair[1]] = pair[2];
    savedScrollApis = null;
  }

  /* ------------------------------ 展开流程 ------------------------------ */

  async function run() {
    if (!isActive()) return;
    if (running) {
      rerunRequested = true;
      return;
    }
    running = true;
    const generation = runGeneration;
    setStatus('展开中', 'busy');
    suppressScroll();

    const startedAt = Date.now();

    try {
      for (let round = 0; round < CONFIG.MAX_ROUNDS; round++) {
        if (generation !== runGeneration || !isActive()) break;
        if (Date.now() - startedAt > CONFIG.MAX_RUN_MS) break;

        const targets = findTargets();
        let clickedInRound = 0;

        for (const target of targets) {
          if (generation !== runGeneration || !isActive()) break;
          if (Date.now() - startedAt > CONFIG.MAX_RUN_MS) break;
          if (!isVisible(target) || isDone(target)) continue;
          target.setAttribute(DONE_ATTR, '1');
          target.click();
          clickedCount++;
          clickedInRound++;
          setStatus('展开中 ' + clickedCount, 'busy');
          await sleep(CONFIG.CLICK_INTERVAL_MS);
        }

        if (!clickedInRound) break;
        await sleep(CONFIG.ROUND_INTERVAL_MS);
      }
    } finally {
      restoreScrollApis();
      running = false;
    }

    // 仅由当前页面的任务更新状态；切页后的新任务负责新页面的状态。
    if (generation === runGeneration && isActive()) {
      setStatus(clickedCount ? '已点击 ' + clickedCount : '无折叠', clickedCount ? 'ok' : 'idle');
    }
    if (rerunRequested) {
      rerunRequested = false;
      schedule();
    }
  }

  function schedule() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (!autoExpand || !isActive()) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      run();
    }, CONFIG.DEBOUNCE_MS);
  }

  /* -------------------------------- 界面 -------------------------------- */

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color =
      kind === 'busy' ? '#ffd54f' : kind === 'ok' ? '#8bc34a' : 'rgba(255,255,255,.6)';
    keepPanelInView();
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'pr-comments-expander-panel';
    panel.style.cssText = [
      'position:fixed',
      'left:auto',
      'top:auto',
      'z-index:2147483000',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:5px 9px',
      'border-radius:8px',
      'background:rgba(32,33,36,.92)',
      'color:#fff',
      'font:12px/1.4 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,.3)',
      'user-select:none',
      'touch-action:none',
      'cursor:move',
    ].join(';');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pce-drag-exclude';
    btn.textContent = '展开评论';
    btn.title = '展开本页所有被折叠的评论（轻点展开；按住拖动可移动面板）';
    btn.style.cssText = [
      'padding:4px 9px',
      'border:0',
      'border-radius:6px',
      'background:#4c8bf5',
      'color:#fff',
      'font:inherit',
      'cursor:pointer',
    ].join(';');
    btn.addEventListener('click', run);

    statusEl = document.createElement('span');

    panel.appendChild(btn);
    panel.appendChild(statusEl);
    document.body.appendChild(panel);
    makeDraggable(panel);
    positionPanel();
    // 面板挂载并定位后再写状态：setStatus 会调用 keepPanelInView，
    // 此时面板已有尺寸与坐标，不会先被夹到视口左上角
    setStatus('', 'idle');
  }

  // 面板初始位置：优先读取上次拖动后的位置，否则默认右下角
  function positionPanel() {
    if (!panel) return;
    const saved = GM_getValue(PANEL_POS_KEY, null);
    if (saved && saved.left && saved.top) {
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = saved.left;
      panel.style.top = saved.top;
      keepPanelInView();
      return;
    }
    const rect = panel.getBoundingClientRect();
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = clamp(window.innerWidth - rect.width - 16, 4, window.innerWidth - rect.width - 4) + 'px';
    panel.style.top = clamp(window.innerHeight - rect.height - 16, 4, window.innerHeight - rect.height - 4) + 'px';
  }

  // 让面板可拖动（Pointer Events 统一鼠标 / 触摸 / 触控笔），面板上任意位置（含按钮）
  // 都能作为拖动起点：移动超过阈值判定为拖动，松手后吞掉紧随的 click 并把位置持久化到
  // GM 存储；未移动（轻点）则不拦截，按钮点击正常触发「展开评论」。位置限制在视口内。
  // 面板样式带 touch-action:none，触摸拖动不会被页面滚动接管，按钮轻点仍会合成 click。
  function makeDraggable(el) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0, moved = false;

    // 拖动后吞掉同一次操作紧跟的 click（click 在 pointerup 后同步派发，
    // 先于 setTimeout 回调），防止拖动被误判成按钮点击；无 click 时立即自行移除
    function killNextClick() {
      const kill = (e) => { e.stopPropagation(); e.preventDefault(); };
      document.addEventListener('click', kill, { capture: true });
      setTimeout(() => document.removeEventListener('click', kill, { capture: true }), 0);
    }

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return; // 仅左键 / 触摸 / 笔主键
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = startLeft + 'px';
      el.style.top = startTop + 'px';
      el.style.cursor = 'grabbing';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = clamp(startLeft + dx, 4, window.innerWidth - w - 4) + 'px';
      el.style.top = clamp(startTop + dy, 4, window.innerHeight - h - 4) + 'px';
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = 'move';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (moved) {
        GM_setValue(PANEL_POS_KEY, { left: el.style.left, top: el.style.top });
        killNextClick();
      }
    }

    el.addEventListener('pointerdown', onDown);
  }

  // 恢复位置、状态文字变宽或视口变化时都重新限制位置。
  function keepPanelInView() {
    if (!panel || panel.style.display === 'none') return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const savedLeft = parseFloat(panel.style.left);
    const savedTop = parseFloat(panel.style.top);
    const left = Number.isFinite(savedLeft) ? savedLeft : 4;
    const top = Number.isFinite(savedTop) ? savedTop : 4;
    panel.style.left = clamp(left, 4, window.innerWidth - w - 4) + 'px';
    panel.style.top = clamp(top, 4, window.innerHeight - h - 4) + 'px';
  }
  window.addEventListener('resize', keepPanelInView);

  // 面板只在 PR 详情页显示；站内跳转进出 PR 页时随之创建 / 隐藏
  function syncPanel() {
    if (!CONFIG.SHOW_PANEL) return;
    if (isActive()) {
      if (!panel && document.body) buildPanel();
      if (panel) {
        panel.style.display = 'flex';
        keepPanelInView();
      }
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
      if (!autoExpand) {
        runGeneration++;
        rerunRequested = false;
      }
      refreshMenu();
      schedule();
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

  // 站内跳转后重新扫描（Nuxt SPA 不会触发 load 事件）。
  // 仅在路径变化时清零计数与标记：查询串 / 锚点变化（如页面记录展开状态）不算换页
  let lastHref = location.href;
  let lastPath = location.pathname;
  function checkUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      runGeneration++;
      rerunRequested = false;
      clickedCount = 0;
      const marked = document.querySelectorAll('[' + DONE_ATTR + ']');
      for (const el of marked) el.removeAttribute(DONE_ATTR);
      setStatus('', 'idle');
    }
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
