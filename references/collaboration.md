# 双代理协作细则

改编自 AgentCollab_Template（Claude / Codex 指挥—执行模板），换成视频制作场景：去掉 git 依赖与 diff 评审，评审对象改成交付物（抽帧拼图、验收报告），任务类型换成幻灯片、动画、现实视频、配音、剪辑、验收、环境搭建。

## 交互方式

1. **文件交互（主方式）**：用户同时开着两个代理终端。总导演把工单写进 `.ai-collab/work-orders/`，执行代理写回执、提问、收口报告到同一目录。用户只在中间传一句话：
   - 对执行代理：“处理新工单”“继续 WO-xxx”“我已经下载完了”“WO-xxx 通过”
   - 对总导演：“看回执”“看提问”“派下一批工单”“WO-xxx 通过”
2. **自动提醒（可选）**：总导演用 `collab.mjs watch` 配合监视工具，回执一出现就开始审查。
3. **命令行互调（可选）**：`collab.mjs dispatch <工单>` 由总导演调用 `codex exec -C <工程> --skip-git-repo-check -s workspace-write` 无交互执行；`collab.mjs ask-claude <工单>` 由执行代理调用 `claude -p --json-schema …` 裁决提问（实测 Claude 侧结构化结果在 `structured_output` 字段）。适合用户不在场时的小工单；有关口的工单仍会停下等用户。

## 文件与格式

每张工单一个目录，文件名带轮次，**一律新写，不改旧文件**（旧文件是证据，带哈希的批准依赖它不变）。格式在 `.ai-collab/schemas/`，写完用 `collab.mjs validate <工单号>` 自检。

| 文件 | 谁写 | 用途 |
|---|---|---|
| order.json / order.md | 总导演 | 工单；order.md 由 `collab.mjs render` 生成给人看 |
| STATUS.json | 执行 | `collab.mjs state <工单> executing / blocked / needs-user / paused` |
| report-rN.json | 执行 | 回执 |
| query-rN.json / resolution-rN.json | 执行 / 总导演 | 提问与裁决 |
| review-rN.json | 总导演 | 审查 |
| user-decision-rN.json | 用户说话所在终端的一方 | 用户原话照录，绑定所批文件的 SHA256 |
| closeout-rN.json | 执行 | 收口报告，写明归口方 |
| experiment-rN.json | 执行 | 对比试验（如本地与云端试点） |

总账 `ledger.json` → `LEDGER.md`：每集 14 步的状态、谁在做、关联工单、完成后交给谁。各方只更新自己负责的步骤：`collab.mjs stage EP02 voice doing "说明" --by=Codex --wo=WO-…`；系列级事项：`collab.mjs stage S1 - done "说明"`。

## 审查与归口

- 用户和总导演都可以审查；**任一方**明确批准**最新**回执、且无未裁决提问，即可收口。执行代理不能自批；用户代理（子代理）不能归口。
- 总导演批准：`review-rN.json` 的 verdict 为 pass 或 pass_with_notes。
- 用户批准：用户在任一终端说“WO-xxx 通过 / 收口”（最好指明回执轮次），说话所在终端的一方写 `user-decision-rN.json`，原话照录，不能写成总导演的审查。
- 执行代理运行 `collab.mjs closeout <工单>` 写 `closeout-rN.json`（归口方、依据文件及哈希、对应回执及哈希），并在终端汇报“本工单由用户归口 / 由总导演归口”。
- 回执被批准后若改动，原批准作废；意见不一致时以用户结论为准。

## 权限分级

| 级别 | 执行代理怎么做 | 例子 |
|---|---|---|
| 常规 | 直接做 | 更新自己的执行状态、回执、提问、自己负责的总账步骤 |
| A 级 | 直接做，记入 FIXLOG.md | 渲染失败、编码参数、路径、按原设计重渲染、镜头时长 ±10% 对齐配音 |
| B 级 | 先写 query，等总导演裁决 | 改文案、画面设计、镜头类别、引擎分工、验收标准、事实内容、方案区文件、协作规则 |
| C 级 | 停下等用户 | 超预算、下载大模型、开通或充值账号、覆盖或删除受保护成片、替换发布目录、发布 |

**返工可以据理力争**：执行代理认为返工要求有误、不适用或遗漏上层问题时，写 query 并附原要求、时间码或文件位置、可重复证据、反例与建议；无争议部分继续，争议部分在裁决前保留产物，涉及花费或覆盖时停在提交前。没有规定的事项交总导演制定规则。

## 第一批工单样例（总导演用 `collab.mjs new` 建好后填写）

1. **熟悉协作流程**（SERIES · setup）：读 `.ai-collab/README.md`、AGENTS.md、PROJECT.md、LEDGER.md；运行 `collab.mjs status`；回执用自己的话复述：谁写什么文件、何时停下等用户、权限分级、怎么更新总账、怎么收口。验收：复述正确，工具能运行。
2. **环境清单与手动指导**（SERIES · setup）：按 `references/setup-checklist.md` 盘点本机，写一份给用户的清单（要下载的模型、要开通或确认的云端 key、要装的工具，每项写为什么需要、费用、步骤、做完怎么告诉执行代理），在终端里一次只给一步带用户操作；用户做完后核验（文件哈希、程序启动、key 最小请求）。关口：下载与开通由用户本人完成；不打印密钥。
3. **目录整理**（SERIES · cleanup，旧工程才需要）：盘点、引用扫描、写计划交用户确认，同盘整体移动、移动前后哈希比对、不删除。
4. **共享资产**（SERIES · assets）：风格板（用户批准）、幻灯片模板、片尾版权页、动画工程复制到制作区并装好依赖、人物登记。
5. **本地与云端试点**（SERIES · experiment）：比喻实物、人物背影、手部特写三类镜头，本地与云端同提示词对比，交用户定分工。
6. **每集制作**（EPNN · delivery）：从动画评审表到交付，关口：评审表、样音、样片、预算。
