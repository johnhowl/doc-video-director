// Render demo clips or stills of the animation scenes.
//
//   node render.mjs                    render every composition to out/<id>.mp4 (OUT_DIR overrides)
//   node render.mjs --only=EP02-04-DnaRepair,EP03-Muscle-row
//   node render.mjs --stills           one still per composition (fast visual check)
//   node render.mjs --final            no review labels (for the real cut)
//
// 依赖：默认用本目录 node_modules（先 npm install）；也可用环境变量 REMOTION_NODE_MODULES 指向共享安装。
// 资源（模型、贴图、draco 解码器）：默认本目录 public/，或用环境变量 PUBLIC_DIR 指定。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const first = (list) => list.find((p) => p && fs.existsSync(p));
const deps = first([process.env.REMOTION_NODE_MODULES, path.join(here, 'node_modules')]);
if (!deps) throw new Error('找不到 Remotion 依赖：先在本目录 npm install，或设置 REMOTION_NODE_MODULES。');
const publicDir = process.env.PUBLIC_DIR || path.join(here, 'public');
fs.mkdirSync(publicDir, {recursive: true});
const require = createRequire(path.join(path.dirname(deps), 'package.json'));
const {bundle} = require('@remotion/bundler');
const {renderMedia, renderStill, selectComposition, getCompositions} = require('@remotion/renderer');

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const stills = args.includes('--stills');
const final = args.includes('--final');
const outDir = process.env.OUT_DIR || path.join(here, stills ? 'out/stills' : 'out');
fs.mkdirSync(outDir, {recursive: true});
const browserExecutable = first([
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]);

console.log('deps:', deps);
console.log('public:', publicDir);
const serveUrl = await bundle({
  entryPoint: path.join(here, 'src/index.ts'),
  publicDir,
  webpackOverride: (c) => ({
    ...c,
    resolve: {...c.resolve, modules: [deps, ...((c.resolve && c.resolve.modules) || ['node_modules'])]},
  }),
});
const all = await getCompositions(serveUrl, {browserExecutable, chromiumOptions: {gl: 'angle'}});
const queue = all.filter((c) => !only || only.includes(c.id));
const jobs = Math.max(1, Math.min(Number(process.env.DEMO_JOBS || 4), queue.length));
const perJob = Math.max(2, Math.floor(os.cpus().length / jobs / 2));
let next = 0;
const log = [];
async function worker() {
  while (next < queue.length) {
    const c = queue[next++];
    const inputProps = {...c.defaultProps, showLabels: !final};
    const composition = await selectComposition({serveUrl, id: c.id, inputProps, browserExecutable, chromiumOptions: {gl: 'angle'}});
    const t0 = performance.now();
    if (stills) {
      const frames = [0.25, 0.55, 0.85].map((f) => Math.floor(composition.durationInFrames * f));
      for (const frame of frames) {
        await renderStill({serveUrl, composition, inputProps, frame, browserExecutable, chromiumOptions: {gl: 'angle'},
          output: path.join(outDir, `${c.id}_f${frame}.jpg`), imageFormat: 'jpeg', jpegQuality: 88});
      }
    } else {
      await renderMedia({serveUrl, composition, inputProps, browserExecutable, chromiumOptions: {gl: 'angle'},
        codec: 'h264', hardwareAcceleration: 'if-possible', videoBitrate: '20M', concurrency: c.id.includes('Muscle') ? 2 : perJob,
        outputLocation: path.join(outDir, `${c.id}${final ? '_final' : ''}.mp4`)});
    }
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    log.push({id: c.id, seconds: Number(s)});
    console.log('done', c.id, s + 's');
  }
}
await Promise.all(Array.from({length: jobs}, worker));
fs.writeFileSync(path.join(outDir, stills ? 'stills-log.json' : 'render-log.json'), JSON.stringify({deps, publicDir, jobs, perJob, log}, null, 2));
