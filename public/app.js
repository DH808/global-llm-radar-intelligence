let STATE = null;
const $ = sel => document.querySelector(sel);
const fmt = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined,{maximumFractionDigits:3}) : 'n/a';
const money = n => Number.isFinite(Number(n)) ? '$' + Number(n).toLocaleString(undefined,{maximumFractionDigits:3}) : 'n/a';

async function load(refresh=false){
  $('#refreshBtn').textContent = refresh ? '刷新中…' : '刷新数据';
  const res = await fetch('/api/state' + (refresh ? '?refresh=1' : ''));
  if(!res.ok) throw new Error('state HTTP '+res.status);
  STATE = await res.json();
  render();
  $('#refreshBtn').textContent = '刷新数据';
}

function render(){
  const m = STATE.metrics || {};
  $('#asOf').textContent = `As-of ${STATE.asOf || STATE.generatedAt || ''}`;
  $('#statusGrid').innerHTML = [
    ['Vendors', m.vendorCount], ['Pricing records', m.pricingRecordCount], ['Usage proxies', m.usageProxyRecordCount], ['Adoption signals', m.adoptionSignalCount], ['Sources OK', m.sourceOkCount], ['Sources failed', m.sourceFailCount]
  ].map(([k,v])=>`<div class="stat"><div class="label">${esc(k)}</div><div class="value">${fmt(v)}</div></div>`).join('');
  renderVendors(); renderAlerts(); renderSources(); renderPricing(); renderAdoption(); renderLimitations();
}
function renderVendors(){
  const q = ($('#search').value || '').toLowerCase();
  const rows = (STATE.vendorSummaries||[]).filter(v => !q || JSON.stringify(v).toLowerCase().includes(q));
  const maxScore = Math.max(1, ...rows.map(v=>v.proxyScore||0));
  $('#vendorBoard').innerHTML = rows.map(v=>`<article class="vendor-card">
    <h3>${esc(v.name)}</h3>
    <div class="chips"><span class="chip">${esc(v.region)}</span><span class="chip">${esc(v.tier)}</span><span class="chip">proxy score ${fmt(v.proxyScore)}</span></div>
    <div class="bar"><i style="width:${Math.min(100, (v.proxyScore||0)/maxScore*100)}%"></i></div>
    <div class="metrics">
      <div class="metric"><b>${money(v.minInputUsdPer1M)}</b><span>min input / 1M</span></div>
      <div class="metric"><b>${money(v.minOutputUsdPer1M)}</b><span>min output / 1M</span></div>
      <div class="metric"><b>${fmt(v.hfDownloads)}</b><span>HF downloads</span></div>
      <div class="metric"><b>${fmt(v.githubStars + v.npmDownloadsLastMonth)}</b><span>GitHub + npm proxy</span></div>
    </div>
    <p class="muted">${esc(v.sourceBoundary)}</p>
    <a href="${esc(v.officialPricingUrl)}" target="_blank" rel="noreferrer">official source ↗</a>
  </article>`).join('');
}
function renderAlerts(){
  $('#alerts').innerHTML = (STATE.alerts||[]).slice(0,40).map(a=>`<div class="alert ${esc(a.severity||'')}"><b>${esc(a.title)}</b><div>${esc(a.detail||'')}</div><div class="small">${esc(a.sourceBoundary||'')}</div></div>`).join('') || '<p class="muted">No alerts.</p>';
}
function renderSources(){
  const statuses = STATE.sourceStatuses || {};
  $('#sources').innerHTML = (STATE.sourceRegistry||[]).map(s=>{ const st=statuses[s.sourceId]||{}; return `<div class="source"><div><span class="tier">Tier ${s.tier}</span> · <b>${esc(s.sourceName)}</b> · ${st.ok?'OK':'check'}</div><div class="muted">${esc(s.boundary)}</div><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.url)}</a></div>` }).join('');
}
function renderPricing(){
  const q = ($('#search').value || '').toLowerCase();
  const rows = (STATE.pricingRecords||[]).filter(p => (!q || JSON.stringify(p).toLowerCase().includes(q)) && ((Number(p.inputUsdPer1M)>=0.001) || (Number(p.outputUsdPer1M)>=0.001))).sort((a,b)=>((a.outputUsdPer1M&&a.outputUsdPer1M>=0.001)?a.outputUsdPer1M:9999)-((b.outputUsdPer1M&&b.outputUsdPer1M>=0.001)?b.outputUsdPer1M:9999)).slice(0,220);
  $('#pricingTable tbody').innerHTML = rows.map(p=>`<tr><td>${esc(p.vendorName)}</td><td>${esc(p.modelName)}<div class="small">${esc(p.modality||'')}</div></td><td>${money(p.inputUsdPer1M)}</td><td>${money(p.outputUsdPer1M)}</td><td>${fmt(p.contextWindowTokens)}</td><td><a href="${esc(p.sourceUrl)}" target="_blank" rel="noreferrer">${esc(p.sourceName)}</a><div class="small">Tier ${p.sourceTier}</div></td><td>${esc(p.sourceBoundary)}</td></tr>`).join('');
}
function renderAdoption(){
  const q = ($('#search').value || '').toLowerCase();
  const rows = [...(STATE.adoptionSignals||[]), ...(STATE.usageProxyRecords||[])].filter(x => !q || JSON.stringify(x).toLowerCase().includes(q)).sort((a,b)=>(b.value||0)-(a.value||0)).slice(0,260);
  $('#adoptionTable tbody').innerHTML = rows.map(x=>`<tr><td>${esc(x.vendorName)}</td><td>${esc(x.metric)}</td><td><a href="${esc(x.sourceUrl||'#')}" target="_blank" rel="noreferrer">${esc(x.modelName||x.coverageScope||'source')}</a></td><td>${fmt(x.value)}</td><td>${esc(x.asOf||x.observedAt||'')}</td><td>${esc(x.sourceBoundary)}</td></tr>`).join('');
}
function renderLimitations(){
  $('#limitations').innerHTML = (STATE.limitations||[]).map(x=>`<li>${esc(x)}</li>`).join('');
}
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

$('#refreshBtn').addEventListener('click',()=>load(true).catch(e=>alert(e.message)));
$('#search').addEventListener('input',()=>render());
load(false).catch(err=>{ document.body.insertAdjacentHTML('afterbegin', `<pre>${esc(err.message)}</pre>`); });
