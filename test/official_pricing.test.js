const assert = require('assert');
const { parseOfficialPricingText, normalizePriceUnit } = require('../src/official_pricing');

assert.strictEqual(normalizePriceUnit('0.27美元/百万tokens'), 0.27);
assert.strictEqual(normalizePriceUnit('$1.10 / 1M output tokens'), 1.10);
assert.strictEqual(normalizePriceUnit('¥2 / 百万tokens', 0.14), 0.28);

const deepseekSample = `
DeepSeek API Pricing
Model Context Length Max Output Tokens Input Price (Cache Hit) Input Price (Cache Miss) Output Price
DeepSeek-V3.2 64K 8K $0.028 / 1M tokens $0.28 / 1M tokens $0.42 / 1M tokens
DeepSeek-R1 64K 8K $0.14 / 1M tokens $0.55 / 1M tokens $2.19 / 1M tokens
`;
const records = parseOfficialPricingText({ vendorId: 'deepseek', vendorName: 'DeepSeek', sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing-details-usd/', text: deepseekSample, observedAt: '2026-07-06T00:00:00Z' });
assert.strictEqual(records.length, 2);
assert.strictEqual(records[0].sourceTier, 1);
assert.strictEqual(records[0].sourceId, 'official_price_pages');
assert.strictEqual(records[0].modelName, 'DeepSeek-V3.2');
assert.strictEqual(records[0].inputUsdPer1M, 0.28);
assert.strictEqual(records[0].cachedInputUsdPer1M, 0.028);
assert.strictEqual(records[0].outputUsdPer1M, 0.42);
assert.strictEqual(records[1].modelName, 'DeepSeek-R1');
assert.strictEqual(records[1].outputUsdPer1M, 2.19);
assert(records[0].recordId.startsWith('official:deepseek:'));
assert(/official/.test(records[0].sourceBoundary));
console.log('official pricing parser tests passed');
