# 本地人机对局控制器 v0.1

`@orange-ludo/game-session` 将纯规则内核组织成可供客户端调用的完整本地对局。第一版默认为红方真人、其余三方 AI，但控制权列表是可配置的。

## 调用流程

1. Cocos 页面读取 `session.state` 和 `session.legalPieceIds`。
2. 真人回合调用 `rollForHuman` 或 `selectPieceForHuman`。
3. AI 回合每次调用一次 `performAiAction`。
4. 页面每次只处理一个 `SessionStep`，播完其事件动画后再请求下一步。
5. 真人 15 秒未操作时调用 `handleTimeout`。

## 超时策略

- 等待掷骰子：自动掷骰子。
- 等待选棋：使用与基础 AI 相同的透明合法策略自动选棋。
- 超时只替玩家完成当前一个原子操作，不连续托管后续回合。

## 可回放性

骰子和 AI 平局选择共用注入的随机源。保存随机种子与 `SessionAction` 序列后，可在后续版本中生成对局回放。
