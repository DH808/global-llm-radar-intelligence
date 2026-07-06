const path = require('path');
const { collectState, writeState } = require('../src/collector');
const { buildDatabase } = require('../src/db');

(async () => {
  const out = path.join(__dirname, '..', 'data', 'latest_state.json');
  const dbOut = path.join(__dirname, '..', 'data', 'latest_db.json');
  const state = await collectState();
  writeState(state, out);
  writeState(buildDatabase(state), dbOut);
  console.log(JSON.stringify({ ok: true, out, dbOut, metrics: state.metrics, database: state.databaseSummary && state.databaseSummary.metrics, generatedAt: state.generatedAt }, null, 2));
})().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
