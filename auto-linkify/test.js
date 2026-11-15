/**
 * Auto Linkify — Node.js 命令行测试
 *
 * 用法：
 *   node test.js              # 运行所有用例
 *   node test.js --verbose    # 显示详细输出
 *
 * 依赖 jsdom，首次运行前执行 `npm install`。
 */

'use strict';

const { JSDOM } = require('jsdom');

// jsdom 不暴露 Node/NodeFilter 常量，从虚拟 window 获取
const { Node, NodeFilter } = new JSDOM('').window;

// ─── 与 userscript 一致的核心逻辑 ──────────────────────────────────────────
const CONFIG = {
  OPEN_IN_NEW_TAB: false,
  DEBOUNCE_MS: 200,
  PATTERNS: [
    /https?:\/\/[^\s<>"'\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]+/gi,
  ],
  SKIP_TAGS: new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
    'A', 'CODE', 'PRE', 'NOSCRIPT', 'BUTTON', 'OPTION',
  ]),
};

// 与 userscript 一致：判断节点（含元素自身）是否在跳过标签内，祖先链跨过 shadow 边界
function isInSkippedTree(node) {
  let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (el) {
    if (CONFIG.SKIP_TAGS.has(el.tagName)) return true;
    const root = el.getRootNode && el.getRootNode();
    el = el.parentElement || (root && root.host) || null;
  }
  return false;
}

function makeLink(ownerDoc, text) {
  const href = text.trim();
  if (!/^https?:\/\//i.test(href)) return null;
  const a = ownerDoc.createElement('a');
  a.href = href;
  a.textContent = text;
  if (CONFIG.OPEN_IN_NEW_TAB) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

const processed = new WeakSet();
const STATS = { count: 0 };

function linkifyTextNode(textNode, skipCheck) {
  if (skipCheck === void 0) skipCheck = false;
  if (processed.has(textNode)) return;
  if (!textNode.parentNode) return;
  if (!skipCheck && isInSkippedTree(textNode)) {
    processed.add(textNode);
    return;
  }

  const value = textNode.nodeValue;
  if (!value) return;

  const hasMatch = CONFIG.PATTERNS.some((re) => re.test(value));
  if (!hasMatch) {
    processed.add(textNode);
    return;
  }

  const frag = textNode.ownerDocument.createDocumentFragment();
  let lastIndex = 0;
  let linksCreated = 0;

  for (const re of CONFIG.PATTERNS) re.lastIndex = 0;

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
      frag.appendChild(textNode.ownerDocument.createTextNode(value.slice(lastIndex, start)));
    }
    const link = makeLink(textNode.ownerDocument, snippet);
    if (link) {
      frag.appendChild(link);
      linksCreated++;
    } else {
      frag.appendChild(textNode.ownerDocument.createTextNode(snippet));
    }
    lastIndex = end;
  }
  if (lastIndex < value.length) {
    frag.appendChild(textNode.ownerDocument.createTextNode(value.slice(lastIndex)));
  }

  if (linksCreated) {
    textNode.parentNode.replaceChild(frag, textNode);
    STATS.count += linksCreated;
  }
  processed.add(textNode);
}

function collectTextNodes(root, out) {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (processed.has(node)) return NodeFilter.FILTER_REJECT;
          if (isInSkippedTree(node)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        // 跳过标签整棵剪枝，连同其 shadow root 一起
        if (CONFIG.SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
        return node.shadowRoot ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    }
  );
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) {
      out.push(n);
    } else if (n.shadowRoot) {
      collectTextNodes(n.shadowRoot, out);
    }
  }
  if (root.nodeType === Node.ELEMENT_NODE && root.shadowRoot) {
    collectTextNodes(root.shadowRoot, out);
  }
}

function linkify(root) {
  if (!root) return;
  // 扫描起点自身可能就在跳过标签内
  if (isInSkippedTree(root)) return;
  const nodes = [];
  collectTextNodes(root, nodes);
  for (const node of nodes) linkifyTextNode(node, true);
}

// 去重：过滤已断开节点，去除被其他节点包含的子树
const pruneRoots = (roots) => {
  const arr = [...roots].filter((n) => n.isConnected);
  return arr.filter((n) => !arr.some((other) => other !== n && other.contains(n)));
};

// ─── 测试框架 ─────────────────────────────────────────────────────────────

const EXIT_CODE = Object.freeze({ SUCCESS: 0, FAILURES: 1, RUNTIME_ERROR: 2 });

const colors = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m' };
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const bail = process.argv.includes('--bail') || process.argv.includes('-b');

let passed = 0;
let failed = 0;
let tests = 0;
const startTime = Date.now();

// 每个测试用例的错误隔离包装器
function test(name, fn) {
  tests++;
  try {
    fn();
    passed++;
    if (verbose) console.log(`  ${colors.green}✓${colors.reset} ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ${colors.red}✗${colors.reset} ${name}`);
    console.log(`    ${colors.red}错误:${colors.reset} ${err.message}`);
    if (verbose && err.stack) {
      const lines = err.stack.split('\n').slice(1);
      for (const line of lines) {
        console.log(`    ${colors.dim}${line.trim()}${colors.reset}`);
      }
    }
    if (bail) {
      printSummary();
      process.exit(EXIT_CODE.FAILURES);
    }
  }
}

function assert(condition, label, expected, actual) {
  if (condition) return;
  let detail = '';
  if (expected !== undefined || actual !== undefined) {
    detail = `\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`;
  }
  throw new Error(`${label || 'assertion failed'}${detail}`);
}

function assertEqual(actual, expected, label) {
  if (actual === expected) return;
  const detail = `\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`;
  throw new Error(`${label || 'assertEqual failed'}${detail}`);
}

// ─── 测试工具 ─────────────────────────────────────────────────────────────

function createDOM(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, {
    url: 'http://localhost/',
  });
  // 重置 processed（jsdom 可能复用）
  return dom;
}

function countLinksIn(root) {
  if (typeof root === 'string') {
    // 选择器
    const dom = createDOM(root);
    return dom.window.document.querySelectorAll('a').length;
  }
  return root.querySelectorAll ? root.querySelectorAll('a').length : (root.getElementsByTagName('a') || []).length;
}

function linksInText(root) {
  const links = [];
  root.querySelectorAll('a').forEach(a => links.push({ href: a.href, text: a.textContent }));
  return links;
}

// ─── 用例 ─────────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${colors.bold}Auto Linkify — Node.js 测试${colors.reset}\n`);

  // ══════════════════════════════════════════════════════════════════════
  console.log(`${colors.cyan}1. 基础 URL 识别${colors.reset}`);

  test('1.1 HTTPS 链接被识别', () => {
    const dom = createDOM('<p>请访问 https://example.com/path 了解更多。</p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 1);
  });

  test('1.2 HTTP 链接被识别', () => {
    const dom = createDOM('<p>普通链接 http://test.com 可以点。</p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 1);
  });

  test('1.3 同文本节点中多个 URL', () => {
    const dom = createDOM('<p>第一个 https://a.com 和第二个 https://b.com/page</p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 2);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}2. URL 与中文混合${colors.reset}`);

  test('2.1 URL 后紧跟中文 — 中文不被吞入', () => {
    const dom = createDOM('<p>请访问 https://example.com/page了解一下</p>');
    linkify(dom.window.document.body);
    const links = linksInText(dom.window.document.body);
    assertEqual(links.length, 1);
    assertEqual(links[0].text, 'https://example.com/page');
  });

  test('2.2 URL 前后中文 — 链接正确提取', () => {
    const dom = createDOM('<p>这是链接https://www.baidu.com/哦试试看</p>');
    linkify(dom.window.document.body);
    const links = linksInText(dom.window.document.body);
    assertEqual(links.length, 1);
    assertEqual(links[0].text, 'https://www.baidu.com/');
  });

  test('2.3 全角逗号 — 不被吞入链接', () => {
    const dom = createDOM('<p>参考：https://example.com/doc，更多资料。</p>');
    linkify(dom.window.document.body);
    const links = linksInText(dom.window.document.body);
    assertEqual(links.length, 1);
    assertEqual(links[0].text, 'https://example.com/doc');
  });

  test('2.4 多 URL + 中文标点 — 全部正确提取', () => {
    const dom = createDOM('<p>看看这个https://test.com。还有这个https://a.com，明白了吗？</p>');
    linkify(dom.window.document.body);
    const links = linksInText(dom.window.document.body);
    assertEqual(links.length, 2);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}3. Skip Zone — 不应处理${colors.reset}`);

  test('3.1 <a> 标签 — 原链接保持不变', () => {
    const dom = createDOM('<p>已有链接：<a href="https://a.link/">https://a.link/</a></p>');
    linkify(dom.window.document.body);
    const aTag = dom.window.document.querySelector('a');
    assert(aTag !== null, '3.1 <a> — 元素存在');
    assertEqual(aTag.href, 'https://a.link/');
    assertEqual(aTag.textContent, 'https://a.link/');
  });

  test('3.2 <code> 标签 — URL 不被转换', () => {
    const dom = createDOM('<p>配置：<code>const url = "https://example.com/api";</code></p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('3.3 <pre> 标签 — URL 不被转换', () => {
    const dom = createDOM('<pre>npm i --registry https://registry.npmjs.org</pre>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('3.4 <textarea> — URL 不被转换', () => {
    const dom = createDOM('<form><textarea>https://no.convert/here</textarea></form>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.querySelector('form') || dom.window.document.body), 0);
  });

  test('3.5 <button> — URL 不被转换', () => {
    const dom = createDOM('<button>点击 https://button.link/ 查看</button>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('3.6 嵌套 Skip Zone (<pre><code>) — URL 不被转换', () => {
    const dom = createDOM('<pre><code>&lt;a href="https://nested.example.com"&gt;</code></pre>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('3.7 <input> — URL 不被转换', () => {
    const dom = createDOM('<form><input type="text" value="https://should.not.link/"></form>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}4. Shadow DOM${colors.reset}`);

  test('4.1 单层 Shadow DOM — 链接被识别', () => {
    const dom = createDOM('<div></div>');
    const host = dom.window.document.querySelector('div');
    host.attachShadow({ mode: 'open' });
    host.shadowRoot.innerHTML = '<span>Shadow 内 https://shadow.example.com/test 链接</span>';
    linkify(dom.window.document.body);
    assert(host.shadowRoot.querySelector('a') !== null, 'shadow 内应有链接');
  });

  test('4.2 嵌套 Shadow DOM — 两层链接都被识别', () => {
    const dom = createDOM('<div id="outer"></div>');
    const outer = dom.window.document.getElementById('outer');
    const outerShadow = outer.attachShadow({ mode: 'open' });
    outerShadow.innerHTML = '<span>外层 https://outer.example.com</span><div id="inner"></div>';
    const inner = outerShadow.getElementById('inner');
    const innerShadow = inner.attachShadow({ mode: 'open' });
    innerShadow.innerHTML = '<span>内层 https://inner.example.com/nested</span>';
    linkify(dom.window.document.body);
    assertEqual(outerShadow.querySelectorAll('a').length, 1, '外层 shadow');
    assertEqual(innerShadow.querySelectorAll('a').length, 1, '内层 shadow');
  });

  test('4.3 三层嵌套 Shadow DOM — 全部识别', () => {
    const dom = createDOM('<div id="root"></div>');
    const root = dom.window.document.getElementById('root');
    const s1 = root.attachShadow({ mode: 'open' });
    s1.innerHTML = '<span>https://level1.com</span><div id="mid"></div>';
    const mid = s1.getElementById('mid');
    const s2 = mid.attachShadow({ mode: 'open' });
    s2.innerHTML = '<span>https://level2.com</span><div id="deep"></div>';
    const deep = s2.getElementById('deep');
    const s3 = deep.attachShadow({ mode: 'open' });
    s3.innerHTML = '<span>https://level3.com</span>';
    linkify(dom.window.document.body);
    assert(s1.querySelector('a') !== null, '第 1 层');
    assert(s2.querySelector('a') !== null, '第 2 层');
    assert(s3.querySelector('a') !== null, '第 3 层');
  });

  test('4.4 跳过标签内的 Shadow 文本不转换，普通容器内的仍转换', () => {
    const dom = createDOM('<pre id="pre"></pre><a id="link"></a><div id="plain"></div>');
    const { document } = dom.window;
    const attach = (parent, url) => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<span>${url}</span>`;
      parent.appendChild(host);
      return shadow;
    };
    const preShadow = attach(document.getElementById('pre'), 'https://code.example/pre');
    const linkShadow = attach(document.getElementById('link'), 'https://code.example/link');
    const plainShadow = attach(document.getElementById('plain'), 'https://code.example/plain');
    linkify(document.body);
    assertEqual(preShadow.querySelectorAll('a').length, 0, '<pre> 内 shadow 不应生成链接');
    assertEqual(linkShadow.querySelectorAll('a').length, 0, '<a> 内 shadow 不应生成链接');
    assertEqual(plainShadow.querySelectorAll('a').length, 1, '普通容器内 shadow 仍应生成链接');
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}5. 边界情况${colors.reset}`);

  test('5.1 无 URL 文本 — 保持原样', () => {
    const dom = createDOM('<p>这是普通文本，没有任何链接。</p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('5.2 email/ftp — 当前不处理（非 http/https）', () => {
    const dom = createDOM('<p>邮箱 user@example.com 和 ftp://files.example.com</p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('5.3 javascript: — 伪协议不被转换（XSS 防护）', () => {
    const dom = createDOM('<p>javascript:alert(1)</p>');
    linkify(dom.window.document.body);
    assertEqual(countLinksIn(dom.window.document.body), 0);
  });

  test('5.4 URL 含 # 锚点 — 完整保留', () => {
    const dom = createDOM('<p>链接 https://example.com/with#hash 有锚点</p>');
    linkify(dom.window.document.body);
    const links = linksInText(dom.window.document.body);
    assertEqual(links.length, 1);
    assertEqual(links[0].href, 'https://example.com/with#hash');
  });

  test('5.5 URL 含端口号 — 正确识别', () => {
    const dom = createDOM('<p>带端口的链接 http://localhost:8080/api 测试</p>');
    linkify(dom.window.document.body);
    const links = linksInText(dom.window.document.body);
    assertEqual(links.length, 1);
    assertEqual(links[0].href, 'http://localhost:8080/api');
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}6. 动态内容${colors.reset}`);

  test('6.1 动态添加 URL 文本 — 增量 linkify 生效', () => {
    const dom = createDOM('<div id="container">普通文本</div>');
    linkify(dom.window.document.body);
    const container = dom.window.document.getElementById('container');
    const span = dom.window.document.createElement('span');
    span.textContent = '动态插入 https://dynamic.test.com/new';
    container.appendChild(span);
    linkify(container);
    assertEqual(countLinksIn(container), 1);
  });

  test('6.2 characterData 原地变动 — 已处理文本节点可重新检查', () => {
    const dom = createDOM('<p id="target">普通文本</p>');
    linkify(dom.window.document.body);
    const target = dom.window.document.getElementById('target');
    const textNode = target.firstChild;
    textNode.nodeValue = '请访问 https://changed.test.com/page';
    // MutationObserver 收到 characterData 记录时会清除旧的处理标记。
    processed.delete(textNode);
    linkifyTextNode(textNode);
    assertEqual(countLinksIn(target), 1, '新文本中的链接应被处理');
    assertEqual(
      target.querySelector('a').href,
      'https://changed.test.com/page'
    );
  });

  test('6.3 统计按实际生成的链接数累加', () => {
    const before = STATS.count;
    const dom = createDOM('<p>https://one.test 和 https://two.test</p>');
    linkify(dom.window.document.body);
    assertEqual(STATS.count - before, 2, '同一文本节点中的两个链接都应计数');
  });

  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}7. 内部工具函数${colors.reset}`);

  test('7.1 pruneRoots — 过滤包含关系', () => {
    const dom = createDOM('<div id="parent"><div id="child">text</div></div>');
    const parent = dom.window.document.getElementById('parent');
    const child = dom.window.document.getElementById('child');
    const pruned = pruneRoots(new Set([parent, child]));
    assertEqual(pruned.length, 1, '应只保留 1 个节点');
    assert(pruned[0] === parent, '应保留最外层节点');
  });

  test('7.2 pruneRoots — 过滤已断开节点', () => {
    const dom = createDOM('<div id="keep">text</div>');
    const keep = dom.window.document.getElementById('keep');
    const detached = dom.window.document.createElement('span');
    const pruned = pruneRoots(new Set([keep, detached]));
    assertEqual(pruned.length, 1, '应只保留 1 个节点');
    assert(pruned[0] === keep, '应保留已连接节点');
  });

  test('7.3 pruneRoots — 空集合', () => {
    const pruned = pruneRoots(new Set());
    assertEqual(pruned.length, 0);
  });

  test('7.4 pruneRoots — 平级兄弟节点都保留', () => {
    const dom = createDOM('<div id="a">A</div><div id="b">B</div>');
    const a = dom.window.document.getElementById('a');
    const b = dom.window.document.getElementById('b');
    const pruned = pruneRoots(new Set([a, b]));
    assertEqual(pruned.length, 2, '兄弟节点应全部保留');
  });

  // 加载实际分发脚本，验证观察器与防抖流程，而非手动调用复制的核心函数。
  async function testUserscript(name, check) {
    tests++;
    const dom = new JSDOM('<!doctype html><body></body>', {
      url: 'https://example.com/', runScripts: 'outside-only',
    });
    try {
      const { window } = dom;
      window.GM_registerMenuCommand = () => 1;
      window.GM_unregisterMenuCommand = () => {};
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
      const source = require('fs').readFileSync(require('path').join(__dirname, 'auto-linkify.user.js'), 'utf8');
      window.eval(source);
      const settle = () => new Promise(resolve => setTimeout(resolve, 450));
      await check(window, settle);
      passed++;
      if (verbose) console.log(`  ${colors.green}✓${colors.reset} ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ${colors.red}✗${colors.reset} ${name}\n    ${err.message}`);
      if (verbose) console.error(err.stack);
      if (bail) {
        printSummary();
        process.exit(EXIT_CODE.FAILURES);
      }
    } finally {
      dom.window.close();
    }
  }

  await testUserscript('6.4 实际脚本监听新增宿主及嵌套 Shadow DOM 的后续变化', async (window, settle) => {
    const host = window.document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const nestedHost = window.document.createElement('div');
    const nested = nestedHost.attachShadow({ mode: 'open' });
    shadow.append(nestedHost);
    window.document.body.append(host);
    await settle();
    shadow.append('https://outer.example/');
    nested.append('https://inner.example/');
    await settle();
    assertEqual(shadow.querySelectorAll('a').length, 1);
    assertEqual(nested.querySelectorAll('a').length, 1);
  });

  await testUserscript('6.5 实际脚本监听文本节点原地更新', async (window, settle) => {
    const text = window.document.createTextNode('普通文本');
    window.document.body.append(text);
    await settle();
    text.nodeValue = 'https://changed.example/';
    await settle();
    assertEqual(window.document.body.querySelectorAll('a').length, 1);
  });

  await testUserscript('6.6 实际脚本整棵插入跳过标签时不转换其 Shadow 文本', async (window, settle) => {
    const attach = (parent, url) => {
      const host = window.document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<span>${url}</span>`;
      parent.appendChild(host);
      return shadow;
    };
    const pre = window.document.createElement('pre');
    const wrap = window.document.createElement('div');
    const shadow = attach(pre, 'https://code.example/pre');
    wrap.appendChild(pre);
    const control = window.document.createElement('div');
    const controlShadow = attach(control, 'https://code.example/plain');
    window.document.body.append(wrap, control);
    await settle();
    assertEqual(shadow.querySelectorAll('a').length, 0, '<div><pre> 内 shadow 不应生成链接');
    assertEqual(controlShadow.querySelectorAll('a').length, 1, '普通容器内 shadow 仍应生成链接');
  });

  await testUserscript('6.7 实际脚本跳过起点在跳过标签内的扫描', async (window, settle) => {
    const attach = (parent, url) => {
      const host = window.document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<span>${url}</span>`;
      parent.appendChild(host);
      return shadow;
    };
    // 起点就是 <pre>：整棵 <pre><x-host> 一次性插入
    const pre = window.document.createElement('pre');
    const shadow = attach(pre, 'https://code.example/root');
    window.document.body.appendChild(pre);
    await settle();
    assertEqual(shadow.querySelectorAll('a').length, 0, '起点为 <pre> 时不应生成链接');
    // 起点是宿主本身，但祖先链含已在页面上的 <pre>
    const laterPre = window.document.createElement('pre');
    window.document.body.appendChild(laterPre);
    await settle();
    const laterShadow = attach(laterPre, 'https://code.example/later');
    await settle();
    assertEqual(laterShadow.querySelectorAll('a').length, 0, '<pre> 内后插入的 shadow 不应生成链接');
  });

  printSummary();
  process.exitCode = failed ? EXIT_CODE.FAILURES : EXIT_CODE.SUCCESS;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────

function printSummary() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${colors.bold}─`.repeat(40));
  console.log(`结果：${colors.green}${passed} 通过${colors.reset} / ${colors.red}${failed} 失败${colors.reset} / ${tests} 总计 | 耗时 ${elapsed}s`);

  if (failed > 0) {
    console.log(`\n${colors.red}存在 ${failed} 个失败用例，请检查。${colors.reset}`);
  } else if (tests === 0) {
    console.log(`\n${colors.yellow}未运行任何用例。${colors.reset}`);
  } else {
    console.log(`\n${colors.green}全部用例通过！${colors.reset}`);
  }
}

// ─── 入口 ─────────────────────────────────────────────────────────────────

// 全局异常兜底
process.on('uncaughtException', (err) => {
  console.error(`\n${colors.red}未捕获的异常:${colors.reset} ${err.message}`);
  if (verbose) console.error(err.stack);
  process.exit(EXIT_CODE.RUNTIME_ERROR);
});

process.on('unhandledRejection', (reason) => {
  console.error(`\n${colors.red}未处理的 Promise 拒绝:${colors.reset} ${reason}`);
  process.exit(EXIT_CODE.RUNTIME_ERROR);
});

try {
  // 检查 jsdom 是否可用
  if (!JSDOM) {
    console.error(`${colors.red}错误: jsdom 未正确加载，请运行 npm install${colors.reset}`);
    process.exit(EXIT_CODE.RUNTIME_ERROR);
  }

  runTests().catch((err) => {
    console.error(err);
    process.exitCode = EXIT_CODE.RUNTIME_ERROR;
  });
} catch (err) {
  console.error(`\n${colors.red}测试执行失败:${colors.reset} ${err.message}`);
  if (verbose) console.error(err.stack);
  process.exit(EXIT_CODE.RUNTIME_ERROR);
}
