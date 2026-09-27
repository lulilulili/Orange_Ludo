# Orange Ludo Cocos Client

这是 Orange Ludo 的 Cocos Creator 3.8.8 竖屏客户端。当前开发版不依赖正式美术资源，启动后会程序化绘制棋盘、棋子、骰子、倒计时与状态提示，可以直接验证一名玩家对三名 AI 的完整经典飞行棋流程。

## 打开项目

1. 启动 `D:\Personal_Work\Tools\CocosCreator\3.8.8\CocosCreator.exe`。
2. 打开本目录 `D:\Personal_Work\阿桐的飞行棋\apps\client`。
3. 打开 `assets/scenes/main.scene`，点击预览。

客户端只负责输入、显示和动画。掷骰、合法移动、叠机、阻挡、连续三个六、撞机与胜负都由共享 TypeScript 包负责，因此未来替换正式 UI 或增加货运模式时无需复制规则。

## 当前交互

- 红方是玩家，黄、蓝、绿三方由 AI 控制。
- 点击“掷骰子”，然后点击带白色光圈的可移动棋子。
- 每个操作限时 15 秒；超时后自动掷骰或自动选择合法棋子。
- 画面按 750 × 1334 竖屏设计，使用固定宽度适配不同手机。

## 目录约定

- `assets/scripts/GameApp.ts`：Cocos 表现层入口。
- `assets/scenes/main.scene`：最小启动场景。
- `../../packages/game-core`：规则、棋盘和 AI。
- `../../packages/game-session`：人机回合编排与超时策略。
- `../../packages/client-model`：竖屏布局、视图状态和动画提示。

`library`、`local`、`temp`、`build`、`profiles` 都是本机生成目录，不提交 Git。
