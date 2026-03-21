# [情侣飞行棋](https://lovegame.hoothin.com)

这是 lovegame.hoothin.com 的[配置文件仓库](https://hoothin.github.io/QingLv)。

`lovegame.hoothin.com` 是一个支持联机的情侣飞行棋网页游戏。本仓库用于存储情侣飞行棋的 `.txt` 和 `.dat` 配置文件，并通过 GitHub Actions 自动生成 GitHub Pages 页面，方便按时间排序浏览、分页查看和一键导入配置。

## 什么是情侣飞行棋？

情侣飞行棋（Couples Ludo）是经典飞行棋的浪漫升级版，专为情侣、夫妻和亲密伴侣设计。与普通飞行棋不同，棋盘上的每一个格子都藏着精心设计的互动任务，从真心话大冒险到亲密肢体接触，旨在打破隔阂、升温感情。无论是热恋期的情侣，还是相伴多年的夫妻，都能在游戏中找到新鲜感和刺激。游戏支持自定义事件库，您可以根据双方的接受程度和喜好，量身定制专属的私密挑战。无需下载 APP，打开网页即可即时体验，是约会之夜、异地恋互动的完美助攻神器。

## 游戏规则

1. 准备阶段：双方或多人选择代表自己的颜色棋子，还可以选择不同的事件库模式，如热恋、私密、异地恋等。
2. 掷骰子：玩家轮流掷骰子，只有掷出 `6` 点，棋子才能从基地起飞进入棋盘。
3. 行进与任务：根据骰子点数移动棋子。当棋子停留在某个格子上时，必须执行该格子对应的事件任务，如“亲吻对方”“说出真心话”等。
4. 特殊机制：如果掷出 `6` 点，可以额外再掷一次。如果棋子移动终点刚好有对方棋子，可以将对方撞回基地，可视规则设定开启或关闭。
5. 胜利条件：率先将所有棋子移动到棋盘中心终点的玩家获胜。赢家通常可以获得输家提供的特别奖励，由双方自行约定。

## 常见问题

### 异地恋可以玩吗？

当然可以。我们特别设计了“异地恋模式”事件库，包含专门针对视频通话场景的互动任务。利用内置的联机功能，双方只需进入同一个房间号，即可实时同步棋盘状态，跨越距离感受彼此的陪伴。

### 需要下载 APP 吗？

不需要。情侣飞行棋是基于网页的在线游戏（Web App），支持电脑、平板和手机浏览器直接访问。您可以将网页添加到手机主屏幕，享受类似 APP 的全屏流畅体验，既不占内存又方便快捷。

## 仓库功能

- 把 `.txt` 或 `.dat` 配置文件放进 `configs/` 后，GitHub Actions 会自动生成静态 HTML 页面
- 页面按配置文件最近一次提交时间倒序排列
- 自动生成分页导航
- 每个配置卡片都可以一键跳转到 `https://lovegame.hoothin.com/ludo?import=xxxxxx.txt`
- 同时保留配置文件原文件下载入口

## 目录

- `configs/`: 存放配置文件
- `scripts/generate-site.mjs`: 静态页面生成脚本
- `.github/workflows/deploy-pages.yml`: 构建并发布 GitHub Pages
- `qinglv.config.json`: 站点标题、分页数量、导入链接规则等配置

## 使用方式

1. 把新的配置文件上传到 `configs/`，例如 `configs/my-lovegame.txt` 或 `configs/my-lovegame.dat`
2. 提交并推送到 GitHub
3. GitHub Actions 会自动执行构建
4. 构建完成后，GitHub Pages 页面会自动更新

## 可调配置

编辑 `qinglv.config.json`：

- `perPage`: 每页展示数量
- `gameBaseUrl`: 点击卡片后跳转的游戏地址
- `importParamMode`: 导入参数模式

`importParamMode` 支持：

- `filename`: 跳转为 `?import=xxxxxx.txt` 或 `?import=xxxxxx.dat`
- `file-url`: 跳转为 `?import=https://你的页面地址/configs/xxxxxx.txt` 或 `?import=https://你的页面地址/configs/xxxxxx.dat`
