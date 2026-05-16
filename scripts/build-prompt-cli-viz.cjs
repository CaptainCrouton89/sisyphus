#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const AGENT_DIR = path.join(TEMPLATES, 'agent-plugin', 'agents');
const OUT = path.join(ROOT, 'mockups', 'prompt-vs-cli.html');

function readText(p) {
  if (!fs.existsSync(p)) throw new Error(`missing input file: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function runHelp(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
  } catch (e) {
    // Some -h paths exit non-zero; capture stdout if present.
    if (typeof e.stdout === 'string' && e.stdout.length > 0) return e.stdout;
    throw new Error('failed to run: ' + cmd + '\n' + (e.stderr ? e.stderr.toString() : e.message));
  }
}

const base = readText(path.join(TEMPLATES, 'orchestrator-base.md'));
const suffix = readText(path.join(TEMPLATES, 'agent-suffix.md'));

const modes = {
  discovery:   readText(path.join(TEMPLATES, 'orchestrator-discovery.md')),
  planning:    readText(path.join(TEMPLATES, 'orchestrator-planning.md')),
  impl:        readText(path.join(TEMPLATES, 'orchestrator-impl.md')),
  validation:  readText(path.join(TEMPLATES, 'orchestrator-validation.md')),
  completion:  readText(path.join(TEMPLATES, 'orchestrator-completion.md')),
};

const agentSpec = [
  { id: 'explore',       file: 'explore.md',       label: 'sisyphus:explore' },
  { id: 'debug',         file: 'debug.md',         label: 'sisyphus:debug' },
  { id: 'implementor',   file: 'implementor.md',   label: 'sisyphus:implementor' },
  { id: 'operator',      file: 'operator.md',      label: 'sisyphus:operator' },
  { id: 'plan',          file: 'plan.md',          label: 'sisyphus:plan' },
  { id: 'problem',       file: 'problem.md',       label: 'sisyphus:problem' },
  { id: 'research-lead', file: 'research-lead.md', label: 'sisyphus:research-lead' },
  { id: 'review',        file: 'review.md',        label: 'sisyphus:review' },
  { id: 'review-plan',   file: 'review-plan.md',   label: 'sisyphus:review-plan' },
  { id: 'spec',          file: 'spec.md',          label: 'sisyphus:spec' },
  { id: 'test-spec',     file: 'test-spec.md',     label: 'sisyphus:test-spec' },
];
const agents = {};
for (const a of agentSpec) agents[a.id] = readText(path.join(AGENT_DIR, a.file));

// The daemon resolves {{HELP:<cmd>}} tokens by inlining live `sis <cmd> -h`
// output (src/daemon/orchestrator.ts). Mirror that here so the left pane shows
// the prompt the orchestrator actually receives, not the raw template.
function resolveHelp(text) {
  return text.replace(/\{\{HELP:([^}]+)\}\}/g, (_m, cmd) => {
    const c = cmd.trim();
    let body;
    try { body = runHelp('sis ' + c + ' -h').trim(); }
    catch (e) { body = '(help unavailable: sis ' + c + ' -h)'; }
    return '<cli-guide bash="sis ' + c + ' -h">\n' + body + '\n</cli-guide>';
  });
}
const part = (source, body) => ({ source, body: resolveHelp(body) });
const docs = [];

const modeMeta = [
  { id: 'discovery',  label: 'discovery',     file: 'orchestrator-discovery.md',
    blurb: 'Define the goal, write strategy.md, transition to planning.' },
  { id: 'planning',   label: 'planning',      file: 'orchestrator-planning.md',
    blurb: 'Spec alignment, plan delegation, review-plan / test-spec dispatch.' },
  { id: 'impl',       label: 'implementation', file: 'orchestrator-impl.md',
    blurb: 'Spawn parallel agents, critique, refine, validate stage-by-stage.' },
  { id: 'validation', label: 'validation',    file: 'orchestrator-validation.md',
    blurb: 'Prove the feature works end-to-end with evidence.' },
  { id: 'completion', label: 'completion',    file: 'orchestrator-completion.md',
    blurb: 'Summarize, get user sign-off, finalize the session.' },
];
for (const m of modeMeta) {
  docs.push({
    id: `oc-${m.id}`,
    group: 'Orchestrator cycle (base + mode)',
    label: `${m.label} cycle`,
    blurb: m.blurb,
    parts: [
      part('orchestrator-base.md (always prepended)', base),
      part(`${m.file} (mode: ${m.label})`, modes[m.id]),
    ],
  });
}

const agentBlurb = {
  explore:         'Read-only exploration. Saves context/explore-{topic}.md.',
  debug:           'Systematic root-cause investigation. Never patches.',
  implementor:     'Worker — implements one slice. Pattern discovery first.',
  operator:        'Drives the actual product via capture/CDP. Browser, logs, services.',
  plan:            'Plan lead. Synthesizes sub-plans, master plan ≤200 lines.',
  problem:         'Brainstorm partner. Multi-lens dialogue, drills to root.',
  'research-lead': 'Web research coordinator. Decompose, dispatch, critic, synth.',
  review:          'Code review coordinator. Parallel sub-reviewers, validates findings.',
  'review-plan':   'Plan review coordinator. 4 sub-reviewers (security/coverage/smells/consistency).',
  spec:            'Three-stage spec (shape→requirements→deepen). Engineer + writer subagents.',
  'test-spec':     'Behavioral verification checklist. Properties + edge cases.',
};
for (const a of agentSpec) {
  docs.push({
    id: `ag-${a.id}`,
    group: 'Agent prompt (body + suffix)',
    label: a.label,
    blurb: agentBlurb[a.id],
    parts: [
      part(`${a.file}`, agents[a.id]),
      part('agent-suffix.md (appended to every agent)', suffix),
    ],
  });
}

docs.push({
  id: 'src-base', group: 'Source files', label: 'orchestrator-base.md',
  blurb: 'Base prompt — always prepended to every orchestrator cycle.',
  parts: [part('orchestrator-base.md', base)],
});
for (const m of modeMeta) {
  docs.push({
    id: `src-${m.id}`, group: 'Source files', label: m.file,
    blurb: `Mode template appended when --mode ${m.label}.`,
    parts: [part(m.file, modes[m.id])],
  });
}
docs.push({
  id: 'src-suffix', group: 'Source files', label: 'agent-suffix.md',
  blurb: 'Suffix appended to every agent prompt (reports, finishing, context dir).',
  parts: [part('agent-suffix.md', suffix)],
});
for (const a of agentSpec) {
  docs.push({
    id: `src-ag-${a.id}`, group: 'Source files', label: a.file,
    blurb: `Body of the ${a.label} prompt (without the suffix).`,
    parts: [part(a.file, agents[a.id])],
  });
}

const cliSpec = [
  ['top',     'sis',                    'sis -h'],
  ['top',     'sis start',              'sis start -h'],
  ['top',     'sis status',             'sis status -h'],
  ['top',     'sis list',               'sis list -h'],
  ['top',     'sis tell',               'sis tell -h'],
  ['top',     'sis read',               'sis read -h'],
  ['top',     'sis message',            'sis message -h'],
  ['top',     'sis ask',                'sis ask -h'],
  ['top',     'sis dashboard',          'sis dashboard -h'],
  ['agent',   'sis agent',              'sis agent -h'],
  ['agent',   'sis agent spawn',        'sis agent spawn -h'],
  ['agent',   'sis agent submit',       'sis agent submit -h'],
  ['agent',   'sis agent report',       'sis agent report -h'],
  ['agent',   'sis agent await',        'sis agent await -h'],
  ['agent',   'sis agent kill',         'sis agent kill -h'],
  ['agent',   'sis agent restart',      'sis agent restart -h'],
  ['orch',    'sis orch',               'sis orch -h'],
  ['orch',    'sis orch yield',         'sis orch yield -h'],
  ['session', 'sis session',            'sis session -h'],
  ['session', 'sis session kill',       'sis session kill -h'],
  ['session', 'sis session delete',     'sis session delete -h'],
  ['session', 'sis session resume',     'sis session resume -h'],
  ['session', 'sis session continue',   'sis session continue -h'],
  ['session', 'sis session complete',   'sis session complete -h'],
  ['session', 'sis session rollback',   'sis session rollback -h'],
  ['session', 'sis session reconnect',  'sis session reconnect -h'],
  ['session', 'sis session clone',      'sis session clone -h'],
  ['session', 'sis session task',       'sis session task -h'],
  ['session', 'sis session effort',     'sis session effort -h'],
  ['session', 'sis session dangerous',  'sis session dangerous -h'],
  ['session', 'sis session context',    'sis session context -h'],
  ['admin',   'sis admin',              'sis admin -h'],
  ['admin',   'sis segment',            'sis segment -h'],
  ['admin',   'sis cloud',              'sis cloud -h'],
  ['admin',   'sis deploy',             'sis deploy -h'],
  ['admin',   'sis companion',          'sis companion -h'],
];
const groupLabels = {
  top: 'Top-level commands',
  agent: 'Agent commands (orchestrator-facing)',
  orch: 'Orchestrator commands',
  session: 'Session lifecycle',
  admin: 'Admin / setup',
};
process.stderr.write('capturing CLI help…\n');
const cli = cliSpec.map(([group, label, cmd]) => {
  process.stderr.write('  ' + cmd + '\n');
  return {
    id: 'cli-' + cmd.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, ''),
    group, groupLabel: groupLabels[group], label, cmd,
    body: runHelp(cmd),
  };
});

const DATA = { docs, cli };

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sisyphus prompts ↔ CLI</title>
<style>
:root {
  --bg:        #f8f7f4;
  --panel:     #ffffff;
  --panel-2:   #fafaf7;
  --ink:       #1f2328;
  --ink-soft:  #4b5563;
  --muted:     #8a8f99;
  --line:      #e6e4df;
  --line-soft: #efedea;
  --accent:    #4a5cb1;
  --accent-soft: #eef0f9;
  --highlight: #fef3c7;
  --note:      #b5680e;
  --note-bg:   #fff7ec;
  --note-line: #f0d8a8;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.topbar {
  position: sticky; top: 0; z-index: 30;
  background: rgba(248,247,244,0.92);
  backdrop-filter: saturate(140%) blur(8px);
  -webkit-backdrop-filter: saturate(140%) blur(8px);
  border-bottom: 1px solid var(--line);
  padding: 10px 18px;
  display: flex; align-items: center; gap: 16px;
}
.brand { font-weight: 600; color: var(--ink); font-size: 13px; letter-spacing: -0.01em; }
.brand .sep { color: var(--muted); font-weight: 400; margin: 0 6px; }
.brand .small { color: var(--muted); font-weight: 400; font-size: 12px; }
.spacer { flex: 1; }
.search {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  min-width: 260px;
}
.search input {
  flex: 1; border: 0; outline: 0; background: transparent; font-size: 12px;
  font-family: inherit; color: var(--ink);
}
.search .icon { color: var(--muted); font-size: 11px; }
.search .counts { color: var(--muted); font-size: 11px; white-space: nowrap; }
.notes-pill {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--note-bg); color: var(--note);
  padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 500;
  border: 1px solid var(--note-line);
}
.btn-link {
  background: transparent; border: 0; color: var(--accent); font-family: inherit;
  font-size: 11px; cursor: pointer; padding: 0;
}
.btn-link:hover { text-decoration: underline; }

.compare {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  padding: 14px 18px; align-items: stretch;
  height: calc(100vh - 50px);
}
.pane {
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
}
.pane-head { padding: 10px 12px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.pane-pickrow { display: flex; gap: 8px; align-items: center; }
.pane-pickrow select {
  flex: 1; background: var(--panel); border: 1px solid var(--line); color: var(--ink);
  font-family: inherit; font-size: 12px; padding: 6px 8px; border-radius: 5px;
}
.pane-pickrow select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.pane-blurb { color: var(--ink-soft); font-size: 11.5px; margin-top: 6px; line-height: 1.5; }
.pane-meta { color: var(--muted); font-size: 11px; margin-top: 6px; display: flex; gap: 10px; align-items: center; }
.pane-meta b { color: var(--ink-soft); font-weight: 500; }

.pane-body-wrap { flex: 1; display: grid; grid-template-columns: 200px 1fr; min-height: 0; }
.pane.collapsed .pane-body-wrap { grid-template-columns: 32px 1fr; }
.outline {
  border-right: 1px solid var(--line); background: var(--panel-2);
  overflow: auto; padding: 10px 0; font-size: 11.5px;
}
.outline-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 10px 6px; color: var(--muted); font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.outline-head .outline-toggle {
  background: transparent; border: 0; color: var(--muted); cursor: pointer;
  font-size: 11px; padding: 0;
}
.outline-source {
  padding: 8px 10px 2px; color: var(--muted); font-size: 10px;
  font-family: 'SF Mono', monospace; word-wrap: break-word;
  border-top: 1px solid var(--line-soft); margin-top: 4px;
}
.outline-source:first-of-type { border-top: 0; margin-top: 0; }
.outline a {
  display: block; padding: 3px 10px 3px 12px;
  color: var(--ink-soft); text-decoration: none; cursor: pointer;
  border-left: 2px solid transparent; line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.outline a.h2 { padding-left: 14px; }
.outline a.h3 { padding-left: 22px; color: var(--muted); }
.outline a.h4 { padding-left: 30px; color: var(--muted); font-size: 10.5px; }
.outline a:hover { background: var(--accent-soft); color: var(--accent); border-left-color: var(--accent); }
.pane.collapsed .outline > * { display: none; }
.pane.collapsed .outline-head { display: flex; padding: 6px 4px; justify-content: center; }
.pane.collapsed .outline-head .outline-toggle { display: block; }

.body {
  overflow: auto;
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px; line-height: 1.6; color: var(--ink);
  padding: 8px 0 80px;
  scroll-behavior: smooth;
}
.divider {
  display: block; padding: 14px 16px 6px; margin-top: 8px;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--muted); font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.04em; text-transform: uppercase;
  font-family: -apple-system, system-ui, sans-serif;
}
.divider:first-child { border-top: 0; margin-top: 0; padding-top: 8px; }
.line {
  display: grid; grid-template-columns: 44px 1fr; gap: 0;
  white-space: pre-wrap; word-wrap: break-word;
  padding: 0; position: relative;
}
.line .num {
  text-align: right; padding: 0 8px 0 0;
  color: #c8c4bd; user-select: none; cursor: pointer;
  font-size: 10.5px; line-height: 1.6;
  border-right: 1px solid var(--line-soft);
}
.line .num:hover { color: var(--accent); background: var(--accent-soft); }
.line .num.has-note { color: var(--note); font-weight: 600; }
.line .num.has-note::after { content: ' ●'; font-size: 7px; vertical-align: middle; }
.line .text { padding: 0 12px; min-width: 0; }
.line.h1 .text { font-weight: 600; color: var(--ink); }
.line.h2 .text { font-weight: 600; color: var(--ink); }
.line.h3 .text { font-weight: 500; color: var(--ink); }
.line .hl { background: var(--highlight); border-radius: 2px; padding: 0 1px; }

.notes-block {
  grid-column: 2;
  background: var(--note-bg);
  border-left: 3px solid var(--note);
  margin: 4px 12px 8px;
  padding: 8px 10px; border-radius: 0 4px 4px 0;
  font-family: -apple-system, system-ui, sans-serif;
  font-size: 12px; color: var(--ink);
}
.note { padding: 6px 0; border-bottom: 1px dashed var(--note-line); }
.note:last-child { border-bottom: 0; }
.note .meta { color: var(--muted); font-size: 10.5px; margin-bottom: 3px; display: flex; gap: 8px; align-items: center; }
.note .meta button { background: transparent; border: 0; color: var(--muted); cursor: pointer; font-size: 10.5px; padding: 0; font-family: inherit; }
.note .meta button:hover { color: var(--note); text-decoration: underline; }
.note .text { white-space: pre-wrap; line-height: 1.5; }
.note .quote {
  font-family: 'SF Mono', monospace; font-size: 11.5px;
  color: var(--ink-soft); background: rgba(255,255,255,0.6);
  border-left: 2px solid var(--note); padding: 4px 8px; margin-bottom: 6px;
  border-radius: 0 3px 3px 0; white-space: pre-wrap; word-wrap: break-word;
  max-height: 5em; overflow: auto;
}
.note .ed-row { display: flex; gap: 6px; margin-top: 6px; }
.body { user-select: text; }
.body .text { cursor: text; }
::selection { background: rgba(74,92,177,0.22); }
.note textarea {
  width: 100%; min-height: 64px; font-family: inherit; font-size: 12px;
  border: 1px solid var(--note-line); border-radius: 4px; padding: 6px 8px;
  background: white; resize: vertical; color: var(--ink); line-height: 1.5;
}
.note textarea:focus { outline: none; border-color: var(--note); box-shadow: 0 0 0 3px rgba(217,119,6,0.12); }
.note .btn {
  background: var(--note); color: white; border: 0; padding: 4px 10px;
  border-radius: 4px; font-size: 11px; cursor: pointer; font-family: inherit;
}
.note .btn.secondary { background: transparent; color: var(--ink-soft); border: 1px solid var(--line); }
.note .btn:hover { opacity: 0.92; }

@media (max-width: 1100px) { .compare { grid-template-columns: 1fr; height: auto; } }
</style>
</head>
<body>

<div class="topbar">
  <div class="brand">sisyphus <span class="sep">·</span> <span class="small">prompts ↔ CLI</span></div>
  <div class="spacer"></div>
  <div class="search">
    <span class="icon">⌕</span>
    <input id="search" type="text" placeholder="search both panes…" autocomplete="off">
    <span class="counts" id="search-counts"></span>
  </div>
  <div class="notes-pill" title="Notes saved in this browser (localStorage)">
    <span>📝</span><span><b id="note-count">0</b> notes</span>
    <button class="btn-link" id="export-notes" title="Download notes as JSON">export</button>
    <button class="btn-link" id="clear-notes" title="Delete all notes">clear</button>
  </div>
</div>

<div class="compare">
  <div class="pane" id="pane-l">
    <div class="pane-head">
      <div class="pane-pickrow"><select id="pick-l"></select></div>
      <div class="pane-blurb" id="blurb-l"></div>
      <div class="pane-meta">
        <span><b id="lines-l">—</b> lines</span>
        <span>·</span>
        <span><b id="parts-l">—</b> source files concatenated</span>
      </div>
    </div>
    <div class="pane-body-wrap">
      <div class="outline">
        <div class="outline-head">
          <span>Outline</span>
          <button class="outline-toggle" data-pane="pane-l" title="Collapse">⟨</button>
        </div>
        <div id="outline-l"></div>
      </div>
      <div class="body" id="body-l"></div>
    </div>
  </div>
  <div class="pane" id="pane-r">
    <div class="pane-head">
      <div class="pane-pickrow"><select id="pick-r"></select></div>
      <div class="pane-blurb" id="blurb-r"></div>
      <div class="pane-meta">
        <span><b id="lines-r">—</b> lines</span>
        <span>·</span>
        <span id="cmd-r" style="font-family:'SF Mono',monospace"></span>
      </div>
    </div>
    <div class="pane-body-wrap">
      <div class="outline">
        <div class="outline-head">
          <span>Outline</span>
          <button class="outline-toggle" data-pane="pane-r" title="Collapse">⟨</button>
        </div>
        <div id="outline-r"></div>
      </div>
      <div class="body" id="body-r"></div>
    </div>
  </div>
</div>

<script>
const DATA = ${JSON.stringify(DATA)};
const KEY = 'sisviz:comments:v1';
const $ = (s, r) => (r ? r : document).querySelector(s);
const $$ = (s, r) => Array.from((r ? r : document).querySelectorAll(s));

function loadComments() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
function saveComments() {
  localStorage.setItem(KEY, JSON.stringify(state.comments));
  updateNoteCount();
}
function noteCount() {
  let n = 0;
  for (const docId in state.comments) {
    for (const k in state.comments[docId]) n += state.comments[docId][k].length;
  }
  return n;
}
function updateNoteCount() { $('#note-count').textContent = noteCount(); }

const state = {
  left:  null,
  right: null,
  search: '',
  comments: loadComments(),
  openComposer: null,
};

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeRegex(s) { return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); }

function highlightHtml(text, query) {
  const safe = escapeHtml(text);
  if (!query) return { html: safe, count: 0 };
  const re = new RegExp(escapeRegex(query), 'gi');
  let count = 0;
  const html = safe.replace(re, m => { count++; return '<span class="hl">' + m + '</span>'; });
  return { html, count };
}

function extractOutline(parts) {
  const out = [];
  let abs = 0;
  parts.forEach((part) => {
    out.push({ kind: 'source', label: part.source, line: abs + 1 });
    const lines = part.body.split(/\\r?\\n/);
    for (let i = 0; i < lines.length; i++) {
      abs++;
      const line = lines[i];
      const md = /^(#{1,4})\\s+(.+?)\\s*\$/.exec(line);
      if (md) { out.push({ kind: 'h', level: md[1].length, label: md[2], line: abs }); continue; }
      if (/^(Usage|Arguments|Options|Commands|Examples)(:|\\s)/.test(line)) {
        const label = line.split(':')[0] + ':';
        out.push({ kind: 'h', level: 2, label, line: abs });
      }
    }
  });
  return out;
}

function renderOutline(parts, paneSide) {
  const items = extractOutline(parts);
  const target = $('#outline-' + paneSide);
  if (items.length === 0) {
    target.innerHTML = '<div class="outline-source" style="opacity:0.6">(no headings)</div>';
    return;
  }
  const buf = [];
  for (const it of items) {
    if (it.kind === 'source') {
      buf.push('<div class="outline-source">' + escapeHtml(it.label) + '</div>');
    } else {
      const cls = 'h' + Math.min(it.level, 4);
      buf.push('<a class="' + cls + '" data-line="' + it.line + '">' + escapeHtml(it.label) + '</a>');
    }
  }
  target.innerHTML = buf.join('');
  target.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      const ln = a.getAttribute('data-line');
      const el = document.querySelector('#body-' + paneSide + ' [data-line="' + ln + '"]');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });
}

function classifyLine(text) {
  if (/^# /.test(text)) return 'h1';
  if (/^## /.test(text)) return 'h2';
  if (/^### /.test(text)) return 'h3';
  return '';
}

function renderLineRow(docId, abs, text, search) {
  const cls = classifyLine(text);
  const { html, count } = highlightHtml(text, search);
  const notes = state.comments[docId] && state.comments[docId][abs] ? state.comments[docId][abs] : [];
  const noteCls = notes.length > 0 ? ' has-note' : '';
  const lineHtml =
    '<div class="line ' + cls + '" data-line="' + abs + '">' +
      '<span class="num' + noteCls + '" data-doc="' + docId + '" data-line-abs="' + abs + '">' + abs + '</span>' +
      '<span class="text">' + (html.length === 0 ? '&nbsp;' : html) + '</span>' +
    '</div>';
  let extra = '';
  const composerOpen = state.openComposer && state.openComposer.doc === docId && state.openComposer.line === abs;
  if (notes.length > 0 || composerOpen) {
    extra = renderNotesBlock(docId, abs, notes);
  }
  return { html: lineHtml + extra, count };
}

function renderDoc(doc, paneSide) {
  const body = $('#body-' + paneSide);
  const buf = [];
  let abs = 0;
  const search = state.search.trim();
  let total = 0;
  doc.parts.forEach((part) => {
    buf.push('<div class="divider">' + escapeHtml(part.source) + '</div>');
    const lines = part.body.split(/\\r?\\n/);
    for (let i = 0; i < lines.length; i++) {
      abs++;
      const r = renderLineRow(doc.id, abs, lines[i], search);
      buf.push(r.html);
      total += r.count;
    }
  });
  body.innerHTML = buf.join('');
  wireBodyActions(body, paneSide);
  return total;
}

function renderCli(c, paneSide) {
  const body = $('#body-' + paneSide);
  const buf = [];
  buf.push('<div class="divider">' + escapeHtml(c.cmd) + '</div>');
  const lines = c.body.split(/\\r?\\n/);
  const search = state.search.trim();
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const abs = i + 1;
    const r = renderLineRow(c.id, abs, lines[i], search);
    buf.push(r.html);
    total += r.count;
  }
  body.innerHTML = buf.join('');
  wireBodyActions(body, paneSide);
  return total;
}

function renderNotesBlock(docId, line, notes) {
  const buf = ['<div class="notes-block" data-line="' + line + '">'];
  for (const n of notes) {
    buf.push(
      '<div class="note" data-id="' + n.id + '">' +
        '<div class="meta">' +
          '<span>' + new Date(n.ts).toLocaleString() + '</span>' +
          '<button data-action="edit">edit</button>' +
          '<button data-action="delete">delete</button>' +
        '</div>' +
        (n.quote ? '<div class="quote">' + escapeHtml(n.quote) + '</div>' : '') +
        '<div class="text">' + escapeHtml(n.text) + '</div>' +
      '</div>'
    );
  }
  if (state.openComposer && state.openComposer.doc === docId && state.openComposer.line === line) {
    const editId = state.openComposer.editId;
    const editing = editId ? notes.find(x => x.id === editId) : null;
    const initial = editing ? editing.text : '';
    const quote = editing && editing.quote ? editing.quote : state.openComposer.quote;
    buf.push(
      '<div class="note" data-composer>' +
        (quote ? '<div class="quote">' + escapeHtml(quote) + '</div>' : '') +
        '<textarea class="composer-text" placeholder="Add a note about line ' + line + '…">' + escapeHtml(initial) + '</textarea>' +
        '<div class="ed-row">' +
          '<button class="btn" data-action="save">' + (editing ? 'Update' : 'Save') + '</button>' +
          '<button class="btn secondary" data-action="cancel">Cancel</button>' +
        '</div>' +
      '</div>'
    );
  }
  buf.push('</div>');
  return buf.join('');
}

function wireBodyMouseup(paneSide) {
  const root = $('#body-' + paneSide);
  root.addEventListener('mouseup', (ev) => {
    if (ev.target.closest('.notes-block')) return;
    if (ev.target.closest('.num')) return;
    if (ev.target.closest('.divider')) return;
    const lineEl = ev.target.closest('.line');
    if (!lineEl) return;
    const docId = paneSide === 'l' ? state.left : state.right;
    let line = parseInt(lineEl.getAttribute('data-line'), 10);
    let quote = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && root.contains(sel.anchorNode)) {
      const text = sel.toString().trim();
      if (text.length > 0) {
        quote = text;
        const startEl = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
        const startLine = startEl.closest('.line');
        if (startLine) line = parseInt(startLine.getAttribute('data-line'), 10);
      }
    }
    openComposer(docId, line, paneSide, quote);
  });
}

function wireBodyActions(root, paneSide) {
  root.querySelectorAll('.num').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const docId = el.getAttribute('data-doc');
      const ln = parseInt(el.getAttribute('data-line-abs'), 10);
      openComposer(docId, ln, paneSide, null);
    });
  });
  root.querySelectorAll('.notes-block').forEach(block => {
    const line = parseInt(block.getAttribute('data-line'), 10);
    block.querySelectorAll('.note').forEach(noteEl => {
      const noteId = noteEl.getAttribute('data-id');
      const docId = block.closest('.body').id === 'body-l' ? state.left : state.right;
      noteEl.querySelectorAll('button').forEach(btn => {
        const action = btn.getAttribute('data-action');
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (action === 'delete') {
            deleteNote(docId, line, noteId);
            rerender(paneSide);
          } else if (action === 'edit') {
            state.openComposer = { doc: docId, line, editId: noteId };
            rerender(paneSide);
            const ta = $('.composer-text');
            if (ta) ta.focus();
          } else if (action === 'save') {
            const text = block.querySelector('.composer-text').value.trim();
            if (text.length > 0) saveNote(docId, line, text, state.openComposer.editId, state.openComposer.quote);
            state.openComposer = null;
            rerender(paneSide);
          } else if (action === 'cancel') {
            state.openComposer = null;
            rerender(paneSide);
          }
        });
      });
    });
  });
}

function openComposer(docId, line, paneSide, quote) {
  state.openComposer = { doc: docId, line, editId: null, quote: quote ? quote : null };
  rerender(paneSide);
  // scroll the composer into view so user can immediately see + type
  const composer = document.querySelector('#body-' + paneSide + ' [data-composer]');
  if (composer) composer.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const ta = $('.composer-text');
  if (ta) ta.focus();
  // clear browser selection so the highlight doesn't linger as visual noise
  if (window.getSelection) window.getSelection().removeAllRanges();
}

function saveNote(docId, line, text, editId, quote) {
  if (!state.comments[docId]) state.comments[docId] = {};
  if (!state.comments[docId][line]) state.comments[docId][line] = [];
  if (editId) {
    const arr = state.comments[docId][line];
    const idx = arr.findIndex(n => n.id === editId);
    if (idx >= 0) arr[idx] = { id: editId, text, ts: Date.now(), quote: arr[idx].quote ? arr[idx].quote : null };
  } else {
    state.comments[docId][line].push({
      id: 'n_' + Math.random().toString(36).slice(2, 9),
      text, ts: Date.now(),
      quote: quote ? quote : null,
    });
  }
  saveComments();
}
function deleteNote(docId, line, id) {
  if (!state.comments[docId] || !state.comments[docId][line]) return;
  state.comments[docId][line] = state.comments[docId][line].filter(n => n.id !== id);
  if (state.comments[docId][line].length === 0) delete state.comments[docId][line];
  if (Object.keys(state.comments[docId]).length === 0) delete state.comments[docId];
  saveComments();
}

let lastLeftMatches = 0, lastRightMatches = 0;

function renderLeft() {
  const doc = DATA.docs.find(d => d.id === state.left);
  if (!doc) return;
  $('#blurb-l').textContent = doc.blurb;
  const totalLines = doc.parts.reduce((s, p) => s + p.body.split(/\\r?\\n/).length, 0);
  $('#lines-l').textContent = totalLines.toLocaleString();
  $('#parts-l').textContent = doc.parts.length;
  renderOutline(doc.parts, 'l');
  lastLeftMatches = renderDoc(doc, 'l');
}
function renderRight() {
  const c = DATA.cli.find(x => x.id === state.right);
  if (!c) return;
  $('#blurb-r').textContent = c.groupLabel;
  $('#lines-r').textContent = c.body.split(/\\r?\\n/).length.toLocaleString();
  $('#cmd-r').textContent = c.cmd;
  renderOutline([{ source: c.cmd, body: c.body }], 'r');
  lastRightMatches = renderCli(c, 'r');
}
function rerender(paneSide) {
  if (paneSide === 'l' || !paneSide) {
    const sl = $('#body-l').scrollTop;
    renderLeft();
    $('#body-l').scrollTop = sl;
  }
  if (paneSide === 'r' || !paneSide) {
    const sr = $('#body-r').scrollTop;
    renderRight();
    $('#body-r').scrollTop = sr;
  }
  updateSearchCounts();
}
function updateSearchCounts() {
  const q = state.search.trim();
  if (!q) { $('#search-counts').textContent = ''; return; }
  $('#search-counts').textContent = lastLeftMatches + ' · ' + lastRightMatches;
}

function buildPicker(selectEl, items, kind) {
  const groups = {};
  const order = [];
  for (const it of items) {
    const g = kind === 'doc' ? it.group : it.groupLabel;
    if (!groups[g]) { groups[g] = []; order.push(g); }
    groups[g].push(it);
  }
  const buf = [];
  for (const g of order) {
    buf.push('<optgroup label="' + escapeHtml(g) + '">');
    for (const it of groups[g]) {
      const lines = kind === 'doc'
        ? it.parts.reduce((s, p) => s + p.body.split(/\\r?\\n/).length, 0)
        : it.body.split(/\\r?\\n/).length;
      buf.push('<option value="' + it.id + '">' + escapeHtml(it.label) + ' (' + lines + ')</option>');
    }
    buf.push('</optgroup>');
  }
  selectEl.innerHTML = buf.join('');
}

buildPicker($('#pick-l'), DATA.docs, 'doc');
buildPicker($('#pick-r'), DATA.cli, 'cli');
wireBodyMouseup('l');
wireBodyMouseup('r');

const defLeft = DATA.docs.find(d => d.id === 'oc-discovery');
const defRight = DATA.cli.find(c => c.cmd === 'sis agent spawn -h');
state.left = defLeft ? defLeft.id : DATA.docs[0].id;
state.right = defRight ? defRight.id : DATA.cli[0].id;
$('#pick-l').value = state.left;
$('#pick-r').value = state.right;

$('#pick-l').addEventListener('change', e => {
  state.left = e.target.value; state.openComposer = null; renderLeft(); updateSearchCounts();
});
$('#pick-r').addEventListener('change', e => {
  state.right = e.target.value; state.openComposer = null; renderRight(); updateSearchCounts();
});

let searchTimer = null;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value; rerender(); }, 100);
});

$$('.outline-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const pane = $('#' + btn.getAttribute('data-pane'));
    pane.classList.toggle('collapsed');
    btn.textContent = pane.classList.contains('collapsed') ? '⟩' : '⟨';
  });
});

$('#export-notes').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.comments, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sisviz-notes-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
});
$('#clear-notes').addEventListener('click', () => {
  if (!confirm('Delete all notes? This cannot be undone.')) return;
  state.comments = {};
  saveComments();
  rerender();
});

document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
    e.preventDefault(); $('#search').focus();
  }
  if (e.key === 'Escape' && state.openComposer) {
    state.openComposer = null; rerender();
  }
});

updateNoteCount();
rerender();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}`);
console.log(`  docs: ${docs.length} (${modeMeta.length} cycles + ${agentSpec.length} agents + ${1 + modeMeta.length + 1 + agentSpec.length} sources)`);
console.log(`  cli:  ${cli.length} commands`);
