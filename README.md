<h1 align="center">情侣飞行棋 · QingLv</h1>

<p align="center">收集与分享情侣飞行棋事件配置，让每一局都有新体验。</p>

<p align="center">
  <a href="https://github.com/hoothin/QingLv/actions/workflows/deploy-pages.yml">
    <img src="https://github.com/hoothin/QingLv/actions/workflows/deploy-pages.yml/badge.svg" alt="GitHub Pages 构建状态">
  </a>
  <img src="https://img.shields.io/badge/配置格式-TXT%20%7C%20DAT-a855f7?style=flat" alt="支持 TXT 和 DAT 配置">
</p>

<p align="center">
  <a href="https://lovegame.hoothin.com"><strong>在线游戏</strong></a>
  ·
  <a href="https://hoothin.github.io/QingLv"><strong>浏览配置</strong></a>
  ·
  <a href="#贡献指南"><strong>贡献配置</strong></a>
</p>

本仓库维护 [情侣飞行棋](https://lovegame.hoothin.com) 的 `.txt` 和 `.dat` 配置文件，并通过 GitHub Actions 自动生成配置库页面、发布到 GitHub Pages，方便浏览、导入与分享。

<p align="center">
  <a href="https://lovegame.hoothin.com">
    <img src="./feixingqi.jpeg" alt="情侣飞行棋的棋盘与互动任务界面" width="760">
  </a>
  <br>
  <sub>游戏界面预览 · 棋盘与事件内容随所选配置变化</sub>
</p>

---

[开始使用](#开始使用) · [功能概览](#功能概览) · [贡献指南](#贡献指南) · [本地构建](#本地构建) · [配置参考](#配置参考) · [项目结构](#项目结构)

## 开始使用

1. 打开 [配置库](https://hoothin.github.io/QingLv)，按更新时间或名称浏览配置。
2. 点击配置卡片或 **立即导入**，跳转到游戏并导入所选配置。
3. 根据双方的喜好选择事件与规则，开始游戏。

游戏直接在浏览器中运行，无需安装 App；支持联机，也可用于异地互动。需要保存配置时，可通过卡片上的 **查看原文件** 入口访问并另行保存。

<details>
<summary><strong>了解基本玩法</strong></summary>

情侣飞行棋在经典飞行棋中加入互动任务，并支持自定义事件库。玩家轮流掷骰、移动棋子，在落点格子触发对应事件。

- **准备**：选择各自的棋子，以及适合本次游戏的事件配置。
- **行动**：轮流掷骰，按点数前进，并完成落点对应的互动任务。
- **规则**：起飞、额外掷骰、碰撞与胜利条件以游戏内设置为准，也可提前约定奖励。

</details>

## 功能概览

| 功能 | 说明 |
| --- | --- |
| 配置浏览 | 展示配置名称、摘要、更新时间与文件大小，支持 `.txt` 和 `.dat` 文件及子目录。 |
| 一键导入 | 点击卡片即可跳转到游戏，自动携带配置导入参数；同时保留原文件入口。 |
| 排序与分页 | 支持更新时间、名称的升序与降序；先对全部配置排序，再按页展示。 |
| 链接分享 | 排序方式保存在 URL 中，刷新、分享链接和翻页后均可保留。 |
| 自动发布 | 配置或站点变更推送到发布分支后，自动完成测试、构建与 GitHub Pages 部署。 |

## 贡献指南

欢迎分享新的事件配置，也欢迎改进配置库页面。

1. 准备可在游戏中正常导入的 `.txt` 或 `.dat` 文件，放入 [configs/](./configs/)。
2. 使用易于辨识的文件名，例如 `my-lovegame.dat`；文件名会用于生成卡片标题。
3. 运行 `npm test` 和 `npm run build`，确认检查与构建通过后提交 Pull Request。

变更合并到 `main` 或 `master` 后，[发布工作流](./.github/workflows/deploy-pages.yml) 会自动更新配置库，也支持在 GitHub Actions 页面手动触发。构建产物 `dist/` 无需提交。

## 本地构建

准备 **Git** 和 **Node.js 20 或更高版本**。项目仅使用 Node.js 内置模块，无需安装第三方依赖；当前 GitHub Actions 使用 Node.js 20。

```sh
git clone https://github.com/hoothin/QingLv.git
cd QingLv
npm test
npm run build
```

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行现有的排序与分页逻辑测试。 |
| `npm run build` | 读取配置文件，生成静态页面、排序数据和公共资源。 |

构建产物位于 `dist/`。本地预览时，请通过静态 HTTP 服务访问该目录，以便页面加载 `gallery-data.json` 中的排序数据。

## 配置参考

### 站点设置

编辑 [qinglv.config.json](./qinglv.config.json) 后重新构建即可生效。

| 字段 | 当前值 | 说明 |
| --- | --- | --- |
| `siteTitle` | `情侣飞行棋` | 页面标题。 |
| `siteDescription` | 见配置文件 | 首页介绍与页面描述。 |
| `gameBaseUrl` | `https://lovegame.hoothin.com/ludo` | 游戏导入入口，支持 HTTP 或 HTTPS 地址。 |
| `importParamMode` | `filename` | 导入参数模式，支持 `filename` 和 `file-url`。 |
| `perPage` | `12` | 每页展示数量，建议填写正整数。 |
| `locale` | `zh-CN` | 日期显示与名称排序使用的区域设置。 |
| `timeZone` | `Asia/Shanghai` | 更新时间的显示时区。 |

### 导入链接

构建脚本会向 `gameBaseUrl` 添加 `import` 参数：

| 模式 | `import` 参数值（编码前） |
| --- | --- |
| `filename` | 配置相对于 `configs/` 的路径，例如 `my-lovegame.dat`。 |
| `file-url` | 配置的公开地址，例如 `https://hoothin.github.io/QingLv/configs/my-lovegame.dat`。 |

默认 `filename` 模式的链接示例：

```text
https://lovegame.hoothin.com/ludo?import=my-lovegame.dat
```

两种模式均支持 `.txt` 和 `.dat` 文件，子目录路径会被保留，参数由脚本统一进行 URL 编码。

使用 `file-url` 模式自行部署时，请在构建环境中设置 `SITE_BASE_URL` 为配置库的公开根地址，例如 `https://hoothin.github.io/QingLv`。本仓库的 Actions 工作流会自动提供该值。

### 排序参数

配置库使用 `sort` 查询参数保存排序方式：

| 参数值 | 排序方式 |
| --- | --- |
| `updated-desc` | 最近更新优先，默认值。 |
| `updated-asc` | 最早更新优先。 |
| `name-asc` | 名称升序。 |
| `name-desc` | 名称降序。 |

例如：[按名称升序浏览配置](https://hoothin.github.io/QingLv/?sort=name-asc)。切换排序时会返回第 1 页；缺省或无效参数会回退到最近更新优先。

更新时间优先取自配置文件的最近一次 Git 提交；没有提交记录或无法读取时，使用文件修改时间。

## 项目结构

```text
QingLv/
├── configs/                          # 游戏配置文件，支持子目录
├── scripts/
│   ├── generate-site.mjs             # 静态站点生成器
│   ├── gallery-model.mjs             # 排序与分页逻辑
│   ├── gallery-model.test.mjs        # 现有逻辑测试
│   └── static/                       # 页面样式与浏览器脚本
├── .github/workflows/
│   └── deploy-pages.yml              # GitHub Pages 构建与发布
├── qinglv.config.json                # 站点与导入设置
├── package.json                      # 构建与测试命令
└── dist/                             # 自动生成的静态站点
```
