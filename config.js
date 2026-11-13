/* config.js — 站点默认配置（在线版与离线版共用，唯一配置入口）。
 * 用记事本修改后刷新页面即可生效，无需重新打包。
 *   mode          static = 纯前端本机存储（GitHub Pages / 离线包默认）；
 *                 server = 启用项目自带 Python/Node 后端的双写同步（自建服务器时使用）
 *   parentPin     家长监督面板 PIN
 *   storageKey    浏览器本地存储键名（在线版与离线版一致，便于导出/导入迁移）
 *   defaultLayout 默认键盘：laptop 笔记本 / us_ansi 全尺寸 / uk_iso 英式
 *   defaultTrack  默认课程轨道：english 初中英语键位进阶 / basic 基础指法阶梯
 */
window.__TYPING_LAB_CONFIG__ = {
  mode: 'static',
  parentPin: '2468',
  storageKey: 'typing-lab.state.v1',
  defaultLayout: 'laptop',
  defaultTrack: 'english',
};
