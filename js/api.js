/* api.js — API 基址自动发现（适配任意子目录层级 / 多服务共存）。
 *
 * 问题背景：
 *   页面 URL 是 https://域名/typing/public/parent.html 时，若写死 /api/health，
 *   请求会打到域名根（通常属于别的服务）；只按「页面所在目录」推导又会得到
 *   /typing/public/api/health，而 Nginx 管理员可能转发的是 /typing/api/ 或 /api/。
 *   前缀对不上，页面就一直显示「服务器 API 未连通」。
 *
 * 解决：启动时并发探测一组候选基址，取第一个真正返回本项目健康检查的：
 *   页面目录 /typing/public/  →  /typing/public/api/  →  /typing/api/  →  /api/
 *   并把命中结果缓存到 localStorage，后续所有请求都走它。
 *   这样 Nginx 无论转发哪一级 api/，前端都能自动对上，无需精确配置路径。
 *
 * 判定严格：必须同时返回 ok=true、runtime=python|node、version=1 或 2
 * （version=2 表示后端支持删除接口与版本仲裁墓碑），
 * 避免误连到域名根上其他服务「碰巧也叫 health」的接口。
 *
 * 如需手工指定（API 走独立网关），二选一，无需改 JS。注意填的是 API 前缀本身、要带 api/：
 *   1) <meta name="typing-lab-api-base" content="/gateway/typing/api/">
 *   2) window.__TYPING_LAB_API_BASE__ = '/gateway/typing/api/'
 * 相对路径自动沿用当前协议，HTTPS 下不会产生混合内容。
 */

const CACHE_KEY = 'typing-lab.apiBase.v1';

/** 页面所在目录（含末尾斜杠），hash 路由不影响结果 */
function pageDirBase() {
  return new URL('api/', new URL('.', document.baseURI)).href;
}

function overrideBase() {
  const meta = document.querySelector('meta[name="typing-lab-api-base"]');
  const raw = window.__TYPING_LAB_API_BASE__ || (meta && meta.content.trim());
  if (!raw) return null;
  const v = raw.endsWith('/') ? raw : raw + '/';
  return new URL(v, document.baseURI).href;
}

/** 生成候选：页面目录起逐级上溯，每级拼 api/，最后补域名根 /api/ */
export function apiCandidates() {
  const forced = overrideBase();
  if (forced) return [forced];
  const seen = new Set(), list = [];
  const add = u => { if (!seen.has(u)) { seen.add(u); list.push(u); } };
  let cur = new URL('.', document.baseURI);
  for (let i = 0; i < 8; i++) {
    add(new URL('api/', cur).href);
    if (cur.pathname === '/') break;
    const parent = new URL('..', cur);
    if (parent.href === cur.href) break;
    cur = parent;
  }
  add(new URL('/api/', location.origin).href);
  // 上次成功的基址优先探测
  let cached = null;
  try { cached = localStorage.getItem(CACHE_KEY); } catch (e) {}
  if (cached) {
    const i = list.indexOf(cached);
    if (i >= 0) list.splice(i, 1);
    list.unshift(cached);
  }
  return list;
}

let BASE = overrideBase() || pageDirBase();
let LAST_PROBE = [];   // 最近一次探测明细，供诊断面板展示
let LAST_DETECT_AT = 0;

/** 把 'overview?pin=x' 或 '/api/state' 统一转换成完整 API URL */
export function apiUrl(path) {
  const p = String(path == null ? '' : path).replace(/^\/+/, '').replace(/^api\//, '');
  return new URL(p, BASE).href;
}

/** 当前生效的 API 基址 */
export function apiBase() { return BASE; }

/** 最近一次探测结果 */
export function apiProbeResults() { return LAST_PROBE.slice(); }

async function probeOne(base) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 3000) : null;
  try {
    const r = await fetch(base + 'health', {
      cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}),
    });
    const d = await r.json().catch(() => ({}));
    const isOurs = d.ok === true &&
      (d.runtime === 'python' || d.runtime === 'node') &&
      (d.version === 1 || d.version === 2);
    return { base, ok: r.ok && isOurs, status: r.status, runtime: d.runtime || '', detail: isOurs ? '本项目服务' : (r.ok ? '非本项目接口' : 'HTTP ' + r.status) };
  } catch (e) {
    return { base, ok: false, status: 0, runtime: '',
      detail: e && e.name === 'AbortError' ? '超时' : '无法连接 / 被拦截' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 并发探测所有候选，命中则设为全局基址并缓存。
 * @param {boolean} force 忽略缓存重新探测
 * @returns {Promise<{base:string|null, results:Array}>}
 */
export async function detectApiBase(force = false) {
  // 后台自动重探（force=false）做 5 秒节流，避免同步失败时反复发探测请求；
  // 启动与「重新检测」按钮走 force=true，始终立即重探。
  if (!force && LAST_PROBE.length && Date.now() - LAST_DETECT_AT < 5000) {
    return { base: LAST_PROBE.some(r => r.ok) ? BASE : null, results: LAST_PROBE };
  }
  LAST_DETECT_AT = Date.now();
  const list = apiCandidates();
  if (force) { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }
  const results = await Promise.all(list.map(probeOne));
  // 按候选顺序取第一个成功项（缓存命中项排在首位）
  const order = new Map(list.map((b, i) => [b, i]));
  results.sort((a, b) => (order.get(a.base) ?? 99) - (order.get(b.base) ?? 99));
  LAST_PROBE = results;
  const hit = results.find(r => r.ok);
  BASE = hit ? hit.base : (overrideBase() || pageDirBase());
  if (hit) { try { localStorage.setItem(CACHE_KEY, hit.base); } catch (e) {} }
  else { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }
  return { base: hit ? hit.base : null, results };
}
