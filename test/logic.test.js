const assert = require('assert');
const { normalizeCostPerMillion, vendorForText, median, calcVendorSummaries, buildAlerts } = require('../src/logic');

assert.strictEqual(normalizeCostPerMillion(0.000001), 1);
assert.strictEqual(normalizeCostPerMillion('0.00000015'), 0.15);
assert.strictEqual(normalizeCostPerMillion(2.5), 2.5);
assert.strictEqual(normalizeCostPerMillion(null), null);

assert.strictEqual(vendorForText('deepseek/deepseek-r1').id, 'deepseek');
assert.strictEqual(vendorForText('anthropic/claude-sonnet-4').id, 'anthropic');
assert.strictEqual(vendorForText('qwen/qwen3-coder').id, 'alibaba');
assert.strictEqual(vendorForText('unknown model'), null);

assert.strictEqual(median([3,1,2]), 2);
assert.strictEqual(median([1,2,3,4]), 2.5);
assert.strictEqual(median([]), null);

const state = {
  pricingRecords: [
    { vendorId:'deepseek', vendorName:'DeepSeek', modelName:'deepseek-chat', inputUsdPer1M:0.14, outputUsdPer1M:0.28, contextWindowTokens:64000, sourceId:'x', sourceName:'x' },
    { vendorId:'openai', vendorName:'OpenAI', modelName:'gpt-long', inputUsdPer1M:1, outputUsdPer1M:4, contextWindowTokens:1000000, sourceId:'x', sourceName:'x' }
  ],
  usageProxyRecords: [{ vendorId:'deepseek', sourceId:'openrouter_models' }],
  adoptionSignals: [{ vendorId:'deepseek', metric:'hf_downloads_total', value:9999 }, { vendorId:'deepseek', metric:'github_stars', value:1000 }]
};
const summaries = calcVendorSummaries(state);
assert(summaries.find(x=>x.vendorId==='deepseek').proxyScore > 0);
const alerts = buildAlerts({ ...state, vendorSummaries: summaries });
assert(alerts.some(a=>a.type==='low_price_competition'));
assert(alerts.some(a=>a.type==='long_context'));
console.log('logic tests passed');
