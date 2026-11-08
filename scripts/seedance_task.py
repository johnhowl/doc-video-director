#!/usr/bin/env python3
"""Seedance (Volcengine Ark) task helper: budget gate, submit, poll, download, ledger.

Standard library only. Reads the key from ARK_API_KEY and never prints it.

Usage:
  python seedance_task.py estimate --model mini --resolution 720p --duration 7
  python seedance_task.py submit --shot 04-02 --prompt-file p.txt --first f.png --last l.png \
      --duration 7 --out production/episode-02-v3/video/seedance --budget production/episode-02-v3/video/budget.json
  python seedance_task.py batch jobs.jsonl --out ... --budget ... [--workers 3]

budget.json (written by the user or the proxy agent after the user approves):
  {"approved_cny": 300, "note": "EP02 首批，用户 2026-11-08 批准"}
Spending is tracked in <out>/tasks.jsonl. A job whose estimate would exceed the
approved budget is refused before any network call.
"""
import argparse, base64, concurrent.futures as cf, json, mimetypes, os, sys, time, urllib.request, urllib.error
from pathlib import Path

BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
MODELS = {
    "2.0": "doubao-seedance-2-0-260128",
    "fast": "doubao-seedance-2-0-fast-260128",
    "mini": "doubao-seedance-2-0-mini-260615",
    "2.5": "doubao-seedance-2-5-260628",
}
# Rough CNY per second (text/image input). From Ark public 5-second examples; verify in console.
EST_PER_SEC = {
    ("2.0", "480p"): 0.47, ("2.0", "720p"): 1.0, ("2.0", "1080p"): 2.5,
    ("fast", "480p"): 0.38, ("fast", "720p"): 0.8,
    ("mini", "480p"): 0.24, ("mini", "720p"): 0.5,
    ("2.5", "720p"): 1.5, ("2.5", "1080p"): 3.5,
}
# CNY per million output tokens (no video input) for actual-cost logging.
TOKEN_PRICE = {("2.0", "480p"): 46, ("2.0", "720p"): 46, ("2.0", "1080p"): 51,
               ("fast", "480p"): 37, ("fast", "720p"): 37,
               ("mini", "480p"): 23, ("mini", "720p"): 23}


def key():
    k = os.environ.get("ARK_API_KEY")
    if not k:
        sys.exit("ARK_API_KEY is not set in this process. Ask the user to load it; do not paste it into files.")
    return k


def http(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}") from None


def image_url(src):
    if src.startswith(("http://", "https://", "asset://", "data:")):
        return src
    p = Path(src)
    mime = mimetypes.guess_type(p.name)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()


def estimate(model, res, dur):
    rate = EST_PER_SEC.get((model, res))
    if rate is None:
        sys.exit(f"No price estimate for {model}/{res}; add one after checking the console.")
    return round(rate * dur, 2)


def spent(out):
    f = Path(out) / "tasks.jsonl"
    total = 0.0
    if f.exists():
        for line in f.read_text(encoding="utf8").splitlines():
            rec = json.loads(line)
            if rec.get("status") in ("succeeded", "submitted", "running"):
                total += rec.get("actual_cny") or rec.get("estimate_cny") or 0
    return total


def log(out, rec):
    Path(out).mkdir(parents=True, exist_ok=True)
    with open(Path(out) / "tasks.jsonl", "a", encoding="utf8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def next_version(out, shot):
    v = 1
    while (Path(out) / f"{shot}_v{v}.mp4").exists():
        v += 1
    return v


def download(url, dest):
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())


def run_job(job, out, budget_file, lock=None):
    model = job.get("model", "mini")
    res = job.get("resolution", "720p")
    dur = int(job["duration"])
    est = estimate(model, res, dur)
    approved = json.loads(Path(budget_file).read_text(encoding="utf8"))["approved_cny"]
    if spent(out) + est > approved:
        return {"shot": job["shot"], "status": "refused_budget", "estimate_cny": est,
                "message": f"would exceed approved budget {approved} CNY; ask the user"}
    text = job.get("prompt") or Path(job["prompt_file"]).read_text(encoding="utf8")
    content = [{"type": "text", "text": text}]
    for role, k in (("first_frame", "first"), ("last_frame", "last")):
        if job.get(k):
            content.append({"type": "image_url", "image_url": {"url": image_url(job[k])}, "role": role})
    for r in job.get("refs", []):
        content.append({"type": "image_url", "image_url": {"url": image_url(r)}, "role": "reference_image"})
    body = {"model": MODELS[model], "content": content, "ratio": job.get("ratio", "16:9"),
            "duration": dur, "resolution": res, "generate_audio": bool(job.get("audio", False)),
            "watermark": False, "return_last_frame": True}
    v = next_version(out, job["shot"])
    base_rec = {"shot": job["shot"], "version": v, "model": model, "resolution": res,
                "duration": dur, "estimate_cny": est, "inputs": {k: job.get(k) for k in ("first", "last", "refs")},
                "prompt": text, "time": time.strftime("%Y-%m-%d %H:%M:%S")}
    try:
        task = http("POST", BASE, body)
    except RuntimeError as e:
        rec = dict(base_rec, status="submit_failed", error=str(e))
        log(out, rec)
        return rec
    tid = task["id"]
    while True:
        time.sleep(15)
        st = http("GET", f"{BASE}/{tid}")
        s = st.get("status")
        if s in ("succeeded", "failed", "cancelled", "expired"):
            break
    rec = dict(base_rec, task_id=tid, status=s)
    if s == "succeeded":
        mp4 = Path(out) / f"{job['shot']}_v{v}.mp4"
        download(st["content"]["video_url"], mp4)
        rec["file"] = str(mp4)
        if st["content"].get("last_frame_url"):
            lf = Path(out) / f"{job['shot']}_v{v}_lastframe.png"
            download(st["content"]["last_frame_url"], lf)
            rec["last_frame"] = str(lf)
        toks = (st.get("usage") or {}).get("completion_tokens")
        price = TOKEN_PRICE.get((model, res))
        if toks and price:
            rec["tokens"] = toks
            rec["actual_cny"] = round(toks * price / 1e6, 2)
    else:
        rec["error"] = st.get("error")
    log(out, rec)
    return rec


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("estimate")
    e.add_argument("--model", default="mini", choices=MODELS)
    e.add_argument("--resolution", default="720p")
    e.add_argument("--duration", type=int, required=True)
    s = sub.add_parser("submit")
    s.add_argument("--shot", required=True)
    s.add_argument("--prompt-file", required=True)
    s.add_argument("--first"); s.add_argument("--last")
    s.add_argument("--ref", action="append", default=[])
    s.add_argument("--model", default="mini", choices=MODELS)
    s.add_argument("--resolution", default="720p")
    s.add_argument("--ratio", default="16:9")
    s.add_argument("--duration", type=int, required=True)
    s.add_argument("--audio", action="store_true")
    s.add_argument("--out", required=True); s.add_argument("--budget", required=True)
    b = sub.add_parser("batch")
    b.add_argument("jobs"); b.add_argument("--out", required=True); b.add_argument("--budget", required=True)
    b.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    if a.cmd == "estimate":
        print(json.dumps({"estimate_cny": estimate(a.model, a.resolution, a.duration)}))
    elif a.cmd == "submit":
        job = {"shot": a.shot, "prompt_file": a.prompt_file, "first": a.first, "last": a.last, "refs": a.ref,
               "model": a.model, "resolution": a.resolution, "ratio": a.ratio, "duration": a.duration, "audio": a.audio}
        print(json.dumps(run_job(job, a.out, a.budget), ensure_ascii=False, indent=2))
    else:
        jobs = [json.loads(l) for l in Path(a.jobs).read_text(encoding="utf8").splitlines() if l.strip()]
        with cf.ThreadPoolExecutor(max_workers=min(a.workers, 3)) as ex:
            for rec in ex.map(lambda j: run_job(j, a.out, a.budget), jobs):
                print(json.dumps({k: rec.get(k) for k in ("shot", "version", "status", "actual_cny", "estimate_cny", "error", "message")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
