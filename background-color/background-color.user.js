// ==UserScript==
// @name         Background Color（网页背景色自定义）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      0.3.0
// @description  一键把网页背景换成预设或自定义颜色；自定义支持 R/G/B 三通道输入并实时预览，配色可保存复用，全局持久化，可随时恢复网页默认背景。
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
  };
  /* ------------------------------------------------------------------- */

  const STORAGE_COLOR_KEY = 'background-color.color'; // 当前生效颜色（#rrggbb 或 null 表示默认）
  const STORAGE_CUSTOM_KEY = 'background-color.customColors'; // 自定义颜色列表（#rrggbb 数组）

  const PANEL_ID = 'background-color-panel';
  const UI_STYLE_ID = 'background-color-ui-style';
  const BG_STYLE_ID = 'background-color-style';

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

  // 把当前颜色写入一条独立样式规则（html/body 加 !important，压过多数站点的普通背景声明）；
  // color 为 null 时移除样式，恢复网页默认背景。
  function applyColor(color) {
    let el = document.getElementById(BG_STYLE_ID);
    if (!color) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = BG_STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = `html, body { background-color: ${color} !important; }`;
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
  resetBtn.title = '移除背景色覆盖，恢复网页默认背景';
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

  panel.append(header, presetSection, customSection, formSection);

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

  // 打开/关闭面板（油猴扩展菜单共用）
  function togglePanel() {
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) {
      renderPalette();
      syncPreview();
    }
  }

  // 点击面板以外任意位置自动关闭（符合常见弹层习惯）
  document.addEventListener('pointerdown', (e) => {
    if (panel.style.display !== 'block') return;
    if (panel.contains(e.target)) return;
    panel.style.display = 'none';
  });

  function init() {
    if (!document.body) return;
    injectUiStyles();
    applyColor(currentColor);
    document.body.appendChild(panel);
    GM_registerMenuCommand('更换背景色', togglePanel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
