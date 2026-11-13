# 打字小课堂 · 初中英语键位进阶

面向零基础学习者的打字练习网站。课程依据《初中英语打字练习·键位进阶系列》编排，
按「指法 → 字母 → 单词 → 句子 → 段落」五级递进，共 8 课 40 关；另保留原有
「基础指法阶梯」9 个阶段，两条轨道进度独立记录。

## 功能

| 能力 | 说明 |
| --- | --- |
| 分级课程 | 8 课 × 5 级 = 40 关，过关后解锁下一关；键位逐课累加 |
| 键盘布局 | 默认笔记本键盘；可切换 US ANSI / UK ISO，按键提示与指法分工随布局重绘 |
| 按次记录 | 每次练习记录时长、完成进度、练习内容、准确率、WPM、布局、关卡 |
| 家长监督 | `parent.html`，PIN 默认 `2468`，可查看明细并导出 CSV / JSON、导入备份 |
| 数据保存 | 纯静态（static）模式，全部记录存本机浏览器 localStorage，不上传、不联网 |
| 双轨进度 | 基础轨与英语轨分别记录，历史进度不会串轨 |

## 目录结构

```
index.html          练习端入口
parent.html         家长监督面板入口
config.js           唯一默认配置入口（在线/离线共用）
config.json         配置项说明（供查阅，站点运行不依赖它）
css/style.css       样式
js/*.js             ESM 源码模块
.nojekyll           让 GitHub Pages 跳过 Jekyll 构建
工具/                部署与验证辅助脚本（不属于站点运行资源）
README.md           本文件
部署到GitHub_步骤.txt
在线版本验证_说明.txt
```

## 默认配置（config.js）

```js
window.__TYPING_LAB_CONFIG__ = {
  mode: 'static',          // 纯前端本机模式，不发任何网络请求
  parentPin: '2468',       // 家长面板 PIN（本机校验）
  storageKey: 'typing-lab.state.v1',
  defaultLayout: 'laptop', // 默认笔记本键盘
  defaultTrack: 'english', // 默认进入「初中英语键位进阶」主线
};
```

## 部署到 GitHub Pages

见同目录 `部署到GitHub_步骤.txt`。仓库开启 Pages 后：

- 练习端：`https://<用户名>.github.io/<仓库名>/`
- 家长面板：`https://<用户名>.github.io/<仓库名>/parent.html`

## 本地运行

本仓库是纯静态站点，任意静态服务器均可。例如：

```bash
python -m http.server 8099
# 打开 http://127.0.0.1:8099/index.html
```

> 注意：ESM 模块在 `file://` 协议下会被浏览器 CORS 拦截，因此**不能直接双击 index.html**。
> 需要免联网双击打开的版本，请使用同批交付的 `初中英语打字练习_离线版.zip`
> （该版本已把 ESM 打包为经典脚本，并提供 `打开这里.html` 入口）。

## 验证

见同目录 `在线版本验证_说明.txt`。核心验证覆盖：分级课程与顺序锁定、
逐字练习、三套键盘布局切换、段落 Enter 换行、按次记录（时长/进度/内容）、
家长 PIN 与明细、刷新后持久化，共 26 项。

## 数据说明

- 记录按「浏览器 + 域名」隔离：线上站点与本地 `file://` 离线版的 localStorage 互不相通。
- 需要迁移记录时，用家长面板的「导出 JSON」→「导入备份」。
- 家长面板可导出 CSV 供 Excel 查看。
