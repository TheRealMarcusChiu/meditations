// Zero-dependency helper + admin API for the Meditations site.
//
//   node server/server.mjs                      serve the site + admin API
//   node server/server.mjs --new 2026-05-18 "A Short Prayer"
//                                               scaffold a meditation from the CLI
//
// The public site needs no server (it runs from file://). This server adds the
// admin API used by index.html's admin mode (⌘E / Ctrl+E): it writes the flat
// meditations/<date>.js files, keeps meditations/manifest.js in sync, and does a
// git commit + push after every change.
//
// The admin API has NO authentication — only run it on a trusted network.

import { createServer } from 'node:http';
import { readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url))); // repo root
const MEDITATIONS = join(ROOT, 'meditations');
const MANIFEST = join(MEDITATIONS, 'manifest.js');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

// ── helpers ──────────────────────────────────────────────────────────────────
const fileFor = (id) => join(MEDITATIONS, id + '.js');
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// Escape a string for embedding in a JS template literal (the body field).
function escBody(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function renderPrayerFile(id, { date, title, hidden, body }) {
  return `// ${date} — ${title}
// Citation syntax: [[shown text||source]]  (source: plain words, a url, or "Label::url").
// A line starting with "> " is an epigraph / scripture line.
(window.PRAYERS = window.PRAYERS || []).push({
  slug: ${JSON.stringify(id)},
  title: ${JSON.stringify(title)},
  date: ${JSON.stringify(date)},
${hidden ? '  hidden: true,\n' : ''}  body:
\`${escBody(body)}\`,
});
`;
}

// Read / write the id list inside window.MEDITATIONS = [ ... ] (site meta untouched).
async function readManifestIds() {
  const text = await readFile(MANIFEST, 'utf8');
  const m = /window\.MEDITATIONS\s*=\s*\[([\s\S]*?)\]/.exec(text);
  if (!m) return { text, ids: [] };
  const ids = (m[1].match(/'([^']+)'|"([^"]+)"/g) || []).map((s) => s.replace(/['"]/g, ''));
  return { text, ids };
}
async function writeManifestIds(ids) {
  const text = await readFile(MANIFEST, 'utf8');
  const uniqSorted = [...new Set(ids)].sort();
  const block = 'window.MEDITATIONS = [\n' + uniqSorted.map((d) => `  '${d}',`).join('\n') + '\n];';
  const next = text.replace(/window\.MEDITATIONS\s*=\s*\[[\s\S]*?\];/, block);
  await writeFile(MANIFEST, next);
}

// Pick a stable, unique file id for a (possibly renamed) meditation.
function computeId(date, origId) {
  if (origId && (origId === date || origId.startsWith(date + '-'))) return origId;
  let id = date, n = 2;
  while (existsSync(fileFor(id)) && id !== origId) id = date + '-' + n++;
  return id;
}

function git(args) {
  return new Promise((res) => {
    execFile('git', args, { cwd: ROOT, timeout: 25000 }, (err, so, se) => res({ err, so: so || '', se: se || '' }));
  });
}
async function commitPush(message) {
  const add = await git(['add', '-A']);
  if (add.err) return { committed: false, pushed: false, error: (add.se || add.err.message).trim() };
  const commit = await git(['commit', '-m', message]);
  const nothing = /nothing to commit/i.test(commit.so + commit.se);
  if (commit.err && !nothing) return { committed: false, pushed: false, error: (commit.se || commit.so || commit.err.message).trim() };
  if (nothing) return { committed: false, pushed: false, skipped: true };
  const push = await git(['push']);
  if (push.err) return { committed: true, pushed: false, error: (push.se || push.err.message).trim() };
  return { committed: true, pushed: true };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ── CLI: scaffold ────────────────────────────────────────────────────────────
async function scaffold(date, title) {
  if (!isDate(date)) { console.error('Usage: node server/server.mjs --new YYYY-MM-DD "Title"'); process.exit(1); }
  const id = computeId(date, null);
  await writeFile(fileFor(id), renderPrayerFile(id, { date, title: title || 'Untitled', hidden: true, body: 'Write the meditation here.' }));
  const { ids } = await readManifestIds();
  await writeManifestIds([...ids, id]);
  console.log(`Created meditations/${id}.js and registered it in manifest.js.`);
}

// ── server ───────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJson(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok: true });

  if (pathname === '/api/prayer' && req.method === 'POST') {
    let d;
    try { d = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON.' }); }
    if (!String(d.title || '').trim()) return sendJson(res, 400, { error: 'Title is required.' });
    if (!isDate(d.date)) return sendJson(res, 400, { error: 'Date must be YYYY-MM-DD.' });

    const id = computeId(d.date, d.origId || null);
    try {
      // handle a rename (date changed → new file id)
      if (d.origId && d.origId !== id) {
        await rm(fileFor(d.origId), { force: true });
      }
      await writeFile(fileFor(id), renderPrayerFile(id, { date: d.date, title: String(d.title).trim(), hidden: !!d.hidden, body: String(d.body || '') }));
      const { ids } = await readManifestIds();
      const nextIds = ids.filter((x) => x !== d.origId).concat(id);
      await writeManifestIds(nextIds);
      const gitResult = await commitPush(`admin: ${d.origId ? 'update' : 'create'} ${id}`);
      return sendJson(res, 200, { id, git: gitResult });
    } catch (err) {
      return sendJson(res, 500, { error: String(err && err.message || err) });
    }
  }
  return sendJson(res, 404, { error: 'Unknown endpoint.' });
}

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return handleApi(req, res, url.pathname);

      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const filePath = normalize(join(ROOT, pathname));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
      const info = await stat(filePath).catch(() => null);
      if (!info || !info.isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(await readFile(filePath));
    } catch {
      res.writeHead(500); res.end('Server error');
    }
  });
  server.listen(PORT, HOST, () => console.log(`Meditations serving at http://${HOST}:${PORT}/  (admin API on /api/*)`));
}

// ── entry ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args[0] === '--new') await scaffold(args[1], args.slice(2).join(' '));
else serve();
