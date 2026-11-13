/* keyboard.js — 虚拟键盘、双手示意图与「字符 → 键位 → 手指」可视化。
 * 所有图形均为内联 SVG / CSS，无外部依赖，离线可用。
 */
import {
  buildLayout, FINGERS, fingerColor, fingerShort, handOf,
} from './layouts.js';

function keyEl(k, opts) {
  const el = document.createElement('div');
  el.className = 'key';
  if (k.type === 'mod') el.classList.add('key-mod');
  if (k.type === 'space') el.classList.add('key-space');
  if (k.f >= 0) {
    el.classList.add('f' + k.f);
    el.style.setProperty('--fc', fingerColor(k.f));
  }
  el.style.setProperty('--w', k.w);
  el.dataset.keyId = k.keyId;
  if (k.b) { el.dataset.char = k.b; el.dataset.shift = k.s || ''; }
  if (k.shiftSide) el.dataset.shiftSide = k.shiftSide;
  if (k.b === 'f' || k.b === 'j') el.classList.add('home-key');
  if (opts && opts.interactive) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
  }
  el.setAttribute('aria-label', k.type === 'space' ? '空格键' : (k.label || k.b || '按键'));

  if (k.type === 'space') {
    el.innerHTML = '<span class="key-main">Space</span>';
  } else if (k.type === 'mod') {
    el.innerHTML = `<span class="key-main">${escapeHtml(k.label || '')}</span>`;
  } else if (/^[a-z]$/.test(k.b)) {
    el.innerHTML = `<span class="key-main">${k.b.toUpperCase()}</span>`;
  } else {
    el.innerHTML = `<span class="key-top">${escapeHtml(k.s || '')}</span>` +
      `<span class="key-bottom">${escapeHtml(k.b === ' ' ? '' : k.b)}</span>`;
  }
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 渲染键盘。返回 { root, layoutId } */
export function renderKeyboard(container, layoutId, opts = {}) {
  const L = buildLayout(layoutId);
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'kb' + (L.info.numpad ? ' kb-full' : '');
  root.dataset.layout = L.id;

  const left = document.createElement('div');
  left.className = 'kb-left';

  L.rows.forEach((row, ri) => {
    // 下排的两个 Shift 标记左右，供组合键高亮使用
    const keys = row.keys.map((k, ci) => {
      const copy = Object.assign({}, k);
      if (k.type === 'mod' && k.label === 'Shift') copy.shiftSide = ci === 0 ? 'L' : 'R';
      if (k.label === 'Enter' || k.label === '⏎') copy.isEnter = true;
      return copy;
    });
    const rowEl = document.createElement('div');
    rowEl.className = row.kind === 'fn' ? 'kb-row kb-fn' : 'kb-row';
    keys.forEach(k => rowEl.appendChild(keyEl(k, opts)));
    left.appendChild(rowEl);
  });

  const wrap = document.createElement('div');
  wrap.className = 'kb-body';
  wrap.appendChild(left);

  if (L.numpad) {
    const pad = document.createElement('div');
    pad.className = 'kb-numpad';
    pad.setAttribute('aria-label', '数字小键盘（不参与指法教学）');
    L.numpad.forEach(r => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      r.forEach((k, i) => rowEl.appendChild(keyEl(Object.assign({}, k, { keyId: `num-${r[0].label}-${i}` }))));
      pad.appendChild(rowEl);
    });
    wrap.appendChild(pad);
  }
  root.appendChild(wrap);

  const legend = document.createElement('div');
  legend.className = 'kb-legend';
  legend.innerHTML = FINGERS.slice(0, 8).map((f, i) =>
    `<span class="legend-chip"><i style="background:${fingerColor(i)}"></i>${f.short} · ${f.home}</span>`
  ).join('') + `<span class="legend-chip"><i style="background:${fingerColor(8)}"></i>拇指 · 空格</span>`;
  root.appendChild(legend);

  container.appendChild(root);
  return { root, layoutId: L.id };
}

/** 渲染双手示意图（内联 SVG） */
export function renderHands(container) {
  const fingers = [
    { x: 26, w: 20, h: 56, y: 54 },
    { x: 52, w: 22, h: 72, y: 38 },
    { x: 80, w: 22, h: 82, y: 28 },
    { x: 108, w: 22, h: 70, y: 40 },
  ];
  const hand = (ids, mirror) => {
    const rects = fingers.map((f, i) => {
      const id = ids[i];
      return `<rect class="finger-shape" data-f="${id}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="10"
        style="--fc:${fingerColor(id)}"><title>${FINGERS[id].name} · 基准键 ${FINGERS[id].home}</title></rect>`;
    }).join('');
    return `<g transform="${mirror ? 'translate(320,0) scale(-1,1)' : ''}">
      <rect class="palm" x="18" y="98" width="122" height="76" rx="26"/>
      ${rects}
      <rect class="thumb finger-shape" data-f="8" x="128" y="96" width="20" height="62" rx="10"
        transform="rotate(34 138 127)" style="--fc:${fingerColor(8)}"><title>拇指 · 空格</title></rect>
    </g>`;
  };
  container.innerHTML = `
    <svg class="hands-svg" viewBox="0 0 320 186" role="img" aria-label="双手手指分工示意图">
      ${hand([0, 1, 2, 3], false)}
      ${hand([7, 6, 5, 4], true)}
      <text x="80" y="182" text-anchor="middle" class="hand-label">左手</text>
      <text x="240" y="182" text-anchor="middle" class="hand-label">右手</text>
    </svg>`;
  return container.firstElementChild;
}

export function clearKeyboard(kbContainer) {
  if (!kbContainer) return;
  kbContainer.querySelectorAll('.key.active, .key.hint, .key.wrong')
    .forEach(el => el.classList.remove('active', 'hint', 'wrong'));
}
export function clearHands(handsContainer) {
  if (!handsContainer) return;
  handsContainer.querySelectorAll('.finger-shape.on').forEach(el => el.classList.remove('on'));
}

/** 高亮某个字符对应的键 + 应配合的 Shift，返回键位信息 */
export function highlightChar(kbContainer, layoutId, ch) {
  clearKeyboard(kbContainer);
  if (!kbContainer) return null;
  // 换行不是字符键：高亮 Enter，并归到右手小指（与 docx 第 7 课指法一致）
  if (ch === '\n') {
    const enter = [...kbContainer.querySelectorAll('.key')].find(el =>
      /^(Enter|⏎)$/.test((el.getAttribute('aria-label') || '').trim()));
    if (enter) enter.classList.add('active');
    return { finger: 7, shift: false, label: 'Enter', keyId: enter ? enter.dataset.keyId : '' };
  }
  const L = buildLayout(layoutId);
  const info = L.byChar.get(ch);
  if (!info) return null;
  const el = kbContainer.querySelector(`[data-key-id="${info.keyId}"]`);
  if (el) el.classList.add('active');
  if (info.shift) {
    const side = info.finger <= 3 ? 'R' : 'L'; // 大写/上档符号用对侧小指按 Shift
    const shift = kbContainer.querySelector(`[data-shift-side="${side}"]`);
    if (shift) shift.classList.add('active');
  }
  return info;
}

export function highlightFinger(handsContainer, finger) {
  clearHands(handsContainer);
  if (!handsContainer || finger == null || finger < 0) return;
  handsContainer.querySelectorAll(`.finger-shape[data-f="${finger}"]`)
    .forEach(el => el.classList.add('on'));
}

export function highlightFingerKeys(kbContainer, finger) {
  if (!kbContainer) return;
  kbContainer.querySelectorAll('.key.hint').forEach(el => el.classList.remove('hint'));
  if (finger == null || finger < 0) return;
  kbContainer.querySelectorAll(`.key.f${finger}`).forEach(el => el.classList.add('hint'));
}

/** 指法提示文案：「右手中指 · K 列 → 8 / I / ,」 */
export function fingerHintText(finger, ch) {
  if (finger == null || finger < 0) return '这个字符不在当前布局中，请切换键盘布局';
  const f = FINGERS[finger];
  return `${f.name} · 基准键 ${f.home}${ch ? ` → 请按「${ch === ' ' ? '空格' : ch}」` : ''}`;
}

export function handText(finger) { return handOf(finger); }
