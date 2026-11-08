# doc-video-director · 科教纪录片 AI 导演流程

一个给 **Codex** 和 **Claude Code** 用的 skill：把一份文案做成一部旁白类科教片或纪录片。

- **GPT 图像**出风格板、分镜草图和无人脸的首尾帧
- **本地模型（ComfyUI）**：空镜、比喻实物、缓慢运动和打样先用本地开源模型，重拍不花钱；下载前先按显存评估
- **视频生成按成本阶梯**：通义万相、Veo、Seedance（火山方舟）、muapi 等，从最便宜的试起，过审即用；Seedance 的人脸限制另有合规做法
- **Remotion / HyperFrames** 写代码做需要精确的科学机制动画、字卡、地图和图表
- **TTS**（如 ElevenLabs）配音并对齐字幕
- 四个子代理分阶段把关：**审核**（只找错）、**监督**（核对用户要求）、**用户代理**（预算内做常规决定）、**首映观众**（像第一次看的人一样复述和挑刺）

核心原则：**在便宜的阶段把错误拦住**。改文案几乎免费，重画一张图占额度，重拍一段视频按秒计费，所以每进入更贵的阶段前都要过一道关。

## 致谢

流程思路来自 EianLu 在 X 上发表的长文《Claude code/Codex+Seedance AI视频：从一个想法到成片的全流程》（https://x.com/EianLu/status/2118317430665613741）：导演、审核、监督、代理四角色，风格与人物设定卡，首尾帧，七段式视频提示词，成片由全新代理复审，以及经验文件。

本仓库按科教纪录片的需要重新撰写和扩展，并非原文转载。主要改动：

- 去掉短剧专属内容，增加镜头分流：精确的科学结构一律用代码建模，AI 视频只负责人物、生活情境、比喻实物和氛围
- 补充 Seedance 的人脸素材规则（含 AI 生成写实人像也会被拦截）及合规做法
- 增加预算闸门、证据核对、目标观众视角和项目设定文件 `PROJECT.md`
- 去 AI 腔、无提示词痕迹的画面文字规则，以及重复镜头自动检测
- 附带只用 Python 标准库的 Seedance 任务脚本：预算检查、提交、轮询、下载、记账

## 安装

把整个目录放到代理能读到的 skills 目录：

| 代理 | 全局 | 项目内 |
|---|---|---|
| Codex | `~/.codex/skills/doc-video-director/` | `<项目>/.agents/skills/doc-video-director/` |
| Claude Code | `~/.claude/skills/doc-video-director/` | `<项目>/.claude/skills/doc-video-director/` |

```bash
git clone https://github.com/johnhowl/doc-video-director.git ~/.claude/skills/doc-video-director
```

然后在项目根目录写一份 `PROJECT.md`（模板见 `references/templates.md#项目设定`），对代理说“按 doc-video-director 流程做这一集”。

## 需要准备

- Seedance：火山方舟账号、实名认证、余额与 API Key，环境变量 `ARK_API_KEY`。开通步骤见 `references/seedance.md`。
- GPT 图像：Codex 内置 image_gen（随 ChatGPT 订阅），或 OpenAI API。
- 可选：Node.js + Remotion / HyperFrames（机制动画与排版），ffmpeg，TTS 账号。

## 文件

```
SKILL.md                    流程、角色、镜头分流、八个阶段与关口
references/templates.md     文案自查表、分镜表、七段式图像/视频提示词、三维镜头说明、PROJECT.md 模板
references/agents.md        审核、监督、用户代理、首映观众四个子代理的指令
references/seedance.md      开通方法、模型与价格、人脸规则、接口要点、常见报错
references/fallback-engines.md  视频引擎成本阶梯、升档与切换条件、接入要点
references/local-comfyui.md     本地模型 + ComfyUI：何时用、按显存选型、先评估再下载、完整安装、批量调用
scripts/seedance_task.py    Seedance 任务脚本（预算闸门 + 并发≤3 + 记账）
scripts/comfy_queue.py      本地 ComfyUI 工作流批量提交脚本（上传首帧、覆盖参数、下载结果、记账）
```

## 提醒

- 价格、模型 ID 和平台规则变化很快，开工前在火山方舟控制台核对一次。
- 不要试图绕过人脸检测，也不要在未经本人认证的情况下使用真实人物肖像。
- 发布时按平台要求声明 AI 生成内容。

## 许可

MIT
