#!/usr/bin/env python3
"""Queue a ComfyUI workflow (API format) on a local ComfyUI server, wait, download outputs, log.

Standard library only. Works with any workflow exported via "Export (API)".

Example:
  python comfy_queue.py --workflow wan22_5b_api.json \
      --set 6.inputs.text="..." --set 3.inputs.seed=42 \
      --image first.png --image-node 56 \
      --out production/episode-02/video/local --shot 05-01

--set NODE.inputs.KEY=VALUE   override a node input (value parsed as JSON if possible)
--image / --image-node        upload a local image and point a LoadImage node at it
"""
import argparse, json, mimetypes, os, time, urllib.parse, urllib.request, uuid
from pathlib import Path


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def upload_image(server, path):
    boundary = uuid.uuid4().hex
    name = Path(path).name
    mime = mimetypes.guess_type(name)[0] or 'image/png'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
            f'Content-Type: {mime}\r\n\r\n').encode() + Path(path).read_bytes() + \
           f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{boundary}--\r\n'.encode()
    res = json.loads(http(f'{server}/upload/image', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'}))
    return res['name'] if not res.get('subfolder') else f"{res['subfolder']}/{res['name']}"


def apply_set(wf, spec):
    key, _, raw = spec.partition('=')
    node, _, rest = key.partition('.')
    parts = rest.split('.')
    try:
        val = json.loads(raw)
    except json.JSONDecodeError:
        val = raw
    tgt = wf[node]
    for p in parts[:-1]:
        tgt = tgt[p]
    tgt[parts[-1]] = val


def next_version(out, shot):
    v = 1
    while list(Path(out).glob(f'{shot}_local_v{v}.*')):
        v += 1
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workflow', required=True)
    ap.add_argument('--server', default='http://127.0.0.1:8188')
    ap.add_argument('--set', action='append', default=[])
    ap.add_argument('--image')
    ap.add_argument('--image-node')
    ap.add_argument('--out', required=True)
    ap.add_argument('--shot', required=True)
    ap.add_argument('--engine', default='local-comfyui')
    a = ap.parse_args()

    wf = json.loads(Path(a.workflow).read_text(encoding='utf8'))
    for s in a.set:
        apply_set(wf, s)
    if a.image:
        if not a.image_node:
            raise SystemExit('--image needs --image-node (the LoadImage node id)')
        wf[a.image_node]['inputs']['image'] = upload_image(a.server, a.image)

    client = uuid.uuid4().hex
    t0 = time.time()
    res = json.loads(http(f'{a.server}/prompt', json.dumps({'prompt': wf, 'client_id': client}).encode(), {'Content-Type': 'application/json'}))
    pid = res['prompt_id']
    while True:
        time.sleep(5)
        hist = json.loads(http(f'{a.server}/history/{pid}'))
        if pid in hist:
            entry = hist[pid]
            status = entry.get('status', {}).get('status_str', 'success')
            break
    Path(a.out).mkdir(parents=True, exist_ok=True)
    v = next_version(a.out, a.shot)
    files = []
    for node_out in entry.get('outputs', {}).values():
        for kind in ('videos', 'gifs', 'images'):
            for f in node_out.get(kind, []):
                q = urllib.parse.urlencode({'filename': f['filename'], 'subfolder': f.get('subfolder', ''), 'type': f.get('type', 'output')})
                ext = Path(f['filename']).suffix
                dest = Path(a.out) / f'{a.shot}_local_v{v}{"" if not files else "_" + str(len(files))}{ext}'
                dest.write_bytes(http(f'{a.server}/view?{q}'))
                files.append(str(dest))
    rec = {'shot': a.shot, 'version': v, 'engine': a.engine, 'workflow': a.workflow, 'overrides': a.set,
           'image': a.image, 'status': status, 'files': files, 'seconds': round(time.time() - t0, 1),
           'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'cost_cny': 0}
    with open(Path(a.out) / 'tasks.jsonl', 'a', encoding='utf8') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    print(json.dumps(rec, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
