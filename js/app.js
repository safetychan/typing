/* app.js — 练习端主应用：路由、仪表盘、课程地图、指法教室、自由练习、设置。 */
import {
  LAYOUTS, buildLayout, FINGERS, FINGER_COLORS, fingerShort, fingerColor,
  HOME_ROW, LAYOUT_DIFFS, printableChars, charInfo,
} from './layouts.js';
import {
  STAGES, LESSONS, TRACKS, ENGLISH_UNITS, ENGLISH_LEVELS,
  lessonById, lessonByIndex, lessonStats, computeStats,
  formatDuration, dayKey, buildTarget,
  stagesOfTrack, lessonsOfTrack, trackProgressIndex, trackCurrentLesson, trackStats,
} from './curriculum.js';
import { RUNTIME, IS_STATIC } from './runtime.js';
import { store } from './storage.js';
import { Practice } from './practice.js';
import {
  renderKeyboard, renderHands, highlightChar, highlightFinger,
  highlightFingerKeys, clearKeyboard, clearHands, fingerHintText,
} from './keyboard.js';

const view = document.getElementById('view');
const modal = document.getElementById('modal');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let practice = null;
// 当前课程轨道（默认「初中英语键位进阶」），选择会被记住，刷新后仍然停在原轨道
let currentTrack = RUNTIME.defaultTrack;
try {
  const savedTrack = localStorage.getItem('typing-lab.track');
  if (savedTrack === 'basic' || savedTrack === 'english') currentTrack = savedTrack;
} catch (e) { /* 隐私模式下 localStorage 不可用，用默认值 */ }
function setTrack(t) {
  currentTrack = t;
  try { localStorage.setItem('typing-lab.track', t); } catch (e) {}
}
// 欢迎页输入草稿：启动同步完成后 render() 会重绘欢迎页，若用户正在输入，
// 重绘不能把已填的名字/布局清空（否则点「创建档案」会因名字为空而无效）。
let welcomeDraft = { name: '', layout: RUNTIME.defaultLayout };

/** 统一跳转：hash 不变时手动重绘，避免重复创建练习实例 */
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// ---------------- 顶栏 ----------------
function refreshTopbar() {
  const ls = $('#layout-select'), us = $('#learner-select');
  ls.innerHTML = Object.values(LAYOUTS).map(l =>
    `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  const lr = store.active();
  ls.value = lr?.layout || 'laptop';
  us.innerHTML = store.learners.map(l =>
    `<option value="${l.id}">${esc(l.name)}</option>`).join('') ||
    '<option value="">（暂无）</option>';
  us.value = store.activeId || '';
  $$('#nav a').forEach(a => a.classList.toggle('active',
    (location.hash || '#/home').startsWith('#/' + a.dataset.nav)));
  document.body.dataset.theme = lr?.settings?.theme || 'light';
}

function bindTopbar() {
  // 欢迎页用 document 级委托：DOM 重绘不会影响输入记录与点击捕获，
  // 也顺带防止连续点击创建出多个档案。
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'w-name') welcomeDraft.name = e.target.value;
  });
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'w-layout') welcomeDraft.layout = e.target.value;
  });
  document.addEventListener('click', e => {
    const btn = e.target && e.target.closest ? e.target.closest('#w-start') : null;
    if (!btn) return;
    const nameEl = $('#w-name'), layoutEl = $('#w-layout');
    if (!nameEl || store.learners.length) return;
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    welcomeDraft.name = name;
    welcomeDraft.layout = layoutEl ? layoutEl.value : 'laptop';
    store.createLearner(name, welcomeDraft.layout);
    welcomeDraft = { name: '', layout: 'laptop' };
    go('#/fingers');
  });
  $('#layout-select').addEventListener('change', e => {
    const id = e.target.value;
    if (practice) {
      if (!confirm('切换键盘布局会结束当前练习（已用时间会记录），继续吗？')) {
        e.target.value = store.active()?.layout || 'laptop'; return;
      }
      practice.destroy(); practice = null;
    }
    store.updateLearner({ layout: id });
    toast(`已切换到「${LAYOUTS[id].name}」`);
    if (location.hash.startsWith('#/lesson/') || location.hash === '#/free-run') go('#/curriculum');
    else render();
  });
  $('#learner-select').addEventListener('change', e => {
    if (practice) { practice.destroy(); practice = null; }
    store.setActive(e.target.value);
    go('#/home');
  });
  $('#add-learner').addEventListener('click', showAddLearner);
  $('#sync-now').addEventListener('click', async () => {
    await store.syncNow(true);
    toast(store.status.online ? '同步完成' : '仍在使用本机存储，恢复连接后会自动补传');
  });
  store.onStatus(s => {
    const dot = $('#sync-dot'), txt = $('#sync-text');
    if (!dot || !txt) return;
    dot.className = 'sync-dot ' + (s.online === false ? 'offline'
      : s.online === 'local' ? 'local' : s.syncing ? 'syncing' : 'online');
    txt.textContent = s.message;
  });
  // 家长端在另一台电脑重置/删除后，本页同步到指令时立即对齐状态
  window.addEventListener('typing-lab:learners-changed', e => {
    const d = e.detail || {};
    const affected = !d.learnerId || d.learnerId === store.activeId;
    if (practice && affected && (!store.active() || d.action !== 'merge')) {
      practice.destroy(); practice = null;
      if (location.hash !== '#/home') location.hash = '#/home';
      toast(d.action === 'purge' ? '该学习者已被家长端删除，已同步最新状态'
        : '学习进度已被家长端重置，已同步最新状态');
    }
    refreshTopbar();
    if (!practice) render();
  });
}

function showAddLearner() {
  modal.hidden = false;
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card">
      <h3>新增学习者</h3>
      <p class="muted">家里多个孩子可以各建一份档案，家长面板能分别查看。</p>
      <label class="field"><span>名字 / 昵称</span><input id="nl-name" maxlength="20" placeholder="例如：小明" autocomplete="off"></label>
      <label class="field"><span>键盘布局</span>
        <select id="nl-layout">${Object.values(LAYOUTS).map(l =>
          `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" data-create>创建并开始</button>
      </div>
    </div>`;
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  modal.querySelector('[data-close]').onclick = close;
  modal.querySelector('.modal-backdrop').onclick = close;
  modal.querySelector('[data-create]').onclick = () => {
    const name = $('#nl-name').value.trim();
    if (!name) { $('#nl-name').focus(); return; }
    store.createLearner(name, $('#nl-layout').value);
    close(); refreshTopbar(); go('#/home');
  };
  $('#nl-name').focus();
}

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------- 路由 ----------------
function parseHash() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const [page, arg] = h.split('/');
  return { page: page || 'home', arg };
}

function render() {
  const { page, arg } = parseHash();
  const isLesson = page === 'lesson' || page === 'free-run';
  const lessonKey = page === 'free-run' ? 'free-run' : arg;
  if (practice && !(isLesson && practice._lessonId === lessonKey)) {
    practice.destroy(); practice = null;
  }
  refreshTopbar();
  if (isLesson && practice && practice._lessonId === lessonKey) return; // 复用已有练习实例，避免重复绑定
  const lr = store.active();
  if (!lr) {
    // 启动同步(bootstrap)完成后会再调一次 render()。若欢迎页已经渲染、且仍无档案，
    // 这次重绘毫无必要，却可能恰好吞掉用户正在进行的点击，或让输入框失焦。
    // 直接跳过：新建档案走 go('#/fingers')、删除档案走 learners-changed 时
    // 页面里不会有 #w-start，不会被这条判断挡住。
    if (view.querySelector('#w-start')) return;
    renderWelcome(); return;
  }
  switch (page) {
    case 'curriculum': renderCurriculum(lr); break;
    case 'fingers': renderFingers(lr); break;
    case 'free': renderFree(lr); break;
    case 'lesson': renderLesson(lr, arg); break;
    case 'free-run': renderLesson(lr, 'free-run'); break;
    default: renderHome(lr);
  }
}

window.addEventListener('hashchange', render);

// ---------------- 欢迎页 ----------------
function renderWelcome() {
  view.innerHTML = `
    <section class="welcome">
      <div class="welcome-card">
        <div class="welcome-emoji">⌨️</div>
        <h1>从第一根手指开始，学会盲打</h1>
        <p>依据《初中英语打字练习 · 键位进阶系列》编排：8 课逐级解锁键位，每课按「指法 → 字母 → 单词 → 句子 → 段落」五步递进。每次练习的时长、完成进度和练习内容都会自动保存。</p>
        <div class="welcome-grid">
          <label class="field"><span>你的名字 / 昵称</span>
            <input id="w-name" maxlength="20" placeholder="例如：小明" autocomplete="off"
              value="${esc(welcomeDraft.name)}"></label>
          <label class="field"><span>键盘布局</span>
            <select id="w-layout">${Object.values(LAYOUTS).map(l =>
              `<option value="${l.id}" ${l.id === welcomeDraft.layout ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        </div>
        <button class="btn btn-primary btn-lg" id="w-start" type="button">创建档案，开始第一课 →</button>
        <p class="muted small">默认使用笔记本键盘布局，之后随时可以在右上角切换为全尺寸或英式键盘，按键提示与指法会自动对齐。记录保存在本机浏览器，家长面板可查看每次练习。</p>
      </div>
    </section>`;
  // 不在这里绑定 onclick：启动同步(bootstrap)完成后 render() 会重绘欢迎页，
  // 若用户恰好在重绘瞬间点击，旧元素上的 onclick 会随元素一起消失，点击被吞掉。
  // 改为 document 级事件委托（见 bindTopbar），元素怎么重绘都能接到点击。
}

// ---------------- 首页 ----------------
function kpi(label, value, sub, icon) {
  return `<div class="kpi"><div class="kpi-icon">${icon}</div>
    <div><span>${label}</span><b>${value}</b><small>${sub || ''}</small></div></div>`;
}

function renderHome(lr) {
  const st = computeStats(lr);
  const goal = (lr.settings?.dailyGoalMin || 15) * 60000;
  const todayPct = Math.min(100, Math.round((st.todayMs / goal) * 100));
  const cur = trackCurrentLesson(lr, currentTrack);
  const tstats = trackStats(lr, currentTrack);
  const trackName = (TRACKS.find(t => t.id === currentTrack) || {}).name || '课程';
  const curLabel = cur.track === 'english'
    ? `第 ${cur.unit} 课 · ${cur.levelName}` : `第 ${cur.trackIndex + 1} 关`;
  const curSt = lessonStats(lr, cur.id);
  const circumference = 2 * Math.PI * 52;
  const recent = st.recent.slice(0, 5);
  const layout = LAYOUTS[lr.layout] || LAYOUTS.laptop;

  view.innerHTML = `
    <section class="page home-page">
      <div class="hero">
        <div class="hero-text">
          <p class="eyebrow">${greeting()}，${esc(lr.name)} 👋</p>
          <h1>今天也来练一会儿吧</h1>
          <p class="hero-sub">${esc(trackName)} · 当前 <b>${esc(curLabel)}</b> / 共 ${tstats.total} 关 ·
            ${esc(STAGES.find(s => s.id === cur.stage)?.name || '')}</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/lesson/${cur.id}">${curSt.attempts ? '继续练习' : '开始第一课'} →</a>
            <a class="btn btn-soft" href="#/curriculum">查看课程地图</a>
          </div>
          <div class="goal-bar">
            <div class="goal-label"><span>今日目标 ${lr.settings?.dailyGoalMin || 15} 分钟</span>
              <b>${formatDuration(st.todayMs)} · ${todayPct}%</b></div>
            <div class="progress"><i style="width:${todayPct}%"></i></div>
          </div>
        </div>
        <div class="hero-ring">
          <svg viewBox="0 0 140 140" aria-label="${esc(trackName)}进度 ${tstats.percent}%">
            <circle class="ring-bg" cx="70" cy="70" r="52"/>
            <circle class="ring-fg" cx="70" cy="70" r="52"
              stroke-dasharray="${(tstats.percent / 100) * circumference} ${circumference}"/>
          </svg>
          <div class="ring-center"><b>${tstats.percent}%</b><span>本轨道进度</span></div>
          <p class="muted small">已达标 ${tstats.passed} / ${tstats.total} 关</p>
        </div>
      </div>

      <div class="kpi-grid">
        ${kpi('累计学习时间', formatDuration(st.activeMs), '含教学与练习', '⏱')}
        ${kpi('本周学习时间', formatDuration(st.weekMs), '最近 7 天', '📅')}
        ${kpi('练习次数', st.attempts + ' 次', `完成 ${st.completedCount} 次`, '✍️')}
        ${kpi('平均准确率', Math.round(st.avgAccuracy) + '%', '已完成练习', '🎯')}
        ${kpi('最高速度', Math.round(st.bestWpm) + ' WPM', '每分钟词数', '⚡')}
        ${kpi('连续打卡', st.streak + ' 天', '保持节奏', '🔥')}
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-head"><h3>当前关卡</h3><a href="#/curriculum" class="link">全部课程 →</a></div>
          <div class="current-lesson">
            <div class="stage-chip">${esc(STAGES.find(s => s.id === cur.stage)?.icon || '')} ${cur.track === 'english' ? `第 ${cur.unit} 课 · ${esc(cur.levelName || '')}` : `第 ${cur.stage} 阶`}</div>
            <h2>${esc(cur.title)}</h2>
            <p class="muted">${esc(cur.brief)}</p>
            <div class="lesson-meta">
              <span>达标 ≥ ${cur.pass.acc}%${cur.pass.wpm ? ` / ${cur.pass.wpm} WPM` : ''}</span>
              ${curSt.attempts ? `<span>已练 ${curSt.attempts} 次 · 最佳 ${curSt.bestAcc}%</span>` : '<span>尚未练习</span>'}
            </div>
            <div class="row-actions">
              <a class="btn btn-primary" href="#/lesson/${cur.id}">进入练习</a>
              <a class="btn btn-ghost" href="#/fingers">先复习指法</a>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>最近成绩</h3><span class="muted small">最近 5 次</span></div>
          ${recent.length ? `<div class="score-list">${recent.map(s => `
            <div class="score-row">
              <div><b>${esc(s.lessonTitle || '自由练习')}</b>
                <small>${esc(formatLocalTime(s.startedAt))} · ${formatDuration(s.durationMs)} · 进度 ${s.progressPct != null ? s.progressPct + '%' : (s.completed ? '100%' : '—')}</small></div>
              <div class="score-num ${s.accuracy >= 95 ? 'good' : ''}">${s.accuracy}%</div>
              <div class="score-num muted">${s.wpm} WPM</div>
              <div class="score-tag ${s.passed ? 'ok' : (s.completed ? '' : 'gray')}">${s.passed ? '达标' : s.completed ? '完成' : '中途结束'}</div>
            </div>`).join('')}</div>`
            : `<div class="empty">还没有练习记录，先去完成第一课吧。</div>`}
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-head"><h3>指法入门</h3><span class="tag">推荐先学</span></div>
          <p class="muted">点击任意手指，看看它负责哪些键；点击键位，看看该用哪根手指。八根手指各有自己的「家」：
            <b>A S D F</b> 与 <b>J K L ;</b>。</p>
          <div class="home-fingers" data-role="home-hands"></div>
          <a class="btn btn-soft" href="#/fingers">打开指法教室 →</a>
        </div>
        <div class="card">
          <div class="card-head"><h3>练习设置</h3><span class="muted small">当前布局：${esc(layout.name)}</span></div>
          <div class="settings-list">
            ${toggleRow('sound', '按键声音', lr.settings?.sound !== false)}
            ${toggleRow('hands', '显示手指示意图', lr.settings?.showHands !== false)}
            ${toggleRow('theme', '深色模式', lr.settings?.theme === 'dark')}
            <label class="setting-row"><span>每日目标</span>
              <select id="goal-select">${[10, 15, 20, 30, 45].map(m =>
                `<option value="${m}" ${(lr.settings?.dailyGoalMin || 15) === m ? 'selected' : ''}>${m} 分钟</option>`).join('')}</select></label>
            <label class="setting-row"><span>我的昵称</span>
              <input id="rename-input" value="${esc(lr.name)}" maxlength="20"></label>
          </div>
        </div>
      </div>
    </section>`;

  renderHands($('[data-role="home-hands"]', view));
  $$('[data-toggle]', view).forEach(btn => btn.onclick = () => {
    const key = btn.dataset.toggle, on = btn.dataset.on !== 'true';
    const patch = key === 'sound' ? { sound: on }
      : key === 'hands' ? { showHands: on } : { theme: on ? 'dark' : 'light' };
    store.updateSettings(patch);
    render();
  });
  $('#goal-select', view).onchange = e => {
    store.updateSettings({ dailyGoalMin: Number(e.target.value) }); render();
  };
  $('#rename-input', view).onchange = e => {
    const n = e.target.value.trim();
    if (n) { store.renameLearner(store.activeId, n); refreshTopbar(); toast('昵称已更新'); }
  };
}

function toggleRow(key, label, on) {
  return `<div class="setting-row"><span>${label}</span>
    <button class="switch ${on ? 'on' : ''}" data-toggle="${key}" data-on="${on}" aria-label="${label}">
      <i></i></button></div>`;
}
function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
function formatLocalTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------- 课程地图 ----------------
function lessonState(l, lr) {
  const pi = trackProgressIndex(lr, l.track || 'basic');
  const ti = l.trackIndex != null ? l.trackIndex : l.index;
  const unlocked = ti <= pi || (lr.unlockedLessons || []).includes(l.id);
  const st = lessonStats(lr, l.id);
  return { unlocked, passed: st.passed, current: ti === pi, st };
}

function renderCurriculum(lr) {
  const stages = stagesOfTrack(currentTrack);
  const all = lessonsOfTrack(currentTrack);
  const tstats = trackStats(lr, currentTrack);
  const track = TRACKS.find(t => t.id === currentTrack) || TRACKS[0];
  const ascii = s => [...(s || '')].filter(c => /^[\x20-\x7e]$/.test(c)).join('');
  view.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div><p class="eyebrow">循序渐进 · 共 ${all.length} 关</p>
          <h1>课程地图</h1>
          <p class="muted">${esc(track.desc)} 每关达标后自动解锁下一关；没达标可以反复练，进度不会倒退。</p></div>
        <div class="overall-progress">
          <b>${tstats.passed} / ${tstats.total}</b><span>已达标</span>
          <div class="progress"><i style="width:${tstats.percent}%"></i></div>
        </div>
      </div>
      <div class="track-tabs" role="tablist" aria-label="课程轨道">
        ${TRACKS.map(t => `<button class="track-tab ${t.id === currentTrack ? 'active' : ''}"
            data-track="${t.id}" role="tab" aria-selected="${t.id === currentTrack}">
            <span class="track-icon">${t.icon}</span>
            <span class="track-copy"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>
            ${t.badge ? `<em>${esc(t.badge)}</em>` : ''}</button>`).join('')}
      </div>
      ${currentTrack === 'english' ? `<div class="level-legend">
          <span class="muted">每课五级递进</span>
          ${ENGLISH_LEVELS.map(l => `<span class="level-chip">${l.icon} ${esc(l.name)}</span>`).join('')}
          <span class="muted small">过关标准：本课短文连打 3 遍、准确率 ≥ 98% 再进下一课。</span>
        </div>` : ''}
      ${stages.map(s => {
        const unit = currentTrack === 'english' ? ENGLISH_UNITS.find(u => u.no === s.unit) : null;
        const list = all.filter(l => l.stage === s.id);
        const done = list.filter(l => lessonState(l, lr).passed).length;
        return `<div class="stage-block">
          <div class="stage-head">
            <div class="stage-icon">${s.icon}</div>
            <div><h2>${esc(s.name)}</h2><p>${esc(s.desc)}</p>
              ${unit ? `<p class="stage-keys">本课新增键 <b>${esc(ascii(unit.newKeys))}</b> ｜ 累计键 ${esc(unit.cumulativeKeys)}</p>` : ''}
            </div>
            <div class="stage-count">${done} / ${list.length} 关</div>
          </div>
          <div class="lesson-grid">
            ${list.map(l => {
              const q = lessonState(l, lr);
              const cls = q.passed ? 'passed' : q.current ? 'current' : q.unlocked ? 'open' : 'locked';
              const lv = ENGLISH_LEVELS.find(x => x.id === l.level);
              return `<button class="lesson-card ${cls}" data-lesson="${l.id}" ${q.unlocked ? '' : 'disabled'}>
                <span class="lesson-no">${l.track === 'english' ? (lv ? lv.icon : '·')
                  : String(l.trackIndex + 1).padStart(2, '0')}</span>
                <span class="lesson-title">${esc(l.track === 'english' ? l.levelName : l.title)}</span>
                ${l.track === 'english' ? `<span class="lesson-sub">${esc((l.contentPreview || '').slice(0, 24))}…</span>` : ''}
                <span class="lesson-foot">${q.passed
                  ? `✓ 最佳 ${q.st.bestAcc}% · ${q.st.bestWpm} WPM`
                  : q.unlocked ? (q.st.attempts ? `已练 ${q.st.attempts} 次` : `达标 ≥ ${l.pass.acc}%`)
                    : '🔒 未解锁'}</span>
                ${q.current ? '<span class="lesson-current">当前</span>' : ''}
              </button>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </section>`;
  $$('[data-track]', view).forEach(b => b.onclick = () => { setTrack(b.dataset.track); render(); });
  $$('[data-lesson]', view).forEach(b => b.onclick = () => {
    if (b.disabled) return;
    location.hash = '#/lesson/' + b.dataset.lesson;
  });
}

// ---------------- 指法教室 ----------------
function renderFingers(lr) {
  const L = LAYOUTS[lr.layout] || LAYOUTS.laptop;
  view.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div><p class="eyebrow">手指 ↔ 键位对应关系</p>
          <h1>指法教室</h1>
          <p class="muted">每根手指只负责固定的几列键。点一点，看看它们怎么分工。</p></div>
        <div class="layout-note"><b>${esc(L.name)}</b><span>${esc(L.badge || '')}</span></div>
      </div>

      <div class="card fingers-card">
        <div class="card-head"><h3>① 点击手指，看它负责哪些键</h3>
          <span class="muted small">也可以点下方图例</span></div>
        <div class="finger-layout">
          <div class="hands-big" data-role="hands"></div>
          <div class="finger-explain" data-role="explain">
            <h2>先找到「家」</h2>
            <p>左手四指放在 <b>A S D F</b>，右手四指放在 <b>J K L ;</b>，两根拇指轻放在空格键上。
              F 与 J 键上的小凸点，是盲打时唯一的定位标记。</p>
            <p class="muted">点击任意一根手指或键盘上的按键，这里会显示对应关系。</p>
            <div class="home-row-demo">${HOME_ROW.map((c, i) =>
              `<span class="home-key-demo" style="--fc:${FINGER_COLORS[i]}">${esc(c === ' ' ? '空格' : c.toUpperCase())}</span>`).join('')}</div>
          </div>
        </div>
        <div class="finger-chips">${FINGERS.map(f =>
          `<button class="finger-chip" data-finger="${f.id}" style="--fc:${fingerColor(f.id)}">
            <i></i>${esc(f.short)}<small>${esc(f.home)}</small></button>`).join('')}</div>
        <div class="kb-big" data-role="kb"></div>
        <div class="finger-tip" id="finger-tip">提示：颜色相同的手指与键位是一一对应的。</div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-head"><h3>② 三步养成盲打</h3></div>
          <ol class="steps">
            <li><b>归位</b>：每次击键后手指回到基准键，靠 F / J 的凸点确认位置。</li>
            <li><b>看屏幕</b>：眼睛只盯目标文本，靠键盘高亮和手指提示建立记忆。</li>
            <li><b>慢而准</b>：先把准确率稳定在 95% 以上，速度会自己长出来。</li>
          </ol>
          <a class="btn btn-primary" href="#/lesson/${lessonByIndex(lr.progressIndex || 0)?.id || 'L00'}">去练当前关卡 →</a>
        </div>
        <div class="card">
          <div class="card-head"><h3>③ 布局差异对照</h3><span class="tag">${esc(L.en)}</span></div>
          <p class="muted">切换布局后，同样的字符会落到不同手指，课程文本也会重新生成。</p>
          <div class="diff-table">
            <div class="diff-row diff-head"><span>字符 / 键</span><span>美式 ANSI</span><span>英式 ISO</span></div>
            ${LAYOUT_DIFFS.map(d => `<div class="diff-row"><kbd>${esc(d.char)}</kbd><span>${esc(d.us)}</span><span>${esc(d.uk)}</span></div>`).join('')}
          </div>
          <p class="small muted">${esc(L.desc)}</p>
        </div>
      </div>
    </section>`;

  const hands = $('[data-role="hands"]', view);
  const kb = $('[data-role="kb"]', view);
  const explain = $('[data-role="explain"]', view);
  const tip = $('#finger-tip', view);
  renderHands(hands);
  renderKeyboard(kb, lr.layout, { interactive: true });

  const byFinger = f => {
    clearKeyboard(kb); clearHands(hands);
    highlightFinger(hands, f);
    highlightFingerKeys(kb, f);
    const keys = buildLayout(lr.layout).keys
      .filter(k => k.b && k.f === f).map(k => k.b);
    const list = [...new Set(keys)].map(c => c === ' ' ? '空格' : c).join(' ');
    explain.innerHTML = `<h2>${esc(FINGERS[f].name)}</h2>
      <p>基准键：<b>${esc(FINGERS[f].home)}</b>　负责的键位（未按下 Shift 时）：</p>
      <div class="keylist">${list ? [...new Set(keys)].map(c =>
        `<kbd>${esc(c === ' ' ? 'Space' : c)}</kbd>`).join('') : '<span class="muted">无</span>'}</div>
      <p class="muted">${f === 8 ? '空格只用拇指，左右手都可以，固定用一只即可。'
        : '打完其它键后，记得回到基准键 ' + esc(FINGERS[f].home) + '。'}</p>`;
    tip.textContent = `${FINGERS[f].name} → ${list || '（无）'}`;
  };
  const byChar = c => {
    const info = charInfo(lr.layout, c);
    clearKeyboard(kb); clearHands(hands);
    if (!info) { tip.textContent = `「${c}」不在当前布局的主键区中`; return; }
    highlightChar(kb, lr.layout, c);
    highlightFinger(hands, info.finger);
    explain.innerHTML = `<h2>按「${esc(c === ' ' ? '空格' : c)}」</h2>
      <p>${esc(fingerHintText(info.finger, c))}</p>
      <p class="muted">${info.shift ? '这个字符需要按住对侧 Shift 再按该键。'
        : '直接按这个键，打完手指立即回位。'}</p>`;
    tip.textContent = `${c === ' ' ? '空格' : c} → ${FINGERS[info.finger]?.name || '未分配'}`;
  };

  $$('.finger-shape', hands).forEach(el => el.addEventListener('click', () => byFinger(Number(el.dataset.f))));
  $$('.finger-chip', view).forEach(el => el.onclick = () => byFinger(Number(el.dataset.finger)));
  $$('.key[data-char]', kb).forEach(el => {
    el.addEventListener('click', () => byChar(el.dataset.char));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); byChar(el.dataset.char); } });
  });
  byFinger(3);
}

// ---------------- 自由练习 ----------------
function renderFree(lr) {
  view.innerHTML = `
    <section class="page">
      <div class="page-head"><div><p class="eyebrow">不解锁课程，成绩照常记录</p>
        <h1>自由练习</h1><p class="muted">想多练一会儿？选个内容直接开始。</p></div></div>
      <div class="card free-card">
        <div class="free-grid">
          <label class="field"><span>练习内容</span>
            <select id="free-source">
              <option value="words">常用英文单词</option>
              <option value="letters">字母与标点混合</option>
              <option value="digits">数字与符号</option>
              <option value="sentences">完整句子</option>
              <option value="custom">自定义文本</option>
            </select></label>
          <label class="field"><span>练习方式</span>
            <select id="free-mode">
              <option value="length">按长度（约 240 字）</option>
              <option value="short">短一点（约 120 字）</option>
              <option value="long">长一点（约 400 字）</option>
              <option value="30">限时 30 秒</option>
              <option value="60">限时 60 秒</option>
            </select></label>
        </div>
        <label class="field" id="custom-wrap" hidden><span>自定义文本（仅保留当前键盘可打出的英文字符）</span>
          <textarea id="free-custom" rows="4" placeholder="在这里粘贴一段英文…"></textarea></label>
        <div class="free-preview" id="free-preview"></div>
        <div class="row-actions">
          <button class="btn btn-primary btn-lg" id="free-start">开始自由练习 →</button>
          <a class="btn btn-ghost" href="#/curriculum">回课程地图</a>
        </div>
      </div>
    </section>`;

  const source = $('#free-source'), mode = $('#free-mode'), custom = $('#free-custom');
  const wrap = $('#custom-wrap'), preview = $('#free-preview');
  const allowed = new Set(printableChars(lr.layout));
  const cleanText = t => [...String(t || '')].filter(c => allowed.has(c)).join('');

  function draft() {
    const src = source.value, m = mode.value;
    wrap.hidden = src !== 'custom';
    const length = m === 'short' ? 120 : m === 'long' ? 400 : m === '30' || m === '60' ? 1600 : 240;
    const base = {
      id: 'FREE', stage: -1, index: null, strict: false, pass: null,
      mode: 'words', length, durationSec: Number(m) || 0,
      brief: '自由练习：把注意力放在节奏与准确率上，不看键盘。',
      tip: '打错会记录进准确率，但不会卡住你。',
      newKeys: '', keys: '',
    };
    let text = '';
    if (src === 'custom') {
      const cleaned = cleanText(custom.value);
      base.mode = 'fixed';
      base.text = cleaned || 'the quick brown fox jumps over the lazy dog';
      base.title = '自由练习 · 自定义文本';
      text = base.text;
    } else if (src === 'letters') {
      base.mode = 'random'; base.keys = 'abcdefghijklmnopqrstuvwxyz,./';
      base.title = '自由练习 · 字母与标点';
      text = buildTarget(base, lr.layout).slice(0, 160);
    } else if (src === 'digits') {
      base.mode = 'random'; base.keys = '0123456789@#$%&*_()-';
      base.title = '自由练习 · 数字与符号';
      text = buildTarget(base, lr.layout).slice(0, 160);
    } else if (src === 'sentences') {
      base.mode = 'sentences'; base.title = '自由练习 · 完整句子';
      text = buildTarget(base, lr.layout).slice(0, 220);
    } else {
      base.mode = 'words'; base.title = '自由练习 · 常用单词';
      text = buildTarget(base, lr.layout).slice(0, 220);
    }
    if (Number(m) > 0) { base.mode = 'timed'; base.length = Math.max(base.length, 1600); }
    preview.textContent = text + (text.length >= 160 ? ' …' : '');
    return base;
  }
  [source, mode, custom].forEach(el => el.addEventListener('input', draft));
  source.addEventListener('change', draft);
  draft();
  $('#free-start').onclick = () => {
    const base = draft();
    if (source.value === 'custom' && !cleanText(custom.value)) {
      toast('自定义文本里没有可输入的英文字符，请换一段内容'); return;
    }
    sessionStorage.setItem('typing-lab.free', JSON.stringify(base));
    location.hash = '#/free-run';
  };
}

function makeFreeLesson() {
  try { return JSON.parse(sessionStorage.getItem('typing-lab.free') || 'null'); }
  catch (e) { return null; }
}

// ---------------- 练习页 ----------------
function renderLesson(lr, id) {
  let lesson;
  if (id === 'free-run') {
    lesson = makeFreeLesson();
    if (!lesson) { location.hash = '#/free'; return; }
  } else {
    lesson = lessonById(id);
  }
  if (!lesson) { location.hash = '#/curriculum'; return; }
  const ti = lesson.trackIndex != null ? lesson.trackIndex : (lesson.index || 0);
  if (lesson.id !== 'FREE' && ti > trackProgressIndex(lr, lesson.track || 'basic') &&
      !(lr.unlockedLessons || []).includes(lesson.id)) {
    view.innerHTML = `<section class="page"><div class="card empty-card">
      <h2>这一关还没解锁 🔒</h2><p class="muted">先完成前面的关卡吧，循序渐进效果最好。</p>
      <a class="btn btn-primary" href="#/curriculum">回课程地图</a></div></section>`;
    return;
  }
  const layoutName = (LAYOUTS[lr.layout] || LAYOUTS.laptop).name;
  practice = new Practice({
    mount: view,
    lesson,
    layoutId: lr.layout,
    layoutName,
    onExit: () => { practice = null; go(lesson.id === 'FREE' ? '#/free' : '#/curriculum'); },
    onRetry: () => { const keep = practice; practice = null; keep.destroy(); render(); },
    onNext: () => {
      const list = lessonsOfTrack(lesson.track || 'basic');
      const next = lesson.id === 'FREE' ? null : list[(lesson.trackIndex || 0) + 1];
      practice = null;
      go(next ? '#/lesson/' + next.id : '#/curriculum');
    },
    onFinish: (s, l, passed) => {
      refreshTopbar();
      toast(passed ? '达标！新关卡已解锁，成绩已保存' : '成绩已保存到本地与服务器');
    },
  });
  practice._lessonId = id;
}

// ---------------- 启动 ----------------
async function boot() {
  bindTopbar();
  render();
  await store.bootstrap();
  refreshTopbar();
  render();
  if (!location.hash) location.hash = '#/home';
}
boot();
