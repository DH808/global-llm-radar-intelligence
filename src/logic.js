const VENDORS = [
  { id: 'openai', name: 'OpenAI', region: 'US', tier: 'frontier', aliases: ['openai', 'gpt-', 'o1', 'o3', 'o4', 'chatgpt'], hfAuthors: [], githubRepos: ['openai/openai-python', 'openai/openai-node'], npmPackages: ['openai'], sourceUrl: 'https://developers.openai.com/api/docs/pricing' },
  { id: 'anthropic', name: 'Anthropic', region: 'US', tier: 'frontier', aliases: ['anthropic', 'claude'], hfAuthors: [], githubRepos: ['anthropics/anthropic-sdk-python', 'anthropics/anthropic-sdk-typescript'], npmPackages: ['@anthropic-ai/sdk'], sourceUrl: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { id: 'google', name: 'Google Gemini', region: 'US', tier: 'frontier', aliases: ['google', 'gemini', 'palm', 'vertex'], hfAuthors: ['google'], githubRepos: ['googleapis/python-genai', 'google-gemini/generative-ai-js'], npmPackages: ['@google/genai', '@google/generative-ai'], sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing' },
  { id: 'meta', name: 'Meta Llama', region: 'US', tier: 'open-weight', aliases: ['meta', 'llama', 'meta-llama'], hfAuthors: ['meta-llama'], githubRepos: ['meta-llama/llama-models', 'meta-llama/llama'], npmPackages: [], sourceUrl: 'https://ai.meta.com/llama/' },
  { id: 'mistral', name: 'Mistral AI', region: 'EU', tier: 'frontier', aliases: ['mistral', 'mixtral', 'codestral', 'ministral'], hfAuthors: ['mistralai'], githubRepos: ['mistralai/client-python', 'mistralai/client-js'], npmPackages: ['@mistralai/mistralai'], sourceUrl: 'https://mistral.ai/products/studio/#pricing' },
  { id: 'xai', name: 'xAI Grok', region: 'US', tier: 'frontier', aliases: ['xai', 'grok'], hfAuthors: [], githubRepos: ['xai-org/grok-1'], npmPackages: ['@xai-sdk/client'], sourceUrl: 'https://docs.x.ai/docs/models' },
  { id: 'cohere', name: 'Cohere', region: 'US', tier: 'enterprise', aliases: ['cohere', 'command-r', 'rerank'], hfAuthors: ['CohereForAI'], githubRepos: ['cohere-ai/cohere-python', 'cohere-ai/cohere-typescript'], npmPackages: ['cohere-ai'], sourceUrl: 'https://cohere.com/pricing' },
  { id: 'deepseek', name: 'DeepSeek', region: 'CN', tier: 'frontier-price', aliases: ['deepseek', 'deepseek-ai'], hfAuthors: ['deepseek-ai'], githubRepos: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1'], npmPackages: [], sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing-details-usd/' },
  { id: 'alibaba', name: 'Alibaba Qwen / Tongyi', region: 'CN', tier: 'cloud', aliases: ['qwen', 'dashscope', 'tongyi', 'aliyun', 'alibaba'], hfAuthors: ['Qwen'], githubRepos: ['QwenLM/Qwen3', 'QwenLM/Qwen2.5'], npmPackages: ['@alicloud/dashscope'], sourceUrl: 'https://help.aliyun.com/zh/model-studio/model-pricing' },
  { id: 'bytedance', name: 'ByteDance Doubao / Volcengine', region: 'CN', tier: 'cloud', aliases: ['doubao', 'volcengine', 'bytedance', 'seed'], hfAuthors: [], githubRepos: [], npmPackages: ['@volcengine/openapi'], sourceUrl: 'https://www.volcengine.com/docs/82379/1544106' },
  { id: 'baidu', name: 'Baidu ERNIE / Qianfan', region: 'CN', tier: 'cloud', aliases: ['baidu', 'ernie', 'qianfan', 'wenxin'], hfAuthors: ['baidu'], githubRepos: ['baidubce/bce-qianfan-sdk'], npmPackages: [], sourceUrl: 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya' },
  { id: 'tencent', name: 'Tencent Hunyuan', region: 'CN', tier: 'cloud', aliases: ['tencent', 'hunyuan'], hfAuthors: ['Tencent-Hunyuan'], githubRepos: ['Tencent-Hunyuan/Hunyuan-A13B', 'Tencent-Hunyuan/HunyuanDiT'], npmPackages: [], sourceUrl: 'https://cloud.tencent.com/document/product/1729/97731' },
  { id: 'zhipu', name: 'Zhipu GLM', region: 'CN', tier: 'frontier', aliases: ['zhipu', 'glm', 'bigmodel', 'chatglm'], hfAuthors: ['zai-org', 'THUDM'], githubRepos: ['THUDM/ChatGLM3', 'THUDM/GLM-4'], npmPackages: [], sourceUrl: 'https://bigmodel.cn/pricing' },
  { id: 'moonshot', name: 'Moonshot Kimi', region: 'CN', tier: 'frontier', aliases: ['moonshot', 'kimi'], hfAuthors: ['moonshotai'], githubRepos: ['moonshotai'], npmPackages: [], sourceUrl: 'https://platform.kimi.ai/docs/pricing/chat-v1' },
  { id: 'minimax', name: 'MiniMax', region: 'CN', tier: 'multimodal', aliases: ['minimax', 'abab'], hfAuthors: ['MiniMaxAI'], githubRepos: ['MiniMax-AI/MiniMax-M1'], npmPackages: [], sourceUrl: 'https://platform.minimax.io/docs/pricing/overview' }
];

function normalizeCostPerMillion(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  // LiteLLM/OpenRouter prices are usually per token; official pages often quote per 1M.
  return n < 0.01 ? n * 1_000_000 : n;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function vendorForText(text) {
  const t = String(text || '').toLowerCase();
  let best = null;
  for (const v of VENDORS) {
    const score = v.aliases.reduce((acc, alias) => acc + (t.includes(alias.toLowerCase()) ? Math.max(2, alias.length / 4) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { vendor: v, score };
  }
  return best ? best.vendor : null;
}

function percentileRank(values, value, higherIsBetter = true) {
  const xs = values.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length || !Number.isFinite(value)) return null;
  const below = xs.filter(x => x <= value).length;
  const p = below / xs.length;
  return higherIsBetter ? p : 1 - p;
}

function sourceTier(sourceType) {
  const m = {
    official_pricing: 1,
    official_cloud_price_api: 1,
    official_model_api: 1,
    channel_usage_proxy: 2,
    open_source_ecosystem_proxy: 3,
    developer_adoption_proxy: 3,
    third_party_price_aggregator: 3,
    media_or_manual: 4,
    model_estimate: 5
  };
  return m[sourceType] || 4;
}

function calcVendorSummaries(state) {
  const summaries = VENDORS.map(v => {
    const pricing = (state.pricingRecords || []).filter(x => x.vendorId === v.id);
    const usage = (state.usageProxyRecords || []).filter(x => x.vendorId === v.id);
    const adoption = (state.adoptionSignals || []).filter(x => x.vendorId === v.id);
    const inputPrices = pricing.map(x => cleanNumber(x.inputUsdPer1M)).filter(x => Number.isFinite(x) && x >= 0.001);
    const outputPrices = pricing.map(x => cleanNumber(x.outputUsdPer1M)).filter(x => Number.isFinite(x) && x >= 0.001);
    const hfDownloads = adoption.filter(x => x.metric === 'hf_downloads_total').reduce((a, x) => a + (Number(x.value) || 0), 0);
    const githubStars = adoption.filter(x => x.metric === 'github_stars').reduce((a, x) => a + (Number(x.value) || 0), 0);
    const npmDownloads = adoption.filter(x => x.metric === 'npm_downloads_last_month').reduce((a, x) => a + (Number(x.value) || 0), 0);
    const openRouterModels = usage.filter(x => x.sourceId === 'openrouter_models').length;
    const proxyScore = Math.round(Math.log10(1 + hfDownloads) * 20 + Math.log10(1 + githubStars) * 12 + Math.log10(1 + npmDownloads) * 10 + openRouterModels * 2);
    return {
      vendorId: v.id,
      name: v.name,
      region: v.region,
      tier: v.tier,
      modelPriceCount: pricing.length,
      openRouterModelCount: openRouterModels,
      minInputUsdPer1M: inputPrices.length ? Math.min(...inputPrices) : null,
      medianInputUsdPer1M: median(inputPrices),
      minOutputUsdPer1M: outputPrices.length ? Math.min(...outputPrices) : null,
      medianOutputUsdPer1M: median(outputPrices),
      hfDownloads,
      githubStars,
      npmDownloadsLastMonth: npmDownloads,
      proxyScore,
      officialPricingUrl: v.sourceUrl,
      sourceBoundary: 'summary derived from public price aggregators plus channel/developer/open-source proxies; not global token share'
    };
  });
  return summaries.sort((a, b) => b.proxyScore - a.proxyScore || b.modelPriceCount - a.modelPriceCount);
}

function median(xs) {
  const arr = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function buildAlerts(state) {
  const alerts = [];
  const pricing = state.pricingRecords || [];
  for (const p of pricing) {
    if (Number.isFinite(p.inputUsdPer1M) && Number.isFinite(p.outputUsdPer1M) && p.inputUsdPer1M <= 0.15 && p.outputUsdPer1M <= 0.7) {
      alerts.push({
        severity: 'watch',
        type: 'low_price_competition',
        title: `${p.vendorName} / ${p.modelName} is in low-price zone`,
        detail: `input $${p.inputUsdPer1M.toFixed(3)} / output $${p.outputUsdPer1M.toFixed(3)} per 1M tokens via ${p.sourceName}`,
        vendorId: p.vendorId,
        sourceId: p.sourceId,
        sourceBoundary: 'price point from public aggregator/channel; verify against official page before investment use'
      });
    }
    if (Number.isFinite(p.contextWindowTokens) && p.contextWindowTokens >= 1000000) {
      alerts.push({
        severity: 'info',
        type: 'long_context',
        title: `${p.vendorName} / ${p.modelName} reports >=1M context`,
        detail: `${p.contextWindowTokens.toLocaleString()} token context; long-context pricing and latency should be separately checked`,
        vendorId: p.vendorId,
        sourceId: p.sourceId,
        sourceBoundary: 'context from public model metadata; capability quality not guaranteed'
      });
    }
  }
  for (const s of state.vendorSummaries || []) {
    if (s.proxyScore >= 120) alerts.push({
      severity: 'info',
      type: 'adoption_proxy_strength',
      title: `${s.name} has high public adoption proxy score`,
      detail: `score=${s.proxyScore}, HF downloads=${s.hfDownloads.toLocaleString()}, GitHub stars=${s.githubStars.toLocaleString()}, npm last-month=${s.npmDownloadsLastMonth.toLocaleString()}`,
      vendorId: s.vendorId,
      sourceBoundary: 'composite of public proxies; not revenue or token volume'
    });
  }
  return alerts.slice(0, 80);
}

module.exports = { VENDORS, normalizeCostPerMillion, vendorForText, percentileRank, sourceTier, calcVendorSummaries, buildAlerts, median };
