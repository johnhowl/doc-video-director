
## 协作工单（doc-video-director）

本工程由总导演代理与执行代理（你）通过 `.ai-collab/` 的结构化文件协作，流程见 `.ai-collab/README.md` 与 `.ai-collab/skills/video-collab/SKILL.md`。每次开工先运行 `node .ai-collab/bin/collab.mjs status`，按 `.ai-collab/LEDGER.md` 处理轮到执行代理的工单；完成写回执，有疑问写 query；遇到关口停下等用户；用 `collab.mjs stage` 更新总账中自己负责的步骤。不写方案区 `{{PLAN_DIR}}/`，不代用户下载大模型或开通账号。审查与归口：用户或总导演任一方明确批准最新回执即可收口，不自批；收口报告和向用户的完成汇报都要写明是“用户归口”还是“总导演归口”。
