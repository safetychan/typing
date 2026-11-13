/* parent.js — 家长监督面板：PIN 门禁、学习时间与进度、图表、明细、导出与数据管理。
 * 在线时数据来自服务器 api/overview（可跨设备查看）；服务器不可用时降级读取本机 localStorage。
 * API 前缀由 api.js 自动探测（逐级上溯候选），子目录层级与 Nginx 转发路径不一致也能对上。
 */
import {
  STAGES, LESSONS, TRACKS, computeStats, formatDuration, dayKey, lessonStats,
  stagesOfTrack, trackStats,
} from './curriculum.js';
import { LAYOUTS } from './layouts.js';
import { store } from './storage.js';
import { RUNTIME, IS_STATIC } from './runtime.js';
import { apiUrl, apiBase, apiProbeResults, detectApiBase } from './api.js';

// 构建标记：升级后若面板上仍是旧版本号，说明浏览器/CDN 缓存了旧的 parent.js。
const BUILD = 'v4.0 · 2026-11-13';

const view = document.getElementById('view');
const modal = document.getElementById('modal');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = { learners: {}, source: null, pin: '', learnerId: '', range: 30 };

/** 后端能力探测：删除接口 / 版本仲裁墓碑是 v2 才有的。
 *  旧后端 /api/config 没有 features，前端就能在用户点「删除」之前明确提示升级，
 *  而不是等 POST 返回一句看不懂的「接口不存在」。 */
let backend = { detected: false, version: 0, features: [], supportsDelete: false, runtime: '' };

async function probeBackend() {
  backend = { detected: false, version: 0, features: [], supportsDelete: false, runtime: '' };
  try {
    const r = await fetch(apiUrl('config'), { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) {
      backend.detected = true;
      backend.version = Number(d.version) || 0;
      backend.features = Array.isArray(d.features) ? d.features : [];
      backend.runtime = String(d.runtime || '');
      backend.supportsDelete = backend.features.indexOf('delete') >= 0;
    }
  } catch (e) { /* 探测失败不误判为旧版 */ }
  return backend;
}
function needsBackendUpgrade() {
  // 只有真正连上后端并读到 config 才会 detected=true；离线/本机模式不会误报
  return backend.detected && !backend.supportsDelete;
}
function backendTag() {
  if (IS_STATIC) return '<span class="build-tag ok" title="纯前端运行，无需服务器">本机模式 · 无需联网</span>';
  if (!backend.detected) return '<span class="build-tag" title="后端能力未探测到">后端版本未知</span>';
  if (backend.supportsDelete) {
    return `<span class="build-tag ok" title="支持删除与版本仲裁">后端 v${backend.version} · ${esc(backend.runtime)}</span>`;
  }
  return `<span class="build-tag warn" title="后端程序版本过旧">⚠️ 后端 v${backend.version} · 缺少删除能力</span>`;
}
function backendWarning() {
  if (IS_STATIC) return '';
  if (!needsBackendUpgrade()) return '';
  return `<div class="backend-warn">
    <b>⚠️ 后端程序版本过旧，删除功能不可用</b>
    <p>当前后端没有 <code>/api/parent/delete</code>，点删除会返回「接口不存在」。删除学习者、以及「重置后旧数据不回流」，都需要新版 <code>server.py</code> / <code>server.js</code>，而且<b>必须重启后端进程</b>——只覆盖 <code>public/</code>、或不重启，正在运行的 Python/Node 进程仍加载着旧代码。</p>
    <pre>cd &lt;项目目录&gt;                       # 例如 /home/www/bj.iur.me/wordpress/typing
cp /tmp/typing-new/typing-lab/server.py server.js ./
./stop.sh &amp;&amp; PORT=8080 HOST=127.0.0.1 ./daemon.sh   # 端口按实际填
curl -s http://127.0.0.1:8080/api/config   # 期望 version:2 且 features 含 "delete"</pre>
    <p class="small">升级后回到本页按 Ctrl+F5 刷新；<code>config.json</code> 与 <code>data/</code> 保持原样，不要删除。</p>
  </div>`;
}
/** 把后端 404「接口不存在」翻译成可执行的原因说明 */
function serverActionError(res, data) {
  if (res && (res.status === 404 || /接口不存在|not found/i.test(String((data && data.error) || '')))) {
    return '后端程序版本过旧：该接口不存在。请用新版 server.py / server.js 替换并重启后端进程（只换前端不会生效），详见上方提示与 README「升级覆盖」一节。';
  }
  return (data && data.error) || '操作失败，请重试';
}

function localLearners() {
  try { return store.learners.reduce((o, l) => (o[l.id] = l, o), {}); }
  catch (e) { return {}; }
}
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtMin(ms) { return (Math.round((Number(ms) || 0) / 60000 * 10) / 10); }
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csvFrom(learners) {
  const rows = [['学习者', '开始时间', '关卡', '课程', '级别', '阶段', '时长(秒)',
    '完成进度(%)', '练习内容', '字符数', '目标字符数', '正确',
    '错误', '击键数', 'WPM', '准确率(%)', '布局', '完成', '达标']];
  const q = v => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  for (const [lid, lr] of Object.entries(learners)) {
    for (const s of (lr.sessions || [])) {
      rows.push([lr.name || lid, s.startedAt, s.lessonTitle, s.courseUnit, s.levelName, s.stage,
        (Number(s.durationMs || 0) / 1000).toFixed(1),
        s.progressPct != null ? s.progressPct : (s.completed ? 100 : 0),
        s.contentPreview, s.chars, s.targetLength, s.correct, s.errors,
        s.keystrokes, s.wpm, s.accuracy, s.layout,
        s.completed ? '是' : '否', s.passed ? '是' : '否']);
    }
  }
  return '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

// ---------------- 门禁 ----------------
/** 探测后端：自动尝试多个 API 前缀，命中即设为全局基址。 */
async function checkServer(force = false) {
  if (IS_STATIC) {
    const badge = $('#source-badge');
    if (badge) badge.textContent = '本机模式';
    return false;
  }
  const res = await detectApiBase(force);
  if (res.base) await probeBackend();
  const badge = $('#source-badge');
  if (badge) badge.textContent = res.base ? '服务器已连接' : '仅本机数据';
  return Boolean(res.base);
}

/** 把探测明细渲染成表格，便于一眼看出 Nginx 到底转发了哪一级 api/ */
function probeTable() {
  const rows = apiProbeResults();
  if (!rows.length) return '<div class="diag-row"><span>探测</span><b>未执行</b></div>';
  return rows.map(r => `<div class="diag-row">
      <span>${r.ok ? '✅' : '❌'}</span>
      <code>${esc(r.base + 'health')}</code>
      <b>${esc(r.detail)}${r.runtime ? ' · ' + esc(r.runtime) : ''}</b>
    </div>`).join('');
}

function renderGate(offline) {
  view.innerHTML = `
    <section class="gate-wrap">
      <div class="gate-card">
        <div class="gate-icon">🔒</div>
        <h1>家长监督面板</h1>
        <p class="muted">查看每次练习的时长、完成进度、练习内容与课程进度。请输入家长 PIN。</p>
        <label class="field"><span>家长 PIN</span>
          <input id="pin-input" type="password" inputmode="numeric" maxlength="12" placeholder="默认 2468，可在 index.html 的 __TYPING_LAB_CONFIG__ 修改"></label>
        <div class="gate-error" id="gate-error"></div>
        <button class="btn btn-primary btn-lg" id="pin-submit">进入面板</button>
        <p class="build-line">${backendTag()}</p>
        ${backendWarning()}
        ${IS_STATIC ? `<div class="gate-local">
          <p><b>本机模式</b>：本版本不需要服务器和网络连接，练习记录保存在这台设备的浏览器里。</p>
          <p class="small">进入面板后可导出 CSV / JSON 备份，也可用「导入备份」把记录迁移到在线版或另一台设备。清除浏览器数据会一并清除记录，请先导出备份。</p>
        </div>` : (offline ? `<div class="gate-offline">
          <p><b>⚠️ 服务器 API 未连通</b>，当前只能查看这台设备浏览器里保存的数据。</p>
          <p class="small">练习端能正常打字，是因为前端有离线降级；但成绩<b>不会写入服务器 data/progress.json</b>，也无法跨设备查看。</p>
          <div class="diag-box">
            <div class="diag-title">已自动尝试以下 API 前缀（页面目录逐级上溯）：</div>
            ${probeTable()}
            <div class="diag-title">按顺序排查：</div>
            <div class="diag-row"><span>① 后端</span><code>curl -s http://127.0.0.1:8081/api/health</code>
              <b>须返回 {"ok":true,...}。启动：PORT=8081 HOST=127.0.0.1 ./daemon.sh；若报 Address already in use 说明 8081 也被占，换端口（如 9000）并同步改下方 proxy_pass 的端口</b></div>
            <div class="diag-row"><span>② Nginx</span><code>location ^~ ${esc(new URL(apiBase()).pathname)} { proxy_pass http://127.0.0.1:8081/api/; }</code>
              <b>location 前缀须和上表某个候选一致，proxy_pass 端口须和 ① 启动端口一致；改完 nginx -t &amp;&amp; nginx -s reload</b></div>
            <div class="diag-row"><span>③ 验证</span><code>curl -i ${esc(apiUrl('health'))}</code>
              <b>期望 200 + JSON；404 说明没转发，502 说明转发了但后端没起（或端口不一致）</b></div>
          </div>
          <div class="row-actions">
            <button class="btn btn-soft" id="retry-connect">↻ 重新检测</button>
            <button class="btn btn-ghost" id="local-view">查看本机数据</button>
          </div>
        </div>` : '')}
        <p class="small muted">${IS_STATIC
          ? '数据保存在本机浏览器 localStorage，不使用数据库；在线版与离线版记录格式完全一致。'
          : '数据保存在服务器 data/progress.json 与各设备浏览器本地存储中，不使用数据库。'}</p>
      </div>
    </section>`;
  const submit = async () => {
    const pin = $('#pin-input').value.trim();
    const err = $('#gate-error');
    // 静态模式没有后端：PIN 在本地校验，通过后直接读取同一浏览器的练习记录
    if (IS_STATIC) {
      if (pin !== RUNTIME.parentPin) { err.textContent = 'PIN 不正确，请重试'; return; }
      state = { learners: localLearners(), source: 'local', pin: '', learnerId: '', range: 30 };
      $('#source-badge').textContent = '本机模式 · 已解锁';
      renderDashboard();
      return;
    }
    try {
      const res = await fetch(apiUrl('parent/verify'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { err.textContent = 'PIN 不正确，请重试'; return; }
      await loadServer(pin);
    } catch (e) {
      err.textContent = '无法连接服务器 API：请确认后端已启动、Nginx 已反代 api/ 前缀，可先查看本机数据';
    }
  };
  $('#pin-submit').onclick = submit;
  $('#pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  if ($('#retry-connect')) $('#retry-connect').onclick = async () => {
    const btn = $('#retry-connect');
    btn.textContent = '检测中…'; btn.disabled = true;
    const online = await checkServer(true);
    const typed = $('#pin-input').value;
    renderGate(!online);
    $('#pin-input').value = typed;
    if (online) $('#gate-error').textContent = '✅ 已连上服务器，请输入 PIN';
    else $('#gate-error').textContent = '仍未连通，请对照上方探测结果排查';
  };
  if ($('#local-view')) $('#local-view').onclick = () => {
    state = { learners: localLearners(), source: 'local', pin: '', learnerId: '', range: 30 };
    renderDashboard();
  };
  $('#pin-input').focus();
}

async function loadServer(pin) {
  try {
    const res = await fetch(apiUrl('overview?pin=' + encodeURIComponent(pin)));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error('pin');
    state = { learners: data.learners || {}, source: 'server', pin, learnerId: '', range: 30 };
    $('#source-badge').textContent = '服务器数据 · 已连接';
    renderDashboard();
  } catch (e) {
    $('#gate-error').textContent = '读取服务器数据失败：后端可能已启动，但 api/ 转发或 PIN 校验未通过';
  }
}

// ---------------- 图表 ----------------
function dailyMinutes(lr) {
  const out = {};
  for (const [d, ms] of Object.entries(lr.activity || {})) out[d] = (Number(ms) || 0) / 60000;
  for (const s of (lr.sessions || [])) {
    const d = dayKey(s.startedAt);
    if (!d) continue;
    out[d] = Math.max(out[d] || 0, (Number(s.durationMs) || 0) / 60000);
  }
  return out;
}
function barChart(lr, days) {
  const mins = dailyMinutes(lr);
  const list = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    list.push({ key: key.slice(5), minutes: Math.round((mins[key] || 0) * 10) / 10, full: key });
  }
  const max = Math.max(15, ...list.map(x => x.minutes));
  const W = Math.max(560, days * 22), H = 190, pad = 28, bw = (W - pad * 2) / list.length;
  const bars = list.map((x, i) => {
    const h = (x.minutes / max) * (H - 52);
    const bx = pad + i * bw + bw * 0.16, by = H - 28 - h;
    return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(bw * 0.68).toFixed(1)}"
      height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${x.minutes ? '#5b7cf0' : '#e6ebf5'}">
      <title>${x.full} · ${x.minutes} 分钟</title></rect>` +
      (days <= 14 || i % Math.ceil(days / 12) === 0
        ? `<text x="${(bx + bw * 0.34).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="axis-label">${x.key}</text>` : '');
  }).join('');
  const grid = [0, 0.5, 1].map(t => {
    const y = H - 28 - t * (H - 52);
    return `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="#e8edf6"/>
      <text x="${pad - 6}" y="${y + 4}" text-anchor="end" class="axis-label">${Math.round(max * t)}m</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="每日学习时长柱状图">
    ${grid}${bars}</svg>`;
}
function lineChart(sessions) {
  const list = sessions.filter(s => s.completed).slice(-20);
  if (list.length < 2) return '<div class="empty">完成 2 次以上练习后，这里会显示准确率与速度趋势。</div>';
  const W = 640, H = 190, pad = 34;
  const step = (W - pad * 2) / (list.length - 1);
  const yAcc = v => H - 28 - (Math.min(100, Math.max(0, v)) / 100) * (H - 52);
  const yWpm = v => H - 28 - (Math.min(60, Math.max(0, v)) / 60) * (H - 52);
  const path = (fn) => list.map((s, i) =>
    `${i ? 'L' : 'M'}${(pad + i * step).toFixed(1)} ${fn(s).toFixed(1)}`).join(' ');
  const dots = list.map((s, i) =>
    `<circle cx="${(pad + i * step).toFixed(1)}" cy="${yAcc(s.accuracy).toFixed(1)}" r="3" fill="#4f6bed">
       <title>第 ${i + 1} 次 · 准确率 ${s.accuracy}%</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="准确率与速度趋势">
    ${[0, 0.5, 1].map(t => `<line x1="${pad}" y1="${H - 28 - t * (H - 52)}" x2="${W - pad}"
      y2="${H - 28 - t * (H - 52)}" stroke="#e8edf6"/>`).join('')}
    <text x="${pad - 6}" y="${H - 28}" text-anchor="end" class="axis-label">0</text>
    <text x="${pad - 6}" y="${H - 28 - (H - 52)}" text-anchor="end" class="axis-label">100%</text>
    <text x="${W - pad + 2}" y="${H - 28}" class="axis-label">0 WPM</text>
    <path d="${path(s => yAcc(s.accuracy))}" fill="none" stroke="#4f6bed" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${path(s => yWpm(s.wpm))}" fill="none" stroke="#f0a35b" stroke-width="2.5"
      stroke-linejoin="round" stroke-dasharray="6 4"/>
    ${dots}
    <g class="chart-legend"><rect x="${pad}" y="6" width="10" height="10" rx="2" fill="#4f6bed"/>
      <text x="${pad + 16}" y="15">准确率 %</text>
      <rect x="${pad + 110}" y="6" width="10" height="10" rx="2" fill="#f0a35b"/>
      <text x="${pad + 126}" y="15">速度 WPM（0–60 刻度）</text></g>
  </svg>`;
}

// ---------------- 面板 ----------------
function kpi(label, value, sub, icon, tone) {
  return `<div class="kpi ${tone || ''}"><div class="kpi-icon">${icon}</div>
    <div><span>${label}</span><b>${value}</b><small>${sub || ''}</small></div></div>`;
}

/**
 * 数据管理区独立渲染：以前它嵌在「有学习者才渲染」的大分支里，
 * 一旦 state.learners 为空（例如家长端走了「仅本机数据」），整个区就消失，
 * 用户会以为功能没做。现在无论有无档案都显示；无档案时按钮禁用并说明原因。
 */
function dataManagementCard(lr, learners) {
  const has = Boolean(lr);
  const tip = has
    ? `当前选中：<b>${esc(lr.name)}</b>。重置只清空练习记录与进度；删除会移除整个档案。${IS_STATIC ? '本机模式下请用「导出 JSON」定期备份。' : '操作会同步到服务器与其他设备。'}操作前请先导出备份。`
    : `当前${learners.length ? '没有选中学习者' : '没有任何学习者档案'}，因此没有可重置或删除的对象。${IS_STATIC ? '请先让孩子在练习端创建档案并完成一次练习。' : '若练习端有档案但这里看不到，请点「↻ 刷新」或确认已连接服务器数据。'}`;
  return `<div class="card data-manage-card">
    <div class="card-head"><h3>数据管理</h3>
      <span class="muted small">重置进度 / 删除学习者 · ${IS_STATIC ? '仅影响本机' : '会同步到所有设备'}</span></div>
    <div class="danger-zone">
      <p class="small muted">${tip}</p>
      <div class="row-actions">
        <button class="btn btn-danger" id="p-reset" ${has ? '' : 'disabled'}>重置该学习者进度</button>
        <button class="btn btn-danger-outline" id="p-delete" ${has ? '' : 'disabled'}>删除该学习者</button>
      </div>
    </div>
  </div>`;
}

function renderDashboard() {
  const learners = Object.values(state.learners);
  if (!state.learnerId || !state.learners[state.learnerId]) {
    // 默认展示最近有活动的学习者，避免多孩子时落在空档案上
    const recent = learners.slice().sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    state.learnerId = recent[0]?.id || '';
  }
  const lr = state.learners[state.learnerId] || null;
  const st = computeStats(lr);
  const days = state.range === 7 ? 7 : state.range === 30 ? 30 : 30;
  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (state.range === 'all' ? 3650 : state.range - 1));
  const sessions = (lr?.sessions || []).filter(s =>
    state.range === 'all' || new Date(s.startedAt) >= cutoff)
    .slice().sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

  view.innerHTML = `
    <section class="page parent-dashboard">
      <div class="page-head">
        <div><p class="eyebrow">家长监督 · 数据总览
            <span class="build-tag" title="本次前端构建版本">前端 ${BUILD}</span>${backendTag()}</p>
          <h1>${lr ? esc(lr.name) : '暂无学习者'} 的学习记录</h1>
          <p class="muted">${state.source === 'server'
            ? '数据来自服务器 JSON 文件，可跨设备查看；浏览器本地另存一份。'
            : IS_STATIC ? '本机模式 · 显示这台设备浏览器里保存的全部练习记录，可导出备份长期留存。'
              : '⚠️ 服务器未连接，当前显示的是这台设备浏览器里保存的数据。'}</p></div>
        <div class="filter-bar">
          <label class="field inline"><span>学习者</span>
            <select id="p-learner">${learners.length ? learners.map(l =>
              `<option value="${l.id}" ${l.id === state.learnerId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')
              : '<option>（暂无）</option>'}</select></label>
          <label class="field inline"><span>时间范围</span>
            <select id="p-range">
              <option value="7" ${state.range === 7 ? 'selected' : ''}>最近 7 天</option>
              <option value="30" ${state.range === 30 ? 'selected' : ''}>最近 30 天</option>
              <option value="all" ${state.range === 'all' ? 'selected' : ''}>全部</option>
            </select></label>
          <button class="btn btn-soft" id="p-refresh">↻ 刷新</button>
          <button class="btn btn-danger-outline" id="p-delete-top" ${lr ? '' : 'disabled'}
            title="删除当前选中的学习者，同步到服务器与其他设备">🗑 删除学习者</button>
        </div>
      </div>

      ${backendWarning()}
      ${dataManagementCard(lr, learners)}

      ${!lr ? `<div class="card empty-card"><h2>还没有学习数据</h2>
        <p class="muted">让孩子在练习端创建档案并完成一次练习，这里就会出现统计。</p>
        <a class="btn btn-primary" href="./index.html">打开练习端</a></div>` : `
      <div class="kpi-grid">
        ${kpi('累计学习时间', formatDuration(st.activeMs), '含教学与练习', '⏱', 'tone-blue')}
        ${kpi('本周学习时间', formatDuration(st.weekMs), '最近 7 天', '📅')}
        ${kpi('今日学习时间', formatDuration(st.todayMs), `目标 ${lr.settings?.dailyGoalMin || 15} 分钟`, '☀️')}
        ${kpi('练习次数', st.attempts + ' 次', `完成 ${st.completedCount} 次`, '✍️')}
        ${kpi('平均准确率', Math.round(st.avgAccuracy) + '%', '已完成练习', '🎯', 'tone-green')}
        ${kpi('最高速度', Math.round(st.bestWpm) + ' WPM', '每分钟词数', '⚡')}
        ${kpi('键位进阶进度', st.englishProgress.percent + '%',
          `已达标 ${st.englishProgress.passed} / ${st.englishProgress.total} 关`, '📘')}
        ${kpi('基础阶梯进度', st.basicProgress.percent + '%',
          `已达标 ${st.basicProgress.passed} / ${st.basicProgress.total} 关`, '📚')}
        ${kpi('连续打卡', st.streak + ' 天', '保持节奏', '🔥')}
      </div>

      <div class="card">
        <div class="card-head"><h3>每日学习时间</h3>
          <span class="muted small">最近 ${days} 天 · 单位：分钟</span></div>
        ${barChart(lr, days)}
        <p class="small muted">学习时间 = 有真实交互的活跃时长（练习按键、点击、翻看教学时的滚动），按天取本地与服务器两份记录的较大值；只开着页面、鼠标晃动、切到后台都不计时。</p>
      </div>

      <div class="card">
        <div class="card-head"><h3>成绩趋势</h3>
          <span class="muted small">最近 20 次完成的练习</span></div>
        ${lineChart(lr.sessions || [])}
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-head"><h3>课程进度</h3>
            <span class="muted small">当前关卡：${esc(LESSONS[Math.min(st.progressIndex, LESSONS.length - 1)]?.title || '—')}</span></div>
          <div class="stage-progress-list">
            ${TRACKS.map(t => {
              const ts = trackStats(lr, t.id);
              return `<div class="track-progress-head"><b>${t.icon} ${esc(t.name)}</b>
                  <span>${ts.passed} / ${ts.total} 关 · ${ts.percent}%</span>
                  <div class="progress"><i style="width:${ts.percent}%"></i></div></div>` +
                stagesOfTrack(t.id).map(s => {
                  const list = LESSONS.filter(l =>
                    l.stage === s.id && (l.track || 'basic') === t.id);
                  const done = list.filter(l => lessonStats(lr, l.id).passed).length;
                  const pct = list.length ? Math.round(done / list.length * 100) : 0;
                  return `<div class="stage-progress-row">
                    <span class="sp-icon">${s.icon}</span>
                    <span class="sp-name">${esc(s.name)}</span>
                    <div class="progress"><i style="width:${pct}%"></i></div>
                    <b>${done}/${list.length}</b></div>`;
                }).join('');
            }).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>档案信息</h3></div>
          <div class="info-list">
            <div><span>创建时间</span><b>${esc(fmtTime(lr.createdAt))}</b></div>
            <div><span>键盘布局</span><b>${esc(LAYOUTS[lr.layout]?.name || lr.layout)}</b></div>
            <div><span>每日目标</span><b>${lr.settings?.dailyGoalMin || 15} 分钟</b></div>
            <div><span>记录条数</span><b>${(lr.sessions || []).length} 条练习</b></div>
            <div><span>数据位置</span><b>${IS_STATIC ? '本机浏览器（可导出备份）' : '浏览器 + 服务器 JSON'}</b></div>
            <div><span>课程主线</span><b>初中英语键位进阶 · 8 课 40 关</b></div>
          </div>
          <div class="data-actions">
            <button class="btn btn-soft" id="p-csv">导出 CSV</button>
            <button class="btn btn-soft" id="p-json">导出 JSON</button>
            <button class="btn btn-soft" id="p-import">导入备份</button>
            <button class="btn btn-ghost" id="p-raw">查看原始数据</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>每次练习明细</h3>
          <span class="muted small">共 ${sessions.length} 条</span></div>
        ${sessions.length ? `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>时间</th><th>课程 / 关卡</th><th>本次时长</th><th>完成进度</th>
            <th>练习内容</th><th>字符</th><th>准确率</th>
            <th>速度</th><th>错误</th><th>布局</th><th>状态</th></tr></thead>
          <tbody>${sessions.map(s => {
            const pct = s.progressPct != null ? Number(s.progressPct) || 0 : (s.completed ? 100 : 0);
            return `<tr>
            <td>${esc(fmtTime(s.startedAt))}</td>
            <td>${esc(s.lessonTitle || '自由练习')}${s.levelName ? `<small class="cell-sub">${esc(s.courseUnit || '')} · ${esc(s.levelName)}</small>` : ''}</td>
            <td>${formatDuration(s.durationMs)}</td>
            <td><div class="cell-progress"><div class="progress mini"><i style="width:${pct}%"></i></div><b>${pct}%</b></div></td>
            <td class="cell-content" title="${esc(s.contentPreview || '')}">${esc(s.contentPreview || '—')}</td>
            <td>${s.chars || 0}${s.targetLength ? ` / ${s.targetLength}` : ''}</td>
            <td class="${s.accuracy >= 95 ? 'good' : ''}">${s.accuracy}%</td>
            <td>${s.wpm} WPM</td>
            <td>${s.errors || 0}</td>
            <td>${esc(LAYOUTS[s.layout]?.name || s.layout || '—')}</td>
            <td><span class="score-tag ${s.passed ? 'ok' : (s.completed ? '' : 'gray')}">${s.passed ? '达标' : s.completed ? '完成' : '中途结束'}</span></td>
          </tr>`; }).join('')}</tbody></table></div>`
          : '<div class="empty">所选时间范围内没有练习记录。</div>'}
      </div>`}
    </section>`;

  $('#p-learner').onchange = e => { state.learnerId = e.target.value; renderDashboard(); };
  $('#p-range').onchange = e => {
    state.range = e.target.value === 'all' ? 'all' : Number(e.target.value);
    renderDashboard();
  };
  $('#p-refresh').onclick = async () => {
    if (state.source === 'server') await loadServer(state.pin);
    else { state.learners = localLearners(); renderDashboard(); }
  };
  if ($('#p-csv')) $('#p-csv').onclick = () => {
    if (state.source === 'server') {
      window.location.href = apiUrl(`export?pin=${encodeURIComponent(state.pin)}&format=csv&learner=${encodeURIComponent(state.learnerId)}`);
    } else download('typing-lab-sessions.csv', csvFrom(state.learners), 'text/csv;charset=utf-8');
  };
  if ($('#p-json')) $('#p-json').onclick = () => {
    if (state.source === 'server') {
      window.location.href = apiUrl(`export?pin=${encodeURIComponent(state.pin)}&format=json&learner=${encodeURIComponent(state.learnerId)}`);
    } else download('typing-lab-data.json',
      JSON.stringify({ learners: state.learners }, null, 2), 'application/json');
  };
  if ($('#p-raw')) $('#p-raw').onclick = () => { if (lr) showRaw(lr); };
  if ($('#p-import')) $('#p-import').onclick = importBackup;
  if ($('#p-reset')) $('#p-reset').onclick = () => { if (lr) confirmReset(lr); };
  $$('#p-delete, #p-delete-top').forEach(b => {
    b.onclick = () => { if (lr) confirmDelete(lr); };
  });
}

/** 导入本面板导出的 JSON 备份：按学习者 id 合并，练习记录按 session id 去重。
 *  用途：在线版与离线版之间迁移记录，或长期留存备份。 */
function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const n = store.importLearners(data);
        if (!n) throw new Error('no learner');
        state.learners = localLearners();
        state.learnerId = '';
        renderDashboard();
        alert(`已导入并合并 ${n} 个学习者档案（练习记录按 ID 去重）。`);
      } catch (e) {
        alert('导入失败：请选择本面板「导出 JSON」生成的备份文件。');
      }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

function showRaw(lr) {
  modal.hidden = false;
  modal.innerHTML = `<div class="modal-backdrop"></div>
    <div class="modal-card modal-wide"><h3>原始数据 · ${esc(lr.name)}</h3>
      <p class="muted small">这是浏览器 / 服务器保存的同一份结构化数据，可供备份排查。</p>
      <pre class="raw-pre">${esc(JSON.stringify(lr, null, 2))}</pre>
      <div class="modal-actions"><button class="btn btn-primary" data-close>关闭</button></div>
    </div>`;
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  $$('[data-close]', modal).forEach(b => b.onclick = close);
  $('.modal-backdrop', modal).onclick = close;
}

function modalError(text) {
  const el = $('[data-error]', modal);
  if (el) { el.textContent = text; el.hidden = false; }
}

function confirmReset(lr) {
  modal.hidden = false;
  modal.innerHTML = `<div class="modal-backdrop"></div>
    <div class="modal-card"><h3>确认重置进度？</h3>
      <p>将清空 <b>${esc(lr.name)}</b> 的 <b>${(lr.sessions || []).length}</b> 条练习记录、学习时间与课程进度，且不可恢复。</p>
      <p class="muted small">建议先点「导出 CSV」备份。重置会同步到服务器和所有已登录设备，其他设备不会再传回旧成绩。</p>
      ${needsBackendUpgrade() ? `<p class="small warn-text">⚠️ 后端版本过旧：本次重置仍能清空服务端，但缺少版本仲裁，学习端旧成绩过一会儿可能同步回来。请先升级并重启后端。</p>` : ''}
      <p class="gate-error" data-error hidden></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-danger" data-confirm>确认重置</button>
      </div>
    </div>`;
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  $('[data-close]', modal).onclick = close;
  $('.modal-backdrop', modal).onclick = close;
  $('[data-confirm]', modal).onclick = async () => {
    const btn = $('[data-confirm]', modal);
    btn.disabled = true; btn.textContent = '处理中…';
    if (state.source === 'server') {
      try {
        const res = await fetch(apiUrl('parent/reset'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: state.pin, learnerId: lr.id, mode: 'progress' }),
        });
        const data = await res.json();
        if (!data.ok) { modalError(serverActionError(res, data)); btn.disabled = false; btn.textContent = '确认重置'; return; }
        // 先用服务端权威副本替换本机，避免本地旧数据随后又上传覆盖
        store.applyServerLearner(data.learners[lr.id]);
        state.learners = data.learners;
      } catch (e) { modalError('无法连接服务器，请稍后重试'); btn.disabled = false; btn.textContent = '确认重置'; return; }
    } else {
      store.resetLearner(lr.id, 'progress');
      state.learners = localLearners();
    }
    close();
    renderDashboard();
  };
}

function confirmDelete(lr) {
  const blocked = needsBackendUpgrade();
  modal.hidden = false;
  modal.innerHTML = `<div class="modal-backdrop"></div>
    <div class="modal-card"><h3>确认删除学习者？</h3>
      <p>将永久删除 <b>${esc(lr.name)}</b> 的整个档案（${(lr.sessions || []).length} 条练习记录、学习时间、进度与设置），且不可恢复。</p>
      <p class="muted small">删除会同步到服务器与其他已登录设备；被删除的档案不会再从学习端上传回来。建议先导出备份。</p>
      ${blocked ? `<div class="backend-warn compact">
        <b>⚠️ 暂不能删除：后端程序版本过旧</b>
        <p>当前后端没有 <code>/api/parent/delete</code>，确认后只会收到「接口不存在」。请用新版 <code>server.py</code> / <code>server.js</code> 替换并<b>重启后端进程</b>，再回到本页刷新。详细命令见面板顶部的提示框。</p>
      </div>` : ''}
      <p class="gate-error" data-error hidden></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-danger" data-confirm ${blocked ? 'disabled' : ''}>确认删除</button>
      </div>
    </div>`;
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  $('[data-close]', modal).onclick = close;
  $('.modal-backdrop', modal).onclick = close;
  $('[data-confirm]', modal).onclick = async () => {
    if (blocked) { modalError('请先升级并重启后端，再执行删除'); return; }
    const btn = $('[data-confirm]', modal);
    btn.disabled = true; btn.textContent = '处理中…';
    let serverRev = null;
    if (state.source === 'server') {
      try {
        const res = await fetch(apiUrl('parent/delete'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: state.pin, learnerId: lr.id }),
        });
        const data = await res.json();
        if (!data.ok) { modalError(serverActionError(res, data)); btn.disabled = false; btn.textContent = '确认删除'; return; }
        serverRev = data.revision;
        state.learners = data.learners;
      } catch (e) { modalError('无法连接服务器，请稍后重试'); btn.disabled = false; btn.textContent = '确认删除'; return; }
    }
    // 本机也写墓碑；联网后会把删除同步给其他设备
    store.deleteLearner(lr.id, serverRev);
    if (state.source !== 'server') state.learners = localLearners();
    state.learnerId = '';
    close();
    renderDashboard();
  };
}

// ---------------- 启动 ----------------
(async function boot() {
  // 先让本机 localStorage 与服务端对齐（接收其他设备的重置/删除），再渲染门禁
  await store.bootstrap().catch(() => {});
  renderGate(!(await checkServer(true)));
})();
