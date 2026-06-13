---
date: 2026-06-13
commit: local
feature: 生图请求自动路由到管理端指定模型
impact: `/chat-run` 在识别到用户明确要求生成图片时，会临时把本次 bridge run 的实际 provider/model 切换到 Web UI 全局配置的生图目标；会话默认模型、后续普通聊天和 goal continuation 仍保留原来的文本模型选择。
---

新增 `imageGenerationRouting` Web UI 配置与提示词识别逻辑。`handleBridgeRun()` 现在会在 run 开始前判断是否命中生图请求；命中时仅覆盖本次实际执行的 model/provider、上下文估算和计费归属，不改写 session 持久化的默认模型选择。管理端新增可配置的全局生图路由面板，供超级管理员从已配置模型中指定生图目标。
