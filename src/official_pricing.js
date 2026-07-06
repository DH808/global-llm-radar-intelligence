function normalizePriceUnit(raw, cnyToUsd = 0.14) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/,/g, '').trim();
  const m = s.match(/([¥$￥])?\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  let v = Number(m[2]);
  if (!Number.isFinite(v)) return null;
  const isCny = (m[1] === '¥' || m[1] === '￥' || /人民币|rmb|cny/i.test(s) || (/元\s*\//.test(s) && !/美元/.test(s)));
  const isPerToken = /per token|\/\s*token\b|每\s*token/i.test(s) && !/(1m|million|百万)/i.test(s);
  if (isPerToken) v *= 1_000_000;
  if (isCny) v *= cnyToUsd;
  return Math.round(v * 1_000_000) / 1_000_000;
}

function parseOfficialPricingText({ vendorId, vendorName, sourceUrl, text, observedAt }) {
  const clean = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ');
  const records = [];
  // Pattern for DeepSeek-like rows: Model Context MaxOut $cache $miss $output
  const re = /\b(DeepSeek-[A-Za-z0-9.\-]+|deepseek-[a-z0-9.\-]+)\s+([0-9]+)K\s+(?:(?:[0-9]+K|-)\s+)?([0-9]+)K\s+\$\s*([0-9.]+)(?:\s*\/\s*1M\s*tokens)?\s+\$\s*([0-9.]+)(?:\s*\/\s*1M\s*tokens)?\s+\$\s*([0-9.]+)(?:\s*\/\s*1M\s*tokens)?/gi;
  let m;
  while ((m = re.exec(clean))) {
    const modelName = m[1];
    const contextK = Number(m[2]);
    const maxOutK = Number(m[3]);
    const cached = Number(m[4]);
    const input = Number(m[5]);
    const output = Number(m[6]);
    records.push(makeOfficialRecord({ vendorId, vendorName, modelName, input, output, cached, contextWindowTokens: contextK * 1000, maxOutputTokens: maxOutK * 1000, sourceUrl, observedAt }));
  }
  // Generic fallback: model followed by input/output prices; useful for hand-normalized snippets.
  if (!records.length) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    for (const line of lines) {
      const lm = line.match(/^([A-Za-z0-9][A-Za-z0-9_.:\/-]{2,80})\s+.*?(?:input|输入)[^$¥￥0-9]*([$¥￥]?[0-9.]+[^\s,;]*)\s+.*?(?:output|输出)[^$¥￥0-9]*([$¥￥]?[0-9.]+[^\s,;]*)/i);
      if (lm) records.push(makeOfficialRecord({ vendorId, vendorName, modelName: lm[1], input: normalizePriceUnit(lm[2]), output: normalizePriceUnit(lm[3]), cached: null, contextWindowTokens: null, maxOutputTokens: null, sourceUrl, observedAt }));
    }
  }
  return records;
}

function makeOfficialRecord({ vendorId, vendorName, modelName, input, output, cached, contextWindowTokens, maxOutputTokens, sourceUrl, observedAt }) {
  return {
    recordId: `official:${vendorId}:${String(modelName).toLowerCase().replace(/[^a-z0-9.:-]+/g, '-')}`,
    sourceId: 'official_price_pages',
    sourceName: 'Official pricing page',
    sourceTier: 1,
    vendorId,
    vendorName,
    modelName,
    provider: 'direct_official',
    inputUsdPer1M: input,
    outputUsdPer1M: output,
    cachedInputUsdPer1M: cached,
    contextWindowTokens,
    maxOutputTokens,
    modality: 'text',
    supportsFunctionCalling: false,
    supportsVision: false,
    observedAt: observedAt || new Date().toISOString(),
    sourceUrl,
    sourceBoundary: 'official parsed pricing page; IC-grade source layer, still verify page snapshot/date before publication'
  };
}

module.exports = { parseOfficialPricingText, normalizePriceUnit };
