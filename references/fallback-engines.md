# 视频引擎与成本阶梯

原则：**同一个镜头，从最便宜的可用引擎开始试；过了审核就用，不过再升一档。** 旁白类片子一律选“无声”计费（声音后期统一配），能省一半左右。

## 成本阶梯（2026-11 公开原价，720p，每秒；美元按约 7.1 元折算；以控制台实际计费为准）

| 档 | 引擎 / 型号 | 每秒 | 适合 | 备注 |
|---|---|---|---|---|
| 0 | 本地开源视频模型（如通义万相开源版 Wan 2.2 TI2V-5B、Wan 2.1 1.3B，经 ComfyUI 或官方脚本） | 不花钱（只耗电和时间） | 简单镜头：空镜、比喻实物、缓慢运动、氛围 | 先评估再下载；安装与使用见 `local-comfyui.md`；复杂人物动作仍交给云端 |
| 1 | 通义万相 `wan2.6-i2v-flash` 无声 | ¥0.15（1080p ¥0.25） | 大多数现实视频镜头 | 阿里云百炼（北京）；有声版 ¥0.3；首帧生视频 |
| 2 | Veo 3.1 Lite 无声（Google Cloud） | $0.03 ≈ ¥0.21 | 备选 | Cloud 上为预览版，需 Google Cloud 账号；有声 $0.05 |
| 3 | Seedance 2.0 Mini | 约 ¥0.5 | 万相不过审时 | 火山方舟；不接受写实人脸首帧 |
| 4 | 通义万相 `wan2.6-i2v` / `wan2.6-t2v` | ¥0.6（1080p ¥1.0） | 动作更复杂的镜头 | 新号开通 90 天内各有 50 秒免费额度 |
| 4 | 通义万相 `wan2.7-i2v`、`wan3.0-video` | 查控制台 | 首尾帧、续写、更长时长 | wan3.0 最长 30 秒，可关声音；`wan3.0-video-prime` 为快速版 |
| 5 | Veo 3.1 Fast | 无声 $0.08 ≈ ¥0.57；有声 $0.10 ≈ ¥0.71 | 写实运动要求高 | Google Cloud 正式版；Gemini API 上改用 Gemini Omni Flash |
| 5 | Gemini Omni Flash（Gemini API） | 约 $0.10 ≈ ¥0.72 | 同上 | Gemini API 上 Veo 3.1 预览版的替代，声音默认开启 |
| 6 | Seedance 2.0 Fast / 2.0 | 约 ¥0.8 / ¥1.0（1080p 约 ¥2.5） | 人物表演、最难的镜头 | |
| 7 | Veo 3.1 标准 | 无声 $0.20 ≈ ¥1.4；有声 $0.40 ≈ ¥2.8 | 一般不用 | |

**muapi（聚合平台）**：一个 key 调用很多模型，适合比价和临时补位。部分老型号或轻量型号很便宜（如 Hailuo 02 标准、LTX、Vidu Q2 Turbo、Veo 3.1 Lite 等），但 Seedance 2 在 muapi 上比火山方舟直连贵。价格单位有按秒、有按条，用前在 muapi 页面核对；需要用户提供 `MUAPI_API_KEY`。

**估算**：一集约 4 分钟现实视频，按 1.5 倍重拍余量生成约 360 秒：全用万相 Flash 无声约 ¥54；全用 Seedance Mini 约 ¥180；全用 Seedance 2.0 约 ¥360。实际按阶梯混用，多数镜头在第 1 档解决。

## 本地模型（第 0 档）

- 完整说明（使用场景、按显存选型、完整安装命令、校验、批量调用）见 `local-comfyui.md`。
- 先查本机是否已装：常见位置为 ComfyUI 的 `models/diffusion_models`、`models/unet`、`models/text_encoders`、`models/vae`。没有就先评估、经用户确认后再下载，只放在用户指定的模型目录，不改全局环境。
- 16GB 显存的显卡跑 5B 级模型通常要用 fp8 或分块加载；先用一个 5 秒 720p 镜头实测耗时、显存峰值和画质，记入 PERFORMANCE。
- 本地模型同样过审核关；画质达不到成片要求的镜头直接升到第 1 档。
- 本地出的片段在 `tasks.jsonl` 里记 `engine: local-wan` 与模型版本（内部台账）；片尾只写“部分画面由 AI 生成”，不列模型名。

## 什么时候升档或换引擎

1. 同一镜头在当前档生成两次仍不过审核（动作变形、穿帮、脸部异常、质感差）→ 升一档。
2. 引擎拒绝输入（人脸、内容审核）→ 换引擎，不绕过审核。万相、Veo 对 AI 生成的写实人像首帧通常可以直接用；Seedance 需走文生视频、Seedream 首帧或虚拟人像（见 `seedance.md`）。
3. 账号余额不足、限流、故障 → 换同档或相邻档的其他引擎。
4. 每次升档或换引擎，由用户代理确认仍在预算内，并记入 REVIEW-LOG（原因、引擎、型号、花费）。

## 接入要点（以各家文档为准）

- **通义万相（阿里云百炼 DashScope）**：环境变量 `DASHSCOPE_API_KEY`。异步任务：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`（请求头 `X-DashScope-Async: enable`），再轮询 `GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}`。参数里设分辨率、时长、是否生成声音；首帧用图片地址或 base64。
- **Google**：Gemini API（`GEMINI_API_KEY`，有代理需 `GOOGLE_GEMINI_BASE_URL`）现在可用 Gemini Omni Flash；Veo 3.1 正式版（`veo-3.1-generate-001`、`veo-3.1-fast-generate-001`）与 Lite 在 Google Cloud（Gemini Enterprise Agent Platform），标注最早 2026-11-17 下线。Veo 时长固定 4/6/8 秒，1080p 只有 8 秒；人物生成受 `personGeneration` 策略限制。Google Flow 网页版按积分计费更便宜，但只能手动操作。
- **Seedance（火山方舟）**：见 `seedance.md` 与 `scripts/seedance_task.py`。
- **muapi**：Codex 已装 `muapi-seedance-2` skill，其他模型按 muapi 文档调用。
- OpenAI Sora 2 接口已于 2026-09-24 关闭，不再列入。

## 保持一致

- 用同一份七段式提示词和同一对首尾帧（按引擎要求调整格式与时长）。
- 生成后按相邻镜头校色，分辨率统一放大到成片规格；不同引擎的帧率统一转换到成片帧率。
- `video/tasks.jsonl` 记录 `engine`、`model`、`audio`、`resolution`、花费（内部台账，不进片尾和公开文件）；片尾只写一句“部分画面由 AI 生成”，不列引擎或助手名称（见 SKILL.md“署名”）。
- 同一场景尽量用同一引擎，避免同一段落画风跳变。
