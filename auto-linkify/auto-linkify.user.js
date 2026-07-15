// ==UserScript==
// @name         Auto Linkify（网页文本转链接）
// @namespace    https://github.com/weiningwei/tampermonkey-scripts
// @version      1.0.0
// @description  自动将网页中的 URL 等纯文本转换为可点击链接，支持动态加载内容。
// @author       weiningwei
// @match        *://*/*
// @run-at      document-idle
// @grant        none
// @license     MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------- 可配置项 ----------------------------- */
  const CONFIG = {
    // 链接是否在新标签页打开
    OPEN_IN_NEW_TAB: true,
    // 防抖间隔（毫秒），避免 MutationObserver 高频触发造成卡顿
    DEBOUNCE_MS: 300,
    // 需要被识别为正则的匹配模式；v1 仅处理 http/https 链接。
    // 如需扩展（如邮箱），可在此追加正则，例如：
    //   /https?:\/\/[^\s<>"']+/gi,
    //   /[\w.+-]+@[\w-]+\.[\w.-]+/gi,
    PATTERNS: [
      /https?:\/\/[^\s<>"']+/gi,
    ],
    // 不处理的标签（避免破坏代码块、表单、已有链接等）
    SKIP_TAGS: new Set([
      'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
      'A', 'CODE', 'PRE', 'NOSCRIPT', 'BUTTON', 'OPTION',
    ]),
  };
  /* ------------------------------------------------------------------- */

  const processed = new WeakSet();

  // 判断节点是否位于需要跳过的祖先标签内
  function isInSkipZone(node) {
    let el = node.parentElement;
    while (el) {
      if (CONFIG.SKIP_TAGS.has(el.tagName)) return true;
      el = el.parentElement;
    }
    return false;
  }

  // 为单个匹配到的文本片段创建一个安全的 <a> 元素
  function makeLink(text) {
    const href = text.trim();
    // 基础校验：仅允许 http/https 协议，防止伪协议 XSS
    if (!/^https?:\/\//i.test(href)) return null;
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (CONFIG.OPEN_IN_NEW_TAB) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  // 处理一个文本节点：将其中的匹配片段替换为链接
  function linkifyTextNode(textNode) {
    if (processed.has(textNode)) return;
    if (!textNode.parentNode) return;
    if (isInSkipZone(textNode)) {
      processed.add(textNode);
      return;
    }

    const value = textNode.nodeValue;
    if (!value) return;

    // 是否存在任一匹配模式
    const hasMatch = CONFIG.PATTERNS.some((re) => re.test(value));
    if (!hasMatch) {
      processed.add(textNode);
      return;
    }

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let matched = false;

    // 用第一个能匹配的正则进行分段（多模式时取最先匹配者）
    for (const re of CONFIG.PATTERNS) {
      re.lastIndex = 0;
    }

    // 取所有模式合并命中的位置
    const positions = [];
    for (const re of CONFIG.PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(value)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        positions.push([m.index, m.index + m[0].length, m[0]]);
      }
    }
    positions.sort((a, b) => a[0] - b[0]);

    // 合并重叠区间，避免重复包裹
    const merged = [];
    for (const pos of positions) {
      if (merged.length && pos[0] <= merged[merged.length - 1][1]) {
        const last = merged[merged.length - 1];
        last[1] = Math.max(last[1], pos[1]);
        last[2] = value.slice(last[0], last[1]);
      } else {
        merged.push(pos.slice());
      }
    }

    if (merged.length === 0) {
      processed.add(textNode);
      return;
    }

    for (const [start, end, snippet] of merged) {
      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(value.slice(lastIndex, start)));
      }
      const link = makeLink(snippet);
      if (link) {
        frag.appendChild(link);
        matched = true;
      } else {
        frag.appendChild(document.createTextNode(snippet));
      }
      lastIndex = end;
    }
    if (lastIndex < value.length) {
      frag.appendChild(document.createTextNode(value.slice(lastIndex)));
    }

    if (matched) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
    // 原文本节点已被替换/保留，标记避免重复处理
    processed.add(textNode);
  }

  // 遍历 root 下所有文本节点并处理
  function linkify(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (processed.has(node)) return NodeFilter.FILTER_REJECT;
        if (isInSkipZone(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) linkifyTextNode(node);
  }

  /* --------------------------- 动态内容处理 --------------------------- */
  let timer = null;
  const observer = new MutationObserver((mutations) => {
    // 仅关注新增/改动的文本，跳过纯属性变化
    let needProcess = false;
    for (const mu of mutations) {
      if (mu.type === 'childList' && mu.addedNodes.length) { needProcess = true; break; }
      if (mu.type === 'characterData') { needProcess = true; break; }
    }
    if (!needProcess) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => linkify(document.body), CONFIG.DEBOUNCE_MS);
  });

  /* ------------------------------- 启动 ------------------------------- */
  function init() {
    linkify(document.body);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
