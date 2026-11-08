# Seedance（火山方舟）使用说明

信息核对日期：2026-11-07。价格和模型以火山方舟控制台为准，开工前重新核对一次。

## 开通（用户本人操作，约 10 分钟）

两个入口不要混淆：

| 入口 | 网址 | 计费 | 适合 |
|---|---|---|---|
| **火山方舟（推荐）** | 官网 https://www.volcengine.com ，控制台 https://console.volcengine.com/ark | 按量付费（按 token），或买资源包 | 让 Codex 或 Claude Code 用接口批量生成，可记账、可自动化 |
| 即梦 | https://jimeng.jianying.com | 会员订阅制，网页手动生成 | 手动试玩；不能让代理自动调用 |

火山方舟开通步骤：

1. 在火山引擎官网注册账号，进入控制台完成**个人实名认证**（不实名，后面都开不了）。
2. 充值：开通 Seedance 2.0 系列要求**账户余额大于 200 元**，或购买 200 元档以上节省计划或资源包。余额是预存款，后续生成时扣，不是开通费。
3. 方舟控制台 →「开通管理」→ 视频生成模型 → 开通 **Doubao Seedance 2.0**（包括 2.0 / 2.0 Fast / 2.0 Mini）；图片生成模型里开通 **Doubao Seedream 5.0**（有人脸的首帧要用它）。开通后等一两分钟再调用，否则可能返回 403。
4. 方舟控制台 →「API Key 管理」（https://ark.volcengine.com/region:cn-beijing/apikey）→ 创建 API Key，当场复制保存。
5. 把 Key 设成环境变量 `ARK_API_KEY`，只放在用户自己的私密配置或当前进程里，**不要发给代理、不要写进项目文件**。
6. （可选）方舟体验中心 → 虚拟人像库：同意协议后可免费使用一万多个预置虚拟人像。

## 模型与价格（2026-11 公开示例价，人民币）

| 模型 | Model ID | 分辨率 | 5 秒 16:9 参考价 | 用途 |
|---|---|---|---|---|
| Seedance 2.0 | doubao-seedance-2-0-260128 | 480p/720p/1080p/4K | 480p ¥2.31 · 720p ¥4.97 · 1080p ¥12.39 | 人物表演、复杂运动 |
| Seedance 2.0 Fast | doubao-seedance-2-0-fast-260128 | 480p/720p | 约为 2.0 的八成 | 要快 |
| Seedance 2.0 Mini | doubao-seedance-2-0-mini-260615 | 480p/720p | 约为 2.0 的一半（720p 约 ¥2.5） | **默认**：多数镜头够用 |
| Seedance 2.5 | doubao-seedance-2-5-260628 | 见文档 | 明显更贵 | 只在 2.0 搞不定时用 |

- 计费按生成的 token，分辨率和时长是大头；720p 到 1080p 约贵一倍以上。默认 720p 生成，后期放大。
- 时长 4–15 秒；个人账号并发上限 3。
- 一集约 10 分钟，若其中约 4 分钟用 Seedance、按 1.5 倍重拍余量算，720p Mini 约 ¥200，720p 2.0 约 ¥360。

## 人脸规则 {#人脸}

Seedance 2.0 和 2.5 **不接受含写实人脸的首帧、尾帧或参考图**，GPT、Midjourney 等生成的写实人像也会被识别拦截，报错 `InputImageSensitiveContentDetected.PrivacyInformation`（提交前失败，不扣费）。换地址、压缩、改文件名都不能绕过，也不允许这样做。

合规路线（按推荐顺序）：

1. **无脸构图**：背影、手部、脚步、剪影、远景小人物、虚焦人物。纪录片里本来就大量使用，首选。GPT 图可直接当首尾帧。
2. **纯文生视频**：不传参考图，用文字描述人物。生成的视频及其尾帧图，在同账号 30 天内是“可信产物”，可作为下一个镜头的首帧，保持同一人物的连续性。
3. **Seedream 5.0 生成人像首帧**：同一方舟账号、30 天内、未经剪辑压缩的原始产物可被 Seedance 信任。直接用 Seedream 返回的原始文件或地址提交，或原样转存到火山 TOS；不要重新编码、裁切、修图。
4. **预置虚拟人像库**：用 `asset://<素材ID>` 作为 `reference_image`，提示词里用“图片1”指代。
5. 私域虚拟人像入库（需开通“高级创作权益包”，有免费入门档；要 AK/SK 和公网可访问的图片地址），工程量较大，非必要不用。

真实人物（包括用户本人）的肖像必须本人完成真人认证才能使用，本系列不使用真实人物肖像。

## 接口要点

- 创建任务：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`，请求头 `Authorization: Bearer $ARK_API_KEY`。
- 查询任务：`GET .../contents/generations/tasks/{id}`，状态为 `succeeded` 时，`content.video_url` 是视频地址（**24 小时内有效**，立即下载），`return_last_frame: true` 时另有 `content.last_frame_url`。
- 请求体主要字段：
  - `model`：Model ID
  - `content`：数组。文字 `{"type":"text","text":"…"}`；图片 `{"type":"image_url","image_url":{"url":"…"},"role":"first_frame|last_frame|reference_image"}`，url 可以是公网地址、`data:image/png;base64,…` 或 `asset://…`
  - `ratio`（如 `"16:9"`；2.5 的首帧类任务可能要求 `"adaptive"`）、`duration`（秒）、`resolution`（`"720p"` 等）
  - `generate_audio`（旁白片一般 `false`）、`watermark`（`false`）、`return_last_frame`（`true`）
- 官方 Python SDK 和示例见方舟文档“Seedance 2.0 系列教程”。本 skill 的 `scripts/seedance_task.py` 只用标准库调 REST。

## 常见报错

| 报错 | 原因 | 处理 |
|---|---|---|
| `InputImageSensitiveContentDetected.PrivacyInformation` | 输入图含人脸 | 按上面的人脸路线改，不要重试原图 |
| `OutputVideoSensitiveContentDetected` | 输出命中审核 | 改提示词或画面内容 |
| 403 | 刚开通、权限未同步，或未开通该模型 | 等一两分钟，检查开通管理 |
| 余额不足 | — | 停下告诉用户，不替用户充值；先用已有素材剪粗剪 |
| `InvalidParameter.TaskTypeMismatch` | 参数与任务类型不符（如 2.5 首帧任务的 ratio） | 按文档改参数 |
