const { loadReport, createReportLoader } = require('../src/report/load.cjs');

// Explicit live check: no warm-up, cache or excluded outliers.
// Production retries and their waits are included in each complete load.
// Only durations, request counts and safe local status codes leave this process.
function commandNames(args) {
  const params = args[1]?.body ? JSON.parse(args[1].body) : {};
  return params.cmd ? Object.values(params.cmd).map((command) => command.split('?')[0])
    : [args[0].split('/').at(-1).replace(/\.json$/, '')];
}
async function checkPerformance({ load = loadReport, fetchImpl = globalThis.fetch,
  now = () => performance.now(), write = console.log } = {}) {
  const samples = [];
  for (let run = 1; run <= 5; run++) {
    let requests = 0, commands = 0;
    const started = now();
    const result = await load({ fetchImpl: (...args) => {
      requests++; commands += commandNames(args).length;
      return fetchImpl(...args);
    } });
    const durationMs = now() - started;
    const sample = { run, requests, commands, status: result.status, durationMs };
    samples.push(sample);
    write(JSON.stringify({ ...sample, durationMs: Math.round(durationMs) }));
    if (result.status !== 200) {
      write('FAIL: полная загрузка CRM не выполнена.');
      return { passed: false, samples, averageMs: null };
    }
  }
  const averageMs = samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length;
  const passed = averageMs <= 4000;
  write(JSON.stringify({ result: passed ? 'PASS' : 'FAIL', runs: samples.length,
    averageMs: Math.round(averageMs), limitMs: 4000,
    minMs: Math.round(Math.min(...samples.map((s) => s.durationMs))),
    maxMs: Math.round(Math.max(...samples.map((s) => s.durationMs))) }));
  return { passed, samples, averageMs };
}

async function checkCachePerformance({ createLoader = createReportLoader, fetchImpl = globalThis.fetch,
  now = () => performance.now(), write = console.log } = {}) {
  let requests = 0, commands = 0, metadataCommands = 0;
  const load = createLoader({ fetchImpl: (...args) => {
    requests++;
    const names = commandNames(args);
    commands += names.length;
    metadataCommands += names.filter((name) => name !== 'crm.item.list').length;
    return fetchImpl(...args);
  } });
  const samples = [];
  for (const scenario of ['cold', 'report-cache', 'fresh-deals']) {
    requests = 0; commands = 0; metadataCommands = 0;
    const started = now();
    const result = await load({ refresh: scenario === 'fresh-deals' });
    const sample = { scenario, requests, commands, metadataCommands, status: result.status, durationMs: now() - started };
    samples.push(sample);
    write(JSON.stringify({ ...sample, durationMs: Math.round(sample.durationMs * 100) / 100 }));
    if (result.status !== 200) return { passed: false, samples };
  }
  const passed = samples[0].metadataCommands > 0 && samples[1].requests === 0
    && samples[2].requests > 0 && samples[2].metadataCommands === 0;
  write(JSON.stringify({ cacheResult: passed ? 'PASS' : 'FAIL' }));
  return { passed, samples };
}

if (require.main === module) {
  checkPerformance().then(async ({ passed }) => {
    if (!passed) { process.exitCode = 1; return; }
    const cache = await checkCachePerformance();
    process.exitCode = cache.passed ? 0 : 1;
  })
    .catch(() => { console.error('FAIL: проверка производительности не выполнена.'); process.exitCode = 1; });
}

module.exports = { checkPerformance, checkCachePerformance };
