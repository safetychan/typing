/* curriculum.js — 循序渐进的课程体系、练习文本生成、进度统计。
 * 设计原则：
 *  1) 每一关只引入少量新键，后续关卡的练习文本只由「已学键 + 本关新键」组成；
 *  2) 达标（准确率 / WPM 门槛）后解锁下一关，未达标可反复重试；
 *  3) 练习文本按当前键盘布局动态生成，切换布局后不会出现打不出来的字符。
 */
import { printableChars } from './layouts.js';
import {
  ENGLISH_UNITS, ENGLISH_STAGES, ENGLISH_LESSONS, ENGLISH_LEVELS,
} from './curriculum-english.js';

/* 两条课程轨道：
 *   basic   —— 原有「基础指法阶梯」，9 个阶段（关卡 ID / 索引完全保持不变，历史进度不丢失）
 *   english —— 初中英语键位进阶系列，docx 第 1→8 课 × 5 级（指法/字母/单词/句子/段落）
 */
export const TRACKS = [
  { id: 'basic', name: '基础指法阶梯', icon: '⌨️',
    desc: '从基准键到数字行的通用盲打阶梯，9 个阶段循序渐进。' },
  { id: 'english', name: '初中英语键位进阶', icon: '📘', badge: '推荐主线',
    desc: '依据《初中英语打字练习·键位进阶系列》编排：8 课逐级解锁键位，每课按指法→字母→单词→句子→段落递进，共 40 关。' },
];

const BASE_STAGES = [
  { id: 0, name: '起步 · 姿势与基准键', icon: '🌱', desc: '认识手指分工，把八根手指放回 ASDF JKL; 的「家」。' },
  { id: 1, name: '第一阶 · 基准键', icon: '🏠', desc: '不低头看键盘，练熟中间一排八个键。' },
  { id: 2, name: '第二阶 · 上排键', icon: '⬆️', desc: '手指从基准键向上伸展，打完立刻回位。' },
  { id: 3, name: '第三阶 · 下排键', icon: '⬇️', desc: '手指向下伸展，完成 26 个字母全覆盖。' },
  { id: 4, name: '第四阶 · 大小写与标点', icon: '✨', desc: 'Shift 配合小指，学会逗号、句号、问号与引号。' },
  { id: 5, name: '第五阶 · 数字与符号', icon: '🔢', desc: '数字行与常用符号，注意不同布局的符号位置差异。' },
  { id: 6, name: '第六阶 · 单词', icon: '📖', desc: '从字母组合过渡到真实单词，建立肌肉记忆。' },
  { id: 7, name: '第七阶 · 句子与短文', icon: '📝', desc: '大小写、空格、标点连成完整表达。' },
  { id: 8, name: '第八阶 · 速度挑战', icon: '🏁', desc: '限时冲刺与准确率挑战，检验学习成果。' },
];

export const STAGES = [
  ...BASE_STAGES.map(s => Object.assign({}, s, { track: 'basic' })),
  ...ENGLISH_STAGES.map(s => Object.assign({}, s, { track: 'english' })),
];

const RAW = [
  // ── Stage 0 ──
  { stage: 0, title: '认识键盘与正确坐姿', newKeys: 'asdfjkl;', keys: 'asdfjkl;',
    mode: 'fixed', text: 'asdf jkl; asdf jkl;', length: 19, pass: { acc: 75, wpm: 0 }, strict: true,
    brief: '先不急着快。坐直、手腕放松、双肘自然下垂，把左手四指放在 A S D F、右手四指放在 J K L ; 上。F 和 J 键上通常有凸起的小横杠，闭眼也能摸到「家」在哪里。',
    tip: '眼睛看屏幕，不看手。打完一个键，手指立刻弹回基准键。' },
  { stage: 0, title: '基准键定位练习', newKeys: '', keys: 'asdfjkl;',
    mode: 'sequence', groupLen: 4, length: 80, pass: { acc: 85, wpm: 0 }, strict: true,
    brief: '按「asdf / jkl;」的节奏轮流敲。左小指管 A，左无名指管 S，左中指管 D，左食指管 F；右手对称，右食指管 J。',
    tip: '注意每根手指只负责自己的那一列，不要「借」邻居的手指。' },
  { stage: 0, title: '八指归位小测', newKeys: '', keys: 'asdfjkl;',
    mode: 'random', groupLen: 4, length: 96, pass: { acc: 85, wpm: 0 }, strict: true,
    brief: '现在顺序被打乱了。盯着屏幕上的字母，让对应的手指自己去找键，这是盲打最重要的第一步。',
    tip: '敲错了不用慌，按提示把正确的键补上即可，练习前期打错不会往后跳。' },
  // ── Stage 1 ──
  { stage: 1, title: '左手 A S D F', newKeys: '', keys: 'asdf',
    mode: 'sequence', groupLen: 4, length: 96, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '单独练左手四指，建立稳定的节奏感。每四个字母一组，组与组之间用右手拇指敲空格。',
    tip: '空格永远用拇指，左右手都可以，选一只固定下来。' },
  { stage: 1, title: '右手 J K L ;', newKeys: '', keys: 'jkl;',
    mode: 'sequence', groupLen: 4, length: 96, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '换右手。分号键由右小指负责，它是右手最外侧的键，一开始容易够不着，慢慢来。',
    tip: '小指力量弱，不要抬高手腕，用整个手掌微微右移带过去。' },
  { stage: 1, title: '双手交替', newKeys: '', keys: 'asdfjkl;',
    mode: 'random', groupLen: 4, length: 120, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '左右手混合。目标是「不用想」——看到字母，手指自动反应。',
    tip: '宁慢勿错。速度会在准确率稳定之后自然上来。' },
  { stage: 1, title: '基准键节奏挑战', newKeys: '', keys: 'asdfjkl;',
    mode: 'random', groupLen: 5, length: 150, pass: { acc: 90, wpm: 0 }, strict: true,
    brief: '加长一点，保持均匀节奏。试着在心里数拍子：一、二、三、四、空格。',
    tip: '节奏均匀比忽快忽慢更容易形成肌肉记忆。' },
  // ── Stage 2 ──
  { stage: 2, title: '食指向上：R T / Y U', newKeys: 'rtyu', keys: 'rtyufghj',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '左食指从 F 向上够 R、T，右食指从 J 向上够 Y、U。打完马上回到 F / J，其余手指保持不动。',
    tip: '只有食指动，其他三根手指要「贴」在基准键上。' },
  { stage: 2, title: '中指与无名指：E I / W O', newKeys: 'eiwo', keys: 'eiwoasdkjl;',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '左中指 D→E，右中指 K→I；左无名指 S→W，右无名指 L→O。注意 8、9 键那一列不要串到别的手指。',
    tip: '上排键与基准键是「同一根手指、斜上方一格」的关系。' },
  { stage: 2, title: '小指向上：Q P', newKeys: 'qp', keys: 'qpasdfjkl;',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: 'Q 由左小指、P 由右小指负责，这是两只小指最远的伸展。允许整只手轻微平移，但不要抬腕。',
    tip: '小指容易累，感到酸就停下来休息 30 秒。' },
  { stage: 2, title: '上排全键综合', newKeys: '', keys: 'qwertyuiopasdfjkl;',
    mode: 'random', groupLen: 6, length: 160, pass: { acc: 90, wpm: 0 }, strict: true,
    brief: '上排 + 基准键一起练。心里记一张「列」的地图：Q-A-Z 一列、W-S-X 一列，以此类推。',
    tip: '把键盘想成竖着的列，而不是横着的行，盲打会简单很多。' },
  { stage: 2, title: '用已学字母拼单词', newKeys: '', keys: '', mode: 'words', maxWordLen: 5,
    length: 140, pass: { acc: 90, wpm: 0 }, strict: true,
    brief: '第一次打真正的单词。系统只挑选「已经学过的字母」组成的词，所以不会突然冒出没练过的键。',
    tip: '按字母逐个反应，不要试图一次记住整个单词。' },
  // ── Stage 3 ──
  { stage: 3, title: '食指向下：V B / N M', newKeys: 'vbnm', keys: 'vbnmfghj',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '左食指 F→V、B，右食指 J→N、M。下排是斜下方，B 和 N 要跨过中间一点点。',
    tip: '回位靠 F / J 的凸点定位，摸到就说明手回来了。' },
  { stage: 3, title: '下排其余键：Z X C , . /', newKeys: 'zxc,./', keys: 'zxc,./asdl;',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 88, wpm: 0 }, strict: true,
    brief: '逗号归右中指、句号归右无名指、斜杠归右小指，和它们在基准行的「正上方」一一对应。',
    tip: '标点也讲指法，别用一根手指满键盘点。' },
  { stage: 3, title: '下排全键综合', newKeys: '', keys: 'zxcvbnm,./',
    mode: 'random', groupLen: 6, length: 150, pass: { acc: 90, wpm: 0 }, strict: true,
    brief: '现在 26 个字母全部学完了。下排单独练一轮，巩固斜向移动。',
    tip: '注意 B 用左食指、N 用右食指，别互相抢。' },
  { stage: 3, title: '三排混合', newKeys: '', keys: 'abcdefghijklmnopqrstuvwxyz,./',
    mode: 'random', groupLen: 6, length: 180, pass: { acc: 90, wpm: 12 }, strict: true,
    brief: '三排字母 + 标点随机混合，这是第一道综合关。通过它，你就已经具备盲打全部字母的能力。',
    tip: '遇到不确定的键，先看提示的手指，再看键位，别低头。' },
  // ── Stage 4 ──
  { stage: 4, title: 'Shift 与大写字母', newKeys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    mode: 'random', groupLen: 5, length: 150, pass: { acc: 90, wpm: 0 }, strict: false,
    brief: '大写要用「对侧小指」按住 Shift：打左手的字母时用右小指按右 Shift，打右手的字母时用左小指按左 Shift。',
    tip: '键盘上会同时高亮字母键和应该按的 Shift 键。' },
  { stage: 4, title: '逗号、句号、问号、叹号', newKeys: '?!', keys: ',.?!abcdefghijklmnopqrstuvwxyz',
    mode: 'random', groupLen: 6, length: 150, pass: { acc: 90, wpm: 0 }, strict: false,
    brief: '? 是 Shift + /，! 是 Shift + 1，都要靠小指配合。标点之后习惯性空一格。',
    tip: '从这一关起打错的字会记录进准确率，但不会卡住你，继续往下打。' },
  { stage: 4, title: '分号、冒号与引号', newKeys: ':"', keys: ';:\'"abcdefghijklmnopqrstuvwxyz',
    mode: 'random', groupLen: 6, length: 150, pass: { acc: 90, wpm: 0 }, strict: false,
    brief: '注意：英式布局的 " 在 Shift + 2，美式布局在 Shift + \'，手指完全不同，跟着键盘高亮走。',
    tip: '切换布局后，本关文本会按新布局重新生成。' },
  { stage: 4, title: '第一组完整短句', newKeys: '', keys: '', mode: 'sentences',
    length: 200, pass: { acc: 92, wpm: 10 }, strict: false,
    brief: '把学过的字母、空格和标点连成句子。句首大写、句末标点、词间空格，一样都不能少。',
    tip: '先求准，再求快。准确率稳定在 95% 以上再提速。' },
  // ── Stage 5 ──
  { stage: 5, title: '数字 1 2 3 4 5', newKeys: '12345', keys: '12345',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 90, wpm: 0 }, strict: false,
    brief: '数字行离基准键最远：1 归左小指、2 左无名、3 左中、4/5 左食指。够键时整只手前移，别只伸手指。',
    tip: '打完数字记得把手拉回 ASDF JKL;。' },
  { stage: 5, title: '数字 6 7 8 9 0', newKeys: '67890', keys: '67890',
    mode: 'random', groupLen: 5, length: 120, pass: { acc: 90, wpm: 0 }, strict: false,
    brief: '6/7 右食指、8 右中指、9 右无名指、0 右小指。和左半边是对称的。',
    tip: '可以用「4 5 | 6 7」这条中线来记左右食指的分工。' },
  { stage: 5, title: '常用符号 @ # $ % &', newKeys: '@#$%&*_()-', keys: '@#$%&*_()-',
    mode: 'random', groupLen: 5, length: 130, pass: { acc: 90, wpm: 0 }, strict: false,
    brief: '符号几乎都要配合 Shift。美式 @ 在 Shift+2，英式 @ 在 Shift+\'——这一关最能体会布局差异。',
    tip: '看键盘高亮：同时亮起的两个键，就是要一起按的组合。' },
  { stage: 5, title: '数字与字母混合', newKeys: '', keys: '0123456789abcdefghijklmnopqrstuvwxyz',
    mode: 'random', groupLen: 6, length: 180, pass: { acc: 92, wpm: 14 }, strict: false,
    brief: '模拟真实场景：编号、日期、简单代号里数字和字母会交替出现。',
    tip: '手指在数字行与字母行之间来回移动，靠基准键复位。' },
  // ── Stage 6 ──
  { stage: 6, title: '短单词（3–4 字母）', newKeys: '', keys: '', mode: 'words', maxWordLen: 4,
    length: 180, pass: { acc: 92, wpm: 15 }, strict: false,
    brief: '短词最适合练习连续击键的节奏，词间空格用拇指。',
    tip: '试着把常见词当成一个「动作串」，而不是一个个字母。' },
  { stage: 6, title: '常用单词', newKeys: '', keys: '', mode: 'words', minWordLen: 4, maxWordLen: 8,
    length: 240, pass: { acc: 93, wpm: 18 }, strict: false,
    brief: '词变长了，但方法不变：眼睛提前扫下一个词，手指跟着走。',
    tip: '视线始终比手指领先一个词，速度就是这样提上去的。' },
  { stage: 6, title: '词流速度', newKeys: '', keys: '', mode: 'words', maxWordLen: 9,
    length: 320, pass: { acc: 93, wpm: 20 }, strict: false,
    brief: '连续词流，不容停顿。保持呼吸放松，错了也别回头纠结。',
    tip: 'WPM 按每 5 个正确字符折算成一个「词」。' },
  // ── Stage 7 ──
  { stage: 7, title: '简单句', newKeys: '', keys: '', mode: 'sentences',
    length: 240, pass: { acc: 93, wpm: 20 }, strict: false,
    brief: '大小写、空格、标点同时出现，注意句首的 Shift 不要漏。',
    tip: '漏打空格也算错，养成打完词就碰拇指的习惯。' },
  { stage: 7, title: '段落练习', newKeys: '', keys: '', mode: 'sentences',
    length: 400, pass: { acc: 93, wpm: 22 }, strict: false,
    brief: '更长的段落，考验持续专注力。中途可以稍作停顿，计时会自动暂停。',
    tip: '切走页面时计时会暂停，回来继续即可。' },
  { stage: 7, title: '短文综合', newKeys: '', keys: '', mode: 'sentences',
    length: 560, pass: { acc: 94, wpm: 24 }, strict: false,
    brief: '接近真实打字任务。到这里，你已经可以不看键盘完成日常输入了。',
    tip: '把准确率放在第一位，速度是副产品。' },
  // ── Stage 8 ──
  { stage: 8, title: '30 秒冲刺', newKeys: '', keys: '', mode: 'timed', durationSec: 30,
    length: 1200, pass: { acc: 92, wpm: 22 }, strict: false,
    brief: '限时 30 秒，尽可能多打。时间到自动结算。',
    tip: '这是速度测试，不是准确率测试，放开了打。' },
  { stage: 8, title: '60 秒耐力', newKeys: '', keys: '', mode: 'timed', durationSec: 60,
    length: 2000, pass: { acc: 92, wpm: 24 }, strict: false,
    brief: '一分钟持续输出，重点是节奏不乱、手不僵。',
    tip: '手腕累了就放慢，别硬撑。' },
  { stage: 8, title: '准确率 98% 挑战', newKeys: '', keys: '', mode: 'words', maxWordLen: 9,
    length: 320, pass: { acc: 98, wpm: 20 }, strict: false,
    brief: '毕业考：准确率必须达到 98%，同时保持一定速度。允许反复挑战。',
    tip: '慢下来，一个键一个键确认，反而更容易过。' },
];

const BASE_WORDS = [
  'as', 'sad', 'fad', 'add', 'all', 'ask', 'fall', 'jak', 'lad', 'salad',
  'a', 'and', 'are', 'art', 'as', 'at', 'ask', 'add', 'dad', 'data', 'date',
  'ear', 'eat', 'tea', 'read', 'dear', 'tree', 'free', 'rate', 'trade', 'later',
  'it', 'is', 'in', 'if', 'sit', 'fit', 'list', 'little', 'still', 'skill',
  'to', 'do', 'go', 'so', 'no', 'not', 'note', 'top', 'stop', 'tool',
  'we', 'wet', 'web', 'well', 'west', 'write', 'water', 'week', 'work', 'word',
  'you', 'your', 'yes', 'yet', 'year', 'yellow', 'type', 'try', 'trust', 'pretty',
  'up', 'us', 'use', 'user', 'under', 'unit', 'until', 'put', 'but', 'cut',
  'i', 'idea', 'ice', 'kind', 'like', 'time', 'line', 'life', 'write', 'quiet',
  'of', 'off', 'old', 'one', 'open', 'over', 'other', 'color', 'cold', 'gold',
  'a', 'apple', 'about', 'after', 'again', 'away', 'always', 'able', 'table',
  'he', 'she', 'the', 'here', 'help', 'happy', 'home', 'hand', 'head', 'hear',
  'me', 'my', 'make', 'more', 'much', 'many', 'map', 'man', 'mother', 'morning',
  'cat', 'car', 'can', 'come', 'close', 'clean', 'class', 'city', 'call', 'care',
  'book', 'bag', 'big', 'bed', 'best', 'blue', 'black', 'back', 'boy', 'bus',
  'dog', 'day', 'do', 'does', 'down', 'door', 'did', 'red', 'run', 'rain',
  'good', 'get', 'give', 'girl', 'green', 'great', 'game', 'go', 'group',
  'name', 'new', 'next', 'nice', 'night', 'no', 'now', 'number', 'near', 'need',
  'please', 'play', 'people', 'part', 'pen', 'paper', 'page', 'place', 'picture',
  'school', 'see', 'say', 'small', 'some', 'sun', 'story', 'student', 'study',
  'thank', 'that', 'this', 'they', 'think', 'three', 'today', 'together', 'take',
  'very', 'view', 'voice', 'wait', 'walk', 'want', 'was', 'way', 'well', 'went',
  'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'word', 'world',
];

const BASE_SENTENCES = [
  'Keep your eyes on the screen, not on your hands.',
  'Place your fingers on the home row and relax your wrists.',
  'The quick brown fox jumps over the lazy dog.',
  'Practice a little every day, and speed will follow.',
  'Slow is smooth, and smooth is fast.',
  'Use the right finger for every key, then return home.',
  'A good typist looks ahead at the next word.',
  'Take a short break when your hands feel tired.',
  'Accuracy comes first; speed is only a byproduct.',
  'Read the line, then let your fingers do the work.',
  'Small steps every day make a big difference.',
  'Typing is a skill you build with patient repetition.',
  'Breathe, relax, and keep a steady rhythm.',
  'Do not peek at the keyboard; trust your fingers.',
  'Today we learn the keys; tomorrow we write a story.',
];

/* 把 docx 的词汇与句子并入通用素材库（自由练习、基础阶梯的随机文本也会用到） */
const DOC_WORDS = [...new Set(ENGLISH_UNITS.flatMap(u =>
  ((u.warmup || '') + ' ' + (u.passage || '')).match(/[A-Za-z]+/g) || [])
  .map(w => w.toLowerCase()))];
const DOC_SENTENCES = ENGLISH_UNITS.flatMap(u =>
  (u.passage || '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
    .map(s => s.trim()).filter(s => s.length > 8));
export const WORDS = [...new Set([...BASE_WORDS, ...DOC_WORDS])];
export const SENTENCES = [...new Set([...BASE_SENTENCES, ...DOC_SENTENCES])];

/* 展平成带全局 index 与 id 的关卡列表。
 * 基础阶梯原有的 id / index 保持原样；键位进阶 40 关追加在后，各自独立记录进度。 */
const BASE_COUNT = RAW.length;
export const LESSONS = [...RAW, ...ENGLISH_LESSONS].map((r, i) => {
  const isEn = r.track === 'english';
  return Object.assign({}, r, {
    index: i,
    track: r.track || 'basic',
    trackIndex: isEn ? i - BASE_COUNT : i,
    id: isEn ? `E${r.unit}-${r.level}` : `L${String(i).padStart(2, '0')}`,
    // docx 的新增键字段带中文说明，只保留可打印的键面字符用于「本关新键」提示
    newKeys: isEn
      ? [...(r.newKeys || '')].filter(c => /^[\x20-\x7e]$/.test(c)).join('')
      : (r.newKeys || ''),
    pass: r.pass || { acc: 90, wpm: 0 },
    strict: r.strict !== false,
    groupLen: r.groupLen || 5,
    length: r.length || 120,
  });
});

export const lessonById = id => LESSONS.find(l => l.id === id) || null;
export const lessonByIndex = i => LESSONS[i] || null;
export const stageOf = i => STAGES.find(s => s.id === i) || STAGES[0];

/* ---------------- 课程轨道辅助 ---------------- */
export const lessonsOfTrack = t => LESSONS.filter(l => (l.track || 'basic') === t);
export const stagesOfTrack = t => STAGES.filter(s => (s.track || 'basic') === t);

/** 某条轨道已解锁到第几关（两轨独立，互不串进度） */
export function trackProgressIndex(lr, track) {
  if (track === 'english') return Number(lr?.englishProgressIndex) || 0;
  if (lr?.basicProgressIndex != null) return Number(lr.basicProgressIndex) || 0;
  return Number(lr?.progressIndex) || 0;   // 兼容旧档案
}

/** 某条轨道当前应练的关卡 */
export function trackCurrentLesson(lr, track) {
  const list = lessonsOfTrack(track);
  const i = Math.min(trackProgressIndex(lr, track), list.length - 1);
  return list[Math.max(0, i)] || LESSONS[0];
}

/** 某条轨道的达标统计 */
export function trackStats(lr, track) {
  const list = lessonsOfTrack(track);
  const passed = new Set((lr?.sessions || []).filter(s => s.passed).map(s => s.lessonId));
  const done = list.filter(l => passed.has(l.id)).length;
  return { total: list.length, passed: done, percent: list.length ? Math.round(done / list.length * 100) : 0 };
}

export { ENGLISH_UNITS, ENGLISH_LEVELS };

/** 截止到某一关（含）已学过的字符集合 */
export function learnedCharsThrough(index) {
  const set = new Set([' ']);
  for (let i = 0; i <= index && i < LESSONS.length; i++) {
    for (const c of (LESSONS[i].keys || '')) set.add(c);
    for (const c of (LESSONS[i].newKeys || '')) set.add(c);
  }
  return set;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 按当前布局生成练习文本；layoutId 决定哪些字符可打 */
export function buildTarget(lesson, layoutId, seed = Date.now()) {
  const rng = mulberry32(seed);
  const allowedChars = new Set(printableChars(layoutId));
  // 切换键盘布局后统一净化：剔除该布局打不出来的字符，保证每个待敲字符都能给出
  // 正确的按键高亮与手指提示；空格与换行是通用输入（换行用 Enter），一律保留。
  const sanitize = s => [...(s || '')]
    .filter(c => c === '\n' || c === ' ' || allowedChars.has(c)).join('');
  const clean = s => {
    const chars = [...(s || '')].filter(c => allowedChars.has(c));
    return chars.length ? chars : [...'asdfjkl;'];
  };

  if (lesson.mode === 'fixed') return sanitize(lesson.text || 'asdf jkl;') || 'asdf jkl;';
  const pool = clean(lesson.keys || '');
  const take = () => pool[Math.floor(rng() * pool.length)] || 'a';

  if (lesson.mode === 'sequence') {
    const out = [];
    let n = 0, k = 0;
    while (n < lesson.length) {
      if (k > 0 && k % lesson.groupLen === 0) out.push(' ');
      out.push(pool[k % pool.length]);
      k++; n++;
    }
    return sanitize(out.join(''));
  }
  if (lesson.mode === 'random') {
    const s = [];
    let n = 0;
    while (n < lesson.length) {
      for (let i = 0; i < lesson.groupLen && n < lesson.length; i++, n++) s.push(take());
      if (n < lesson.length) s.push(' ');
    }
    return sanitize(s.join(''));
  }
  if (lesson.mode === 'words' || lesson.mode === 'timed') {
    const learned = learnedCharsThrough(lesson.index);
    const filtered = WORDS.filter(w =>
      w.length >= (lesson.minWordLen || 1) && w.length <= (lesson.maxWordLen || 12) &&
      [...w].every(c => learned.has(c)));
    const list = filtered.length >= 6 ? filtered : WORDS;
    const out = [];
    let len = 0;
    const cap = lesson.mode === 'timed' ? Math.max(lesson.length || 1200, 1200) : lesson.length;
    while (len < cap) {
      const w = list[Math.floor(rng() * list.length)];
      if (len + w.length + 1 > cap + 12) break;
      out.push(w); len += w.length + 1;
    }
    return sanitize(out.join(' '));
  }
  if (lesson.mode === 'sentences') {
    const out = [];
    let len = 0;
    while (len < lesson.length) {
      const s = SENTENCES[Math.floor(rng() * SENTENCES.length)];
      out.push(s); len += s.length + 1;
    }
    return sanitize(out.join(' '));
  }
  return 'asdf jkl; asdf jkl;';
}

/** 是否达标：准确率与最低 WPM 同时满足 */
export function evaluate(lesson, session) {
  const acc = Number(session.accuracy || 0);
  const wpm = Number(session.wpm || 0);
  return Boolean(session.completed) && acc >= (lesson.pass.acc || 0) && wpm >= (lesson.pass.wpm || 0);
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m} 分 ${r} 秒` : `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

export function dayKey(isoOrMs) {
  const d = new Date(isoOrMs);
  if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function lessonStats(learner, lessonId) {
  const list = (learner?.sessions || []).filter(s => s.lessonId === lessonId);
  const done = list.filter(s => s.completed);
  const bestAcc = done.reduce((m, s) => Math.max(m, Number(s.accuracy) || 0), 0);
  const bestWpm = done.reduce((m, s) => Math.max(m, Number(s.wpm) || 0), 0);
  return { attempts: list.length, bestAcc, bestWpm, passed: list.some(s => s.passed) };
}

/** 从 sessions / activity 派生全部统计，服务端与浏览器使用同一套口径 */
export function computeStats(learner) {
  const sessions = (learner?.sessions || []).slice();
  sessions.sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
  const practiceMs = sessions.reduce((n, s) => n + (Number(s.durationMs) || 0), 0);
  const activity = learner?.activity || {};
  const activeMs = Object.values(activity).reduce((n, v) => n + (Number(v) || 0), 0);
  const completed = sessions.filter(s => s.completed);
  const avgAccuracy = completed.length
    ? completed.reduce((n, s) => n + (Number(s.accuracy) || 0), 0) / completed.length : 0;
  const bestWpm = completed.reduce((m, s) => Math.max(m, Number(s.wpm) || 0), 0);
  const passedSet = new Set(sessions.filter(s => s.passed).map(s => s.lessonId));
  const days = new Set();
  sessions.forEach(s => { const d = dayKey(s.startedAt); if (d) days.add(d); });
  Object.keys(activity).forEach(d => { if (Number(activity[d]) > 0) days.add(d); });
  let streak = 0;
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  while (days.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  const today = dayKey(new Date());
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  let weekMs = 0, todayMs = 0;
  for (const [d, v] of Object.entries(activity)) {
    const t = new Date(d + 'T00:00:00');
    if (!isNaN(t.getTime()) && t >= weekStart) weekMs += Number(v) || 0;
    if (d === today) todayMs += Number(v) || 0;
  }
  return {
    sessions, practiceMs, activeMs: Math.max(activeMs, practiceMs), todayMs, weekMs,
    attempts: sessions.length, completedCount: completed.length,
    avgAccuracy, bestWpm, passedCount: passedSet.size,
    totalLessons: LESSONS.length,
    progressIndex: Math.min(Number(learner?.progressIndex) || 0, LESSONS.length - 1),
    streak, recent: sessions.slice(-12).reverse(),
    percent: Math.round((passedSet.size / LESSONS.length) * 100),
    englishProgress: trackStats(learner, 'english'),
    basicProgress: trackStats(learner, 'basic'),
  };
}
