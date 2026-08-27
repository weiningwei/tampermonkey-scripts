// ==UserScript==
// @name         URL Replace（网址替换新标签打开）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.5.0
// @description  网址包含指定字符串时双向切换，并通过按钮在新标签页打开切换后的网址；支持动态增删规则。
// @author       weiningwei
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 默认替换规则：仅首次运行时作为初始值写入存储，之后以页面内增删为准。
    REPLACEMENTS: [
      { from: 'gitcode', to: 'atomgit' },
    ],
    // 按钮文案模板：{from} 与 {to} 会被替换为当前切换方向的原串/目标串
    BUTTON_TEXT: '{from} → {to}',
    // 是否在无匹配时也显示切换按钮（false：仅当存在匹配规则时才显示）
    ALWAYS_SHOW: false,
    // 是否在新标签页打开（true）；false 则在当前页跳转
    OPEN_IN_NEW_TAB: true,
  };
  /* ------------------------------------------------------------------- */

  const STORAGE_KEY = 'url-replace.rules';

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

  function saveRules() {
    GM_setValue(STORAGE_KEY, rules);
  }

  let rules = loadRules();

  // 判断切换方向：返回 { from, to, url }，无匹配返回 null
  function detectSwitch() {
    const href = location.href;
    for (const rule of rules) {
      if (!isValidRule(rule)) continue;
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

  // 生成按钮文案：体现 from、to 与切换方向
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

  // 切换按钮（文案随规则变化）
  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.style.cssText = BASE_BUTTON_STYLE;
  switchBtn.addEventListener('click', openReplaced);

  // 齿轮按钮：开关规则管理面板
  const gearBtn = document.createElement('button');
  gearBtn.type = 'button';
  gearBtn.textContent = '⚙';
  gearBtn.title = '管理规则';
  gearBtn.style.cssText = BASE_BUTTON_STYLE + ';background:#5f6368;padding:10px 12px;';

  // 规则管理面板
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:64px',
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

  gearBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') renderList();
  });

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
    saveRules();
    refresh();
  }
  resetBtn.addEventListener('click', resetRules);

  // 刷新切换按钮与规则列表
  function refresh() {
    const sw = detectSwitch();
    if (sw) {
      switchBtn.textContent = formatLabel(sw);
      switchBtn.title = sw.url;
      switchBtn.style.display = '';
    } else if (CONFIG.ALWAYS_SHOW) {
      switchBtn.textContent = '未命中规则';
      switchBtn.title = '';
      switchBtn.style.display = '';
    } else {
      switchBtn.style.display = 'none';
    }
    if (panel.style.display === 'block') renderList();
  }

  // 底部工具栏：切换按钮 + 齿轮按钮
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:8px;align-items:center;';
  bar.append(switchBtn, gearBtn);

  function init() {
    if (!document.body) return;
    document.body.appendChild(bar);
    document.body.appendChild(panel);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
