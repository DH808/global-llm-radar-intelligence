const fs = require('fs');
const path = require('path');
const { VENDORS, normalizeCostPerMillion, vendorForText, sourceTier, calcVendorSummaries, buildAlerts } = require('./logic');
const { buildDatabase } = require('./db');
const { parseOfficialPricingText } = require('./official_pricing');

const DEFAULT_TIMEOUT_MS = Number(process.env.COLLECT_TIMEOUT_MS || 15000);

function readJsonFile(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function nowIso() { return new Date().toISOString(); }

async function fetchJson(url, opts = {}) {
  const r = await fetchText(url, opts);
  if (!r.ok) return r;
  try { return { ...r, data: JSON.parse(r.text) }; }
  catch (err) { return { ok: false, error: `JSON parse: ${err.message}`, bytes: r.bytes, ms: r.ms }; }
}

async function fetchText(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs || DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'global-llm-radar-intelligence/0.1', ...(opts.headers || {}) }, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { ok: true, text, bytes: text.length, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: String(err.message || err), ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

function baseSourceRegistry() {
  return [
    { sourceId: 'litellm_prices', sourceName: 'LiteLLM model_prices_and_context_window.json', sourceType: 'third_party_price_aggregator', tier: sourceTier('third_party_price_aggregator'), url: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json', refresh: '6h', boundary: 'community-maintained price/context aggregator; cross-check official pages for IC use' },
    { sourceId: 'openrouter_models', sourceName: 'OpenRouter Models API', sourceType: 'channel_usage_proxy', tier: sourceTier('channel_usage_proxy'), url: 'https://openrouter.ai/api/v1/models', refresh: '6h', boundary: 'OpenRouter channel model metadata and pricing; not global market share' },
    { sourceId: 'huggingface_api', sourceName: 'Hugging Face public model API', sourceType: 'open_source_ecosystem_proxy', tier: sourceTier('open_source_ecosystem_proxy'), url: 'https://huggingface.co/api/models', refresh: 'daily', boundary: 'open-source model downloads/likes proxy; not inference token volume' },
    { sourceId: 'github_api', sourceName: 'GitHub REST API', sourceType: 'developer_adoption_proxy', tier: sourceTier('developer_adoption_proxy'), url: 'https://api.github.com', refresh: 'daily', boundary: 'developer/code activity proxy; not API usage' },
    { sourceId: 'npm_downloads', sourceName: 'npm downloads API', sourceType: 'developer_adoption_proxy', tier: sourceTier('developer_adoption_proxy'), url: 'https://api.npmjs.org/downloads', refresh: 'daily', boundary: 'SDK install proxy; CI/bot noise likely' },
    { sourceId: 'official_price_pages', sourceName: 'Official vendor pricing pages', sourceType: 'official_pricing', tier: sourceTier('official_pricing'), url: 'vendor-specific URLs', refresh: 'daily', boundary: 'official source layer; v1 records URLs and uses aggregators for normalized values where direct parsing is incomplete' }
  ];
}

async function collectLiteLLM(sourceStatuses) {
  const url = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  const r = await fetchJson(url);
  sourceStatuses.litellm_prices = statusFromResult(r);
  if (!r.ok) return [];
  const rows = [];
  for (const [modelKey, rec] of Object.entries(r.data || {})) {
    const text = `${modelKey} ${rec.litellm_provider || ''} ${rec.mode || ''}`;
    const vendor = vendorForText(text);
    if (!vendor) continue;
    const input = normalizeCostPerMillion(rec.input_cost_per_token ?? rec.input_cost_per_character);
    const output = normalizeCostPerMillion(rec.output_cost_per_token ?? rec.output_cost_per_character);
    const cached = normalizeCostPerMillion(rec.cache_read_input_token_cost ?? rec.cache_creation_input_token_cost);
    const context = Number(rec.max_input_tokens || rec.max_tokens || rec.context_window || rec.max_context_tokens || 0) || null;
    if (input === null && output === null && !context) continue;
    rows.push({
      recordId: `litellm:${modelKey}`,
      sourceId: 'litellm_prices',
      sourceName: 'LiteLLM',
      sourceTier: sourceTier('third_party_price_aggregator'),
      vendorId: vendor.id,
      vendorName: vendor.name,
      modelName: modelKey,
      provider: rec.litellm_provider || null,
      inputUsdPer1M: input,
      outputUsdPer1M: output,
      cachedInputUsdPer1M: cached,
      contextWindowTokens: context,
      maxOutputTokens: Number(rec.max_output_tokens || 0) || null,
      modality: rec.mode || null,
      supportsFunctionCalling: Boolean(rec.supports_function_calling),
      supportsVision: Boolean(rec.supports_vision),
      observedAt: nowIso(),
      sourceUrl: url,
      sourceBoundary: 'LiteLLM community price/context aggregator; verify official pricing before IC publication'
    });
  }
  return rows.slice(0, 1200);
}

async function collectOpenRouter(sourceStatuses) {
  const url = 'https://openrouter.ai/api/v1/models';
  const r = await fetchJson(url);
  sourceStatuses.openrouter_models = statusFromResult(r);
  if (!r.ok) return { pricing: [], usage: [] };
  const models = Array.isArray(r.data && r.data.data) ? r.data.data : [];
  const pricing = [];
  const usage = [];
  for (const m of models) {
    const text = `${m.id || ''} ${m.name || ''} ${m.canonical_slug || ''} ${m.hugging_face_id || ''}`;
    const vendor = vendorForText(text);
    if (!vendor) continue;
    const input = normalizeCostPerMillion(m.pricing && m.pricing.prompt);
    const output = normalizeCostPerMillion(m.pricing && m.pricing.completion);
    const context = Number(m.context_length || 0) || null;
    const common = {
      sourceId: 'openrouter_models', sourceName: 'OpenRouter', sourceTier: sourceTier('channel_usage_proxy'), vendorId: vendor.id, vendorName: vendor.name,
      modelName: m.id || m.name, observedAt: nowIso(), sourceUrl: url,
      sourceBoundary: 'OpenRouter channel metadata/pricing; not global vendor usage or share'
    };
    pricing.push({ recordId: `openrouter:${m.id}`, ...common, provider: m.top_provider && m.top_provider.provider_name || null, inputUsdPer1M: input, outputUsdPer1M: output, cachedInputUsdPer1M: null, contextWindowTokens: context, maxOutputTokens: null, modality: m.architecture && m.architecture.modality || null, supportsFunctionCalling: Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'), supportsVision: /image|vision/i.test(JSON.stringify(m.architecture || {})) });
    usage.push({ recordId: `openrouter-model:${m.id}`, sourceId: 'openrouter_models', vendorId: vendor.id, vendorName: vendor.name, modelName: m.id || m.name, metric: 'openrouter_model_list_presence', value: 1, contextWindowTokens: context, createdAt: m.created ? new Date(m.created * 1000).toISOString() : null, observedAt: nowIso(), coverageScope: 'OpenRouter listed model universe', sourceUrl: url, sourceBoundary: 'presence/count in OpenRouter model catalog; not traffic share' });
  }
  return { pricing, usage };
}

async function collectHuggingFace(sourceStatuses) {
  const out = [];
  let ok = 0, fail = 0;
  for (const vendor of VENDORS) {
    for (const author of vendor.hfAuthors || []) {
      const url = `https://huggingface.co/api/models?author=${encodeURIComponent(author)}&limit=20&full=0&sort=downloads&direction=-1`;
      const r = await fetchJson(url, { timeoutMs: 10000 });
      if (!r.ok) { fail++; continue; }
      ok++;
      for (const m of Array.isArray(r.data) ? r.data : []) {
        out.push({
          recordId: `hf:${m.modelId || m.id}`,
          sourceId: 'huggingface_api',
          vendorId: vendor.id,
          vendorName: vendor.name,
          modelName: m.modelId || m.id,
          metric: 'hf_downloads_total',
          value: Number(m.downloads || 0),
          secondaryMetric: 'hf_likes_total',
          secondaryValue: Number(m.likes || 0),
          observedAt: nowIso(),
          asOf: m.lastModified || null,
          coverageScope: `Hugging Face author=${author}`,
          sourceUrl: `https://huggingface.co/${m.modelId || m.id}`,
          sourceBoundary: 'HF downloads/likes are open-source ecosystem proxies, not API token volume'
        });
      }
    }
  }
  sourceStatuses.huggingface_api = { ok: ok > 0, okCount: ok, failCount: fail, observedAt: nowIso() };
  return out;
}

async function collectGitHub(sourceStatuses) {
  const out = [];
  let ok = 0, fail = 0;
  for (const vendor of VENDORS) {
    for (const repo of vendor.githubRepos || []) {
      const url = `https://api.github.com/repos/${repo}`;
      const r = await fetchJson(url, { timeoutMs: 10000, headers: process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {} });
      if (!r.ok) { fail++; continue; }
      ok++;
      out.push({ recordId: `github:${repo}:stars`, sourceId: 'github_api', vendorId: vendor.id, vendorName: vendor.name, modelName: repo, metric: 'github_stars', value: Number(r.data.stargazers_count || 0), secondaryMetric: 'github_forks', secondaryValue: Number(r.data.forks_count || 0), observedAt: nowIso(), asOf: r.data.pushed_at || r.data.updated_at || null, coverageScope: 'selected official or high-signal repositories', sourceUrl: r.data.html_url || url, sourceBoundary: 'GitHub repository activity proxy; not commercial usage' });
    }
  }
  sourceStatuses.github_api = { ok: ok > 0, okCount: ok, failCount: fail, observedAt: nowIso() };
  return out;
}

async function collectNpm(sourceStatuses) {
  const out = [];
  let ok = 0, fail = 0;
  for (const vendor of VENDORS) {
    for (const pkg of vendor.npmPackages || []) {
      const url = `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`;
      const r = await fetchJson(url, { timeoutMs: 10000 });
      if (!r.ok) { fail++; continue; }
      ok++;
      out.push({ recordId: `npm:${pkg}:last-month`, sourceId: 'npm_downloads', vendorId: vendor.id, vendorName: vendor.name, modelName: pkg, metric: 'npm_downloads_last_month', value: Number(r.data.downloads || 0), observedAt: nowIso(), asOf: `${r.data.start || ''}/${r.data.end || ''}`, coverageScope: 'npm package downloads last month', sourceUrl: `https://www.npmjs.com/package/${pkg}`, sourceBoundary: 'npm SDK downloads proxy; CI/bot/version-update noise; not token volume' });
    }
  }
  sourceStatuses.npm_downloads = { ok: ok > 0, okCount: ok, failCount: fail, observedAt: nowIso() };
  return out;
}

async function collectOfficialPricing(sourceStatuses) {
  const out = [];
  const targets = VENDORS.filter(v => v.id === 'deepseek');
  let ok = 0, fail = 0;
  for (const vendor of targets) {
    const r = await fetchText(vendor.sourceUrl, { timeoutMs: 15000, headers: { 'user-agent': 'Mozilla/5.0 global-llm-radar-intelligence/0.1' } });
    if (!r.ok) { fail++; continue; }
    const parsed = parseOfficialPricingText({ vendorId: vendor.id, vendorName: vendor.name, sourceUrl: vendor.sourceUrl, text: r.text, observedAt: nowIso() });
    if (parsed.length) ok++; else fail++;
    out.push(...parsed);
  }
  sourceStatuses.official_price_pages = { ok: ok > 0, okCount: ok, failCount: fail, parsedRecords: out.length, observedAt: nowIso() };
  return out;
}

function officialSourcePlaceholders() {
  return VENDORS.map(v => ({
    recordId: `official-url:${v.id}`,
    sourceId: 'official_price_pages',
    vendorId: v.id,
    vendorName: v.name,
    metric: 'official_pricing_url_registered',
    value: 1,
    observedAt: nowIso(),
    coverageScope: 'official pricing/model documentation URL registry',
    sourceUrl: v.sourceUrl,
    sourceBoundary: 'registered official source for analyst verification; normalized v1 prices may come from LiteLLM/OpenRouter until parser is added'
  }));
}

function statusFromResult(r) {
  return r.ok ? { ok: true, bytes: r.bytes, ms: r.ms, observedAt: nowIso() } : { ok: false, error: r.error, ms: r.ms, observedAt: nowIso() };
}

async function collectState() {
  const generatedAt = nowIso();
  const sourceStatuses = {};
  const sourceRegistry = baseSourceRegistry();
  let [litellm, openrouter, hf, github, npm, officialPricing] = await Promise.all([
    collectLiteLLM(sourceStatuses),
    collectOpenRouter(sourceStatuses),
    collectHuggingFace(sourceStatuses),
    collectGitHub(sourceStatuses),
    collectNpm(sourceStatuses),
    collectOfficialPricing(sourceStatuses)
  ]);
  const staleState = readJsonFile(path.join(__dirname, '..', 'data', 'latest_state.json'), {});
  if ((!openrouter.pricing || !openrouter.pricing.length) && staleState.pricingRecords) {
    openrouter.pricing = staleState.pricingRecords.filter(x => x.sourceId === 'openrouter_models');
    openrouter.usage = staleState.usageProxyRecords ? staleState.usageProxyRecords.filter(x => x.sourceId === 'openrouter_models') : [];
    sourceStatuses.openrouter_models = { ...(sourceStatuses.openrouter_models || {}), ok: false, staleFallback: true, fallbackPricingRecords: openrouter.pricing.length, fallbackUsageRecords: openrouter.usage.length, observedAt: nowIso() };
  }
  if ((!github || !github.length) && staleState.adoptionSignals) {
    github = staleState.adoptionSignals.filter(x => x.sourceId === 'github_api');
    sourceStatuses.github_api = { ...(sourceStatuses.github_api || {}), ok: false, staleFallback: true, fallbackRecords: github.length, observedAt: nowIso() };
  }
  const pricingRecords = [...officialPricing, ...litellm, ...openrouter.pricing];
  const usageProxyRecords = [...openrouter.usage, ...officialSourcePlaceholders()];
  const adoptionSignals = [...hf, ...github, ...npm];
  const state = {
    schemaVersion: 'global-llm-radar-v1',
    generatedAt,
    asOf: generatedAt,
    productBoundary: 'Global LLM vendor pricing/model/adoption proxy radar. Token-volume fields are proxies by source/channel, not global market share.',
    sourceRegistry,
    sourceStatuses,
    vendors: VENDORS.map(({ aliases, ...v }) => v),
    pricingRecords,
    usageProxyRecords,
    adoptionSignals,
    metrics: {
      vendorCount: VENDORS.length,
      pricingRecordCount: pricingRecords.length,
      usageProxyRecordCount: usageProxyRecords.length,
      adoptionSignalCount: adoptionSignals.length,
      officialPricingUrlCount: VENDORS.length,
      sourceOkCount: Object.values(sourceStatuses).filter(s => s.ok).length,
      sourceFailCount: Object.values(sourceStatuses).filter(s => s.ok === false).length
    },
    limitations: [
      'No public source provides complete global token volume for OpenAI/Anthropic/Google/DeepSeek/Qwen/Doubao/etc.',
      'OpenRouter and Cloud/SDK/HF/GitHub data are channel/developer/open-source proxies, not total market share.',
      'LiteLLM/OpenRouter price records are normalized public aggregators; official pages remain the IC-grade verification layer.',
      'Enterprise contract pricing, committed-use discounts and private deployment volumes are generally unavailable.'
    ]
  };
  state.vendorSummaries = calcVendorSummaries(state);
  state.alerts = buildAlerts(state);
  const db = buildDatabase(state);
  state.databaseSummary = {
    schemaVersion: db.schemaVersion,
    metrics: db.metrics,
    coverage: db.coverage,
    tableNames: Object.keys(db.tables),
    boundary: db.productBoundary
  };
  return state;
}

function writeState(state, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

module.exports = { collectState, writeState };
