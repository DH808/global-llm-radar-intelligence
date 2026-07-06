const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { collectState, writeState } = require('./src/collector');
const { buildDatabase } = require('./src/db');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(APP_DIR, 'data', 'latest_state.json');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8846);
const LIVE_REFRESH_ENABLED = process.env.LIVE_REFRESH_ENABLED !== 'false';
const REFRESH_TTL_MS = Number(process.env.REFRESH_TTL_MS || 15 * 60 * 1000);

let memoryState = null;
let memoryLoadedAt = 0;
let refreshPromise = null;

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function loadState() {
  if (!memoryState || Date.now() - memoryLoadedAt > 30_000) {
    memoryState = readJson(DATA_FILE, fallbackState());
    memoryLoadedAt = Date.now();
  }
  return memoryState;
}

function fallbackState() {
  return { schemaVersion: 'global-llm-radar-v1', generatedAt: new Date().toISOString(), asOf: new Date().toISOString(), metrics: { vendorCount: 0, pricingRecordCount: 0, usageProxyRecordCount: 0, adoptionSignalCount: 0, sourceOkCount: 0, sourceFailCount: 1 }, vendors: [], vendorSummaries: [], pricingRecords: [], usageProxyRecords: [], adoptionSignals: [], alerts: [], limitations: ['No collected snapshot available yet.'], sourceStatuses: { local_snapshot: { ok: false, error: 'missing data/latest_state.json' } } };
}

async function maybeRefresh(force = false) {
  const state = loadState();
  const age = Date.now() - Date.parse(state.generatedAt || 0);
  if (!LIVE_REFRESH_ENABLED && !force) return state;
  if (!force && Number.isFinite(age) && age < REFRESH_TTL_MS) return state;
  if (!refreshPromise) {
    refreshPromise = collectState().then(next => {
      writeState(next, DATA_FILE);
      memoryState = next;
      memoryLoadedAt = Date.now();
      return next;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'access-control-allow-origin': '*', ...headers });
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, JSON.stringify(obj, null, 2), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
}
function text404(res) { send(res, 404, 'Not Found', { 'content-type': 'text/plain; charset=utf-8' }); }
function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8' }[ext] || 'application/octet-stream';
}
function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return text404(res);
  send(res, 200, fs.readFileSync(file), { 'content-type': mime(file), 'cache-control': 'no-cache' });
}
function pickStateView(state) {
  return {
    ...state,
    pricingRecords: (state.pricingRecords || []).slice(0, 600),
    adoptionSignals: (state.adoptionSignals || []).slice(0, 500),
    usageProxyRecords: (state.usageProxyRecords || []).slice(0, 500)
  };
}
function pickDbView(db) {
  return {
    schemaVersion: db.schemaVersion,
    asOf: db.asOf,
    productBoundary: db.productBoundary,
    metrics: db.metrics,
    coverage: db.coverage,
    tables: {
      dim_vendor: db.tables.dim_vendor,
      dim_model: db.tables.dim_model.slice(0, 1000),
      dim_source: db.tables.dim_source,
      fact_model_pricing: db.tables.fact_model_pricing.slice(0, 1000),
      fact_adoption_signal: db.tables.fact_adoption_signal.slice(0, 800),
      fact_usage_proxy: db.tables.fact_usage_proxy.slice(0, 800),
      fact_source_snapshot: db.tables.fact_source_snapshot,
      fact_alert: db.tables.fact_alert.slice(0, 200)
    },
    indexes: { modelsByVendor: db.indexes.modelsByVendor }
  };
}
function databaseSchemaContract() {
  return {
    schemaVersion: 'global-llm-token-intelligence-db-v1',
    principle: 'All material facts are source-bound, vintage-aware and labeled as official fact, channel sample, developer/open-source proxy, or estimate.',
    primaryKeys: {
      dim_vendor: 'vendorId', dim_model: 'modelId', dim_source: 'sourceId', fact_model_pricing: 'pricingId', fact_adoption_signal: 'adoptionId', fact_usage_proxy: 'usageProxyId', fact_source_snapshot: 'snapshotId', fact_alert: 'alertId'
    },
    requiredVintageFields: ['observedAt', 'asOf/effectiveDate', 'sourceId', 'sourceUrl', 'sourceBoundary', 'confidenceScore'],
    plannedButMissing: ['officialParsedPrice for every vendor', 'financialDisclosure facts', 'appWebTraffic facts', 'enterpriseCustomerEvidence facts', 'historical price-diff fact table']
  };
}

async function handleApi(req, res, pathname, url) {
  try {
    if (pathname === '/api/health') {
      const state = loadState();
      return json(res, 200, { ok: true, service: 'global-llm-radar-intelligence', time: new Date().toISOString(), generatedAt: state.generatedAt, metrics: state.metrics, liveRefresh: LIVE_REFRESH_ENABLED });
    }
    if (pathname === '/api/state') {
      const force = url.searchParams.get('refresh') === '1';
      const state = await maybeRefresh(force);
      return json(res, 200, pickStateView(state));
    }
    if (pathname === '/api/db') {
      const state = await maybeRefresh(url.searchParams.get('refresh') === '1');
      const db = buildDatabase(state);
      return json(res, 200, pickDbView(db));
    }
    if (pathname === '/api/coverage') {
      const state = await maybeRefresh(false);
      const db = buildDatabase(state);
      return json(res, 200, { asOf: db.asOf, metrics: db.metrics, coverage: db.coverage, tables: Object.fromEntries(Object.entries(db.tables).map(([k, v]) => [k, v.length])) });
    }
    if (pathname === '/api/schema') {
      return json(res, 200, databaseSchemaContract());
    }
    if (pathname === '/api/export/markdown') {
      const state = await maybeRefresh(false);
      return send(res, 200, renderMarkdown(state), { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="global-llm-radar.md"' });
    }
    return json(res, 404, { error: 'api_not_found' });
  } catch (err) {
    return json(res, 500, { error: err.message, stack: process.env.NODE_ENV === 'production' ? undefined : err.stack });
  }
}

function renderMarkdown(state) {
  const lines = [];
  lines.push('# Global LLM Radar Intelligence');
  lines.push('');
  lines.push(`As of: ${state.asOf}`);
  lines.push('');
  lines.push('## Boundary');
  lines.push(state.productBoundary || 'Public-source LLM radar.');
  lines.push('');
  lines.push('## Top vendor summaries');
  for (const v of (state.vendorSummaries || []).slice(0, 20)) {
    lines.push(`- **${v.name}** (${v.region}): proxyScore=${v.proxyScore}, priceRecords=${v.modelPriceCount}, OpenRouterModels=${v.openRouterModelCount}, minInput=$${fmt(v.minInputUsdPer1M)}, minOutput=$${fmt(v.minOutputUsdPer1M)}, HF=${v.hfDownloads}, GitHubStars=${v.githubStars}, npm=${v.npmDownloadsLastMonth}`);
  }
  lines.push('');
  lines.push('## Alerts');
  for (const a of (state.alerts || []).slice(0, 30)) lines.push(`- ${a.severity}/${a.type}: ${a.title} — ${a.detail || ''}`);
  lines.push('');
  lines.push('## Limitations');
  for (const l of state.limitations || []) lines.push(`- ${l}`);
  return lines.join('\n');
}
function fmt(x) { return Number.isFinite(x) ? x.toFixed(3) : 'n/a'; }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'content-type' });
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname, url);
  return serveStatic(res, pathname);
});

server.listen(PORT, HOST, () => {
  console.error(`Global LLM Radar listening on http://${HOST}:${PORT}/ data=${DATA_FILE}`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
