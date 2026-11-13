/* layouts.js — 键盘布局定义、指法（手指↔键位）映射、布局差异说明。
 * 三套布局共用同一套「按物理列分配手指」的指法规则，
 * 但由于键面字符不同，同一个字符在不同布局下会落到不同手指（例如 @ 在美式是 Shift+2，在英式是 Shift+'）。
 */

export const FINGER_COLORS = [
  '#ef8f8f', // 0 左小指
  '#e8a866', // 1 左无名指
  '#d9c05a', // 2 左中指
  '#79bf8b', // 3 左食指
  '#5fb6c4', // 4 右食指
  '#6f9fe0', // 5 右中指
  '#9b8ada', // 6 右无名指
  '#d184c6', // 7 右小指
  '#9aa6b8', // 8 拇指
];

export const FINGERS = [
  { id: 0, name: '左手小指', short: '左小指', hand: '左手', home: 'A' },
  { id: 1, name: '左手无名指', short: '左无名', hand: '左手', home: 'S' },
  { id: 2, name: '左手中指', short: '左中指', hand: '左手', home: 'D' },
  { id: 3, name: '左手食指', short: '左食指', hand: '左手', home: 'F' },
  { id: 4, name: '右手食指', short: '右食指', hand: '右手', home: 'J' },
  { id: 5, name: '右手中指', short: '右中指', hand: '右手', home: 'K' },
  { id: 6, name: '右手无名指', short: '右无名', hand: '右手', home: 'L' },
  { id: 7, name: '右手小指', short: '右小指', hand: '右手', home: ';' },
  { id: 8, name: '双手拇指', short: '拇指', hand: '双手', home: '空格' },
];

export const HOME_ROW_LEFT = ['a', 's', 'd', 'f'];
export const HOME_ROW_RIGHT = ['j', 'k', 'l', ';'];
export const HOME_ROW = [...HOME_ROW_LEFT, ...HOME_ROW_RIGHT];

/* 标准盲打指法：按物理键列分配手指（小写基准字符 → 手指编号） */
const CHAR_FINGER = {
  '`': 0, '1': 0, 'q': 0, 'a': 0, 'z': 0,
  '2': 1, 'w': 1, 's': 1, 'x': 1,
  '3': 2, 'e': 2, 'd': 2, 'c': 2,
  '4': 3, '5': 3, 'r': 3, 't': 3, 'f': 3, 'g': 3, 'v': 3, 'b': 3,
  '6': 4, '7': 4, 'y': 4, 'u': 4, 'h': 4, 'j': 4, 'n': 4, 'm': 4,
  '8': 5, 'i': 5, 'k': 5, ',': 5,
  '9': 6, 'o': 6, 'l': 6, '.': 6,
  '0': 7, '-': 7, '=': 7, 'p': 7, '[': 7, ']': 7,
  '\\': 7, ';': 7, "'": 7, '/': 7, '#': 7,
  ' ': 8,
};

export const LAYOUTS = {
  laptop: {
    id: 'laptop', name: '笔记本键盘', en: 'Laptop', badge: '默认',
    desc: '无数字小键盘的紧凑布局，功能键与方向键精简。绝大多数笔记本电脑采用这种键位，也是本课程的默认布局。',
    fnRow: ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Del'],
    digit: ['`1234567890-=', '~!@#$%^&*()_+'],
    top: ['qwertyuiop[]\\', 'QWERTYUIOP{}|'],
    home: ['asdfghjkl;\'', 'ASDFGHJKL:"'],
    bottom: ['zxcvbnm,./', 'ZXCVBNM<>?'],
    iso: false, numpad: false,
    topTail: null, homeEnter: 2.25, shiftLeft: 2.25, shiftRight: 2.75,
    bottomHead: null,
    bottomRow: [
      ['Ctrl', 1.25], ['Fn', 1], ['Win', 1.25], ['Alt', 1.25], [' ', 6.25],
      ['Alt', 1.25], ['Ctrl', 1.25], ['◀', 1], ['▲', 1], ['▼', 1], ['▶', 1],
    ],
  },
  us_ansi: {
    id: 'us_ansi', name: '标准美式（ANSI 全尺寸）', en: 'US ANSI', badge: '104 键',
    desc: '带独立数字小键盘与编辑键区的全尺寸美式布局。回车为横向长条，左 Shift 右侧无额外按键。',
    fnRow: ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
      'F9', 'F10', 'F11', 'F12', 'PrtSc', 'ScrLk', 'Pause'],
    digit: ['`1234567890-=', '~!@#$%^&*()_+'],
    top: ['qwertyuiop[]\\', 'QWERTYUIOP{}|'],
    home: ['asdfghjkl;\'', 'ASDFGHJKL:"'],
    bottom: ['zxcvbnm,./', 'ZXCVBNM<>?'],
    iso: false, numpad: true,
    topTail: null, homeEnter: 2.25, shiftLeft: 2.25, shiftRight: 2.75,
    bottomHead: null,
    bottomRow: [
      ['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], [' ', 6.25],
      ['Alt', 1.25], ['Win', 1.25], ['Menu', 1.25], ['Ctrl', 1.25],
    ],
  },
  uk_iso: {
    id: 'uk_iso', name: '英式（UK ISO）', en: 'UK ISO', badge: 'ISO 105 键',
    desc: '英式 ISO 布局：回车为倒 L 形大键，左 Shift 与 Z 之间多一个 \\ 键，引号右侧多一个 #~ 键；@ 与 " 的位置和美式互换，另有 £ 符号。',
    fnRow: ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
      'F9', 'F10', 'F11', 'F12', 'PrtSc', 'ScrLk', 'Pause'],
    digit: ['`1234567890-=', '¬!"£$%^&*()_+'],
    top: ['qwertyuiop[]', 'QWERTYUIOP{}'],
    home: ['asdfghjkl;\'#', 'ASDFGHJKL:@~'],
    bottom: ['\\zxcvbnm,./', '|ZXCVBNM<>?'],
    iso: true, numpad: true,
    topTail: ['⏎', 1.5], homeEnter: 1.25, shiftLeft: 1.25, shiftRight: 2.75,
    bottomHead: null,
    bottomRow: [
      ['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], ['AltGr', 1.25], [' ', 6.25],
      ['AltGr', 1.25], ['Menu', 1.25], ['Ctrl', 1.25],
    ],
  },
};

/* 布局差异对照：用于「指法教室」的说明表格 */
export const LAYOUT_DIFFS = [
  { char: '@', us: 'Shift + 2（左无名指）', uk: "Shift + '（右小指）" },
  { char: '"', us: "Shift + '（右小指）", uk: 'Shift + 2（左无名指）' },
  { char: '#', us: 'Shift + 3（左中指）', uk: "独立键 #~（右小指）" },
  { char: '~', us: 'Shift + `（左小指）', uk: 'Shift + #（右小指）' },
  { char: '\\', us: '上排末（右小指）', uk: 'Z 左侧（右小指）' },
  { char: '£', us: '无此键', uk: 'Shift + 3（左中指）' },
  { char: 'Enter', us: '横向长条', uk: '倒 L 形大键' },
];

function charRow(strBase, strShift, rowIndex, startCol) {
  const base = [...strBase], shift = [...strShift];
  return base.map((b, i) => ({
    b, s: shift[i] || '', w: 1, f: CHAR_FINGER[b] ?? -1,
    type: 'char', row: rowIndex, col: startCol + i,
    label: /^[a-z]$/.test(b) ? b.toUpperCase() : null,
  }));
}

function mod(label, w, f = -1) {
  return { b: '', s: '', w, f, type: 'mod', label };
}

export function buildRows(layoutId) {
  const L = LAYOUTS[layoutId] || LAYOUTS.laptop;
  const rows = [];
  // 功能键行
  rows.push({ kind: 'fn', keys: L.fnRow.map(t => mod(t, 1)) });
  // 数字行
  const digit = charRow(L.digit[0], L.digit[1], 1, 0);
  digit.push(mod('Backspace', 2, 7));
  rows.push({ kind: 'main', keys: digit });
  // 上排
  const top = [mod('Tab', 1.5, 0), ...charRow(L.top[0], L.top[1], 2, 1)];
  if (L.topTail) top.push(mod(L.topTail[0], L.topTail[1]));
  rows.push({ kind: 'main', keys: top });
  // 基准行
  const home = [mod('Caps', 1.75, 0), ...charRow(L.home[0], L.home[1], 3, 1),
    mod('Enter', L.homeEnter, 7)];
  rows.push({ kind: 'main', keys: home });
  // 下排
  const bottom = [mod('Shift', L.shiftLeft, 0), ...charRow(L.bottom[0], L.bottom[1], 4, 1),
    mod('Shift', L.shiftRight, 7)];
  rows.push({ kind: 'main', keys: bottom });
  // 底部修饰行
  const last = L.bottomRow.map(([label, w]) =>
    label === ' ' ? { b: ' ', s: '', w, f: 8, type: 'space', label: '' } : mod(label, w));
  rows.push({ kind: 'main', keys: last });
  return rows;
}

export function buildNumpad() {
  const grid = [
    ['Num', '/', '*', '−'],
    ['7', '8', '9', '+'],
    ['4', '5', '6', '+'],
    ['1', '2', '3', '⏎'],
    ['0', '0', '.', '⏎'],
  ];
  return grid.map(r => r.map(t => mod(t, 1)));
}

const CACHE = new Map();

/** 返回 { rows, numpad, byChar, keys, info }；byChar: 字符 → 键位信息 */
export function buildLayout(layoutId) {
  const id = LAYOUTS[layoutId] ? layoutId : 'laptop';
  if (CACHE.has(id)) return CACHE.get(id);
  const rows = buildRows(id);
  const byChar = new Map();
  const keys = [];
  rows.forEach((row, ri) => row.keys.forEach((k, ci) => {
    const key = Object.assign({}, k, { row: ri, col: ci, keyId: `k${ri}-${ci}` });
    keys.push(key);
    if (key.b) {
      const info = {
        keyId: key.keyId, b: key.b, s: key.s || '', finger: key.f,
        shift: false, row: ri, col: ci, label: key.label || key.b.toUpperCase(),
      };
      byChar.set(key.b, info);
      if (key.s && !byChar.has(key.s)) {
        byChar.set(key.s, Object.assign({}, info, { shift: true, label: key.s }));
      }
    }
  }));
  const result = { id, info: LAYOUTS[id], rows, numpad: LAYOUTS[id].numpad ? buildNumpad() : null, byChar, keys };
  CACHE.set(id, result);
  return result;
}

/** 查某个字符在当前布局下的键位与手指；未收录返回 null */
export function charInfo(layoutId, ch) {
  const L = buildLayout(layoutId);
  return L.byChar.get(ch) || null;
}

/** 某布局下可打印的 ASCII 字符池（供课程生成，排除 £ ¬ 等非 ASCII 与宽字符） */
export function printableChars(layoutId) {
  return [...buildLayout(layoutId).byChar.keys()]
    .filter(c => c.length === 1 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
}

export const fingerName = i => (FINGERS[i] || { name: '未分配' }).name;
export const fingerShort = i => (FINGERS[i] || { short: '—' }).short;
export const fingerColor = i => FINGER_COLORS[i] || '#cbd5e1';
export const handOf = i => (i === 8 ? '双手' : i <= 3 ? '左手' : '右手');
