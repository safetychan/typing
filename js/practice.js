/* practice.js — 练习引擎：课前教学卡、实时盲打反馈、指标计算、成绩结算。
 * 计时口径：从第一次有效击键开始；切换页面 / 手动暂停的时间不计入。
 * 准确率 = 正确击键 / 总击键；WPM = 净正确字符 / 5 / 分钟。
 */
import { buildTarget, evaluate, formatDuration, STAGES, lessonByIndex } from './curriculum.js';
import { fingerShort, fingerColor } from './layouts.js';
import {
  renderKeyboard, renderHands, highlightChar, highlightFinger,
  clearKeyboard, clearHands, fingerHintText,
} from './keyboard.js';
import { store } from './storage.js';

const round1 = n => Math.round(Number(n) * 10) / 10;
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let audioCtx = null;
function beep(ok, enabled) {
  if (!enabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = ok ? 760 : 210;
    g.gain.setValueAtTime(ok ? 0.045 : 0.075, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (ok ? 0.06 : 0.13));
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (ok ? 0.07 : 0.14));
  } catch (e) { /* 浏览器不支持声音时静默 */ }
}

export class Practice {
  /**
   * @param {Object} o
   *  o.mount      容器
   *  o.lesson     关卡对象（自由练习可传合成对象）
   *  o.layoutId   当前布局
   *  o.onFinish   结算回调 (session, lesson, passed)
   *  o.onExit     退出回调
   *  o.onNext     下一关回调
   *  o.onRetry    重练回调
   */
  constructor(o) {
    Object.assign(this, o);
    this.settings = (store.active()?.settings) || {};
    this.sound = this.settings.sound !== false;
    this.showHands = this.settings.showHands !== false;
    this.strict = this.lesson.strict !== false;
    this.target = buildTarget(this.lesson, this.layoutId);
    this.idx = 0;
    this.errors = 0;
    this.keystrokes = 0;
    this.correctKeys = 0;
    this.typed = [];
    this.errorAt = new Set();
    this.startedAt = null;
    this.accumMs = 0;
    this.segmentStart = null;
    this.paused = false;
    this.finished = false;
    this.recorded = false;
    this.autoPaused = false;
    this.cells = [];
    this._tick = null;
    this._demo = null;
    this._build();
    this._bind();
  }

  // ---------- DOM ----------
  _build() {
    const L = this.lesson;
    const stage = STAGES.find(s => s.id === L.stage) || STAGES[0];
    const pass = L.pass || { acc: 0, wpm: 0 };
    const passText = L.id === 'FREE'
      ? '自由练习不解锁课程，成绩仍会记录'
      : `达标条件：准确率 ≥ ${pass.acc}%${pass.wpm ? ` · 速度 ≥ ${pass.wpm} WPM` : ''}`;
    const newKeys = [...new Set([...(L.newKeys || '')])].filter(c => c !== ' ').slice(0, 12);

    this.mount.innerHTML = `
      <section class="practice-shell">
        <header class="practice-head">
          <button class="btn btn-ghost" data-act="exit">← 返回</button>
          <div class="practice-title">
            <span class="tag tag-stage">${esc(stage.icon)} ${esc(stage.name)}</span>
            <h2>${esc(L.title || '自由练习')}</h2>
          </div>
          <div class="practice-layout">布局：<b>${esc(this.layoutName || this.layoutId)}</b></div>
        </header>

        <div class="intro-card" data-view="intro">
          <div class="intro-main">
            <div class="intro-kicker">本关学什么</div>
            <p class="intro-brief">${esc(L.brief || '按屏幕提示逐字输入，保持手指归位。')}</p>
            <div class="intro-tip"><span>💡</span>${esc(L.tip || '眼睛看屏幕，不看键盘。')}</div>
            ${newKeys.length ? `<div class="intro-keys"><span class="muted">本关新键</span>
              <span class="newkey-list">${newKeys.map(c => `<kbd>${esc(c === ' ' ? '空格' : c)}</kbd>`).join('')}</span></div>` : ''}
            ${L.unit ? `<div class="intro-preview"><span class="muted">练习内容 · ${esc(L.levelName || '')}</span>
              <code>${esc((L.contentPreview || this.target).replace(/\n/g, ' ↵ ').slice(0, 72))}…</code></div>` : ''}
            <div class="intro-pass">${esc(passText)}</div>
          </div>
          <div class="intro-side">
            <div class="mini-hands" data-role="intro-hands"></div>
            <button class="btn btn-soft" data-act="demo">▶ 看一遍演示</button>
            <button class="btn btn-primary btn-lg" data-act="start">开始练习</button>
            <p class="intro-note">请确保输入法为 <b>英文</b> 状态；Esc 可随时退出。</p>
          </div>
          <div class="intro-kb" data-role="intro-kb"></div>
        </div>

        <div class="typing-area" data-view="typing" hidden>
          <div class="metrics">
            <div class="metric"><span>用时</span><b data-m="time">0:00</b></div>
            <div class="metric"><span>速度</span><b data-m="wpm">0 <small>WPM</small></b></div>
            <div class="metric"><span>准确率</span><b data-m="acc">100<small>%</small></b></div>
            <div class="metric"><span>错误</span><b data-m="err">0</b></div>
            <div class="metric metric-wide"><span>进度</span>
              <div class="progress"><i data-m="progress"></i></div><b data-m="pct">0%</b></div>
          </div>
          <div class="target-box" data-role="target" tabindex="0" aria-label="练习文本"></div>
          <div class="hint-bar">
            <span class="hint-finger" data-role="finger">准备开始</span>
            <span class="hint-key" data-role="key"></span>
            <span class="hint-mode">${this.strict ? '纠错模式：打错需按正确的键' : '流畅模式：打错会记录并继续'}</span>
          </div>
          <div class="kb-host" data-role="kb"></div>
          ${this.showHands ? '<div class="hands-host" data-role="hands"></div>' : ''}
          <div class="practice-controls">
            <button class="btn btn-ghost" data-act="restart">↻ 重新开始</button>
            <button class="btn btn-ghost" data-act="pause">⏸ 暂停</button>
            <button class="btn btn-ghost" data-act="exit">结束本次练习</button>
          </div>
        </div>

        <div class="result-card" data-view="result" hidden></div>
      </section>`;

    this.el = {
      intro: this.mount.querySelector('[data-view="intro"]'),
      typing: this.mount.querySelector('[data-view="typing"]'),
      result: this.mount.querySelector('[data-view="result"]'),
      target: this.mount.querySelector('[data-role="target"]'),
      finger: this.mount.querySelector('[data-role="finger"]'),
      key: this.mount.querySelector('[data-role="key"]'),
      kb: this.mount.querySelector('[data-role="kb"]'),
      hands: this.mount.querySelector('[data-role="hands"]'),
      introHands: this.mount.querySelector('[data-role="intro-hands"]'),
      introKb: this.mount.querySelector('[data-role="intro-kb"]'),
    };
    renderKeyboard(this.el.kb, this.layoutId);
    if (this.el.introKb) renderKeyboard(this.el.introKb, this.layoutId);
    if (this.el.hands) renderHands(this.el.hands);
    if (this.el.introHands) renderHands(this.el.introHands);
    this._renderTarget();
    this._updateHint();
  }

  _renderTarget() {
    const frag = document.createDocumentFragment();
    this.cells = [...this.target].map((ch, i) => {
      const span = document.createElement('span');
      span.className = 'cell' + (ch === ' ' ? ' cell-space' : '') +
        (ch === '\n' ? ' cell-break' : '');
      span.textContent = ch === ' ' ? '·' : ch === '\n' ? '↵' : ch;
      span.dataset.i = i;
      frag.appendChild(span);
      // 段落练习中的换行：显示 ↵ 并真正换行，输入时按 Enter
      if (ch === '\n') frag.appendChild(document.createElement('br'));
      return span;
    });
    this.el.target.innerHTML = '';
    this.el.target.appendChild(frag);
    this._paintCells();
  }

  _paintCells() {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      c.classList.toggle('done', i < this.idx && !this.errorAt.has(i));
      c.classList.toggle('wrong', i < this.idx && this.errorAt.has(i));
      c.classList.toggle('current', i === this.idx);
    }
    const cur = this.cells[this.idx];
    if (cur && this.el.target.scrollHeight > this.el.target.clientHeight) {
      const top = cur.offsetTop - this.el.target.clientHeight / 2 + cur.offsetHeight / 2;
      this.el.target.scrollTop = Math.max(0, top);
    }
  }

  _bind() {
    this._onClick = e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'start') this.start();
      else if (act === 'demo') this.demo();
      else if (act === 'restart') this.restart();
      else if (act === 'pause') this.togglePause();
      else if (act === 'exit') this.exit();
      else if (act === 'retry' && this.onRetry) this.onRetry();
      else if (act === 'next' && this.onNext) this.onNext();
      else if (act === 'back' && this.onExit) this.onExit();
    };
    this.mount.addEventListener('click', this._onClick);
    this._onKey = e => this._handleKey(e);
    this._onVis = () => {
      if (document.visibilityState === 'hidden' && this._running() && !this.paused) {
        this.autoPaused = true; this.pause();
      } else if (document.visibilityState === 'visible' && this.autoPaused) {
        this.autoPaused = false; this.resume();
      }
    };
    window.addEventListener('keydown', this._onKey, true);
    document.addEventListener('visibilitychange', this._onVis);
  }

  _running() { return Boolean(this.startedAt) && !this.finished; }

  // ---------- 计时 ----------
  _elapsed() {
    let ms = this.accumMs;
    if (this.startedAt && !this.paused && this.segmentStart != null) ms += performance.now() - this.segmentStart;
    return ms;
  }
  _startTimer() {
    this.startedAt = new Date().toISOString();
    this.segmentStart = performance.now();
    this._tick = setInterval(() => {
      if (!this._running()) return;
      this._updateMetrics();
      if (this.lesson.mode === 'timed' && this._elapsed() >= (this.lesson.durationSec || 30) * 1000) {
        this.finish(true);
      }
    }, 200);
  }
  pause() {
    if (!this._running() || this.paused) return;
    this.accumMs += performance.now() - this.segmentStart;
    this.segmentStart = null;
    this.paused = true;
    this.mount.querySelector('[data-act="pause"]')?.replaceChildren('▶ 继续');
    this.el.finger.textContent = '已暂停 · 点击「继续」恢复';
  }
  resume() {
    if (!this._running() || !this.paused) return;
    this.segmentStart = performance.now();
    this.paused = false;
    this.mount.querySelector('[data-act="pause"]')?.replaceChildren('⏸ 暂停');
    this._updateHint();
  }
  togglePause() { this.paused ? this.resume() : this.pause(); }

  // ---------- 流程 ----------
  start() {
    this.el.intro.hidden = true;
    this.el.typing.hidden = false;
    this.el.result.hidden = true;
    this.el.target.focus({ preventScroll: true });
    this._updateHint();
    this._updateMetrics();
  }
  demo() {
    clearInterval(this._demo);
    const chars = [...new Set([...(this.lesson.newKeys || ''), ...'asdfjkl;'])]
      .filter(c => c !== ' ').slice(0, 8);
    let i = 0;
    const step = () => {
      if (i >= chars.length) {
        clearInterval(this._demo);
        clearKeyboard(this.el.introKb); clearHands(this.el.introHands);
        const f = this.el.intro.querySelector('.demo-tip');
        if (f) f.textContent = '演示完毕，试着自己打一遍吧！';
        return;
      }
      const ch = chars[i++];
      const info = highlightChar(this.el.introKb, this.layoutId, ch);
      highlightFinger(this.el.introHands, info ? info.finger : null);
      let tip = this.el.intro.querySelector('.demo-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'demo-tip';
        this.el.intro.querySelector('.intro-side').prepend(tip);
      }
      tip.textContent = `第 ${i}/${chars.length} 个：${ch === ' ' ? '空格' : ch} → ${info ? fingerShort(info.finger) : '—'}`;
    };
    step();
    this._demo = setInterval(step, 850);
  }
  restart() {
    this.idx = 0; this.errors = 0; this.keystrokes = 0; this.correctKeys = 0;
    this.typed = []; this.errorAt.clear();
    this.accumMs = 0; this.segmentStart = this.startedAt ? performance.now() : null;
    this.paused = false; this.finished = false; this.recorded = false;
    clearInterval(this._tick);
    if (this.startedAt) this._startTimer();
    this.target = buildTarget(this.lesson, this.layoutId);
    this.el.result.hidden = true;
    this.el.typing.hidden = false;
    this._renderTarget(); this._updateHint(); this._updateMetrics();
    this.el.target.focus({ preventScroll: true });
  }

  _handleKey(e) {
    if (this.el.typing.hidden) return;
    if (e.isComposing || e.key === 'Process' || e.key === 'Dead') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); this.exit(); return; }
    if (e.key === 'Tab') return;
    // 段落练习里的换行：Enter 对应目标文本中的 \n（docx 第 7 课对话逐行输入）
    if (e.key === 'Enter' && this.target[this.idx] === '\n') {
      e.preventDefault();
      if (this.paused) { this.resume(); return; }
      if (!this.startedAt) this._startTimer();
      this._input('\n');
      return;
    }
    if (this.finished) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (!this.paused && this.idx > 0) {
        this.idx--; this.typed[this.idx] = undefined; this.errorAt.delete(this.idx);
        this._paintCells(); this._updateHint(); this._updateMetrics();
      }
      return;
    }
    if (e.key.length !== 1) return;
    e.preventDefault();
    if (this.paused) { this.resume(); return; }
    if (!this.startedAt) this._startTimer();
    this._input(e.key);
  }

  _input(ch) {
    const expected = this.target[this.idx];
    this.keystrokes++;
    if (ch === expected) {
      this.correctKeys++;
      this.typed[this.idx] = ch;
      this.idx++;
      beep(true, this.sound);
    } else {
      this.errors++;
      beep(false, this.sound);
      if (this.strict) {
        this._flashWrong(expected);
        this._updateHint(`打错了，请按「${expected === ' ' ? '空格' : expected === '\n' ? 'Enter 换行' : expected}」`);
        this._updateMetrics();
        return;
      }
      this.typed[this.idx] = ch;
      this.errorAt.add(this.idx);
      this.idx++;
    }
    this._paintCells();
    this._updateHint();
    this._updateMetrics();
    if (this.idx >= this.target.length) this.finish(true);
  }

  _flashWrong(expected) {
    const info = highlightChar(this.el.kb, this.layoutId, expected);
    highlightFinger(this.el.hands, info ? info.finger : null);
    const cell = this.cells[this.idx];
    if (cell) {
      cell.classList.add('shake');
      setTimeout(() => cell.classList.remove('shake'), 320);
    }
    const kb = this.el.kb.querySelector('.key.active');
    if (kb) { kb.classList.add('wrong'); setTimeout(() => kb.classList.remove('wrong'), 320); }
  }

  _updateHint(override) {
    if (!this.el.typing || this.el.typing.hidden) return;
    const ch = this.target[this.idx];
    if (ch === undefined) return;
    if (ch === '\n') {
      highlightChar(this.el.kb, this.layoutId, '\n');
      highlightFinger(this.el.hands, 7);
      this.el.finger.innerHTML = '<i class="dot" style="background:#d184c6"></i>右手小指 · 基准键 ; → 请按 Enter 换行';
      this.el.key.textContent = '请按 Enter ↵';
      return;
    }
    const info = highlightChar(this.el.kb, this.layoutId, ch);
    highlightFinger(this.el.hands, info ? info.finger : null);
    if (override) {
      this.el.finger.textContent = override;
    } else if (info) {
      this.el.finger.innerHTML = `<i class="dot" style="background:${fingerColor(info.finger)}"></i>` +
        esc(fingerHintText(info.finger, ''));
    } else {
      this.el.finger.textContent = '当前布局没有这个字符';
    }
    this.el.key.textContent = info
      ? `请按 ${info.shift ? 'Shift + ' : ''}${ch === ' ' ? '空格' : ch}`
      : '';
  }

  _updateMetrics() {
    if (!this.el.typing) return;
    const ms = this._elapsed();
    const min = ms / 60000;
    const wpm = min > 0 ? round1((this.idx / 5) / min) : 0;
    const acc = this.keystrokes ? round1((this.correctKeys / this.keystrokes) * 100) : 100;
    const total = this.target.length;
    const pct = Math.round((this.idx / total) * 100);
    const sec = Math.floor(ms / 1000);
    const set = (k, v) => { const el = this.el.typing.querySelector(`[data-m="${k}"]`); if (el) el.innerHTML = v; };
    set('time', `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    set('wpm', `${wpm} <small>WPM</small>`);
    set('acc', `${acc}<small>%</small>`);
    set('err', String(this.errors));
    set('pct', `${pct}%`);
    const bar = this.el.typing.querySelector('[data-m="progress"]');
    if (bar) bar.style.width = pct + '%';
  }

  _makeSession(completed) {
    const ms = Math.round(this._elapsed());
    const min = ms / 60000;
    const wpm = min > 0 ? round1((this.idx / 5) / min) : 0;
    const acc = this.keystrokes ? round1((this.correctKeys / this.keystrokes) * 100) : 100;
    const s = {
      lessonId: this.lesson.id || 'FREE',
      lessonTitle: this.lesson.title || '自由练习',
      stage: this.lesson.stage != null ? this.lesson.stage : -1,
      startedAt: this.startedAt || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: ms,
      chars: this.idx, correct: this.idx, errors: this.errors,
      keystrokes: this.keystrokes, wpm, accuracy: acc,
      layout: this.layoutId, completed, passed: false,
      mode: this.lesson.mode || 'free',
      // 按次记录：完成进度、练习内容、所属课程与级别
      progressPct: this.target.length ? Math.round((this.idx / this.target.length) * 100) : 0,
      targetLength: this.target.length,
      contentPreview: String(this.lesson.contentPreview ||
        this.target.replace(/\n/g, ' ↵ ')).slice(0, 80),
      courseUnit: this.lesson.unit ? `第 ${this.lesson.unit} 课` : '',
      levelName: this.lesson.levelName || '',
      track: this.lesson.track || 'basic',
    };
    s.passed = completed && this.lesson.id !== 'FREE' && evaluate(this.lesson, s);
    return s;
  }

  finish(completed) {
    if (this.finished) return;
    this.finished = true;
    clearInterval(this._tick);
    if (this.startedAt && !this.paused && this.segmentStart != null) {
      this.accumMs += performance.now() - this.segmentStart;
      this.segmentStart = null;
    }
    const session = this._makeSession(completed);
    this.recorded = true;
    store.addSession(session);
    this._paintResult(session);
    if (this.onFinish) this.onFinish(session, this.lesson, session.passed);
  }

  /** 中途退出：仍记录一次练习时长（completed=false），保证家长能看到真实学习时间 */
  exit() {
    if (!this.recorded && this.startedAt && this.idx > 0) {
      this.finished = true;
      clearInterval(this._tick);
      const session = this._makeSession(false);
      this.recorded = true;
      store.addSession(session);
    }
    this.destroy();
    if (this.onExit) this.onExit();
  }

  _paintResult(s) {
    const passed = s.passed;
    const next = lessonByIndex((this.lesson.index != null ? this.lesson.index : -1) + 1);
    const grade = s.accuracy >= 98 ? '出色！' : s.accuracy >= 92 ? '很棒！' : s.accuracy >= 85 ? '不错，继续' : '再来一次会更好';
    this.el.typing.hidden = true;
    this.el.result.hidden = false;
    this.el.result.innerHTML = `
      <div class="result-head">
        <div class="result-badge ${passed ? 'ok' : ''}">${passed ? '✓ 达标' : (s.completed ? '已完成练习' : '本次已记录')}</div>
        <h2>${esc(grade)}</h2>
        <p class="muted">${passed ? '新关卡已解锁，继续保持！'
          : (this.lesson.id === 'FREE' ? '自由练习成绩已保存到学习记录'
            : `未达到本关标准（准确率 ≥ ${this.lesson.pass?.acc || 0}%${this.lesson.pass?.wpm ? `、速度 ≥ ${this.lesson.pass.wpm} WPM` : ''}），可以随时重练。`)}</p>
      </div>
      <div class="result-grid">
        <div class="result-item"><span>用时</span><b>${formatDuration(s.durationMs)}</b></div>
        <div class="result-item"><span>速度</span><b>${s.wpm} <small>WPM</small></b></div>
        <div class="result-item"><span>准确率</span><b>${s.accuracy}<small>%</small></b></div>
        <div class="result-item"><span>错误击键</span><b>${s.errors}</b></div>
        <div class="result-item"><span>完成字符</span><b>${s.chars} / ${this.target.length}</b></div>
        <div class="result-item"><span>键盘布局</span><b>${esc(this.layoutName || this.layoutId)}</b></div>
      </div>
      <div class="result-actions">
        <button class="btn btn-primary" data-act="retry">↻ 再练一次</button>
        ${passed && next ? '<button class="btn btn-primary" data-act="next">下一关 →</button>' : ''}
        <button class="btn btn-ghost" data-act="back">返回课程</button>
      </div>`;
  }

  destroy() {
    clearInterval(this._tick);
    clearInterval(this._demo);
    this.mount.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('visibilitychange', this._onVis);
    this.mount.innerHTML = '';
  }
}
