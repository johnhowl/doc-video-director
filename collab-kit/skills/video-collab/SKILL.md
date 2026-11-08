---
name: video-collab
description: 本工程 Claude 与 Codex 的工单协作流程。处理工单、写回执、提问、更新总账时使用。
---
# 视频制作协作
1. 先读 `.ai-collab/README.md`（分工、文件约定、权限分级、传话口令）。
2. 运行 `node .ai-collab/bin/collab.mjs status` 看总账和工单，找轮到自己的那张。
3. Codex：读 order.md 执行；遇关口用 `collab.mjs state <工单> needs-user` 停下；完成写 report-rN.json 并 `validate`；有疑问写 query-rN.json；用 `collab.mjs stage` 更新总账自己负责的步骤。
4. Claude：看回执与拼图（`collab.mjs sheet`），写 review-rN.json 或 resolution-rN.json；派新工单（`collab.mjs new` 后填 order.json，再 `validate`、`render`）。
5. 审查与归口：用户或 Claude 任一方批准最新回执即可收口；Claude 批准写 review-rN.json，用户批准由其说话所在终端的一方写 user-decision-rN.json；Codex 用 `collab.mjs closeout` 写收口报告，并在完成汇报里说明是用户归口还是 Claude 归口。
6. 制作方法按 `doc-video-director skill`；规则按 `{{PLAN_DIR}}/PROJECT.md`。
