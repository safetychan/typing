/* runtime.js — 运行模式与默认配置（在线版 / 离线版共用同一份）。
 *
 * static（默认）：纯前端运行。练习记录写入浏览器 localStorage，家长面板直接读本机数据。
 *                 适用于 GitHub Pages 静态托管与 file:// 双击打开的离线包，全程不需要联网。
 * server        ：启用项目自带的 Python / Node 后端，恢复 localStorage + 服务器 JSON 双写同步
 *                 （自建服务器部署时使用；需后端已启动并正确反代 api/ 前缀）。
 *
 * 切换方式（无需改 JS），在 index.html / parent.html 的 <head> 中、模块脚本之前加一行：
 *   <script>window.__TYPING_LAB_CONFIG__ = { mode: 'server', parentPin: '2468' };</script>
 * 离线包与在线版均使用 static，因此两端行为一致。
 */
const CFG = (typeof window !== 'undefined' && window.__TYPING_LAB_CONFIG__) || {};

function detectMode() {
  if (CFG.mode === 'server' || CFG.mode === 'static') return CFG.mode;
  const declared = (typeof document !== 'undefined') &&
    document.documentElement && document.documentElement.dataset &&
    document.documentElement.dataset.runtime;
  return declared === 'server' ? 'server' : 'static';
}

export const RUNTIME = Object.freeze({
  mode: detectMode(),
  parentPin: String(CFG.parentPin || '2468'),
  storageKey: String(CFG.storageKey || 'typing-lab.state.v1'),
  appName: '打字小课堂 · 初中英语键位进阶',
  defaultLayout: String(CFG.defaultLayout || 'laptop'),
  defaultTrack: String(CFG.defaultTrack || 'english'),
});

export const IS_STATIC = RUNTIME.mode !== 'server';
