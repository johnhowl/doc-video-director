# doc-video-director · 科教纪录片 AI 导演流程（含双代理协作）

一个给 **Claude Code** 和 **Codex** 用的 skill：把一份文案做成一部旁白类科教片或纪录片。制作流程与跨代理协作合在同一条 14 步流程里：

- **总导演代理**（如 Claude Code）写文案、逐镜设计稿、难的代码动画，派工单，审查回执；
- **执行代理**（如 Codex）生成首帧与视频、渲染幻灯片和动画、配音、剪辑、验收，指导用户下载模型和开通 key；
- 两边通过**你的工程里**的 `.ai-collab/` 结构化文件交接（工单、回执、提问、裁决、审查、收口报告），用户在中间传一句话；也可以只用一个代理跑同一流程。

> **本仓库里没有 `.ai-collab/` 文件夹，这是正常的。** 仓库里放的是模板 `collab-kit/`；在你自己的工程根目录运行一次 `scripts/init-collab.mjs`（见下文“快速开始”第 2 步），它会把 `collab-kit/` 复制成工程里的 `.ai-collab/`，再生成总账与工单目录。之后两个代理读写的都是工程里的 `.ai-collab/`，不是本仓库。

镜头分三类：**幻灯片**（HyperFrames）、**代码动画**（Remotion + React Three Fiber）、**现实视频**（本地 ComfyUI 模型优先，运动示范和复杂场景走云端：通义万相、Veo、Seedance、muapi，按成本阶梯）。审核、监督、用户代理、首映观众四种检查分阶段把关；用户或总导演任一方批准最新回执即可收口，执行代理写明归口方。

## 快速开始

```bash
# 1. 安装 skill（任选其一）
git clone https://github.com/johnhowl/doc-video-director.git ~/.claude/skills/doc-video-director   # Claude Code
git clone https://github.com/johnhowl/doc-video-director.git ~/.codex/skills/doc-video-director    # Codex

# 2. 在新工程根目录初始化协作区（生成 .ai-collab/、总账，并在 AGENTS.md / CLAUDE.md 追加协作说明）
node ~/.claude/skills/doc-video-director/scripts/init-collab.mjs --root . --project "作品名" --episodes 12 --plan-dir 方案

# 3. 查看进度与工单
node .ai-collab/bin/collab.mjs status
```

然后在方案目录写 `PROJECT.md`（模板见 `references/templates.md`），由总导演派第一张工单“熟悉协作流程”，对执行代理说“处理新工单”。

## 仓库与工程的对应关系

| 本仓库 | 运行 `init-collab.mjs` 后，你的工程里 |
|---|---|
| `collab-kit/bin/collab.mjs` | `.ai-collab/bin/collab.mjs`（status、stage、new、validate、closeout 等命令） |
| `collab-kit/schemas/` | `.ai-collab/schemas/`（工单、回执、提问、裁决、审查、收口的格式） |
| `collab-kit/README.md`、`prompts/`、`skills/video-collab/` | `.ai-collab/README.md` 等（项目名、方案目录已替换） |
| `collab-kit/snippets/` | 追加到工程根目录 `AGENTS.md`（执行侧）与 `CLAUDE.md`（总导演侧）末尾的协作说明 |
| （无） | 新生成：`.ai-collab/project.json`、`ledger.json` → `LEDGER.md`（每集 14 步总账）、`BOARD.md`（工单看板）、`work-orders/`（每张工单一个目录）、`FIXLOG.md` |

已存在的文件不会被覆盖；升级协作工具用 `init-collab.mjs --update-tools`（只覆盖 `bin/` 与 `schemas/`）。

## 目录

```
SKILL.md                         一条 14 步流程：角色、工单生命周期、镜头分流、关口、规矩
references/
  collaboration.md               双代理协作：文件约定、审查与归口、权限分级、传话口令、第一批工单样例
  setup-checklist.md             环境与依赖：整机共用 / 每工程分界、ComfyUI 与模型、npm、云端 key、常见坑
  animation.md                   代码动画：演示片流程、踩坑表、lemo-opuscar 风格库用法与许可
  templates.md                   文案自查、分镜表、七段式图像/视频提示词、PROJECT.md、免责声明
  agents.md                      审核、监督、用户代理、首映观众
  local-comfyui.md               本地模型：何时用、按显存选型、完整安装、校验、批量调用
  fallback-engines.md            视频引擎成本阶梯与切换条件
  seedance.md                    Seedance 开通、价格、人脸规则、接口
  download-manifest.example.json 模型下载清单示例（含 SHA256）
collab-kit/                      协作区模板：init-collab.mjs 把它复制到你工程里，成为 .ai-collab/（collab.mjs、格式定义、说明、协作 skill、测试）
templates/remotion-3d/           三维动画起步工程（画布、灯光、材质、三个示例场景、渲染脚本）
scripts/
  init-collab.mjs                初始化协作区（不覆盖已有文件；--update-tools 只升级工具）
  download-assets.ps1            按清单并行下载、断点续传、SHA256 校验（用户自己运行）
  comfy_queue.py                 向本地 ComfyUI 批量提交工作流
  seedance_task.py               Seedance 任务提交、轮询、下载、记账
```

## 需要准备

基础：Node 20+、Python 3.12/3.13、Git、ffmpeg、Chrome。按需：ComfyUI（本地视频）、云端 key（通义万相 / Google / 火山方舟 / muapi）、TTS 账号。完整清单与核验方法见 `references/setup-checklist.md`。下载大模型、开通或充值账号都由用户本人操作，代理只给命令和核验。

## 致谢

- 制作流程思路来自 EianLu 的《Claude code/Codex+Seedance AI视频：从一个想法到成片的全流程》（https://x.com/EianLu/status/2118317430665613741）。
- 协作机制改编自 AgentCollab_Template（https://github.com/johnhowl/AgentCollab_Template）。
- 代码动画风格可参考 lemo-opuscar（https://github.com/lemomo-ai/lemo-opuscar，代码 MIT，内容 CC BY 4.0）；本仓库未复制其内容，使用其风格提示词或素材时请按其许可署名。

以上均为重新撰写和改编，并非原文转载。

## 许可

MIT
