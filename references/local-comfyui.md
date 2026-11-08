# 本地模型 + ComfyUI（成本阶梯第 0 档）

本地开源模型不花生成费，只耗电和时间。它的主要价值是**重拍不花钱**：适合打样、试提示词、简单镜头。画质和速度通常不如云端，所以它是阶梯的起点，不是终点。

## 什么时候用本地，什么时候用云端

旁白类科教片、纪录片和短剧不同：现实视频多是配合旁白的空镜、比喻和背影，画质要求不高，只要分镜符合场景。**这类片子可以把本地设为现实视频的默认引擎**，只把运动示范、需要人物跨镜头一致、本地两次不过审的镜头交给云端。前提是分镜按本地模型的长处设计：多用背影、剪影、远景、手部和物件，少用正脸和复杂动作。正式启用前，用“比喻实物 / 人物背影 / 手部特写”三类镜头各做一条本地与云端对比，交用户定分工。

| 适合本地 | 交给云端 |
|---|---|
| 空镜、环境、天空、城市远景 | 人物表演、表情、复杂肢体动作（运动示范） |
| 比喻实物的慢变化（鞋带头散开、书签滑走、花园延时） | 同一人物跨多个镜头保持一致 |
| 缓慢运镜的氛围镜头、显微风格空镜 | 需要 1080p 质感的“门面镜头” |
| 正式生成前的打样：试构图、试提示词、给用户看方向 | 本地连续两次不过审的镜头 |
| 首帧图：本地图像模型（如基于 Qwen-Image、FLUX 的模型）替代付费生图 | 时间紧、来不及让显卡跑几个小时 |

经验值：本地 5B 级视频模型在 16GB 显卡上，5 秒 720p 约 5–10 分钟；一集几十个简单镜头可以放夜里批量跑。云端最便宜一档每 5 秒不到 1 元，所以本地省下的钱有限，**别为了省钱硬把难镜头留在本地**。

## 先评估，再下载（硬性规则）

视频模型和文本编码器动辄十几到几十 GB。**下载前必须先完成评估，并把总下载量报给用户确认**，不能先下大模型再发现跑不动。

1. 核实硬件：显卡型号与显存、计算能力（新架构需要对应 CUDA 版本的 PyTorch，例如 RTX 50 系需要 CUDA 12.8 以上编译的版本）、系统内存（卸载权重主要吃内存，32GB 是下限，64GB 以上宽裕）、磁盘剩余。
2. 查本机已有：是否装过 ComfyUI、已有哪些模型（文本编码器、VAE 常可复用）。
3. 查公开实测：同档显存显卡上的耗时与显存峰值、文件大小（从模型仓库接口核实，不凭记忆）。
4. 选一个模型、一种精度，列出每个文件的地址、大小、SHA256，写成评估文件交用户。
5. 用户确认后，**给出下载命令让用户自己执行**（或经用户明确同意后代为下载）。

## 按显存选型（2026-11 的开源视频模型，以实测为准）

| 显存 | 推荐 | 备注 |
|---|---|---|
| 8GB | Wan 2.2 TI2V-5B（GGUF Q4–Q6）或 Wan 2.1 1.3B（480p） | 慢；1.3B 画质明显差一档 |
| 12GB | Wan 2.2 TI2V-5B（GGUF Q8） | 720p 可用 |
| **16GB** | **Wan 2.2 TI2V-5B（GGUF Q8，峰值约 9–11GB）** | 余量足；14B 与 HunyuanVideo 1.5 能跑但吃紧且慢（480p 约 11–20 分钟） |
| 24GB | Wan 2.2 A14B（FP8）或 5B 原版 | 开源里画质最好 |
| 32GB 以上 | Wan 2.2 A14B 720p、LTX-2 系列 | |

Wan 2.2 TI2V-5B 没有官方 FP8 文件，省显存靠 GGUF；Q8 与原版几乎无差别，不建议压到 Q5 以下。输出 1280×704、24fps，一次约 5 秒。

## 安装（Windows 示例，按实际路径改）

推荐**完整安装**：git 拉取 ComfyUI 源码，建独立 Python 虚拟环境，装与显卡匹配的 PyTorch。便于固定版本、升级和让代理通过本地接口调用。（便携版 `ComfyUI_windows_portable_nvidia.7z` 也可以，但用户指定完整安装时不要用便携版。）

```powershell
$ROOT = "D:\Local-AI\video"                         # 放在项目目录之外
New-Item -ItemType Directory -Force $ROOT | Out-Null; Set-Location $ROOT
git clone --branch v0.44.0 https://github.com/comfyanonymous/ComfyUI.git   # 版本号在评估时核实
$C = "$ROOT\ComfyUI"; Set-Location $C
py -3.13 -m venv .venv                                # 用本机已有的 Python 3.12/3.13
$PY = "$C\.venv\Scripts\python.exe"
& $PY -m pip install --upgrade pip
# PyTorch：按显卡选 CUDA 版本。RTX 50 系（sm_120）需要 cu128 或更新；先于 requirements 安装
& $PY -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
& $PY -m pip install -r requirements.txt              # 国内慢可加 -i https://pypi.tuna.tsinghua.edu.cn/simple
& $PY -c "import torch;print(torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0), torch.cuda.get_arch_list())"
git clone https://github.com/city96/ComfyUI-GGUF "$C\custom_nodes\ComfyUI-GGUF"
& $PY -m pip install -r "$C\custom_nodes\ComfyUI-GGUF\requirements.txt"

$HF = "https://huggingface.co"                      # 国内慢可改 https://hf-mirror.com
New-Item -ItemType Directory -Force "$C\models\unet","$C\models\text_encoders","$C\models\vae" | Out-Null
curl.exe -L -C - -o "$C\models\unet\Wan2.2-TI2V-5B-Q8_0.gguf" "$HF/QuantStack/Wan2.2-TI2V-5B-GGUF/resolve/main/Wan2.2-TI2V-5B-Q8_0.gguf"
curl.exe -L -C - -o "$C\models\text_encoders\umt5_xxl_fp8_e4m3fn_scaled.safetensors" "$HF/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
curl.exe -L -C - -o "$C\models\vae\wan2.2_vae.safetensors" "$HF/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors"
Get-FileHash "$C\models\unet\*.gguf","$C\models\text_encoders\umt5*","$C\models\vae\wan2.2*" -Algorithm SHA256
& $PY "$C\main.py" --listen 127.0.0.1 --port 8188    # 浏览器打开 http://127.0.0.1:8188
```

- PyTorch 官方源慢时，可从镜像（如阿里云 `mirrors.aliyun.com/pytorch-wheels/cu128/`）下载对应 Python 版本的三个 whl 再本地安装。
- 正式项目里，ComfyUI 版本号、模型文件 SHA256 要在评估时从仓库接口核实后写死。
- 下载总量 = PyTorch 与依赖（约 3.7GB）+ 模型文件；评估文件里要列清楚，交用户确认。

## 下载后：校验与实测

1. 文件 SHA256 与评估表一致；ComfyUI 启动无 CUDA 报错，日志显示识别到显卡。
2. 打开官方模板“Wan 2.2 5B 文/图生视频”，把“Load Diffusion Model”换成“Unet Loader (GGUF)”指向 Q8 文件；1280×704、121 帧、24fps、20 步。
3. 选一个本集的简单镜头实测：记录耗时、显存峰值、内存峰值（写入 PERFORMANCE）；同一提示词用云端第 1 档生成一条，两条放在一起交用户看。
4. 用户认可才启用为第 0 档；否则停用，不再下载其他模型。

## 批量生成：ComfyUI 本地接口

在 ComfyUI 里把调好的工作流用“Export (API)”另存为 JSON，再用 `scripts/comfy_queue.py` 批量提交：

```bash
python comfy_queue.py --workflow wan22_5b_api.json \
  --set 6.inputs.text="一根白色鞋带……" --set 3.inputs.seed=42 \
  --image first_frame.png --image-node 56 \
  --out production/episode-02/video/local --shot 05-01
```

- `--set 节点号.inputs.参数=值` 覆盖工作流里的提示词、种子、帧数等；节点号看导出的 JSON。
- `--image` 把首帧图上传到 ComfyUI 并填进指定的“Load Image”节点。
- 结果下载到 `--out`，文件名 `<镜号>_local_v1.mp4`，并在 `tasks.jsonl` 追加一条（`engine: local-comfyui`）。
- 本地生成显卡占满，期间不要并行跑别的显卡任务（三维渲染、编码），可以交替排队。

## 后期衔接

- 24fps → 成片帧率：短空镜可直接让剪辑软件按时间重采样；运动明显的镜头用光流补帧或保持 24fps 段落，避免抖动。
- 720p → 1080p：lanczos 放大加轻度锐化，与云端片段统一调色。
- 超过 5 秒的镜头：用上一段的最后一帧作为下一段首帧接续。
- 片尾 AI 生成声明写明实际用到的本地模型。
