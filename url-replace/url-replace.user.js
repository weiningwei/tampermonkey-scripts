// ==UserScript==
// @name         URL Replace（网址替换新标签打开）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.15.0
// @description  网址命中替换规则时一键在新标签页打开对应站点；同一来源可配多个目标（如 github → github1s / gitdiagram），支持动态增删规则。
// @author       weiningwei
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @icon         https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f501.png
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 默认替换规则：首次运行作为初始值写入存储；之后更新脚本时，新增的默认规则
    // 会自动合并进存储（你在页面上删过的默认规则不会被复活），其余以页面内增删为准。
    // 同一 from 可对应多个 to（一对多），命中时每个目标各渲染一个按钮。
    REPLACEMENTS: [
      { from: 'gitcode', to: 'atomgit' },
      { from: 'github', to: 'github1s' },
      { from: 'github', to: 'gitdiagram' },
    ],
    // 按钮文案模板：{from}、{to} 为规则原串；{arrow} 为 →（正向）或 ←（反向）
    BUTTON_TEXT: '{from} {arrow} {to}',
    // 是否在新标签页打开（true）；false 则在当前页跳转
    OPEN_IN_NEW_TAB: true,
  };
  /* ------------------------------------------------------------------- */

  const STORAGE_KEY = 'url-replace.rules';
  const POS_KEY = 'url-replace.buttonPos';
  // 记录用户在页面上删除过的默认规则（from>to），自动合并时不再复活它们
  const DELETED_DEFAULTS_KEY = 'url-replace.deletedDefaults';

  function isValidRule(r) {
    return r && typeof r.from === 'string' && typeof r.to === 'string'
      && r.from !== '' && r.to !== '';
  }

  // 读取规则：优先取存储值；首次运行用 CONFIG 初始化
  function loadRules() {
    const stored = GM_getValue(STORAGE_KEY, null);
    if (Array.isArray(stored)) {
      return stored.filter(isValidRule);
    }
    return CONFIG.REPLACEMENTS.filter(isValidRule).map(r => ({ from: r.from, to: r.to }));
  }

  // 读取被删除过的默认规则列表
  function loadDeletedDefaults() {
    const d = GM_getValue(DELETED_DEFAULTS_KEY, null);
    return Array.isArray(d) ? d : [];
  }

  // 把 CONFIG 中存储里还没有的默认规则自动补进去（脚本更新后新增默认规则即可生效），
  // 用户删过的默认规则（在 DELETED_DEFAULTS_KEY 中）不会被重新加回。
  function mergeNewDefaults() {
    const deleted = new Set(loadDeletedDefaults());
    let changed = false;
    for (const r of CONFIG.REPLACEMENTS) {
      if (!isValidRule(r)) continue;
      const key = r.from + '>' + r.to;
      if (deleted.has(key)) continue;
      if (rules.some(x => x.from === r.from && x.to === r.to)) continue;
      rules.push({ from: r.from, to: r.to });
      changed = true;
    }
    if (changed) saveRules();
  }

  function saveRules() {
    GM_setValue(STORAGE_KEY, rules);
  }

  let rules = loadRules();
  mergeNewDefaults();

  // 检测当前页面可用的切换目标：返回 [{ from, to, forward, url }]，无命中返回 []。
  // 仅针对域名（hostname）匹配与替换，路径 / 查询 / 哈希保持不变。
  // 一对多：先汇总所有规则的 from/to 字符串，取 hostname 命中的「最长者」作为当前串——
  // 这样 github / github1s / gitdiagram 等互为子串的域名在任一站点上都能正确识别自己，
  // 然后列出所有以当前串为一侧的规则：from 命中为正向（from→to，每个 to 一个按钮），
  // to 命中为反向（to→from）。命中的非最长串不参与，避免子串误判。
  function detectMatches() {
    let u;
    try {
      u = new URL(location.href);
    } catch (e) {
      return [];
    }
    const host = u.hostname;
    const strings = new Set();
    for (const rule of rules) {
      if (!isValidRule(rule)) continue;
      strings.add(rule.from);
      strings.add(rule.to);
    }
    const hits = Array.from(strings).filter(s => host.includes(s));
    if (!hits.length) return [];
    const current = hits.sort((a, b) => b.length - a.length)[0];
    const matches = [];
    const seen = new Set();
    for (const rule of rules) {
      if (!isValidRule(rule)) continue;
      let forward;
      if (rule.from === current) forward = true;
      else if (rule.to === current) forward = false;
      else continue;
      const key = (forward ? 'F:' : 'R:') + rule.from + '>' + rule.to;
      if (seen.has(key)) continue;
      seen.add(key);
      const target = forward ? rule.to : rule.from;
      u.hostname = host.replaceAll(current, target);
      matches.push({ from: rule.from, to: rule.to, forward, url: u.href });
    }
    return matches;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // 生成按钮文案：弱化当前串、强调目标串（目标串即切换后网址命中的字符串），箭头体现切换方向
  function formatLabel(sw) {
    const arrow = sw.forward === false ? '←' : '→';
    // forward=true 表示 from→to：当前串是 from，目标串是 to；反向则相反
    const dim = 'color:rgba(255,255,255,.65)';
    const strong = 'color:#fff;font-weight:bold';
    const fromStyle = sw.forward ? dim : strong;
    const toStyle = sw.forward ? strong : dim;
    const fromHtml = `<span style="${fromStyle}">${escapeHtml(sw.from)}</span>`;
    const toHtml = `<span style="${toStyle}">${escapeHtml(sw.to)}</span>`;
    const arrowHtml = `<span style="color:#fff">${arrow}</span>`;
    return CONFIG.BUTTON_TEXT
      .replaceAll('{from}', fromHtml)
      .replaceAll('{to}', toHtml)
      .replaceAll('{arrow}', arrowHtml);
  }

  // 打开切换后的网址（url 由各按钮自带；无匹配时提示）
  function openReplaced(url) {
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

  const BASE_BUTTON_STYLE = [
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

  // 切换按钮容器：一对多时纵向堆叠多个按钮（每个目标一个，等宽对齐）
  const switchWrap = document.createElement('div');
  switchWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:stretch;';

  // 齿轮按钮：开关规则管理面板
  const gearBtn = document.createElement('button');
  gearBtn.type = 'button';
  gearBtn.textContent = '⚙';
  gearBtn.title = '管理规则';
  gearBtn.style.cssText = BASE_BUTTON_STYLE + ';background:#5f6368;padding:10px 12px;';

  // 收起/展开把手已移除（v0.15.0）：未命中页面工具栏整体不注入，无需收起；命中页面按钮少且可拖动。

  // 规则管理面板
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'width:280px',
    'padding:12px',
    'background:#fff',
    'border:1px solid #ddd',
    'border-radius:8px',
    'box-shadow:0 4px 16px rgba(0,0,0,.2)',
    'color:#333',
    'font-size:13px',
    'display:none',
  ].join(';');

  const panelHeader = document.createElement('div');
  panelHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
  const panelTitle = document.createElement('span');
  panelTitle.textContent = '规则管理';
  panelTitle.style.cssText = 'font-weight:bold;';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = '重置为默认';
  resetBtn.title = '清空所有规则，恢复 CONFIG.REPLACEMENTS 默认值';
  resetBtn.style.cssText = 'padding:2px 8px;color:#1a73e8;background:none;border:1px solid #1a73e8;border-radius:4px;cursor:pointer;';
  panelHeader.append(panelTitle, resetBtn);

  const listEl = document.createElement('div');
  listEl.style.cssText = 'max-height:200px;overflow-y:auto;margin-bottom:8px;';

  const formRow = document.createElement('div');
  formRow.style.cssText = 'display:flex;gap:6px;';
  const fromInput = document.createElement('input');
  fromInput.placeholder = 'from';
  fromInput.style.cssText = 'flex:1;min-width:0;padding:6px;border:1px solid #ccc;border-radius:4px;';
  const toInput = document.createElement('input');
  toInput.placeholder = 'to';
  toInput.style.cssText = 'flex:1;min-width:0;padding:6px;border:1px solid #ccc;border-radius:4px;';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '添加';
  addBtn.style.cssText = 'padding:6px 12px;color:#fff;background:#1a73e8;border:none;border-radius:4px;cursor:pointer;';
  formRow.append(fromInput, toInput, addBtn);

  panel.append(panelHeader, listEl, formRow);

  // 开关规则管理面板（齿轮点击 / 工具栏右键 / 油猴菜单共用）
  function togglePanel() {
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) {
      renderList();
      positionPanel();
    }
  }

  gearBtn.addEventListener('click', togglePanel);

  // 渲染规则列表
  function renderList() {
    listEl.textContent = '';
    rules.forEach((rule, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;';
      const label = document.createElement('span');
      label.textContent = rule.from + ' → ' + rule.to;
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '删除';
      delBtn.style.cssText = 'padding:2px 8px;color:#d93025;background:none;border:1px solid #d93025;border-radius:4px;cursor:pointer;';
      delBtn.addEventListener('click', () => {
        // 若删除的是默认规则，记入已删除列表，避免自动合并时被重新加回
        const key = rule.from + '>' + rule.to;
        if (CONFIG.REPLACEMENTS.some(r => r.from === rule.from && r.to === rule.to)) {
          const deleted = loadDeletedDefaults();
          if (!deleted.includes(key)) {
            deleted.push(key);
            GM_setValue(DELETED_DEFAULTS_KEY, deleted);
          }
        }
        rules.splice(i, 1);
        saveRules();
        refresh();
      });
      row.append(label, delBtn);
      listEl.appendChild(row);
    });
    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '暂无规则';
      empty.style.cssText = 'color:#999;padding:8px 0;';
      listEl.appendChild(empty);
    }
  }

  // 添加规则
  function addRule() {
    const from = fromInput.value.trim();
    const to = toInput.value.trim();
    if (!from || !to) {
      alert('from 与 to 不能为空。');
      return;
    }
    if (rules.some(r => r.from === from && r.to === to)) {
      alert('该规则已存在。');
      return;
    }
    rules.push({ from, to });
    saveRules();
    fromInput.value = '';
    toInput.value = '';
    refresh();
  }
  addBtn.addEventListener('click', addRule);
  [fromInput, toInput].forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addRule();
    });
  });

  // 重置为默认规则
  function resetRules() {
    if (!confirm('确定清空所有规则并恢复默认值吗？')) return;
    rules = CONFIG.REPLACEMENTS.filter(isValidRule).map(r => ({ from: r.from, to: r.to }));
    GM_setValue(DELETED_DEFAULTS_KEY, []); // 重置即恢复全部默认规则，清空已删除记录
    saveRules();
    refresh();
  }
  resetBtn.addEventListener('click', resetRules);

  // 刷新切换按钮组：命中规则时显示工具栏（目标按钮 + 齿轮），未命中时整体隐藏（零打扰）
  function refresh() {
    const matches = detectMatches();
    switchWrap.textContent = '';
    bar.style.display = matches.length ? 'flex' : 'none';
    for (const m of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = BASE_BUTTON_STYLE;
      btn.innerHTML = formatLabel(m);
      btn.title = m.url;
      btn.addEventListener('click', () => openReplaced(m.url));
      switchWrap.appendChild(btn);
    }
    if (panel.style.display === 'block') renderList();
  }

  // 底部工具栏：切换按钮 + 齿轮按钮（可拖动，位置持久化）
  // 初始 display:none，由 refresh() 按命中情况显式设为 flex/none
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:none;gap:8px;align-items:center;user-select:none;touch-action:none;';
  bar.append(switchWrap, gearBtn);

  // 右键工具栏任意位置：打开/关闭规则管理面板（与齿轮等效的快捷入口）
  bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    togglePanel();
  });

  // 点击面板与工具栏以外的任意位置，自动关闭面板（符合常见弹层习惯）
  document.addEventListener('pointerdown', (e) => {
    if (panel.style.display !== 'block') return;
    if (panel.contains(e.target) || bar.contains(e.target)) return;
    panel.style.display = 'none';
  });

  // 将工具栏定位到距视口右下角 (right, bottom) 的位置（left/top 置为 auto 以让 right/bottom 生效），并限制在视口内
  function setBarPos(right, bottom) {
    const rect = bar.getBoundingClientRect();
    const maxRight = Math.max(0, window.innerWidth - rect.width);
    const maxBottom = Math.max(0, window.innerHeight - rect.height);
    bar.style.right = Math.min(Math.max(0, right), maxRight) + 'px';
    bar.style.bottom = Math.min(Math.max(0, bottom), maxBottom) + 'px';
    bar.style.left = 'auto';
    bar.style.top = 'auto';
  }

  // 恢复上次拖动保存的位置
  function applySavedPos() {
    const saved = GM_getValue(POS_KEY, null);
    if (!saved) return;
    if (typeof saved.right === 'number' && typeof saved.bottom === 'number') {
      setBarPos(saved.right, saved.bottom);
    } else if (typeof saved.left === 'number' && typeof saved.top === 'number') {
      // 兼容旧版 {left, top} 左上锚定格式：换算为右下锚定
      const rect = bar.getBoundingClientRect();
      setBarPos(window.innerWidth - saved.left - rect.width, window.innerHeight - saved.top - rect.height);
    }
  }

  // 让规则管理面板显示在工具栏上方（空间不足时放到下方）；
  // 工具栏未显示时（未命中页面经油猴菜单打开），面板放到视口右下角
  function positionPanel() {
    const gap = 8;
    const pw = panel.offsetWidth || 280;
    const ph = panel.offsetHeight || 0;
    let left, top;
    if (bar.style.display === 'none') {
      left = window.innerWidth - pw - gap;
      top = window.innerHeight - ph - gap;
    } else {
      const rect = bar.getBoundingClientRect();
      left = rect.right - pw; // 默认右缘与工具栏右缘对齐
      if (left < gap) left = gap;
      if (left + pw > window.innerWidth - gap) left = window.innerWidth - pw - gap;
      top = rect.top - gap - ph; // 默认在工具栏上方
      if (top < gap) top = rect.bottom + gap; // 上方空间不足则放到下方
      if (top + ph > window.innerHeight - gap) top = window.innerHeight - ph - gap;
    }
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  // 拖动逻辑：按下后超过阈值即视为拖动（区别于点击），松开时保存位置
  const DRAG_THRESHOLD = 4;
  let dragState = null;
  let didDrag = false;

  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const rect = bar.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      offsetRight: rect.right - e.clientX,
      offsetBottom: rect.bottom - e.clientY,
    };
    didDrag = false;
    // 不在此处 setPointerCapture：否则 pointerup/click 会被重定向到 bar，导致子按钮点击失效
  });

  bar.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!didDrag) {
      didDrag = true;
      // 确认是拖动后再捕获指针：既保证拖出元素/iframe 时不丢事件，又不影响普通点击
      try { bar.setPointerCapture(e.pointerId); } catch (_) { /* 指针可能已释放，忽略 */ }
    }
    setBarPos(window.innerWidth - e.clientX - dragState.offsetRight, window.innerHeight - e.clientY - dragState.offsetBottom);
  });

  function endDrag() {
    dragState = null;
    if (didDrag) {
      const rect = bar.getBoundingClientRect();
      GM_setValue(POS_KEY, { right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom });
      // didDrag 保留到下方 click 抑制器复位，避免拖动后误触发子按钮
    }
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // 拖动后抑制子按钮的 click（捕获阶段，先于按钮自身的 click 处理器执行）
  bar.addEventListener('click', (e) => {
    if (didDrag) {
      e.stopPropagation();
      e.preventDefault();
      didDrag = false;
    }
  }, true);

  // 监听 SPA 路由变化（popstate / hashchange / pushState / replaceState）
  function watchUrlChange() {
    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        refresh();
        return result;
      };
    }
  }

  function init() {
    if (!document.body) return;
    watchUrlChange();
    document.body.appendChild(bar);
    document.body.appendChild(panel);
    // 油猴扩展菜单入口：任意页面（含未命中页）都能打开规则管理面板
    GM_registerMenuCommand('管理规则', togglePanel);
    applySavedPos();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
