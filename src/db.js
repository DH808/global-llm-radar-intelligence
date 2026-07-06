function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'unknown';
}

function makeRecordId(type, vendor, object) {
  return `${slug(type)}:${slug(vendor)}:${slug(object)}`;
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function boolCount(obj) {
  return Object.values(obj).filter(Boolean).length;
}

function dedupeById(rows, idField) {
  const seen = new Map();
  for (const row of rows) {
    const id = row[idField];
    if (!seen.has(id)) seen.set(id, row);
    else seen.set(id, { ...seen.get(id), ...row });
  }
  return Array.from(seen.values());
}

function buildDatabase(state) {
  const observedAt = state.asOf || state.generatedAt || new Date().toISOString();
  const sourceRegistry = state.sourceRegistry || [];
  const vendors = state.vendors || [];
  const pricing = state.pricingRecords || [];
  const adoption = state.adoptionSignals || [];
  const usage = state.usageProxyRecords || [];

  const dim_source = sourceRegistry.map(s => ({
    sourceId: s.sourceId,
    sourceName: s.sourceName,
    sourceType: s.sourceType,
    sourceTier: s.tier,
    url: s.url,
    refreshFrequency: s.refresh || null,
    boundary: s.boundary || null,
    statusOk: Boolean(state.sourceStatuses && state.sourceStatuses[s.sourceId] && state.sourceStatuses[s.sourceId].ok),
    observedAt
  }));

  const dim_vendor = vendors.map(v => ({
    vendorId: v.id,
    vendorName: v.name,
    region: v.region || 'Other',
    tier: v.tier || null,
    ownershipType: v.ownership_type || v.ownershipType || null,
    officialPricingUrl: v.sourceUrl || null,
    coverageStatus: 'active',
    observedAt
  }));

  const modelRows = [];
  for (const p of pricing) {
    modelRows.push({
      modelId: makeRecordId('model', p.vendorId || p.vendorName, p.modelName),
      vendorId: p.vendorId,
      vendorName: p.vendorName,
      modelName: p.modelName,
      modelFamily: inferFamily(p.modelName, p.vendorName),
      modality: p.modality || null,
      channelPresence: [p.sourceId].filter(Boolean),
      contextWindowTokens: num(p.contextWindowTokens),
      maxOutputTokens: num(p.maxOutputTokens),
      supportsFunctionCalling: Boolean(p.supportsFunctionCalling),
      supportsVision: Boolean(p.supportsVision),
      firstObservedAt: p.observedAt || observedAt,
      lastObservedAt: p.observedAt || observedAt
    });
  }
  for (const u of usage) {
    if (u.modelName) modelRows.push({
      modelId: makeRecordId('model', u.vendorId || u.vendorName, u.modelName),
      vendorId: u.vendorId,
      vendorName: u.vendorName,
      modelName: u.modelName,
      modelFamily: inferFamily(u.modelName, u.vendorName),
      modality: null,
      channelPresence: [u.sourceId].filter(Boolean),
      contextWindowTokens: num(u.contextWindowTokens),
      maxOutputTokens: null,
      supportsFunctionCalling: false,
      supportsVision: false,
      firstObservedAt: u.observedAt || observedAt,
      lastObservedAt: u.observedAt || observedAt
    });
  }
  const dim_model = mergeModels(modelRows);

  const fact_model_pricing = pricing.map(p => ({
    pricingId: p.recordId || makeRecordId('pricing', p.vendorId || p.vendorName, p.modelName),
    modelId: makeRecordId('model', p.vendorId || p.vendorName, p.modelName),
    vendorId: p.vendorId,
    sourceId: p.sourceId,
    sourceTier: p.sourceTier || null,
    channel: p.provider || p.sourceName || null,
    modelName: p.modelName,
    inputUsdPer1M: num(p.inputUsdPer1M),
    outputUsdPer1M: num(p.outputUsdPer1M),
    cachedInputUsdPer1M: num(p.cachedInputUsdPer1M),
    batchInputUsdPer1M: num(p.batchInputUsdPer1M),
    batchOutputUsdPer1M: num(p.batchOutputUsdPer1M),
    contextWindowTokens: num(p.contextWindowTokens),
    maxOutputTokens: num(p.maxOutputTokens),
    currency: 'USD',
    unit: 'per_1m_tokens',
    observedAt: p.observedAt || observedAt,
    effectiveDate: p.effectiveDate || null,
    sourceUrl: p.sourceUrl || null,
    sourceBoundary: p.sourceBoundary || null,
    confidenceScore: confidenceFromTier(p.sourceTier || 3)
  }));

  const fact_adoption_signal = adoption.map(a => ({
    adoptionId: a.recordId || makeRecordId('adoption', a.vendorId || a.vendorName, `${a.metric}:${a.modelName}`),
    vendorId: a.vendorId,
    modelId: a.modelName ? makeRecordId('model', a.vendorId || a.vendorName, a.modelName) : null,
    sourceId: a.sourceId,
    metric: a.metric,
    value: num(a.value),
    secondaryMetric: a.secondaryMetric || null,
    secondaryValue: num(a.secondaryValue),
    objectName: a.modelName || null,
    coverageScope: a.coverageScope || null,
    asOf: a.asOf || a.observedAt || observedAt,
    observedAt: a.observedAt || observedAt,
    sourceUrl: a.sourceUrl || null,
    sourceBoundary: a.sourceBoundary || null,
    confidenceScore: 55
  }));

  const fact_usage_proxy = usage.map(u => ({
    usageProxyId: u.recordId || makeRecordId('usage', u.vendorId || u.vendorName, `${u.metric}:${u.modelName || u.sourceId}`),
    vendorId: u.vendorId,
    modelId: u.modelName ? makeRecordId('model', u.vendorId || u.vendorName, u.modelName) : null,
    sourceId: u.sourceId,
    metric: u.metric,
    value: num(u.value),
    objectName: u.modelName || null,
    coverageScope: u.coverageScope || null,
    asOf: u.asOf || u.observedAt || observedAt,
    observedAt: u.observedAt || observedAt,
    sourceUrl: u.sourceUrl || null,
    sourceBoundary: u.sourceBoundary || null,
    confidenceScore: u.sourceId === 'official_price_pages' ? 80 : 50
  }));

  const fact_source_snapshot = dim_source.map(s => ({
    snapshotId: makeRecordId('source-snapshot', s.sourceId, observedAt),
    sourceId: s.sourceId,
    observedAt,
    statusOk: s.statusOk,
    recordCounts: {
      pricing: fact_model_pricing.filter(x => x.sourceId === s.sourceId).length,
      adoption: fact_adoption_signal.filter(x => x.sourceId === s.sourceId).length,
      usageProxy: fact_usage_proxy.filter(x => x.sourceId === s.sourceId).length
    },
    boundary: s.boundary
  }));

  const fact_alert = (state.alerts || []).map((a, i) => ({
    alertId: a.alertId || `alert:${observedAt}:${i}`,
    vendorId: a.vendorId || null,
    severity: a.severity,
    type: a.type,
    title: a.title,
    detail: a.detail || null,
    sourceId: a.sourceId || null,
    observedAt,
    sourceBoundary: a.sourceBoundary || null
  }));

  const tables = { dim_vendor, dim_model, dim_source, fact_model_pricing, fact_adoption_signal, fact_usage_proxy, fact_source_snapshot, fact_alert };
  const db = {
    schemaVersion: 'global-llm-token-intelligence-db-v1',
    asOf: observedAt,
    productBoundary: state.productBoundary || 'source-bound LLM token intelligence database; proxy metrics are not global market share',
    tables,
    indexes: buildIndexes(tables),
    coverage: null
  };
  db.coverage = computeCoverageMatrix(db);
  db.metrics = {
    vendors: dim_vendor.length,
    models: dim_model.length,
    sources: dim_source.length,
    pricingFacts: fact_model_pricing.length,
    adoptionFacts: fact_adoption_signal.length,
    usageProxyFacts: fact_usage_proxy.length,
    alerts: fact_alert.length,
    avgCoverageScore: avg(db.coverage.vendors.map(x => x.coverageScore))
  };
  return db;
}

function mergeModels(rows) {
  const by = new Map();
  for (const row of rows) {
    const prev = by.get(row.modelId);
    if (!prev) { by.set(row.modelId, row); continue; }
    by.set(row.modelId, {
      ...prev,
      ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined && v !== false)),
      channelPresence: Array.from(new Set([...(prev.channelPresence || []), ...(row.channelPresence || [])])),
      contextWindowTokens: Math.max(prev.contextWindowTokens || 0, row.contextWindowTokens || 0) || null,
      supportsFunctionCalling: Boolean(prev.supportsFunctionCalling || row.supportsFunctionCalling),
      supportsVision: Boolean(prev.supportsVision || row.supportsVision),
      firstObservedAt: [prev.firstObservedAt, row.firstObservedAt].filter(Boolean).sort()[0],
      lastObservedAt: [prev.lastObservedAt, row.lastObservedAt].filter(Boolean).sort().slice(-1)[0]
    });
  }
  return Array.from(by.values()).sort((a, b) => String(a.vendorId).localeCompare(String(b.vendorId)) || String(a.modelName).localeCompare(String(b.modelName)));
}

function buildIndexes(tables) {
  const vendorById = Object.fromEntries(tables.dim_vendor.map(v => [v.vendorId, v]));
  const sourceById = Object.fromEntries(tables.dim_source.map(s => [s.sourceId, s]));
  const modelById = Object.fromEntries(tables.dim_model.map(m => [m.modelId, m]));
  const modelsByVendor = {};
  for (const m of tables.dim_model) {
    modelsByVendor[m.vendorId] = modelsByVendor[m.vendorId] || [];
    modelsByVendor[m.vendorId].push(m.modelName);
  }
  return { vendorById, sourceById, modelById, modelsByVendor };
}

function computeCoverageMatrix(db) {
  const t = db.tables;
  const vendors = t.dim_vendor.map(v => {
    const cols = {
      officialPricingUrl: Boolean(v.officialPricingUrl) || t.fact_usage_proxy.some(x => x.vendorId === v.vendorId && x.sourceId === 'official_price_pages'),
      pricing: t.fact_model_pricing.some(x => x.vendorId === v.vendorId),
      usageProxy: t.fact_usage_proxy.some(x => x.vendorId === v.vendorId && x.sourceId !== 'official_price_pages'),
      adoptionProxy: t.fact_adoption_signal.some(x => x.vendorId === v.vendorId),
      modelCatalog: t.dim_model.some(x => x.vendorId === v.vendorId),
      alerts: t.fact_alert.some(x => x.vendorId === v.vendorId),
      officialParsedPrice: t.fact_model_pricing.some(x => x.vendorId === v.vendorId && x.sourceTier <= 1),
      financialDisclosure: false,
      appWebTraffic: false,
      enterpriseCustomerEvidence: false
    };
    const weights = {
      officialPricingUrl: 10, pricing: 18, usageProxy: 16, adoptionProxy: 12, modelCatalog: 12, alerts: 4,
      officialParsedPrice: 12, financialDisclosure: 6, appWebTraffic: 5, enterpriseCustomerEvidence: 5
    };
    const score = Object.entries(cols).reduce((a, [k, v]) => a + (v ? weights[k] : 0), 0);
    return { vendorId: v.vendorId, vendorName: v.vendorName, region: v.region, columns: cols, coverageScore: score };
  }).sort((a, b) => b.coverageScore - a.coverageScore);
  const fields = Object.keys(vendors[0] ? vendors[0].columns : {});
  const fieldCoverage = fields.map(field => ({
    field,
    coveredVendors: vendors.filter(v => v.columns[field]).length,
    totalVendors: vendors.length,
    coveragePct: vendors.length ? Math.round(vendors.filter(v => v.columns[field]).length / vendors.length * 100) : 0
  }));
  return { vendors, fieldCoverage };
}

function inferFamily(modelName, vendorName) {
  const s = `${modelName || ''} ${vendorName || ''}`.toLowerCase();
  if (s.includes('claude')) return 'Claude';
  if (s.includes('gemini')) return 'Gemini';
  if (s.includes('gpt') || s.includes('openai') || /\bo[1345]/.test(s)) return 'GPT/OpenAI';
  if (s.includes('llama')) return 'Llama';
  if (s.includes('deepseek')) return 'DeepSeek';
  if (s.includes('qwen')) return 'Qwen';
  if (s.includes('doubao') || s.includes('seed')) return 'Doubao/Seed';
  if (s.includes('hunyuan')) return 'Hunyuan';
  if (s.includes('glm') || s.includes('chatglm')) return 'GLM';
  if (s.includes('kimi') || s.includes('moonshot')) return 'Kimi';
  if (s.includes('mistral') || s.includes('mixtral') || s.includes('codestral')) return 'Mistral';
  return 'Other';
}

function confidenceFromTier(tier) {
  if (tier <= 1) return 90;
  if (tier === 2) return 75;
  if (tier === 3) return 60;
  if (tier === 4) return 35;
  return 20;
}
function avg(xs) {
  const arr = xs.filter(Number.isFinite);
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

module.exports = { buildDatabase, computeCoverageMatrix, makeRecordId, inferFamily };
