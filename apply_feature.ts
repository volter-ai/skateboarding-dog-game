import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const FEATURE = process.env.FEATURE_REQUEST || '';
if (!FEATURE) {
  console.error('No FEATURE_REQUEST provided');
  process.exit(0);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Collect lightweight repo context to guide the model
function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

const pkgJson = safeRead('package.json');
const indexHtml = safeRead('index.html');
const appTsx = safeRead('src/App.tsx');
const mainTsx = safeRead('src/main.tsx');

(async () => {
  const system = [
    'You are an expert software engineer editing this repository. ',
    'Your job is to IMPLEMENT the requested feature directly by returning ONLY a single fenced JSON object.',
    'Do not output any prose before or after. Do not include backticks outside the fence. No explanations.',
    'Every change must appear in the JSON as a full file content replacement (no patches).',
    'Prefer minimal, safe edits that compile and run.'
  ].join('');

  const prompt = [
    'Repository context (read-only to you):',
    '--- package.json ---',
    pkgJson || '(missing)',
    '--- index.html ---',
    indexHtml || '(missing)',
    '--- key files ---',
    'src/App.tsx:\n' + (appTsx || '(missing)'),
    'src/main.tsx:\n' + (mainTsx || '(missing)'),
    '',
    'Feature request (implement now):',
    FEATURE,
    '',
    'Return ONLY a fenced JSON block with the following shape:',
    '```json',
    '{\n  "changes": [ { "path": "relative/file/path", "content": "full new file content" } ],\n  "notes": "short notes/instructions"\n}',
    '```',
    '',
    'Rules:',
    '- Include full file contents for small files you add or replace (<= 300 lines).',
    '- Use this project\'s conventions (TypeScript+Vite React app).',
    '- If creating a basic UI page/app, update src/App.tsx and any necessary bootstrapping files.',
    '- If adding dependencies, also update package.json and optionally note install steps in notes.',
    '- Do not output anything except the fenced JSON. No extra backticks outside the fence.'
  ].join('\n');

  const msg = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 3000,
    temperature: 0.2,
    system,
    messages: [
      { role: 'user', content: prompt }
    ]
  });

  const parts = msg.content || [];
  const text = parts.map(p => (typeof p === 'string' ? p : p.text)).join('\n');

  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const rawJson = fenceMatch ? fenceMatch[1] : (text.trim().startsWith('{') ? text.trim() : '');
  if (!rawJson) {
    console.log('No JSON changes found.');
    return;
  }
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (e) {
    console.log('Failed to parse JSON, aborting without changes.');
    return;
  }

  const changes = Array.isArray(data.changes) ? data.changes : [];
  let wrote = 0;
  for (const ch of changes) {
    if (!ch || !ch.path || typeof ch.content !== 'string') continue;
    const fp = path.resolve(process.cwd(), ch.path);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, ch.content, 'utf8');
    console.log('✅ Wrote', ch.path);
    wrote++;
  }
  if (data.notes) {
    fs.writeFileSync('FEATURE_AI_NOTES.md', String(data.notes));
  }
  if (wrote === 0) {
    console.log('⚠️ No files written from model response.');
  }
})().catch(err => {
  console.error('❌ Error running Anthropic:', err?.stack || err?.message || String(err));
  process.exit(0); // don't fail the workflow
});
