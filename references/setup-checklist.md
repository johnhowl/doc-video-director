# 环境与依赖清单

执行代理的任务是**盘点 → 列清单 → 一步一步指导用户自己装和开通 → 核验**。下载、安装、开通账号、充值都由用户本人操作；代理给命令、检查结果、做最小连通测试，不打印任何密钥。

## 一、什么装在哪：整机共用与每个工程

| 内容 | 放哪里 | 原因 |
|---|---|---|
| 显卡驱动、Python、Node、Git、ffmpeg / ffprobe、aria2、Chrome | 整机一次 | 各工程共用的基础工具 |
| ComfyUI + 它自己的 Python 虚拟环境 + 插件 | 整机共用一套（如 `F:\Local-AI\video\ComfyUI`） | 所有视频工程调用同一服务；Python 依赖与系统隔离 |
| 本地模型文件（GGUF、文本编码器、VAE） | 整机共用的模型目录（ComfyUI 的 `models/`） | 不是 Python 包，跨工程复用，不随工程复制 |
| PyTorch 等 ComfyUI 的 Python 依赖 | ComfyUI 的 `.venv` 里 | 不污染系统 Python；升级只影响这一套 |
| HyperFrames 命令行 | 用户全局或项目锁定版本 | 命令行入口可共用 |
| Remotion、React、three.js 等库 | **每个工程锁定版本**（`package.json` + 锁文件） | 全局安装不等于工程能 import；锁版本保证渲染一致 |
| 代理的 skill（本 skill、HyperFrames、Remotion 等） | 用户的 skill 目录 | 已有的不重复下载 |
| 工单、预算、素材来源、输出 | 各工程 | 属于制作记录 |

## 二、盘点（执行代理先做，只读）

- 显卡型号、显存、驱动版本、计算能力（`nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv`）；系统内存；各盘剩余空间。
- `node -v`、`python --version`、`git --version`、`ffmpeg -version`、`aria2c --version`、Chrome 路径。
- 是否已有 ComfyUI（找 `main.py` 与 `models/`），已有模型清单。
- 环境变量是否存在（只看有没有，不看值）：`DASHSCOPE_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_GEMINI_BASE_URL`、`ARK_API_KEY`、`MUAPI_API_KEY`、TTS 的 key。
- 网络：`huggingface.co`、`hf-mirror.com`、`download.pytorch.org`、`github.com` 能否访问；git 是否配置了已失效的代理（`git config --global --get http.proxy`）。

## 三、本地视频模型（第 0 档，可选）

先按 `local-comfyui.md` 评估显存、速度和下载量，用户同意后再给命令。16GB 显存推荐 Wan 2.2 TI2V-5B（GGUF Q8，约 13.5GB）。

1. **ComfyUI 完整安装**：`git clone --branch <固定版本> --depth 1 https://github.com/Comfy-Org/ComfyUI.git`，核对提交哈希；`python -m venv .venv`；PyTorch 按显卡选 CUDA 版本（RTX 50 系需要 cu128 以上），**先于** `requirements.txt` 安装；`ComfyUI-GGUF` 插件；启动后确认识别显卡。
2. **模型下载**：把文件、大小、SHA256、官方与镜像地址写成清单（格式见 `download-manifest.example.json`），让用户运行
   `powershell -NoProfile -ExecutionPolicy Bypass -File <skill>/scripts/download-assets.ps1 -Manifest 清单.json -ModelRoot <ComfyUI目录> -DownloadRoot <下载缓存> [-Source Mirror] [-Proxy http://127.0.0.1:端口]`
   并行下载、断点续传、逐个校验 SHA256；失败就重跑同一条命令续传。
3. **核验**：三个文件哈希一致；ComfyUI 启动日志识别显卡、GGUF 节点可用；用一个 5 秒镜头实测耗时与显存峰值。

## 四、项目依赖

- 动画工程：复制 `templates/remotion-3d/` 到工程，`npm install`（版本已在 package.json 锁定），`node render.mjs --stills` 出静帧验证。多个工程可共用一份安装：把依赖装在共享目录，用 `REMOTION_NODE_MODULES` 指过去。
- HyperFrames：按其 skill 说明安装并固定版本；`hyperframes check` 通过。
- 可选：`@react-three/drei`、`@react-three/postprocessing`（景深、泛光），装前查与 fiber / three 版本的兼容性。
- 重复镜头检测：工程内的 Python 虚拟环境装 `imagehash`、`scikit-image`。

## 五、云端 key（按需开通，用户本人操作）

| 服务 | 变量 | 何时需要 | 核验 |
|---|---|---|---|
| 通义万相（阿里云百炼 DashScope） | `DASHSCOPE_API_KEY` | 云端第 1 档；新号有免费额度 | 查询可用模型或提交 1 条最短任务 |
| Google Gemini / Veo | `GEMINI_API_KEY`（代理时加 `GOOGLE_GEMINI_BASE_URL`） | 备选 | 列出可调用的视频型号 |
| 火山方舟 Seedance | `ARK_API_KEY` | 人物表演类镜头升档；开通需实名、余额门槛 | 查询任务列表或最短任务 |
| muapi | `MUAPI_API_KEY` | 比价与补位 | 账户信息接口 |
| TTS（如 ElevenLabs） | 按项目已有私密配置 | 配音 | 生成 1 句样音 |

规则：key 只放环境变量或用户的私密配置；代理只检查“是否存在”和最小请求的返回码；预算写进 `video/budget.json` 后才能提交付费任务。

## 六、常见坑

- **git 残留失效代理**：报“连接 127.0.0.1:某端口失败”时，查 `git config --global --get http.proxy`；只对单条命令加 `-c http.proxy=<当前可用端口>`，不改全局配置。
- **镜像 403 或中途断开**：保留已下载的文件和 `.aria2` 续传记录，换源（`-Source Official / Mirror`）或加代理后重跑同一条命令；不要删除重来，不要同时跑两份。
- **PowerShell 5.1 中文乱码**：读写 JSON 用 `-Encoding UTF8`；给命令行程序传中文前设 `$OutputEncoding = [Text.UTF8Encoding]::new($false)`。
- **PyTorch 装成了 CPU 版**：必须用对应 CUDA 版本的索引地址，且先于其他依赖安装；用 `torch.cuda.get_arch_list()` 确认包含显卡架构（如 `sm_120`）。
- **三维渲染出现空白帧**：浏览器 WebGL 上下文不够，降低渲染并发（大模型场景每次 1–2 个）。
