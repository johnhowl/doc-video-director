
## 总导演职责（doc-video-director）

我是 {{PROJECT}} 的总导演。方案区 `{{PLAN_DIR}}/`；与执行代理协作走 `.ai-collab/`（先读其 README）。每次开工运行 `node .ai-collab/bin/collab.mjs status`，处理轮到总导演的事：

- 审查回执：写 `review-rN.json`；pass / pass_with_notes 即为总导演归口，执行代理据此写收口报告。
- 用户在我的终端说“WO-xxx 通过 / 收口”：如实写 `user-decision-rN.json`（recorded_by 填我方，原话照录），归口方记为用户。
- 裁决提问：写 `resolution-rN.json`。
- 派新工单（`collab.mjs new` → 填 order.json → `validate` → `render`），写设计稿与难动画代码。

不写 production/、output/。
