const assert = require('assert');
const { buildDatabase, computeCoverageMatrix, makeRecordId } = require('../src/db');

const sampleState = {
  schemaVersion: 'global-llm-radar-v1',
  generatedAt: '2026-07-06T00:00:00.000Z',
  asOf: '2026-07-06T00:00:00.000Z',
  vendors: [
    { id: 'openai', name: 'OpenAI', region: 'US', tier: 'frontier', sourceUrl: 'https://example.com/openai' },
    { id: 'deepseek', name: 'DeepSeek', region: 'CN', tier: 'frontier-price', sourceUrl: 'https://example.com/deepseek' }
  ],
  sourceRegistry: [
    { sourceId: 'official_price_pages', sourceName: 'Official pricing pages', sourceType: 'official_pricing', tier: 1, url: 'vendor urls' },
    { sourceId: 'litellm_prices', sourceName: 'LiteLLM', sourceType: 'third_party_price_aggregator', tier: 3, url: 'https://example.com/litellm' },
    { sourceId: 'huggingface_api', sourceName: 'HF', sourceType: 'open_source_ecosystem_proxy', tier: 3, url: 'https://example.com/hf' }
  ],
  sourceStatuses: { litellm_prices: { ok: true }, huggingface_api: { ok: true } },
  pricingRecords: [
    { recordId: 'p1', vendorId: 'openai', vendorName: 'OpenAI', modelName: 'gpt-test', inputUsdPer1M: 1, outputUsdPer1M: 3, contextWindowTokens: 128000, sourceId: 'litellm_prices', sourceName: 'LiteLLM', sourceTier: 3, observedAt: '2026-07-06T00:00:00.000Z', sourceUrl: 'https://example.com/litellm', sourceBoundary: 'proxy' },
    { recordId: 'p2', vendorId: 'deepseek', vendorName: 'DeepSeek', modelName: 'deepseek-test', inputUsdPer1M: 0.1, outputUsdPer1M: 0.2, contextWindowTokens: 64000, sourceId: 'litellm_prices', sourceName: 'LiteLLM', sourceTier: 3, observedAt: '2026-07-06T00:00:00.000Z', sourceUrl: 'https://example.com/litellm', sourceBoundary: 'proxy' }
  ],
  adoptionSignals: [
    { recordId: 'a1', vendorId: 'deepseek', vendorName: 'DeepSeek', modelName: 'deepseek-ai/DeepSeek-R1', metric: 'hf_downloads_total', value: 1000, sourceId: 'huggingface_api', observedAt: '2026-07-06T00:00:00.000Z', sourceUrl: 'https://example.com/hf', sourceBoundary: 'open-source proxy' }
  ],
  usageProxyRecords: [
    { recordId: 'u1', vendorId: 'openai', vendorName: 'OpenAI', modelName: 'gpt-test', metric: 'openrouter_model_list_presence', value: 1, sourceId: 'openrouter_models', observedAt: '2026-07-06T00:00:00.000Z', sourceBoundary: 'channel proxy' },
    { recordId: 'official-url:openai', vendorId: 'openai', vendorName: 'OpenAI', metric: 'official_pricing_url_registered', value: 1, sourceId: 'official_price_pages', sourceUrl: 'https://example.com/openai', sourceBoundary: 'official registry' }
  ],
  alerts: []
};

assert.strictEqual(makeRecordId('pricing', 'OpenAI', 'gpt-test'), 'pricing:openai:gpt-test');

const db = buildDatabase(sampleState);
assert.strictEqual(db.schemaVersion, 'global-llm-token-intelligence-db-v1');
assert.strictEqual(db.tables.dim_vendor.length, 2);
assert.strictEqual(db.tables.dim_model.length, 2);
assert.strictEqual(db.tables.fact_model_pricing.length, 2);
assert.strictEqual(db.tables.fact_adoption_signal.length, 1);
assert.strictEqual(db.tables.fact_usage_proxy.length, 2);
assert.strictEqual(db.tables.fact_source_snapshot.length >= 3, true);
assert(db.indexes.vendorById.openai);
assert(db.indexes.modelsByVendor.deepseek.includes('deepseek-test'));

const coverage = computeCoverageMatrix(db);
const openai = coverage.vendors.find(v => v.vendorId === 'openai');
const deepseek = coverage.vendors.find(v => v.vendorId === 'deepseek');
assert(openai.coverageScore > deepseek.coverageScore, 'OpenAI has pricing + usage + official url, should score higher than DeepSeek in sample');
assert(openai.columns.pricing === true);
assert(openai.columns.usageProxy === true);
assert(openai.columns.officialPricingUrl === true);
assert(deepseek.columns.adoptionProxy === true);
assert(coverage.fieldCoverage.some(x => x.field === 'pricing'));
console.log('db tests passed');
