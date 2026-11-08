#!/usr/bin/env node
// 在一个工程里初始化“总导演 + 执行代理”协作区（.ai-collab/）。只用 Node 标准库。
//
//   node init-collab.mjs --root <工程目录> --project "作品名" [--episodes 12 | --titles 片名清单.txt]
//                        [--plan-dir 方案] [--update-tools]
//
// - 复制 collab-kit 到 <root>/.ai-collab/，替换 {{PROJECT}} 与 {{PLAN_DIR}}；已存在的文件不覆盖。
// - --update-tools：只用新版覆盖 bin/ 与 schemas/（升级工具），不动工单、总账和说明。
// - 生成 project.json、ledger.json（每集 14 步）、work-orders/、FIXLOG.md，并渲染 LEDGER.md。
// - 在 <root>/AGENTS.md（执行代理）与 <root>/CLAUDE.md（总导演）末尾追加协作说明；已追加过则跳过。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(SKILL, 'collab-kit');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);
const root = path.resolve(opt('root', process.cwd()));
const project = opt('project');
const planDir = opt('plan-dir', '方案');
if (!project) {
  console.error('用法：node init-collab.mjs --root <工程目录> --project "作品名" [--episodes 12 | --titles 片名清单.txt] [--plan-dir 方案] [--update-tools]');
  process.exit(1);
}
const COLLAB = path.join(root, '.ai-collab');
const fill = (s) => s.replaceAll('{{PROJECT}}', project).replaceAll('{{PLAN_DIR}}', planDir);
const today = new Date().toISOString().slice(0, 10);
const created = [];
const skipped = [];

function copyTree(src, dst, overwrite) {
  for (const ent of fs.readdirSync(src, {withFileTypes: true})) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      fs.mkdirSync(d, {recursive: true});
      copyTree(s, d, overwrite);
    } else if (overwrite || !fs.existsSync(d)) {
      fs.mkdirSync(path.dirname(d), {recursive: true});
      const text = /\.(md|json|mjs|js|txt)$/i.test(ent.name);
      if (text) fs.writeFileSync(d, fill(fs.readFileSync(s, 'utf8')), 'utf8');
      else fs.copyFileSync(s, d);
      created.push(path.relative(root, d));
    } else skipped.push(path.relative(root, d));
  }
}

fs.mkdirSync(COLLAB, {recursive: true});
if (flag('update-tools')) {
  copyTree(path.join(KIT, 'bin'), path.join(COLLAB, 'bin'), true);
  copyTree(path.join(KIT, 'schemas'), path.join(COLLAB, 'schemas'), true);
} else {
  for (const part of ['bin', 'schemas', 'prompts', 'skills']) copyTree(path.join(KIT, part), path.join(COLLAB, part), false);
  for (const f of ['README.md']) {
    const d = path.join(COLLAB, f);
    if (!fs.existsSync(d)) {
      fs.writeFileSync(d, fill(fs.readFileSync(path.join(KIT, f), 'utf8')), 'utf8');
      created.push(path.relative(root, d));
    } else skipped.push(path.relative(root, d));
  }
  fs.mkdirSync(path.join(COLLAB, 'work-orders'), {recursive: true});

  const pj = path.join(COLLAB, 'project.json');
  if (!fs.existsSync(pj)) {
    fs.writeFileSync(pj, JSON.stringify({project, plan_dir: planDir, created: today}, null, 2) + '\n', 'utf8');
    created.push(path.relative(root, pj));
  }

  const fix = path.join(COLLAB, 'FIXLOG.md');
  if (!fs.existsSync(fix)) {
    fs.writeFileSync(fix, '# A 级修复记录（执行代理直接修复的技术问题）\n\n| 日期 | 工单 | 问题 | 修复 |\n|---|---|---|---|\n', 'utf8');
    created.push(path.relative(root, fix));
  }

  const lj = path.join(COLLAB, 'ledger.json');
  if (!fs.existsSync(lj)) {
    const {pipeline, states} = JSON.parse(fs.readFileSync(path.join(KIT, 'pipeline.json'), 'utf8'));
    const titlesFile = opt('titles');
    const titles = titlesFile ? fs.readFileSync(path.resolve(titlesFile), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
    const n = titles.length || Number(opt('episodes', '1'));
    const stage = () => ({state: 'todo', by: '', note: '', wo: [], updated: today});
    const ledger = {
      project,
      pipeline,
      states,
      series: [
        {id: 'S0', name: '执行代理熟悉协作流程', owner: '执行', state: 'todo', note: '读 .ai-collab/README.md 与 PROJECT.md，回执复述流程', wo: [], updated: today},
        {id: 'S1', name: '环境清单与手动指导（模型、云端 key、工具）', owner: '执行指导 → 用户操作 → 执行核验', state: 'todo', note: '按 doc-video-director 的 references/setup-checklist.md', wo: [], updated: today},
        {id: 'S2', name: '共享资产（风格板、模板、片尾、动画工程、人物登记）', owner: '执行（用户批风格板）', state: 'todo', note: '', wo: [], updated: today},
      ],
      episodes: Array.from({length: n}, (_, i) => ({
        episode: `EP${String(i + 1).padStart(2, '0')}`,
        title: titles[i] || `第${i + 1}集`,
        narrator: '',
        note: '',
        stages: Object.fromEntries(pipeline.map((p) => [p.id, stage()])),
      })),
    };
    fs.writeFileSync(lj, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
    created.push(path.relative(root, lj));
  }

  for (const [file, snippet, marker] of [
    ['AGENTS.md', 'AGENTS-collab.md', '## 协作工单（doc-video-director）'],
    ['CLAUDE.md', 'CLAUDE-collab.md', '## 总导演职责（doc-video-director）'],
  ]) {
    const target = path.join(root, file);
    const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (prev.includes(marker)) {
      skipped.push(`${file}（已有协作说明）`);
      continue;
    }
    fs.writeFileSync(target, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + fill(fs.readFileSync(path.join(KIT, 'snippets', snippet), 'utf8')), 'utf8');
    created.push(`${file}（追加协作说明）`);
  }
}

const r = spawnSync(process.execPath, [path.join(COLLAB, 'bin', 'collab.mjs'), 'ledger'], {cwd: root, encoding: 'utf8'});
console.log(`工程：${root}\n作品：${project}\n方案目录：${planDir}`);
console.log(`新建 ${created.length} 项${created.length ? '：\n  ' + created.join('\n  ') : ''}`);
if (skipped.length) console.log(`已存在、未覆盖 ${skipped.length} 项`);
console.log(r.status === 0 ? '已生成 .ai-collab/LEDGER.md' : `生成总账失败：${r.stderr}`);
console.log('下一步：在方案目录写 PROJECT.md；对执行代理说“处理新工单”前，先由总导演用 collab.mjs new 派第一张工单（样例见 references/collaboration.md）。');
