// ==UserScript==
// @name         Background Color（网页背景色自定义）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.5.1
// @description  一键把网页背景换成预设或自定义颜色；自定义支持 R/G/B 三通道输入并实时预览，配色可保存复用，全局持久化，可随时恢复网页默认背景或重置全部设置。
// @author       weiningwei
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @icon         https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3a8.png
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 预设背景色（常用护眼 / 柔和配色）。rgb 为 0~255 的三通道数组，
    // 首次运行时展示在「预设颜色」区；预设固定不可删除，自定义颜色在面板中增删。
    PRESETS: [
      { name: '豆沙绿', rgb: [199, 237, 204] },
      { name: '杏仁黄', rgb: [250, 249, 222] },
      { name: '秋叶褐', rgb: [255, 242, 204] },
      { name: '胭脂红', rgb: [253, 230, 224] },
      { name: '青草绿', rgb: [227, 237, 205] },
      { name: '海天蓝', rgb: [220, 226, 241] },
      { name: '葛巾紫', rgb: [234, 227, 239] },
      { name: '极简灰', rgb: [242, 242, 242] },
    ],
    // 是否在页面右下角显示浮动按钮（true）：点击即可打开背景色设置面板，可拖动换位。
    // 设为 false 则不显示浮动按钮，仅能通过油猴扩展菜单打开面板。
    FLOATING_BUTTON: true,
  };
  /* ------------------------------------------------------------------- */

  const STORAGE_COLOR_KEY = 'background-color.color'; // 当前生效颜色（#rrggbb 或 null 表示默认）
  const STORAGE_CUSTOM_KEY = 'background-color.customColors'; // 自定义颜色列表（#rrggbb 数组）
  const FAB_POS_KEY = 'background-color.fabPos'; // 浮动按钮拖动后的位置（右下锚定）

  const PANEL_ID = 'background-color-panel';
  const UI_STYLE_ID = 'background-color-ui-style';
  const FAB_ID = 'background-color-fab';

  /* ----------------------------- 存取与工具 ----------------------------- */

  function rgbToHex(rgb) {
    return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toLowerCase();
  }

  // 解析 HEX 颜色文本：支持 #c7edcc 完整写法与 #ce3 三位缩写，合法时返回标准 #rrggbb，否则 null
  function parseHex(text) {
    const m = typeof text === 'string' ? text.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i) : null;
    if (!m) return null;
    const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return '#' + hex.toLowerCase();
  }

  function hexToRgb(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  }

  function isValidHex(s) {
    return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  }

  function loadCurrentColor() {
    const v = GM_getValue(STORAGE_COLOR_KEY, null);
    return isValidHex(v) ? v.toLowerCase() : null;
  }

  function saveCurrentColor(hex) {
    GM_setValue(STORAGE_COLOR_KEY, hex);
  }

  function loadCustomColors() {
    const v = GM_getValue(STORAGE_CUSTOM_KEY, []);
    return Array.isArray(v) ? v.filter(isValidHex).map(s => s.toLowerCase()) : [];
  }

  function saveCustomColors(list) {
    GM_setValue(STORAGE_CUSTOM_KEY, list);
  }

  let currentColor = loadCurrentColor();
  let customColors = loadCustomColors();

  // 读取 R/G/B 三个输入框：全部为 0~255 整数时返回 { ok: true, rgb }，否则 ok: false
  function readRgbInputs(inputs) {
    const rgb = [];
    for (const input of inputs) {
      const raw = input.value.trim();
      if (raw === '') return { ok: false };
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 0 || v > 255) return { ok: false };
      rgb.push(v);
    }
    return { ok: true, rgb };
  }

  /* ----------------------------- 背景应用 ----------------------------- */

  // 记录被脚本改动过内联样式的元素及原始 style 属性，恢复默认时按原样还原
  const touchStyles = new Map(); // el -> 原始 style 属性字符串（null 表示原本没有内联样式）

  function saveInline(el) {
    if (!touchStyles.has(el)) touchStyles.set(el, el.getAttribute('style'));
  }

  function restoreInline(el) {
    if (!touchStyles.has(el)) return;
    const prev = touchStyles.get(el);
    if (prev === null) el.removeAttribute('style');
    else el.setAttribute('style', prev);
    touchStyles.delete(el);
  }

  // 直接给 html / body 打内联 !important：优先级高于站点自身的 !important 规则
  function paintBase(color) {
    [document.documentElement, document.body].forEach((el) => {
      if (!el) return;
      saveInline(el);
      el.style.setProperty('background-color', color, 'important');
    });
  }

  // 元素是否铺满视口（整页背景层通常如此）；排除 fixed / sticky，避免动到弹窗遮罩与吸顶栏
  function isCovering(el) {
    const rect = el.getBoundingClientRect();
    if (!window.innerWidth || !window.innerHeight) return false;
    if (rect.width < window.innerWidth * 0.85 || rect.height < window.innerHeight * 0.85) return false;
    const pos = getComputedStyle(el).position;
    return pos !== 'fixed' && pos !== 'sticky';
  }

  // 元素自身是否画了可见背景（非全透明纯色，或有背景图）
  function hasVisibleBackground(el) {
    const style = getComputedStyle(el);
    const bg = style.backgroundColor;
    const solid = bg !== 'transparent' && !/,\s*0\)$/.test(bg);
    return solid || style.backgroundImage !== 'none';
  }

  // 很多站点把背景画在铺满视口的布局容器（SPA 外壳、整页白色背景层）上，只改 html/body 会被盖住。
  // 这里把这些容器置为透明，让 html 上的颜色透出来；卡片、正文等局部元素尺寸不够，不受影响。
  // 从 body 逐层向下检查，限制层数与元素数，避免大页面扫描开销。
  function clearCoveringBackgrounds() {
    if (!currentColor || !document.body) return;
    const queue = [{ el: document.body, depth: 0 }];
    let visited = 0;
    while (queue.length && visited < 400) {
      const { el, depth } = queue.shift();
      visited++;
      if (el === panel || el === fab) continue;
      if (isCovering(el) && hasVisibleBackground(el)) {
        saveInline(el);
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('background-image', 'none', 'important');
      }
      if (depth < 3) {
        for (const child of el.children) queue.push({ el: child, depth: depth + 1 });
      }
    }
  }

  // 站点异步渲染或 SPA 切换后布局容器可能变化，重新清理一次
  function rescanBackground() {
    if (!currentColor) return;
    clearCoveringBackgrounds();
    clearLightBackgrounds(document.body);
  }

  // ---------- 浅色背景清理：内容卡片等局部元素 ----------

  // 解析 computed background-color 文本（"rgb(r, g, b)" / "rgba(r, g, b, a)"）
  function parseRgbColor(text) {
    const m = typeof text === 'string'
      ? text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
      : null;
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  // 近白/浅色判定阈值：知乎等站的内容卡片（#fff、#f6f6f6 等）都在此之上
  const LIGHT_THRESHOLD = 230;
  // 表单控件保留原样，避免影响输入框与按钮的辨识度
  const SKIPPED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OPTION']);

  function isLightBackground(colorText) {
    const c = parseRgbColor(colorText);
    if (!c || c.a < 0.5) return false; // 全透明或近乎透明的浅色无需处理
    return c.r >= LIGHT_THRESHOLD && c.g >= LIGHT_THRESHOLD && c.b >= LIGHT_THRESHOLD;
  }

  // 解析单个颜色文本（rgb/rgba 或 #hex / #rgba），用于渐变停靠点
  function parseColorToken(text) {
    const c = parseRgbColor(text);
    if (c) return c;
    const m = typeof text === 'string' ? text.match(/^#([0-9a-f]{3,8})$/i) : null;
    if (!m) return null;
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(ch => ch + ch).join('');
    if (h.length < 6) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  // 渐变是否整体为浅色：站点常用 linear-gradient(#fff, #f6f6f6) 当卡片背景，
  // 此时 computed backgroundColor 是 transparent，单看颜色会漏掉，需按停靠点判断。
  // 含 url() 的图片、无法解析的颜色关键字一律不处理，避免误伤深色渐变与图片。
  function isLightGradient(imageText) {
    if (!imageText || imageText === 'none' || /url\(/i.test(imageText)) return false;
    const tokens = imageText.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi);
    if (!tokens || !tokens.length) return false;
    return tokens.every((t) => {
      const c = parseColorToken(t);
      return c && c.a >= 0.5
        && c.r >= LIGHT_THRESHOLD && c.g >= LIGHT_THRESHOLD && c.b >= LIGHT_THRESHOLD;
    });
  }

  // 单个元素：近白背景或浅色渐变置为透明，让 html 上的颜色透出来
  // （幂等：清过的元素 computed 变透明后自然跳过）
  function clearLightBackground(el) {
    if (el.nodeType !== 1) return;
    if (el === panel || panel.contains(el) || el === fab || fab.contains(el)) return;
    if (SKIPPED_TAGS.has(el.tagName)) return;
    const style = getComputedStyle(el);
    if (style.position === 'fixed') return; // 弹窗、遮罩等覆盖层不动
    const lightColor = isLightBackground(style.backgroundColor);
    const lightGradient = isLightGradient(style.backgroundImage);
    if (!lightColor && !lightGradient) return;
    saveInline(el);
    el.style.setProperty('background-color', 'transparent', 'important');
    if (lightGradient) el.style.setProperty('background-image', 'none', 'important');
  }

  // 对一棵子树逐元素清浅色背景；初始全量扫 body，动态新增时只扫新节点，控制开销
  function clearLightBackgrounds(root) {
    if (!root || !document.body) return;
    const elements = root === document.body
      ? document.body.querySelectorAll('*')
      : [root, ...root.querySelectorAll('*')];
    let count = 0;
    for (const el of elements) {
      if (count++ > 8000) break;
      clearLightBackground(el);
    }
  }

  // 动态内容（信息流无限滚动等）新增节点后，去抖 200ms 补一次浅色清理
  let lightObserver = null;
  let pendingNodes = new Set();
  let pendingScanTimer = null;

  function scheduleLightScan(node) {
    pendingNodes.add(node);
    if (pendingScanTimer) clearTimeout(pendingScanTimer);
    pendingScanTimer = setTimeout(() => {
      pendingScanTimer = null;
      const nodes = Array.from(pendingNodes);
      pendingNodes = new Set();
      for (const n of nodes) clearLightBackgrounds(n);
    }, 200);
  }

  function startLightObserver() {
    if (lightObserver || !document.body) return;
    lightObserver = new MutationObserver((mutations) => {
      if (!currentColor) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) scheduleLightScan(node);
        }
      }
    });
    lightObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopLightObserver() {
    if (lightObserver) {
      lightObserver.disconnect();
      lightObserver = null;
    }
    if (pendingScanTimer) {
      clearTimeout(pendingScanTimer);
      pendingScanTimer = null;
    }
    pendingNodes = new Set();
  }

  // 应用颜色；null 表示恢复网页默认背景（还原所有被改动的内联样式）
  function applyColor(color) {
    if (!color) {
      for (const el of Array.from(touchStyles.keys())) restoreInline(el);
      stopLightObserver();
      return;
    }
    paintBase(color);
    clearCoveringBackgrounds();
    clearLightBackgrounds(document.body);
    startLightObserver();
  }

  // 监听 SPA 路由变化，切换页面后重新清理
  function watchRouteChange() {
    window.addEventListener('popstate', rescanBackground);
    window.addEventListener('hashchange', rescanBackground);
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        rescanBackground();
        return result;
      };
    }
  }

  // 应用并持久化某个颜色；null 表示恢复默认
  function setCurrentColor(hex) {
    currentColor = hex;
    saveCurrentColor(hex);
    applyColor(hex);
    renderPalette();
  }

  /* ----------------------------- 面板 UI ----------------------------- */

  const UI_STYLE_TEXT = `
#${PANEL_ID} { position:fixed; top:72px; left:50%; transform:translateX(-50%); z-index:2147483647; width:320px; padding:12px; background:#fff; border:1px solid #ddd; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,.2); color:#333; font-size:13px; display:none; }
#${PANEL_ID} .pbg-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
#${PANEL_ID} .pbg-title { font-weight:bold; }
#${PANEL_ID} .pbg-reset { padding:2px 8px; color:#1a73e8; background:none; border:1px solid #1a73e8; border-radius:4px; cursor:pointer; }
#${PANEL_ID} .pbg-section { margin-top:10px; }
#${PANEL_ID} .pbg-label { color:#555; font-weight:bold; margin-bottom:6px; }
#${PANEL_ID} .pbg-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
#${PANEL_ID} .pbg-swatch { position:relative; padding:0; border:none; background:none; cursor:pointer; }
#${PANEL_ID} .pbg-chip { display:block; width:100%; height:34px; border-radius:6px; border:2px solid transparent; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08); box-sizing:border-box; }
#${PANEL_ID} .pbg-swatch.is-active .pbg-chip { border-color:#1a73e8; }
#${PANEL_ID} .pbg-name { display:block; margin-top:2px; font-size:11px; color:#666; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${PANEL_ID} .pbg-del { position:absolute; top:-7px; right:-7px; width:16px; height:16px; padding:0; line-height:13px; font-size:11px; text-align:center; color:#d93025; background:#fff; border:1px solid #d93025; border-radius:50%; cursor:pointer; display:none; }
#${PANEL_ID} .pbg-swatch:hover .pbg-del { display:block; }
#${PANEL_ID} .pbg-empty { color:#999; }
#${PANEL_ID} .pbg-form { display:flex; gap:6px; align-items:center; margin-top:6px; }
#${PANEL_ID} .pbg-input { width:56px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; }
#${PANEL_ID} .pbg-hex-input { width:86px; }
#${PANEL_ID} .pbg-preview { display:flex; align-items:center; gap:8px; margin-top:8px; }
#${PANEL_ID} .pbg-preview-chip { width:32px; height:32px; border-radius:6px; flex-shrink:0; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08); }
#${PANEL_ID} .pbg-hex { color:#666; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#${PANEL_ID} .pbg-add { margin-left:auto; padding:6px 12px; color:#fff; background:#1a73e8; border:none; border-radius:4px; cursor:pointer; flex-shrink:0; }
#${PANEL_ID} .pbg-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid #eee; }
#${PANEL_ID} .pbg-hint { color:#999; font-size:11px; line-height:1.4; }
#${PANEL_ID} .pbg-reset-all { padding:4px 10px; color:#d93025; background:#fff; border:1px solid #d93025; border-radius:4px; cursor:pointer; flex-shrink:0; }
#${PANEL_ID} .pbg-reset-all:hover { background:#fce8e6; }
#${FAB_ID} { position:fixed; right:16px; bottom:16px; z-index:2147483646; width:38px; height:38px; line-height:38px; padding:0; text-align:center; font-size:18px; color:#fff; background:#1a73e8; border:none; border-radius:50%; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.25); user-select:none; touch-action:none; }
#${FAB_ID}:hover { background:#1765cc; }
`;

  function injectUiStyles() {
    if (document.getElementById(UI_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = UI_STYLE_ID;
    style.textContent = UI_STYLE_TEXT;
    (document.head || document.documentElement).appendChild(style);
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'pbg-header';
  const title = document.createElement('span');
  title.textContent = '背景色设置';
  title.className = 'pbg-title';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = '恢复默认';
  resetBtn.title = '仅取消当前背景色并还原网页默认背景，保留自定义颜色与浮动按钮位置';
  resetBtn.className = 'pbg-reset';
  header.append(title, resetBtn);

  // 预设颜色区
  const presetSection = document.createElement('div');
  presetSection.className = 'pbg-section';
  const presetLabel = document.createElement('div');
  presetLabel.textContent = '预设颜色';
  presetLabel.className = 'pbg-label';
  const presetGrid = document.createElement('div');
  presetGrid.className = 'pbg-grid';
  presetSection.append(presetLabel, presetGrid);

  // 自定义颜色区
  const customSection = document.createElement('div');
  customSection.className = 'pbg-section';
  const customLabel = document.createElement('div');
  customLabel.textContent = '自定义颜色';
  customLabel.className = 'pbg-label';
  const customGrid = document.createElement('div');
  customGrid.className = 'pbg-grid';
  customSection.append(customLabel, customGrid);

  // RGB / HEX 添加表单：三通道输入 + HEX 输入（双向联动）+ 实时预览 + 添加按钮
  const formSection = document.createElement('div');
  formSection.className = 'pbg-section';
  const formLabel = document.createElement('div');
  formLabel.textContent = '输入 RGB 或 HEX 添加自定义颜色';
  formLabel.className = 'pbg-label';
  const formRow = document.createElement('div');
  formRow.className = 'pbg-form';
  const channelInputs = ['R', 'G', 'B'].map((name) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '255';
    input.placeholder = name;
    input.title = `${name} 通道，0~255 的整数`;
    input.className = 'pbg-input';
    return input;
  });
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.placeholder = '#hex';
  hexInput.title = '十六进制颜色（可选）：支持 #c7edcc 完整写法与 #ce3 三位缩写，与 R / G / B 双向联动';
  hexInput.className = 'pbg-input pbg-hex-input';
  hexInput.spellcheck = false;
  formRow.append(...channelInputs, hexInput);

  const previewRow = document.createElement('div');
  previewRow.className = 'pbg-preview';
  const previewChip = document.createElement('span');
  previewChip.className = 'pbg-preview-chip';
  const previewText = document.createElement('span');
  previewText.className = 'pbg-hex';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '添加并应用';
  addBtn.title = '校验通过后保存到自定义颜色并立即生效';
  addBtn.className = 'pbg-add';
  previewRow.append(previewChip, previewText, addBtn);

  formSection.append(formLabel, formRow, previewRow);

  // 面板底部：区分「恢复默认」（只取消当前颜色）与「重置全部设置」（清空全部已保存的配置）
  const footer = document.createElement('div');
  footer.className = 'pbg-footer';
  const footerHint = document.createElement('span');
  footerHint.className = 'pbg-hint';
  footerHint.textContent = '「恢复默认」只取消当前颜色';
  const resetAllBtn = document.createElement('button');
  resetAllBtn.type = 'button';
  resetAllBtn.textContent = '重置全部设置';
  resetAllBtn.title = '恢复网页默认背景，并清除所有自定义颜色与浮动按钮位置（不可撤销）';
  resetAllBtn.className = 'pbg-reset-all';
  footer.append(footerHint, resetAllBtn);

  panel.append(header, presetSection, customSection, formSection, footer);

  // 渲染色板：预设 + 自定义两行网格，当前生效颜色高亮
  function renderPalette() {
    presetGrid.textContent = '';
    for (const preset of CONFIG.PRESETS) {
      presetGrid.appendChild(buildSwatch(rgbToHex(preset.rgb), preset.name, false));
    }

    customGrid.textContent = '';
    if (customColors.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '暂无自定义颜色';
      empty.className = 'pbg-empty';
      customGrid.appendChild(empty);
    } else {
      for (const hex of customColors) {
        customGrid.appendChild(buildSwatch(hex, hex, true));
      }
    }
  }

  // 生成一个色块按钮：点击应用颜色，再次点击当前生效颜色则取消；isCustom 时悬停显示删除角标
  function buildSwatch(hex, name, isCustom) {
    const isActive = currentColor === hex;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pbg-swatch' + (isActive ? ' is-active' : '');
    const baseTitle = isActive ? `${name}（当前生效，再次点击取消）` : `${name}（点击应用）`;
    btn.title = isCustom ? `${baseTitle}，悬停可删除` : baseTitle;

    const chip = document.createElement('span');
    chip.className = 'pbg-chip';
    chip.style.backgroundColor = hex; // 颜色值来自存储/配置，只能内联
    const nameEl = document.createElement('span');
    nameEl.className = 'pbg-name';
    nameEl.textContent = name;
    btn.append(chip, nameEl);

    btn.addEventListener('click', () => {
      // 切换语义：点击已生效的颜色等于取消，恢复网页默认背景
      setCurrentColor(isActive ? null : hex);
    });

    if (isCustom) {
      const del = document.createElement('span');
      del.className = 'pbg-del';
      del.textContent = '×';
      del.title = '删除该自定义颜色';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCustomColor(hex);
      });
      btn.appendChild(del);
    }
    return btn;
  }

  function removeCustomColor(hex) {
    customColors = customColors.filter(c => c !== hex);
    saveCustomColors(customColors);
    // 删除的是当前生效颜色时，一并恢复默认，避免出现色板里找不到的生效色
    if (currentColor === hex) setCurrentColor(null);
    else renderPalette();
  }

  // 读取当前输入的颜色：优先取合法的 HEX 输入框；HEX 为空或非法时回退到 R/G/B 三通道。
  // 两个入口双向联动，正常情况下取哪边结果一致；都不合法时返回 null。
  function currentInputHex() {
    const fromHex = parseHex(hexInput.value);
    if (fromHex) return fromHex;
    const result = readRgbInputs(channelInputs);
    return result.ok ? rgbToHex(result.rgb) : null;
  }

  // 实时预览：输入合法时显示色块与 HEX 值，否则显示提示
  function syncPreview() {
    const hex = currentInputHex();
    if (hex) {
      previewChip.style.backgroundColor = hex;
      previewText.textContent = `${hex} · rgb(${hexToRgb(hex).join(', ')})`;
    } else {
      previewChip.style.backgroundColor = '#eee';
      previewText.textContent = '输入 RGB 或 HEX（如 #c7edcc）后预览';
    }
  }

  // R/G/B 三通道都合法时回写 HEX 输入框，否则清空，保持两个入口一致
  function syncHexFromChannels() {
    const result = readRgbInputs(channelInputs);
    hexInput.value = result.ok ? rgbToHex(result.rgb) : '';
  }

  // HEX 输入合法时回写 R/G/B 三通道；输入中途（尚不合法）不改动三通道
  function syncChannelsFromHex() {
    const hex = parseHex(hexInput.value);
    if (!hex) return;
    hexToRgb(hex).forEach((v, i) => { channelInputs[i].value = v; });
  }

  // 添加自定义颜色：校验、去重、保存、应用
  function addCustomColor() {
    const hex = currentInputHex();
    if (!hex) {
      alert('请输入合法的 RGB（0~255 整数）或 HEX 颜色（如 #c7edcc）。');
      return;
    }
    const existsInPresets = CONFIG.PRESETS.some(p => rgbToHex(p.rgb) === hex);
    if (existsInPresets || customColors.includes(hex)) {
      alert('该颜色已存在。');
      return;
    }
    customColors.push(hex);
    saveCustomColors(customColors);
    channelInputs.forEach(input => { input.value = ''; });
    hexInput.value = '';
    syncPreview();
    setCurrentColor(hex);
  }

  addBtn.addEventListener('click', addCustomColor);
  channelInputs.forEach((input) => {
    input.addEventListener('input', () => {
      syncHexFromChannels();
      syncPreview();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCustomColor();
    });
  });
  hexInput.addEventListener('input', () => {
    syncChannelsFromHex();
    syncPreview();
  });
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomColor();
  });

  resetBtn.addEventListener('click', () => setCurrentColor(null));

  /* ----------------------------- 浮动按钮 ----------------------------- */

  // 右下角常驻圆形按钮：点击打开/关闭面板，按住拖动可换位置并持久化（与油猴菜单入口等效）
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = FAB_ID;
  fab.textContent = '🎨';
  fab.title = '背景色设置（点击打开，可拖动换位）';

  // 将浮动按钮定位到距视口右下角 (right, bottom) 的位置，并限制在视口内
  function setFabPos(right, bottom) {
    const maxRight = Math.max(0, window.innerWidth - fab.offsetWidth);
    const maxBottom = Math.max(0, window.innerHeight - fab.offsetHeight);
    fab.style.right = Math.min(Math.max(0, right), maxRight) + 'px';
    fab.style.bottom = Math.min(Math.max(0, bottom), maxBottom) + 'px';
    fab.style.left = 'auto';
    fab.style.top = 'auto';
  }

  // 恢复上次拖动保存的位置
  function applySavedFabPos() {
    const saved = GM_getValue(FAB_POS_KEY, null);
    if (saved && typeof saved.right === 'number' && typeof saved.bottom === 'number') {
      setFabPos(saved.right, saved.bottom);
    }
  }

  // 拖动逻辑：按下后超过阈值即视为拖动（区别于点击），松开时保存位置
  const DRAG_THRESHOLD = 4;
  let dragState = null;
  let didDrag = false;

  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      offsetRight: rect.right - e.clientX,
      offsetBottom: rect.bottom - e.clientY,
    };
    didDrag = false;
    // 不在此处 setPointerCapture：否则 pointerup/click 会被重定向到按钮，导致点击失效
  });

  fab.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    if (!didDrag && Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) < DRAG_THRESHOLD) return;
    if (!didDrag) {
      didDrag = true;
      // 确认是拖动后再捕获指针：拖出按钮不丢事件，又不影响普通点击
      try { fab.setPointerCapture(e.pointerId); } catch (_) { /* 指针可能已释放，忽略 */ }
    }
    setFabPos(window.innerWidth - e.clientX - dragState.offsetRight, window.innerHeight - e.clientY - dragState.offsetBottom);
  });

  function endFabDrag() {
    if (dragState && didDrag) {
      const rect = fab.getBoundingClientRect();
      GM_setValue(FAB_POS_KEY, { right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom });
      // didDrag 保留到下方 click 抑制器复位，避免拖动后误开面板
    }
    dragState = null;
  }
  // 拖动被系统中断（手势取消、指针丢失）时不会再有 click 跟随，立即复位
  function abortFabDrag() {
    dragState = null;
    didDrag = false;
  }
  fab.addEventListener('pointerup', endFabDrag);
  fab.addEventListener('pointercancel', abortFabDrag);

  // 拖动后抑制本次 click（捕获阶段，先于按钮自身的 click 处理器执行）
  fab.addEventListener('click', (e) => {
    if (didDrag) {
      e.stopPropagation();
      e.preventDefault();
      didDrag = false;
    }
  }, true);

  const PANEL_EDGE_GAP = 8;

  // 油猴菜单入口：面板在视口顶部居中显示
  function centerPanel() {
    panel.style.transform = 'translateX(-50%)';
    panel.style.left = '50%';
    panel.style.top = '72px';
  }

  // 浮动按钮入口：面板贴在按钮上方，右边缘与按钮对齐；上方空间不足时翻到按钮下方
  function positionPanelAboveFab() {
    const rect = fab.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = Math.max(PANEL_EDGE_GAP, Math.min(rect.right - width, window.innerWidth - width - PANEL_EDGE_GAP));
    let top = rect.top - height - PANEL_EDGE_GAP;
    if (top < PANEL_EDGE_GAP) top = Math.min(rect.bottom + PANEL_EDGE_GAP, window.innerHeight - height - PANEL_EDGE_GAP);
    panel.style.transform = 'none';
    panel.style.left = left + 'px';
    panel.style.top = Math.max(PANEL_EDGE_GAP, top) + 'px';
  }

  // 打开/关闭面板（浮动按钮 / 油猴扩展菜单共用）；anchor 为 'fab' 时贴着按钮弹出
  function togglePanel(anchor) {
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (!show) return;
    renderPalette();
    syncPreview();
    // 色板内容会影响面板高度，需在渲染后再测量定位
    if (anchor === 'fab') positionPanelAboveFab();
    else centerPanel();
  }

  // 重置全部设置：恢复网页默认背景，并清空当前颜色、自定义颜色与浮动按钮位置
  function resetAllSettings() {
    const confirmed = confirm('重置全部设置会恢复网页默认背景、删除所有自定义颜色，并把浮动按钮位置还原。此操作不可撤销，确定继续？');
    if (!confirmed) return;
    customColors = [];
    saveCustomColors(customColors);
    GM_setValue(FAB_POS_KEY, null);
    // 清掉 setFabPos 写入的内联定位，浮动按钮回到样式表里的默认位置
    ['right', 'bottom', 'left', 'top'].forEach((prop) => fab.style.removeProperty(prop));
    channelInputs.forEach((input) => { input.value = ''; });
    hexInput.value = '';
    setCurrentColor(null); // 内部会还原内联样式并重渲色板
    syncPreview();
  }

  resetAllBtn.addEventListener('click', resetAllSettings);

  // 点击浮动按钮开/关面板（拖动结束后的 click 已被上面的抑制器拦截）
  fab.addEventListener('click', () => togglePanel('fab'));

  // 点击面板与浮动按钮以外的任意位置，自动关闭面板（符合常见弹层习惯）
  document.addEventListener('pointerdown', (e) => {
    if (panel.style.display !== 'block') return;
    if (panel.contains(e.target) || (CONFIG.FLOATING_BUTTON && fab.contains(e.target))) return;
    panel.style.display = 'none';
  });

  // 按 Esc 关闭面板（与点击面板外关闭等效）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.style.display === 'block') {
      panel.style.display = 'none';
    }
  });

  function init() {
    if (!document.body) return;
    injectUiStyles();
    applyColor(currentColor);
    document.body.appendChild(panel);
    if (CONFIG.FLOATING_BUTTON) {
      document.body.appendChild(fab);
      applySavedFabPos();
    }
    GM_registerMenuCommand('更换背景色', () => togglePanel('menu'));
    // 异步渲染的站点稍后才生成整页布局容器，加载完成后再清理一次；
    // SPA 路由切换后同样重扫（未选颜色时 rescanBackground 自身直接返回）
    watchRouteChange();
    window.addEventListener('load', rescanBackground, { once: true });
    setTimeout(rescanBackground, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
