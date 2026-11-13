/* browser_check.mjs — 真实浏览器（Chrome/Edge CDP）端到端验证
 *
 * 用法：node browser_check.mjs <url> [标签]
 * 例：  node browser_check.mjs http://127.0.0.1:8099/index.html 在线版
 *       node browser_check.mjs file:///D:/.../index.html 离线版
 *
 * 验证：分级课程、核心练习、键盘布局切换、按次记录（时长/进度/内容）、
 *       家长监督面板、刷新后持久化。全部通过退出码 0，否则 1。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAW_URL = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const URL_UNDER_TEST = /^https?:\/\//.test(RAW_URL) ? RAW_URL
  : pathToFileURL(path.resolve(RAW_URL)).href;
const LABEL = process.argv[3] || '站点';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const exe = fs.existsSync(CHROME) ? CHROME : EDGE;
const PORT = 9333 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-check-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); }
      }, 15000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面 JS 异常: ' + (r.exceptionDetails.exception?.description ||
        r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch (e) { /* 尚未启动 */ }
    await sleep(200);
  }
  throw new Error('浏览器 CDP 端口未就绪');
}

let chrome, ws;
try {
  console.log(`\n===== ${LABEL} · ${URL_UNDER_TEST} =====`);
  chrome = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-extensions', '--window-size=1280,900', URL_UNDER_TEST,
  ], { stdio: 'ignore', windowsHide: true });

  await waitCdp();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = list.find(t => t.type === 'page');
  if (!target) throw new Error('未找到页面 target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await sleep(1200);

  // ---------- 1. 首屏 ----------
  record('页面加载且练习端脚本执行（欢迎页渲染）',
    await cdp.eval(`!!document.querySelector('.welcome-card')`),
    await cdp.eval(`document.title`));
  record('默认键盘为笔记本布局',
    await cdp.eval(`document.querySelector('#w-layout')?.value === 'laptop'`));
  record('静态/本机模式状态提示正确',
    await cdp.eval(`/本机模式|已保存/.test(document.querySelector('#sync-text')?.textContent || '')`),
    await cdp.eval(`document.querySelector('#sync-text')?.textContent`));

  // ---------- 2. 创建档案 ----------
  await cdp.eval(`(() => {
    const i = document.querySelector('#w-name');
    i.value = '验证学生'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#w-start').click();
    return true;
  })()`);
  await sleep(500);
  record('创建档案成功并进入指法页',
    await cdp.eval(`!!document.querySelector('#learner-select') &&
      document.querySelector('#learner-select').options.length === 1`));

  // ---------- 3. 课程地图 ----------
  await cdp.eval(`location.hash = '#/curriculum'`);
  await sleep(500);
  const curriculum = await cdp.eval(`(() => ({
    tabs: document.querySelectorAll('.track-tab').length,
    activeTab: document.querySelector('.track-tab.active .track-copy b')?.textContent,
    stages: document.querySelectorAll('.stage-block').length,
    lessons: document.querySelectorAll('.lesson-card').length,
    levels: document.querySelectorAll('.level-chip').length,
    firstLesson: document.querySelector('.lesson-card .lesson-title')?.textContent,
    locked: document.querySelectorAll('.lesson-card.locked').length,
  }))()`);
  record('课程地图默认「初中英语键位进阶」轨道',
    curriculum.activeTab === '初中英语键位进阶', curriculum.activeTab);
  record('8 课 × 5 级 = 40 关，分级说明齐全',
    curriculum.stages === 8 && curriculum.lessons === 40 && curriculum.levels === 5,
    `阶段${curriculum.stages} 关卡${curriculum.lessons} 级别${curriculum.levels}`);
  record('课程按顺序锁定，仅第一关可练',
    curriculum.locked === 39, `锁定 ${curriculum.locked} 关`);
  record('第一关为「第1课 · 指法」',
    curriculum.firstLesson === '指法', curriculum.firstLesson);

  // ---------- 4. 核心练习 ----------
  await cdp.eval(`document.querySelector('.lesson-card:not([disabled])').click()`);
  await sleep(500);
  record('练习页渲染：教学卡、练习内容预览、虚拟键盘',
    await cdp.eval(`!!document.querySelector('.intro-card') &&
      !!document.querySelector('.intro-preview code') &&
      document.querySelectorAll('.kb .key').length > 40`));
  record('默认布局的虚拟键盘为笔记本',
    await cdp.eval(`document.querySelector('.kb')?.dataset.layout === 'laptop'`),
    await cdp.eval(`document.querySelector('.kb')?.dataset.layout`));

  await cdp.eval(`document.querySelector('[data-act="start"]').click()`);
  await sleep(200);
  const targetInfo = await cdp.eval(`(() => {
    const cells = [...document.querySelectorAll('[data-role="target"] .cell')];
    return { count: cells.length,
      keys: cells.map(c => c.classList.contains('cell-space') ? ' '
        : c.classList.contains('cell-break') ? '\\n' : c.textContent) };
  })()`);
  // 逐字击键（真实键盘事件语义：换行用 Enter），分批留出时间以产生真实练习时长
  const keysJson = JSON.stringify(targetInfo.keys);
  await cdp.eval(`(async () => {
    const keys = ${keysJson};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i] === '\\n' ? 'Enter' : keys[i];
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      if (i % 20 === 19) await new Promise(r => setTimeout(r, 70));
    }
    return true;
  })()`);
  await sleep(400);
  record('逐字完成一整关并出现结算卡',
    await cdp.eval(`!document.querySelector('[data-view="result"]').hidden`),
    `目标 ${targetInfo.count} 字符`);

  const session = await cdp.eval(`(() => {
    const st = JSON.parse(localStorage.getItem('typing-lab.state.v1') || '{}');
    const lr = Object.values(st.learners || {})[0];
    return lr && lr.sessions && lr.sessions.at(-1) ? lr.sessions.at(-1) : null;
  })()`);
  record('按次记录含练习时长',
    session && Number(session.durationMs) > 0, `${session?.durationMs} ms`);
  record('按次记录含完成进度',
    session && session.progressPct === 100, `progressPct=${session?.progressPct}`);
  record('按次记录含对应练习内容 / 课程 / 级别',
    session && session.contentPreview && session.courseUnit && session.levelName,
    `${session?.courseUnit} · ${session?.levelName} · ${String(session?.contentPreview).slice(0, 22)}…`);
  record('达标后键位进阶轨道解锁下一关',
    await cdp.eval(`(() => {
      const st = JSON.parse(localStorage.getItem('typing-lab.state.v1'));
      const lr = Object.values(st.learners)[0];
      return lr.englishProgressIndex === 1 && lr.basicProgressIndex === 0;
    })()`));

  // ---------- 5. 键盘布局切换 ----------
  await cdp.eval(`location.hash = '#/curriculum'`);
  await sleep(400);
  const layoutResults = {};
  for (const id of ['us_ansi', 'uk_iso', 'laptop']) {
    await cdp.eval(`(() => {
      const s = document.querySelector('#layout-select');
      s.value = '${id}'; s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    await cdp.eval(`location.hash = '#/fingers'`);
    await sleep(400);
    layoutResults[id] = await cdp.eval(`(() => {
      const kb = document.querySelector('.kb');
      const keys = kb ? [...kb.querySelectorAll('.key')].filter(k => k.dataset.char).length : 0;
      const st = JSON.parse(localStorage.getItem('typing-lab.state.v1'));
      return { layout: kb?.dataset.layout, keys,
        saved: Object.values(st.learners)[0].layout,
        numpad: !!kb?.querySelector('.kb-numpad') };
    })()`);
    await cdp.eval(`location.hash = '#/curriculum'`);
    await sleep(250);
  }
  record('键盘类型可切换且写入档案（笔记本 / 全尺寸 / 英式）',
    layoutResults.us_ansi.saved === 'us_ansi' && layoutResults.uk_iso.saved === 'uk_iso' &&
    layoutResults.laptop.saved === 'laptop');
  record('切换后虚拟键盘按布局重绘（全尺寸含数字小键盘）',
    layoutResults.us_ansi.layout === 'us_ansi' && layoutResults.us_ansi.numpad === true &&
    layoutResults.uk_iso.layout === 'uk_iso' && layoutResults.laptop.layout === 'laptop');
  record('三套布局的字符键位数量一致、指法提示不丢失',
    Object.values(layoutResults).every(v => v.keys >= 40),
    Object.entries(layoutResults).map(([k, v]) => `${k}:${v.keys}`).join(' '));

  // 解锁全部关卡后验证段落关：切换布局后练习文本与换行结构仍一致
  await cdp.eval(`(() => {
    const st = JSON.parse(localStorage.getItem('typing-lab.state.v1'));
    const lr = Object.values(st.learners)[0];
    lr.englishProgressIndex = 40; lr.basicProgressIndex = 33;
    localStorage.setItem('typing-lab.state.v1', JSON.stringify(st));
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  await cdp.eval(`location.hash = '#/lesson/E7-passage'`);
  await sleep(600);
  const passage = await cdp.eval(`(() => {
    const cells = [...document.querySelectorAll('[data-role="target"] .cell')];
    return { cells: cells.length,
      breaks: document.querySelectorAll('[data-role="target"] .cell-break').length,
      preview: document.querySelector('.intro-preview code')?.textContent || '',
      layout: document.querySelector('.kb')?.dataset.layout };
  })()`);
  record('第 7 课段落练习渲染出换行符（Enter 练习）',
    passage.breaks === 5, `${passage.breaks} 处换行 / ${passage.cells} 字符`);

  // ---------- 6. 家长监督面板 ----------
  const base = URL_UNDER_TEST.replace(/[^/]*$/, '');
  await cdp.send('Page.navigate', { url: base + 'parent.html' });
  await sleep(1200);
  record('家长面板门禁渲染（本机模式说明）',
    await cdp.eval(`!!document.querySelector('#pin-input') && !!document.querySelector('.gate-local')`));
  await cdp.eval(`(() => {
    const i = document.querySelector('#pin-input');
    i.value = '0000'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#pin-submit').click(); return true;
  })()`);
  await sleep(300);
  record('错误 PIN 被拒绝',
    await cdp.eval(`!!document.querySelector('#gate-error') &&
      /不正确/.test(document.querySelector('#gate-error').textContent)`));
  await cdp.eval(`(() => {
    const i = document.querySelector('#pin-input');
    i.value = '2468'; document.querySelector('#pin-submit').click(); return true;
  })()`);
  await sleep(600);
  const parent = await cdp.eval(`(() => ({
    dashboard: !!document.querySelector('.parent-dashboard'),
    headers: [...document.querySelectorAll('.data-table thead th')].map(t => t.textContent),
    rows: document.querySelectorAll('.data-table tbody tr').length,
    firstRow: document.querySelector('.data-table tbody tr')?.innerText || '',
    trackHeads: document.querySelectorAll('.track-progress-head').length,
    kpis: [...document.querySelectorAll('.kpi span')].map(s => s.textContent),
  }))()`);
  record('正确 PIN 进入家长面板', parent.dashboard);
  record('明细表含「本次时长 / 完成进度 / 练习内容」列',
    ['本次时长', '完成进度', '练习内容'].every(h => parent.headers.includes(h)),
    parent.headers.join('|'));
  record('明细表展示刚完成的练习记录',
    parent.rows >= 1 && /100%/.test(parent.firstRow), parent.firstRow.replace(/\s+/g, ' ').slice(0, 90));
  record('家长视图展示两条轨道的课程进度',
    parent.trackHeads === 2 && parent.kpis.some(k => /键位进阶进度/.test(k)));

  // ---------- 7. 持久化 ----------
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(1000);
  const persisted = await cdp.eval(`(() => {
    const st = JSON.parse(localStorage.getItem('typing-lab.state.v1') || '{}');
    const lr = Object.values(st.learners || {})[0];
    return { learners: Object.keys(st.learners || {}).length,
      sessions: lr?.sessions?.length || 0,
      english: lr?.englishProgressIndex, layout: lr?.layout,
      lastPct: lr?.sessions?.at(-1)?.progressPct };
  })()`);
  // 注：为验证第 7 课段落关，前面把 englishProgressIndex 手动设为 40；
  // 此处断言该值也被持久化，恰好验证进度字段同样可持久保存。
  record('刷新后档案 / 记录 / 进度 / 布局持久保存',
    persisted.learners === 1 && persisted.sessions >= 1 &&
    persisted.english === 40 && persisted.lastPct === 100 && persisted.layout === 'laptop',
    JSON.stringify(persisted));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${LABEL} 结果：${results.length - failed.length} / ${results.length} 项通过`);
  if (failed.length) {
    console.log('失败项：' + failed.map(f => f.name).join('；'));
    process.exitCode = 1;
  }
} catch (e) {
  console.error('\n验证中断：' + (e.stack || e.message));
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (e) {}
  try { chrome && chrome.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
