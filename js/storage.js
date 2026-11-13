/* storage.js — 双写存储：浏览器 localStorage + 服务端 JSON 文件。
 *
 * 学习时间口径：只累计「有真实交互的心跳窗口」。
 *   每 5 秒一个窗口，窗口内出现过可信的按键 / 点击 / 触摸 / 滚轮 / 滚动，
 *   且页面可见、窗口有焦点，才把这段窗口时长计入当天 activity。
 *   单纯开着页面、鼠标晃动、切到后台、最小化都不会累计。
 *
 * 跨设备一致性：每个学习者带 revision（权威版本号）。
 *   家长端重置 / 删除时，服务端把 revision 递增并写下墓碑；
 *   其他设备带着旧版本来同步，只能收到「整体替换 / 删除」指令，
 *   旧成绩不会再被 session 并集合并回来。
 */
import { dayKey, LESSONS } from './curriculum.js';
import { apiUrl, detectApiBase } from './api.js';
import { RUNTIME, IS_STATIC } from './runtime.js';

const KEY = RUNTIME.storageKey;
const TICK_MS = 5000;              // 活跃窗口长度
const MAX_WINDOW_MS = 10000;       // 标签页被节流时单窗口最多计入 10 秒
const SYNC_EVERY_MS = 60000;       // 同步心跳：即使挂机也要及时接收重置/删除
const ACTIVE_EVENTS = ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'wheel', 'scroll'];

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
}
function nowIso() { return new Date().toISOString(); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function blankState() {
  return { version: 2, activeLearnerId: '', learners: {}, deletedLearners: {},
    updatedAt: nowIso(), pending: true };
}

function newLearner(name, layout) {
  const t = nowIso();
  return {
    id: uid('learner'), name: name || '学习者', createdAt: t, updatedAt: t,
    layout: layout || 'laptop',
    settings: { sound: true, showHands: true, theme: 'light', dailyGoalMin: 15 },
    currentLessonId: LESSONS[0]?.id || 'L00',
    progressIndex: 0, unlockedLessons: [],
    basicProgressIndex: 0, englishProgressIndex: 0,
    sessions: [], activity: {},
    revision: 0, resetAt: '',
  };
}

/** 补齐历史数据 / 服务端副本的字段，保证 revision 等新字段存在 */
function normalizeLocal(lr) {
  const o = clone(lr || {});
  o.id = String(o.id || '');
  o.name = String(o.name || '学习者');
  o.layout = o.layout || 'laptop';
  o.settings = (o.settings && typeof o.settings === 'object') ? o.settings :
    { sound: true, showHands: true, theme: 'light', dailyGoalMin: 15 };
  o.currentLessonId = o.currentLessonId || LESSONS[0]?.id || 'L00';
  o.progressIndex = Number(o.progressIndex) || 0;
  // 两条课程轨道各自独立解锁；旧档案没有这两个字段时回退到原 progressIndex
  o.basicProgressIndex = o.basicProgressIndex != null
    ? Number(o.basicProgressIndex) || 0 : o.progressIndex;
  o.englishProgressIndex = Number(o.englishProgressIndex) || 0;
  o.unlockedLessons = Array.isArray(o.unlockedLessons) ? o.unlockedLessons : [];
  o.sessions = Array.isArray(o.sessions) ? o.sessions : [];
  o.activity = (o.activity && typeof o.activity === 'object') ? o.activity : {};
  o.revision = Math.max(0, Number(o.revision) || 0);
  o.resetAt = String(o.resetAt || '');
  o.createdAt = o.createdAt || nowIso();
  o.updatedAt = o.updatedAt || nowIso();
  return o;
}

function normalizeState(d) {
  const s = d && typeof d === 'object' ? d : blankState();
  s.version = 2;
  s.learners = (s.learners && typeof s.learners === 'object') ? s.learners : {};
  s.deletedLearners = (s.deletedLearners && typeof s.deletedLearners === 'object') ? s.deletedLearners : {};
  for (const [id, lr] of Object.entries(s.learners)) s.learners[id] = normalizeLocal(lr);
  s.activeLearnerId = s.activeLearnerId || '';
  s.updatedAt = s.updatedAt || nowIso();
  s.pending = Boolean(s.pending);
  return s;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.learners !== 'object' || !d.learners) return null;
    return d;
  } catch (e) { return null; }
}

/** 常规合并：sessions 按 id 去重、活跃时长按日取 max、进度取较大值 */
function mergeLocal(a, b) {
  if (!a) return normalizeLocal(b);
  if (!b) return normalizeLocal(a);
  const out = clone(a);
  const map = new Map();
  for (const s of [...(a.sessions || []), ...(b.sessions || [])]) if (s && s.id) map.set(s.id, s);
  out.sessions = [...map.values()].sort((x, y) =>
    String(x.startedAt || '').localeCompare(String(y.startedAt || '')));
  const act = Object.assign({}, a.activity || {});
  for (const [d, ms] of Object.entries(b.activity || {})) act[d] = Math.max(Number(act[d]) || 0, Number(ms) || 0);
  out.activity = act;
  out.progressIndex = Math.max(Number(a.progressIndex) || 0, Number(b.progressIndex) || 0);
  out.basicProgressIndex = Math.max(Number(a.basicProgressIndex ?? a.progressIndex) || 0,
    Number(b.basicProgressIndex ?? b.progressIndex) || 0);
  out.englishProgressIndex = Math.max(Number(a.englishProgressIndex) || 0, Number(b.englishProgressIndex) || 0);
  out.unlockedLessons = [...new Set([...(a.unlockedLessons || []), ...(b.unlockedLessons || [])])];
  if (String(b.updatedAt || '') >= String(a.updatedAt || '')) {
    for (const k of ['name', 'layout', 'settings', 'currentLessonId']) {
      if (b[k] !== undefined) out[k] = clone(b[k]);
    }
  }
  const ra = Number(a.revision) || 0, rb = Number(b.revision) || 0;
  out.revision = Math.max(ra, rb);
  out.resetAt = ra >= rb ? String(a.resetAt || '') : String(b.resetAt || '');
  return out;
}

/** 版本仲裁合并：revision 更大的一方是权威，直接整体替换，不做 session 并集 */
function mergeByRevision(a, b) {
  if (!a) return normalizeLocal(b);
  if (!b) return normalizeLocal(a);
  const ra = Number(a.revision) || 0, rb = Number(b.revision) || 0;
  if (rb > ra) return normalizeLocal(b);
  if (ra > rb) return normalizeLocal(a);
  return mergeLocal(a, b);
}

class Store {
  constructor() {
    this.state = normalizeState(readRaw() || blankState());
    this.listeners = new Set();
    this.status = { online: null, syncing: false, lastSyncAt: null, message: '等待同步' };
    this._activity = { lastTick: Date.now(), hits: 0, focused: true };
    this._timer = null;
    this._lastPush = 0;
    this._bound = false;
    this._soon = null;
    this._pendingSync = false;
  }

  onStatus(fn) { this.listeners.add(fn); fn(this.status); return () => this.listeners.delete(fn); }
  _emit(patch) {
    this.status = Object.assign({}, this.status, patch);
    this.listeners.forEach(fn => { try { fn(this.status); } catch (e) {} });
  }
  _emitLearnersChanged(detail) {
    try { window.dispatchEvent(new CustomEvent('typing-lab:learners-changed', { detail })); }
    catch (e) { /* 非浏览器环境忽略 */ }
  }
  save() {
    this.state.updatedAt = nowIso();
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {
      this._emit({ message: '浏览器存储空间不足，请及时导出数据' });
    }
  }
  get learners() { return Object.values(this.state.learners); }
  get activeId() { return this.state.activeLearnerId; }
  active() { return this.state.learners[this.state.activeLearnerId] || null; }
  get(id) { return this.state.learners[id] || null; }

  /** 本地单调递增修订号；离线重置/删除也用它标记权威版本 */
  nextRevision() {
    let m = 0;
    for (const lr of Object.values(this.state.learners)) m = Math.max(m, Number(lr.revision) || 0);
    for (const t of Object.values(this.state.deletedLearners)) m = Math.max(m, Number(t.revision) || 0);
    return Math.max(m + 1, Date.now());
  }
  _deletedPayload() {
    return Object.entries(this.state.deletedLearners).map(([id, t]) =>
      ({ id, at: t.at, revision: Number(t.revision) || 0, name: t.name || '' }));
  }
  _fixActive() {
    if (!this.state.learners[this.state.activeLearnerId])
      this.state.activeLearnerId = Object.keys(this.state.learners)[0] || '';
  }

  createLearner(name, layout) {
    const lr = newLearner(name, layout);
    this.state.learners[lr.id] = lr;
    this.state.activeLearnerId = lr.id;
    this.save();
    this.syncNow(true);
    return lr;
  }
  setActive(id) {
    if (!this.state.learners[id]) return;
    this.state.activeLearnerId = id;
    this.save();
    this.syncNow(true);
  }
  updateLearner(patch) {
    const lr = this.active();
    if (!lr) return null;
    Object.assign(lr, patch, { updatedAt: nowIso() });
    if (patch.layout) lr.layout = patch.layout;
    this.save();
    this.syncSoon();
    return lr;
  }
  updateSettings(patch) {
    const lr = this.active();
    if (!lr) return;
    lr.settings = Object.assign({}, lr.settings, patch);
    lr.updatedAt = nowIso();
    this.save();
    this.syncSoon();
  }
  renameLearner(id, name) {
    const lr = this.state.learners[id];
    if (!lr) return;
    lr.name = name; lr.updatedAt = nowIso();
    this.save();
    this.syncSoon();
  }

  /** 追加一次练习记录（完成或未完成都记，保证「每次练习时长」不丢） */
  addSession(session) {
    const lr = this.active();
    if (!lr) return;   // 档案已被家长端删除时不再写回
    const s = Object.assign({
      id: uid('s'), startedAt: nowIso(), endedAt: nowIso(),
      durationMs: 0, chars: 0, correct: 0, errors: 0, keystrokes: 0,
      wpm: 0, accuracy: 0, layout: lr.layout, completed: false, passed: false,
      // 按次记录：完成进度 + 对应练习内容（家长面板逐条展示）
      progressPct: 0, targetLength: 0, contentPreview: '',
      courseUnit: '', levelName: '', track: 'basic',
    }, session);
    lr.sessions.push(s);
    if (s.passed && s.lessonId) {
      const lesson = LESSONS.find(l => l.id === s.lessonId);
      const idx = LESSONS.findIndex(l => l.id === s.lessonId);
      if (idx >= 0) lr.progressIndex = Math.max(lr.progressIndex || 0, idx + 1);
      if (lesson) {
        const key = lesson.track === 'english' ? 'englishProgressIndex' : 'basicProgressIndex';
        lr[key] = Math.max(Number(lr[key]) || 0, (lesson.trackIndex ?? idx) + 1);
      }
      if (!lr.unlockedLessons.includes(s.lessonId)) lr.unlockedLessons.push(s.lessonId);
    }
    if (s.lessonId) lr.currentLessonId = s.lessonId;
    lr.updatedAt = nowIso();
    this.save();
    this.syncNow(true);
    return s;
  }

  /** 只由 _tickActivity 调用：把一个「有交互」的窗口计入当日学习时间 */
  addActivity(ms) {
    const lr = this.active();
    if (!lr || !ms || ms <= 0) return;
    const d = dayKey(new Date());
    lr.activity[d] = Math.max(0, (Number(lr.activity[d]) || 0) + ms);
    lr.updatedAt = nowIso();
    this.save();
  }
  markInteraction() {
    this._activity.hits++;
    this._activity.lastTick = this._activity.lastTick || Date.now();
  }

  /** 结算一个心跳窗口；countHiddenWindow 用于页面隐藏前补记最后一个片段 */
  _tickActivity(countHiddenWindow = false, alsoSync = true) {
    const now = Date.now();
    const elapsed = Math.min(Math.max(0, now - this._activity.lastTick), MAX_WINDOW_MS);
    this._activity.lastTick = now;
    const active = countHiddenWindow ? true :
      (document.visibilityState === 'visible' && this._activity.focused);
    if (active && this._activity.hits > 0 && elapsed > 0) this.addActivity(elapsed);
    this._activity.hits = 0;
    // 同步不依赖交互：挂机时也要及时接收家长端的重置/删除
    if (alsoSync && now - this._lastPush > SYNC_EVERY_MS) this.syncNow(true);
  }

  unlockAll() {
    const lr = this.active();
    if (!lr) return;
    lr.progressIndex = LESSONS.length - 1;
    lr.basicProgressIndex = LESSONS.filter(l => l.track !== 'english').length;
    lr.englishProgressIndex = LESSONS.filter(l => l.track === 'english').length;
    lr.unlockedLessons = LESSONS.map(l => l.id);
    lr.updatedAt = nowIso();
    this.save();
    this.syncSoon();
  }

  _purgeLocal(id, revision, at) {
    if (!id) return;
    const lr = this.state.learners[id];
    const rev = Number(revision) || this.nextRevision();
    this.state.deletedLearners[id] = {
      at: at || nowIso(), revision: rev, name: lr?.name || '',
    };
    delete this.state.learners[id];
    this._fixActive();
    this.save();
    this._emitLearnersChanged({ action: 'purge', learnerId: id });
  }

  _applySyncResult(data, id, lr, sentAt) {
    if (data.action === 'purge') {
      this._purgeLocal(data.learnerId, data.revision, data.at);
      return;
    }
    if (data.action === 'deleted') return;   // 仅上报删除墓碑的响应
    const serverLr = normalizeLocal(data.learner);
    if (!serverLr || !serverLr.id) return;

    if (data.action === 'replace') {
      // 服务端权威版本：整体替换，但保留重置之后在本机真实产生的新练习
      const current = id ? this.state.learners[id] : null;
      if (current && serverLr.resetAt) {
        const extra = (current.sessions || []).filter(s =>
          String(s.startedAt || '') > String(serverLr.resetAt));
        const map = new Map((serverLr.sessions || []).map(s => [s.id, s]));
        for (const s of extra) if (s.id && !map.has(s.id)) map.set(s.id, s);
        serverLr.sessions = [...map.values()].sort((a, b) =>
          String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
      }
      this.state.learners[serverLr.id] = serverLr;
      this._fixActive();
      this._emitLearnersChanged({ action: 'replace', learnerId: serverLr.id });
      return;
    }

    // action === 'merge'：版本相同，常规幂等合并
    const current = id ? (this.state.learners[id] || lr) : null;
    if (!current) return;
    const merged = mergeByRevision(current, serverLr);
    if (sentAt && current.updatedAt !== sentAt) {
      // 请求进行中用户又改了设置/布局：本地版本优先，不能被服务端返回覆盖
      for (const k of ['name', 'layout', 'settings', 'currentLessonId']) {
        if (current[k] !== undefined) merged[k] = clone(current[k]);
      }
      merged.updatedAt = current.updatedAt;
    }
    this.state.learners[merged.id] = merged;
  }

  /** 把本地所有学习者推送到服务端，并按服务端指令对齐本地 */
  async syncNow(force = false) {
    // 静态模式（GitHub Pages / file:// 离线包）：不发任何网络请求，
    // 记录已由 save() 写入 localStorage，家长面板直接读取同一份数据。
    if (IS_STATIC) {
      this._emit({ online: 'local', syncing: false, lastSyncAt: nowIso(),
        message: '本机模式 · 练习记录已保存在此浏览器' });
      return true;
    }
    // 启动同步(bootstrap)正在进行时，新建档案 / 刚结束的练习会撞上这把锁。
    // 记一个待办，等本轮结束后立刻重跑，避免新数据要等下一个 60 秒心跳才上传。
    if (this.status.syncing) { this._pendingSync = true; return false; }
    if (!force && Date.now() - this._lastPush < 8000) return false;
    this._lastPush = Date.now();
    this._emit({ syncing: true, message: '正在同步…' });
    let okCount = 0, total = 0;
    try {
      const learners = Object.values(this.state.learners);
      const deleted = this._deletedPayload();
      if (!learners.length && !deleted.length) {
        // 还没有学习者时也必须验证后端连通性，否则会「零请求却报告已连接」
        total = 1;
        const h = await fetch(apiUrl('health'), { cache: 'no-store' });
        const d = await h.json().catch(() => ({}));
        if (!h.ok || !d.ok) throw new Error('offline');
        okCount = 1;
      } else {
        const targets = learners.length ? learners : [null];
        for (const lr of targets) {
          total++;
          const id = lr ? lr.id : null;
          const sentAt = lr ? lr.updatedAt : null;
          const res = await fetch(apiUrl('sync'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ learner: lr ? clone(lr) : null,
              deleted, clientTime: nowIso() }),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'sync failed');
          this._applySyncResult(data, id, lr, sentAt);
          okCount++;
        }
      }
      this.state.pending = false;
      this.save();
      this._emit({ online: true, syncing: false, lastSyncAt: nowIso(),
        message: `已保存到本地 + 服务器（${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）` });
    } catch (e) {
      this.state.pending = true;
      this.save();
      this._emit({ online: false, syncing: false,
        message: '服务器未连接，数据已安全保存在本机，恢复后自动补传' });
      // 可能只是 API 基址变了（换了 Nginx 路径 / 刚配好转发），后台重新探测一次
      detectApiBase(false).catch(() => {});
    } finally {
      if (this._pendingSync) {
        this._pendingSync = false;
        setTimeout(() => this.syncNow(true), 50);
      }
    }
    return okCount === total;
  }
  syncSoon() { clearTimeout(this._soon); this._soon = setTimeout(() => this.syncNow(true), 1200); }

  /** 启动时：先探测 API 基址，再推本地、拉取服务端档案 */
  async bootstrap() {
    this._bindEvents();
    if (IS_STATIC) {
      this._emit({ online: 'local', syncing: false, lastSyncAt: nowIso(),
        message: '本机模式 · 练习记录已保存在此浏览器' });
      return;
    }
    await detectApiBase(true).catch(() => {});
    await this.syncNow(true);
    if (this.status.online === false) return;
    try {
      const idx = await fetch(apiUrl('learners'));
      const list = await idx.json();
      if (list.ok && Array.isArray(list.learners)) {
        for (const item of list.learners) {
          if (this.state.learners[item.id]) continue;
          try {
            const r = await fetch(apiUrl('state?learner=' + encodeURIComponent(item.id)));
            const d = await r.json();
            if (d.deleted) {
              this._purgeLocal(item.id, d.revision, d.deletedAt);
            } else if (d.learner) {
              this.state.learners[item.id] = normalizeLocal(d.learner);
            }
            // d.learner == null 且无墓碑：服务端暂时还没有此档案（例如刚新建、
            // 首次同步尚未完成），必须保留本地，绝不能误判为家长端删除。
          } catch (e) { /* 跳过单个档案 */ }
        }
      }
      this._fixActive();
      // 再对齐一次当前档案：服务端 revision 更大时整体替换，避免旧数据回流
      const id = this.state.activeLearnerId;
      if (id) {
        const r = await fetch(apiUrl('state?learner=' + encodeURIComponent(id)));
        const d = await r.json();
        if (d.deleted) {
          this._purgeLocal(id, d.revision, d.deletedAt);
        } else if (d.learner) {
          const local = this.state.learners[id];
          const merged = mergeByRevision(local, normalizeLocal(d.learner));
          if (local && String(local.updatedAt || '') > String(d.learner.updatedAt || '')) {
            for (const k of ['name', 'layout', 'settings', 'currentLessonId']) {
              if (local[k] !== undefined) merged[k] = clone(local[k]);
            }
            merged.updatedAt = local.updatedAt;
          }
          this.state.learners[id] = merged;
        }
        // 否则保留本地新档案，等下一次 syncNow 推送上去
      }
      this.save();
    } catch (e) { /* 保持本地数据 */ }
  }

  _bindEvents() {
    if (this._bound) return;
    this._bound = true;
    const onInteraction = ev => {
      // 只认真实用户操作；程序触发的 scroll / 合成事件不计入学习时间
      if (ev && ev.isTrusted === false) return;
      this.markInteraction();
    };
    ACTIVE_EVENTS.forEach(ev =>
      window.addEventListener(ev, onInteraction, { passive: true, capture: true }));
    window.addEventListener('online', () => this.syncNow(true));
    window.addEventListener('focus', () => { this._activity.focused = true; });
    window.addEventListener('blur', () => { this._activity.focused = false; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this._tickActivity(true, false);   // 补记隐藏前最后一个有交互的窗口
        this.syncNow(true);
      } else {
        this._activity.lastTick = Date.now();
        this._activity.hits = 0;
      }
    });
    window.addEventListener('pagehide', () => this._tickActivity(true, false));
    this._timer = setInterval(() => this._tickActivity(), TICK_MS);
  }

  exportJSON() {
    return JSON.stringify({ version: 2, learners: this.state.learners,
      deletedLearners: this.state.deletedLearners }, null, 2);
  }

  /** 导入 JSON 备份：按学习者 id 合并（练习记录按 id 去重、活跃时长与进度取较大值）。
   *  在线版 / 离线版记录格式一致，可互相迁移。 */
  importLearners(payload) {
    const incoming = (payload && payload.learners) || payload;
    if (!incoming || typeof incoming !== 'object') return 0;
    let n = 0;
    for (const [id, raw] of Object.entries(incoming)) {
      if (!raw || typeof raw !== 'object') continue;
      const lr = normalizeLocal(Object.assign({}, raw, { id: raw.id || id }));
      const cur = this.state.learners[lr.id];
      this.state.learners[lr.id] = cur ? mergeLocal(cur, lr) : lr;
      n++;
    }
    if (!n) return 0;
    this._fixActive();
    this.save();
    this.syncSoon();
    this._emitLearnersChanged({ action: 'merge' });
    return n;
  }

  /** 家长端在线重置成功后：用服务端权威副本整体替换本机 */
  applyServerLearner(serverLr) {
    if (!serverLr || !serverLr.id) return;
    this.state.learners[serverLr.id] = normalizeLocal(serverLr);
    this._fixActive();
    this.save();
    this._emitLearnersChanged({ action: 'replace', learnerId: serverLr.id });
  }

  /** 离线重置 / 家长端「仅本机」模式：本地也递增 revision，联网后服务端会采信 */
  resetLearner(id, mode = 'progress') {
    if (mode === 'all' || mode === 'delete') return this.deleteLearner(id);
    const lr = this.state.learners[id];
    if (!lr) return;
    lr.sessions = []; lr.activity = {}; lr.progressIndex = 0;
    lr.basicProgressIndex = 0; lr.englishProgressIndex = 0;
    lr.unlockedLessons = []; lr.currentLessonId = LESSONS[0]?.id || 'L00';
    lr.revision = this.nextRevision();
    lr.resetAt = nowIso();
    lr.updatedAt = nowIso();
    this.save();
    this._emitLearnersChanged({ action: 'reset', learnerId: id });
    this.syncSoon();
  }

  /** 删除学习者：写墓碑 + 递增 revision，联网后同步给所有设备 */
  deleteLearner(id, serverRevision) {
    const lr = this.state.learners[id];
    if (!lr && !serverRevision) return;
    const rev = Number(serverRevision) || this.nextRevision();
    this.state.deletedLearners[id] = {
      at: nowIso(), revision: rev, name: lr?.name || '',
    };
    delete this.state.learners[id];
    this._fixActive();
    this.save();
    this._emitLearnersChanged({ action: 'purge', learnerId: id });
    this.syncSoon();
  }
}

export const store = new Store();
export { mergeLocal, mergeByRevision, normalizeLocal, uid, nowIso };
