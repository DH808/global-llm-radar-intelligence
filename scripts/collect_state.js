const path = require('path');
const { collectState, writeState } = require('../src/collector');

(async () => {
  const out = path.join(__dirname, '..', 'data', 'latest_state.json');
  const state = await collectState();
  writeState(state, out);
  console.log(JSON.stringify({ ok: true, out, metrics: state.metrics, generatedAt: state.generatedAt }, null, 2));
})().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
