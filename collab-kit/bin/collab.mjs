#!/usr/bin/env node
// Claude ↔ Codex 协作工具（文件交互为主，命令行互调为辅）。只用 Node 标准库。
//
//   node .ai-collab/bin/collab.mjs status                 各集进度 + 工单看板（同时写 LEDGER.md、BOARD.md）
//   node .ai-collab/bin/collab.mjs ledger                 重新生成总账 .ai-collab/LEDGER.md
//   node .ai-collab/bin/collab.mjs stage EP02 voice doing "说明" --by=Codex --wo=WO-…   更新总账某一步
//   node .ai-collab/bin/collab.mjs stage S1 - done "说明"                              更新系列级事项
//   node .ai-collab/bin/collab.mjs new EP02 animation "标题"   新建工单目录与 order.json 骨架（Claude 用）
//   node .ai-collab/bin/collab.mjs validate <文件或工单号>     按 schema 校验（按文件名判断类型）
//   node .ai-collab/bin/collab.mjs render <工单号>            由 order.json 生成 order.md（给人看）
//   node .ai-collab/bin/collab.mjs state <工单号> <状态> [说明]  写 STATUS.json（executing / blocked / needs-user …）
//   node .ai-collab/bin/collab.mjs closeout <工单号>             据用户或Claude明确批准写带批准者的收口回执
//   node .ai-collab/bin/collab.mjs sheet <工单号> [r轮次]      把回执里的视频抽帧拼图，供评审
//   node .ai-collab/bin/collab.mjs watch [秒]                有新的回执、提问、评审、裁决时打印一行（配合 Monitor 使用）
// 可选的命令行互调（不需要也能完整协作）：
//   node .ai-collab/bin/collab.mjs dispatch <工单号>          Claude 侧调用 codex exec 无交互执行该工单
//   node .ai-collab/bin/collab.mjs ask-claude <工单号> [query-rN.json]   Codex 侧调用 claude -p 裁决提问
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COLLAB = path.resolve(HERE, '..');
const ROOT = path.resolve(COLLAB, '..');
const WO_DIR = path.join(COLLAB, 'work-orders');
const SCHEMA_DIR = path.join(COLLAB, 'schemas');
const PROJECT_FILE = path.join(COLLAB, 'project.json');
const PROJECT = fs.existsSync(PROJECT_FILE) ? JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf8')).project : '{{PROJECT}}';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const woPath = (id) => path.join(WO_DIR, id);
const die = (m) => {
  console.error(m);
  process.exit(1);
};

/* ---------------- minimal JSON-schema validator (subset used by our schemas) ---------------- */
function validate(schema, value, at = '$', errs = []) {
  const t = schema.type;
  const typeOk = {
    object: (v) => v && typeof v === 'object' && !Array.isArray(v),
    array: Array.isArray,
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number',
    integer: Number.isInteger,
    boolean: (v) => typeof v === 'boolean',
  };
  if (t && !typeOk[t](value)) {
    errs.push(`${at}: 应为 ${t}`);
    return errs;
  }
  if ('const' in schema && value !== schema.const) errs.push(`${at}: 必须为 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: 取值 ${JSON.stringify(value)} 不在 ${schema.enum.join(' | ')}`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: 不符合格式 ${schema.pattern}`);
  if (typeof value === 'number' && 'minimum' in schema && value < schema.minimum) errs.push(`${at}: 不能小于 ${schema.minimum}`);
  if (t === 'array') {
    if (schema.minItems && value.length < schema.minItems) errs.push(`${at}: 至少 ${schema.minItems} 项`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`, errs));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${at}: 缺少字段 ${k}`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) validate(props[k], v, `${at}.${k}`, errs);
      else if (schema.additionalProperties === false) errs.push(`${at}: 多余字段 ${k}`);
    }
  }
  return errs;
}
const kindOf = (file) => {
  const b = path.basename(file);
  if (b === 'order.json') return 'work-order';
  if (/^user-decision-r\d+\.json$/.test(b)) return 'user-decision';
  if (/^closeout-r\d+\.json$/.test(b)) return 'closeout';
  for (const [prefix, kind] of [['report', 'work-report'], ['review', 'review'], ['query', 'query'], ['resolution', 'resolution'],
    ['experiment', 'experiment'], ['research', 'research-brief'], ['summary', 'delivery-summary']]) if (b.startsWith(prefix)) return kind;
  return null;
};
function validateFile(file) {
  const kind = kindOf(file);
  if (!kind) return [`无法从文件名判断类型：${path.basename(file)}`];
  let data;
  try {
    data = readJson(file);
  } catch (e) {
    return [`不是合法 JSON：${e.message}`];
  }
  return validate(readJson(path.join(SCHEMA_DIR, `${kind}.schema.json`)), data);
}

/* ---------------- state derivation ---------------- */
const rounds = (dir, prefix) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).map((f) => f.match(new RegExp(`^${prefix}-r(\\d+)\\.json$`))).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b)
    : [];
function stateOf(id, all) {
  const dir = woPath(id);
  const order = fs.existsSync(path.join(dir, 'order.json')) ? readJson(path.join(dir, 'order.json')) : null;
  const rep = rounds(dir, 'report');
  const rev = rounds(dir, 'review');
  const q = rounds(dir, 'query');
  const res = rounds(dir, 'resolution');
  const status = fs.existsSync(path.join(dir, 'STATUS.json')) ? readJson(path.join(dir, 'STATUS.json')) : null;
  const lastRep = rep.at(-1);
  const lastRev = rev.at(-1);
  // User decisions are transcribed from explicit instructions, never represented as Claude reviews.
  const decisions = rounds(dir, 'user-decision').map(n => readJson(path.join(dir, `user-decision-r${n}.json`)))
    .filter(d => d.actor === 'user' && d.work_order_id === id);
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const unresolved = q.filter(n => {
    const queryFile = path.join(dir, `query-r${n}.json`);
    const query = readJson(queryFile);
    const user = decisions.flatMap(d => d.query_resolutions ?? [])
      .filter(r => r.query_round === n && r.artifact_sha256 === digest(queryFile));
    const resolutionFile = path.join(dir, `resolution-r${n}.json`);
    const rulings = fs.existsSync(resolutionFile) ? readJson(resolutionFile).resolutions ?? [] : [];
    return query.queries.some(item => {
      const decision = user.filter(r => r.query_ids.includes(item.id)).at(-1)
        ?? rulings.filter(r => r.query_id === item.id).at(-1);
      return !decision || decision.decision === 'defer';
    });
  });
  const userApproval = lastRep ? decisions.flatMap(d => d.report_approvals ?? [])
    .filter(a => a.report_round === lastRep && a.artifact_sha256 === digest(path.join(dir, `report-r${lastRep}.json`))).at(-1) : null;
  const reviewFile = lastRep ? path.join(dir, `review-r${lastRep}.json`) : null;
  const claudeReview = reviewFile && fs.existsSync(reviewFile) ? readJson(reviewFile) : null;
  const reportStatus = lastRep ? readJson(path.join(dir, `report-r${lastRep}.json`)).status : null;
  const passed = v => v === 'pass' || v === 'pass_with_notes';
  // 2026-11-08 latest user rule: either explicit user approval OR Claude approval may close a report.
  const closurePending = !!lastRep && (passed(userApproval?.verdict) || passed(claudeReview?.verdict));
  let approval = null;
  let state;
  let who;
  if (unresolved.length) [state, who] = ['待裁决', 'Claude'];
  else if (lastRep) {
    if (userApproval && !passed(userApproval.verdict)) [state, who] = [userApproval.verdict === 'fail' ? '未通过' : '待修改', 'Codex'];
    else if (!passed(userApproval?.verdict) && claudeReview && !passed(claudeReview.verdict)) [state, who] = [claudeReview.verdict === 'fail' ? '未通过' : '待修改', 'Codex'];
    else if (reportStatus !== 'done' && (passed(userApproval?.verdict) || passed(claudeReview?.verdict))) [state, who] = ['部分结果已批准，工单未完成', 'Codex'];
    else if (passed(userApproval?.verdict) || passed(claudeReview?.verdict)) {
      [state, who] = ['已完成', '—'];
      const byUser = passed(userApproval?.verdict);
      const decisionRound = byUser ? rounds(dir, 'user-decision').filter(n => {
        const d = readJson(path.join(dir, `user-decision-r${n}.json`));
        return d.actor === 'user' && (d.report_approvals ?? []).some(a => a.report_round === lastRep && a.artifact_sha256 === digest(path.join(dir, `report-r${lastRep}.json`)) && passed(a.verdict));
      }).at(-1) : null;
      const artifact = byUser ? `user-decision-r${decisionRound}.json` : `review-r${lastRep}.json`;
      approval = {by: byUser ? 'user' : 'Claude', label: byUser ? '用户' : 'Claude', report_round: lastRep,
        report_sha256: digest(path.join(dir, `report-r${lastRep}.json`)), artifact, artifact_sha256: digest(path.join(dir, artifact))};
    }
    else if (reportStatus === 'partial') [state, who] = ['部分完成', 'Codex'];
    else if (reportStatus === 'needs-user') [state, who] = ['等用户', '用户'];
    else if (reportStatus === 'blocked') [state, who] = ['受阻', '用户/Claude'];
    else [state, who] = ['待评审', 'Claude'];
  } else [state, who] = ['待执行', 'Codex'];
  if (status && state !== '已完成' && !unresolved.length && !closurePending) {
    const later = [lastRep && `report-r${lastRep}`, lastRev && `review-r${lastRev}`].filter(Boolean)
      .every((f) => fs.statSync(path.join(dir, `${f}.json`)).mtimeMs <= fs.statSync(path.join(dir, 'STATUS.json')).mtimeMs);
    if (later) {
      const map = {executing: ['执行中', 'Codex'], blocked: ['受阻', '用户/Claude'], 'needs-user': ['等用户', '用户'], paused: ['暂停', '—']};
      if (map[status.state]) [state, who] = map[status.state];
    }
  }
  const deps = (order?.depends_on || []).filter((d) => all && all[d] !== '已完成');
  if (state === '待执行' && deps.length) [state, who] = [`等前置 ${deps.join(',')}`, '—'];
  return {id, order, state, who, approval, rounds: {report: rep.length, review: rev.length, query: q.length, resolution: res.length}};
}
function listIds() {
  return fs.existsSync(WO_DIR) ? fs.readdirSync(WO_DIR).filter((d) => /^WO-\d{8}-\d{3}$/.test(d)).sort() : [];
}
function board() {
  const ids = listIds();
  const first = Object.fromEntries(ids.map((id) => [id, stateOf(id, null).state]));
  const rows = ids.map((id) => stateOf(id, first));
  const lines = ['# 工单看板', '', `生成于 ${now()}（由 collab.mjs status 自动生成，请勿手改）`, '', '| 工单 | 集 | 阶段 | 标题 | 状态 | 轮到 | 收口批准者 |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.id} | ${r.order?.episode ?? ''} | ${r.order?.stage ?? ''} | ${r.order?.title ?? ''} | ${r.state} | ${r.who} | ${r.approval?.label ?? '—'} |`);
  fs.writeFileSync(path.join(COLLAB, 'BOARD.md'), lines.join('\n') + '\n', 'utf8');
  return rows;
}

/* ---------------- 12-episode ledger (总账) ---------------- */
function closeout(id) {
  const r = stateOf(id, null);
  if (r.state !== '已完成' || !r.approval) die('没有对应最新回执的明确批准，或尚有返工/未裁决提问，不能写收口文件。');
  const a = r.approval;
  const file = path.join(woPath(id), `closeout-r${a.report_round}.json`);
  const receipt = {project: PROJECT, work_order_id: id, report_round: a.report_round,
    approved_by: a.by, approved_by_label: a.label, approval_artifact: a.artifact, approval_sha256: a.artifact_sha256,
    report_artifact: `report-r${a.report_round}.json`, report_sha256: a.report_sha256,
    recorded_by: 'Codex', recorded_at: now(), summary: `${a.label}明确批准对应回执；Codex据批准记录收口，不是Codex自批。`};
  if (fs.existsSync(file)) die('收口回执已存在，先核对原记录，不覆盖。');
  writeJson(file, receipt);
  console.log(`已写 ${path.relative(ROOT, file)}；批准者：${a.label}`);
}
const LEDGER = path.join(COLLAB, 'ledger.json');
const SYM = {done: '✅', skip: '—', doing: '🔵', 'waiting-user': '🟡', 'waiting-claude': '🟣', 'waiting-codex': '🟠', blocked: '🔴', todo: '·'};
function currentStage(ep, pipeline) {
  const cur = pipeline.find((p) => !['done', 'skip'].includes(ep.stages[p.id]?.state));
  if (!cur) return {name: '全部完成', who: '—', next: '—'};
  const s = ep.stages[cur.id];
  const nxt = pipeline.find((p) => p.id === cur.next);
  const who = s.state === 'waiting-user' ? '用户' : s.state === 'waiting-claude' ? 'Claude' : s.state === 'waiting-codex' ? 'Codex' : cur.owner;
  return {name: `${cur.name}（${SYM[s.state] ?? ''}${s.state}）`, who, next: nxt ? `${nxt.name}（${nxt.owner}）` : '—', note: s.note};
}
const woLabel = (r) => (r ? r.state + (r.approval ? `·${r.approval.label}归口` : '') : '?');
function renderLedger() {
  const L = readJson(LEDGER);
  const woStates = Object.fromEntries(listIds().map((id) => [id, stateOf(id, null)]));
  const out = ['# 总计划与进度总账', '', `生成于 ${now()}；数据在 \`.ai-collab/ledger.json\`，用 \`node .ai-collab/bin/collab.mjs stage …\` 更新，请勿手改本页。`, ''];
  out.push('## 现在轮到谁', '');
  const todoSeries = L.series.filter((s) => !['done', 'skip'].includes(s.state));
  for (const s of todoSeries) out.push(`- **${s.id} ${s.name}**：${s.owner}（${s.state}）— ${s.note}`);
  for (const ep of L.episodes) {
    const c = currentStage(ep, L.pipeline);
    if (c.name !== '全部完成' && !ep.note.includes('不再修改')) out.push(`- **${ep.episode} ${ep.title}**：${c.name} → 轮到 **${c.who}**；完成后：${c.next}`);
  }
  out.push('', '## 系列级事项', '', '| 编号 | 事项 | 负责 | 状态 | 工单 | 说明 |', '|---|---|---|---|---|---|');
  for (const s of L.series) out.push(`| ${s.id} | ${s.name} | ${s.owner} | ${SYM[s.state] ?? ''} ${s.state} | ${s.wo.map((w) => `${w}（${woLabel(woStates[w])}）`).join('<br>')} | ${s.note} |`);
  out.push('', '## 逐集进度', '', `图例：${Object.entries(SYM).map(([k, v]) => `${v} ${L.states[k] ?? k}`).join('　')}`, '');
  out.push(`| 集 | 片名 | ${L.pipeline.map((p) => p.name).join(' | ')} | 当前步骤 | 轮到 | 下一步 |`);
  out.push(`|${'---|'.repeat(L.pipeline.length + 5)}`);
  for (const ep of L.episodes) {
    const c = currentStage(ep, L.pipeline);
    out.push(`| ${ep.episode} | ${ep.title} | ${L.pipeline.map((p) => SYM[ep.stages[p.id]?.state] ?? '·').join(' | ')} | ${c.name} | ${c.who} | ${c.next} |`);
  }
  out.push('', '## 各集备注与工单', '');
  for (const ep of L.episodes) {
    const items = L.pipeline.filter((p) => ep.stages[p.id]?.note || ep.stages[p.id]?.wo?.length).map((p) => {
      const s = ep.stages[p.id];
      const wos = s.wo.length ? `；工单 ${s.wo.map((w) => `${w}（${woLabel(woStates[w])}）`).join('、')}` : '';
      return `  - ${p.name}：${s.state}${s.by ? ` · ${s.by}` : ''}${s.note ? ` · ${s.note}` : ''}${wos}（${s.updated}）`;
    });
    out.push(`- **${ep.episode} ${ep.title}**（${ep.narrator}）${ep.note ? '：' + ep.note : ''}`, ...items);
  }
  out.push('', '## 流程：每一步谁做、做到什么算完成、完成后交给谁', '', '| 步骤 | 负责 | 完成标准 | 完成后 |', '|---|---|---|---|');
  for (const p of L.pipeline) out.push(`| ${p.name} | ${p.owner} | ${p.done_when} | ${p.next ? L.pipeline.find((x) => x.id === p.next).name : '—'} |`);
  fs.writeFileSync(path.join(COLLAB, 'LEDGER.md'), out.join('\n') + '\n', 'utf8');
  return L;
}
function setStage(epId, stageId, state, args) {
  const L = readJson(LEDGER);
  const by = (args.find((x) => x.startsWith('--by=')) || '').slice(5);
  const wo = (args.find((x) => x.startsWith('--wo=')) || '').slice(5);
  const note = args.filter((x) => !x.startsWith('--')).join(' ');
  if (!L.states[state]) die(`状态应为：${Object.keys(L.states).join(' | ')}`);
  let target;
  if (/^S\d+$/.test(epId)) {
    target = L.series.find((s) => s.id === epId);
    if (!target) die('没有该系列事项');
  } else {
    const ep = L.episodes.find((e) => e.episode === epId);
    if (!ep) die('没有该集');
    if (!ep.stages[stageId]) die(`步骤应为：${L.pipeline.map((p) => p.id).join(' | ')}`);
    target = ep.stages[stageId];
    if (by) target.by = by;
  }
  target.state = state;
  if (note) target.note = note;
  if (wo && !target.wo.includes(wo)) target.wo.push(wo);
  target.updated = now().slice(0, 10);
  writeJson(LEDGER, L);
  renderLedger();
  console.log(`已更新 ${epId}${stageId ? ' ' + stageId : ''} → ${state}`);
}

/* ---------------- render order.md ---------------- */
function render(id) {
  const o = readJson(path.join(woPath(id), 'order.json'));
  const L = [];
  L.push(`# ${o.id} · ${o.title}`, '', `- 集：${o.episode}　阶段：${o.stage}　优先级：${o.priority ?? 'normal'}　预算上限：¥${o.budget_cny}`);
  if (o.depends_on?.length) L.push(`- 前置工单：${o.depends_on.join('、')}`);
  L.push(`- 目标：${o.objective}`, '', '## 必读', '');
  o.inputs.forEach((i) => L.push(`- \`${i.path}\`：${i.purpose}`));
  L.push('', '## 步骤', '');
  o.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
  if (o.shots.length) {
    L.push('', '## 镜头', '', '| 镜号 | 类别 | 引擎 | 备用 | 依据 | 说明 |', '|---|---|---|---|---|---|');
    o.shots.forEach((s) => L.push(`| ${s.shot_id} | ${s.category} | ${s.engine} | ${s.fallback_engine ?? ''} | ${s.spec_ref} | ${s.notes ?? ''} |`));
  }
  L.push('', '## 交付', '');
  o.outputs.forEach((x) => L.push(`- \`${x.path}\`：${x.description}`));
  L.push('', '## 验收', '');
  o.acceptance.forEach((a) => L.push(`- [ ] ${a}`));
  if (o.gates.length) {
    L.push('', '## 必须停下等待的关口', '');
    o.gates.forEach((g) => L.push(`- **${g.kind}**：${g.description}`));
  }
  if (o.forbidden.length) {
    L.push('', '## 禁止', '');
    o.forbidden.forEach((f) => L.push(`- ${f}`));
  }
  if (o.notes) L.push('', '## 备注', '', o.notes);
  L.push('', '---', '', `完成后：在本目录写 \`report-rN.json\`（格式见 \`.ai-collab/schemas/work-report.schema.json\`），运行 \`node .ai-collab/bin/collab.mjs validate ${o.id}\` 自检。有疑问写 \`query-rN.json\`。`);
  fs.writeFileSync(path.join(woPath(id), 'order.md'), L.join('\n') + '\n', 'utf8');
}

/* ---------------- contact sheets for review ---------------- */
function sheet(id, roundArg) {
  const dir = woPath(id);
  const r = roundArg ? Number(String(roundArg).replace(/\D/g, '')) : rounds(dir, 'report').at(-1);
  if (!r) die('没有回执，无法出拼图');
  const rep = readJson(path.join(dir, `report-r${r}.json`));
  const vids = [...rep.outputs.map((o) => o.path), ...rep.shots.map((s) => s.file).filter(Boolean)]
    .filter((p) => /\.(mp4|mov|webm|mkv)$/i.test(p))
    .map((p) => (path.isAbsolute(p) ? p : path.join(ROOT, p)))
    .filter((p, i, a) => fs.existsSync(p) && a.indexOf(p) === i);
  const outDir = path.join(dir, `review-material-r${r}`);
  fs.mkdirSync(outDir, {recursive: true});
  const made = [];
  for (const v of vids) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v], {encoding: 'utf8'});
    const dur = Number(probe.stdout.trim()) || 6;
    const fps = Math.max(0.2, 6 / dur);
    const out = path.join(outDir, path.basename(v).replace(/\.\w+$/, '') + '_sheet.jpg');
    const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', v, '-vf', `fps=${fps.toFixed(3)},scale=480:-1,tile=3x2`, '-frames:v', '1', out], {encoding: 'utf8'});
    if (ff.status === 0) made.push(path.relative(ROOT, out));
    else console.error('ffmpeg 失败', v, ff.stderr.slice(0, 200));
  }
  console.log(made.length ? made.join('\n') : '没有可抽帧的视频');
}

/* ---------------- optional CLI bridges ---------------- */
function dispatch(id) {
  const order = path.join(woPath(id), 'order.md');
  if (!fs.existsSync(order)) render(id);
  const prompt = [
    `执行协作工单 ${id}。`,
    `先读根目录 AGENTS.md 的“协作工单”一节和 .ai-collab/README.md，再读 .ai-collab/work-orders/${id}/order.md 与 order.json。`,
    '按步骤执行；遇到工单里的关口（用户确认、预算、下载、样片审看）就停下，把状态写成 needs-user。',
    `完成或停下时，在 .ai-collab/work-orders/${id}/ 写 report-rN.json（N 为下一轮次），并运行 node .ai-collab/bin/collab.mjs validate ${id} 自检。`,
    '有疑问或异议写 query-rN.json，不要自行改动方案区 Claude总导演/。',
  ].join('\n');
  const last = path.join(woPath(id), 'codex-last-message.md');
  console.log(`调用 codex exec 执行 ${id}（工作目录 ${ROOT}）…`);
  const r = spawnSync(`codex exec -C "${ROOT}" --skip-git-repo-check -s workspace-write -o "${last}" -`, {
    input: prompt, encoding: 'utf8', shell: true, stdio: ['pipe', 'inherit', 'inherit'], timeout: 6 * 3600 * 1000,
  });
  console.log('codex 退出码', r.status, '；最后一条消息：', last);
}
function askClaude(id, queryFile) {
  const dir = woPath(id);
  const qn = queryFile ? Number(queryFile.replace(/\D/g, '')) : rounds(dir, 'query').at(-1);
  if (!qn) die('没有提问文件');
  const schema = fs.readFileSync(path.join(SCHEMA_DIR, 'resolution.schema.json'), 'utf8');
  const prompt = [
    fs.readFileSync(path.join(COLLAB, 'prompts', 'resolve.md'), 'utf8'),
    '', '## 工单', fs.readFileSync(path.join(dir, 'order.json'), 'utf8'),
    '', '## 提问', fs.readFileSync(path.join(dir, `query-r${qn}.json`), 'utf8'),
  ].join('\n');
  const r = spawnSync('claude', ['-p', '--json-schema', schema, '--output-format', 'json', '--permission-mode', 'plan', '--add-dir', ROOT], {
    input: prompt, encoding: 'utf8', cwd: ROOT, timeout: 1800 * 1000, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) die('claude 调用失败：' + (r.stderr || '').slice(0, 500));
  const env = JSON.parse(r.stdout);
  const out = env.structured_output ?? JSON.parse(env.result);
  const file = path.join(dir, `resolution-r${qn}.json`);
  writeJson(file, out);
  const errs = validateFile(file);
  console.log(errs.length ? `已写 ${file}，但校验有问题：\n${errs.join('\n')}` : `已写 ${file}（校验通过）`);
}

/* ---------------- watch ---------------- */
function watch(sec = 10) {
  const seen = new Map();
  const scan = (announce) => {
    for (const id of listIds()) {
      for (const f of fs.readdirSync(woPath(id))) {
        if (!/^(report|review|query|resolution|experiment|user-decision|closeout)-r\d+\.json$|^STATUS\.json$/.test(f)) continue;
        const m = fs.statSync(path.join(woPath(id), f)).mtimeMs;
        const key = `${id}/${f}`;
        if (announce && seen.get(key) !== m) console.log(`${now()} ${key}`);
        seen.set(key, m);
      }
    }
  };
  scan(false);
  setInterval(() => scan(true), sec * 1000);
}

/* ---------------- main ---------------- */
const [cmd, ...a] = process.argv.slice(2);
switch (cmd) {
  case 'status': {
    const rows = board();
    const L = fs.existsSync(LEDGER) ? renderLedger() : null;
    if (L) {
      console.log('== 各集进度（详见 .ai-collab/LEDGER.md）');
      for (const s of L.series.filter((x) => !['done', 'skip'].includes(x.state))) console.log(`${s.id}  ${s.name}  ${s.state}  负责:${s.owner}`);
      for (const ep of L.episodes) {
        const c = currentStage(ep, L.pipeline);
        if (c.name !== '全部完成' && !ep.note.includes('不再修改')) console.log(`${ep.episode}  ${c.name}  轮到:${c.who}  完成后:${c.next}`);
      }
      console.log('');
    }
    console.log('== 工单（详见 .ai-collab/BOARD.md）');
    for (const r of rows) console.log(`${r.id}  ${(r.order?.episode ?? '').padEnd(6)} ${(r.order?.stage ?? '').padEnd(10)} ${r.state.padEnd(8)} 轮到:${r.who} 收口批准:${r.approval?.label ?? '—'}  ${r.order?.title ?? ''}`);
    if (!rows.length) console.log('暂无工单');
    break;
  }
  case 'ledger':
    renderLedger();
    console.log('已生成', path.join(COLLAB, 'LEDGER.md'));
    break;
  case 'closeout':
    closeout(a[0]);
    break;
  case 'stage':
    // stage EP02 voice doing "说明" --by=Codex --wo=WO-...   或   stage S1 - done "说明"
    if (!a[0] || !a[1] || !a[2]) die('用法：stage <EP02|S1> <步骤id|-> <状态> [说明] [--by=Claude|Codex|用户] [--wo=工单号]');
    setStage(a[0], a[1] === '-' ? null : a[1], a[2], a.slice(3));
    break;
  case 'new': {
    const [episode, stage, ...t] = a;
    if (!episode || !stage) die('用法：new <EP02|SERIES> <stage> "标题"');
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const n = listIds().filter((x) => x.includes(day)).length + 1;
    const id = `WO-${day}-${String(n).padStart(3, '0')}`;
    fs.mkdirSync(woPath(id), {recursive: true});
    writeJson(path.join(woPath(id), 'order.json'), {
      project: PROJECT, id, title: t.join(' ') || '（待填）', episode, stage, priority: 'normal', objective: '',
      inputs: [], steps: [''], shots: [], outputs: [{path: '', description: ''}], acceptance: [''], gates: [], budget_cny: 0, depends_on: [], forbidden: [],
    });
    console.log(id);
    break;
  }
  case 'validate': {
    const target = a[0];
    if (!target) die('用法：validate <文件|工单号>');
    const files = /^WO-\d{8}-\d{3}$/.test(target)
      ? fs.readdirSync(woPath(target)).filter((f) => f.endsWith('.json') && kindOf(f)).map((f) => path.join(woPath(target), f))
      : [path.resolve(target)];
    let bad = 0;
    for (const f of files) {
      const errs = validateFile(f);
      console.log(`${errs.length ? '✗' : '✓'} ${path.relative(ROOT, f)}`);
      errs.forEach((e) => console.log('    ' + e));
      bad += errs.length ? 1 : 0;
    }
    process.exit(bad ? 2 : 0);
  }
  case 'render':
    render(a[0]);
    console.log('已生成', path.join(woPath(a[0]), 'order.md'));
    break;
  case 'state':
    if (!a[0] || !a[1]) die('用法：state <工单号> <executing|blocked|needs-user|paused> [说明]');
    writeJson(path.join(woPath(a[0]), 'STATUS.json'), {state: a[1], note: a.slice(2).join(' '), at: now()});
    console.log('已更新', a[0], a[1]);
    break;
  case 'sheet':
    sheet(a[0], a[1]);
    break;
  case 'watch':
    watch(Number(a[0]) || 10);
    break;
  case 'dispatch':
    dispatch(a[0]);
    break;
  case 'ask-claude':
    askClaude(a[0], a[1]);
    break;
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, arr) => i < arr.findIndex((x) => x.startsWith('import'))).join('\n'));
}
