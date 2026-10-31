const { createReportLoader } = require('../../src/report/load.cjs');
const { createFixture, deal, WEBHOOK } = require('../support/crm-fixture.cjs');
const { createServer } = require('../../server.js');
const TTL = 300000, META_TTL = 86400000;
function setup(state = {}) {
  const fixture = createFixture(state);
  let time = Date.parse('2026-06-01T10:00:00Z');
  const options = { ...fixture, now: () => new Date(time) };
  return { fixture, options, load: createReportLoader(options), advance: (ms) => { time += ms; } };
}
const metadataCalls = (fixture) => fixture.state.requests.filter((r) => r.method !== 'crm.item.list').length;

test.each([{ items: [] }, { items: [deal(1)] }])('caches even empty snapshots for exactly five minutes without sliding expiry', async ({ items }) => {
  const { fixture, load, advance } = setup({ items });
  const first = await load();
  const calls = fixture.state.httpRequests.length;
  fixture.state.items = [deal(2, { opportunity: '75' })];
  advance(TTL - 1);
  expect(await load()).toEqual(first);
  expect(fixture.state.httpRequests).toHaveLength(calls);
  advance(1);
  const fresh = await load();
  expect(fresh.body.rooms[1].amount).toBe('75');
  expect(fresh.body.updatedAt).not.toBe(first.body.updatedAt);
  expect(metadataCalls(fixture)).toBe(3);
  expect(fixture.state.reads).toBe(2);
});

test('manual refresh bypasses only report cache, metadata expires at 24h without sliding', async () => {
  const { fixture, load, advance } = setup({ items: [deal(1)] });
  const first = await load();
  advance(1000);
  fixture.state.items[0].opportunity = '25';
  expect((await load({ refresh: true })).body.rooms[1].amount).toBe('25');
  expect(metadataCalls(fixture)).toBe(3);
  advance(META_TTL - 1001);
  await load({ refresh: true });
  expect(metadataCalls(fixture)).toBe(3);
  advance(1);
  fixture.state.fields.ufCrmNewArea = fixture.state.fields.ufCrmArea;
  delete fixture.state.fields.ufCrmArea;
  fixture.state.items[0].ufCrmNewArea = '99';
  const fresh = await load({ refresh: true });
  expect(metadataCalls(fixture)).toBe(6);
  expect(fresh.body.deals[0].area).toBe('99');
  expect(fresh.body.updatedAt).not.toBe(first.body.updatedAt);
});

test('valid report hit does not fetch expired metadata until next fresh load', async () => {
  const { fixture, load, advance } = setup();
  await load(); advance(META_TTL - 1000);
  const first = await load({ refresh: true });
  const calls = fixture.state.httpRequests.length;
  advance(2000);
  expect(await load()).toEqual(first);
  expect(fixture.state.httpRequests).toHaveLength(calls);
  await load({ refresh: true });
  expect(metadataCalls(fixture)).toBe(6);
});

test('concurrent openings and forced refresh share one load, retries and failure recovery', async () => {
  const { fixture, load } = setup({ items: [deal(1)] });
  await load();
  let release;
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  fixture.state.failPage = 0;
  const pending = [load({ refresh: true }), load(), load({ refresh: true })];
  release();
  const failed = await Promise.all(pending);
  expect(failed).toEqual(Array(3).fill({ status: 502, body: { error: 'CRM_READ_ERROR' } }));
  expect(fixture.state.retryWaits).toBe(3);
  expect(fixture.state.reads).toBe(5); // initial success plus four failed attempts, not four per caller
  fixture.state.failPage = undefined;
  fixture.state.items[0].opportunity = '88';
  const fresh = await load();
  expect(fresh.body.rooms[1].amount).toBe('88');
  expect(metadataCalls(fixture)).toBe(3);
});

test('cold concurrent openings share metadata and data and return isolated result objects', async () => {
  const { fixture, load } = setup();
  const [first, second] = await Promise.all([load(), load()]);
  expect(first).toEqual(second);
  expect(fixture.state.reads).toBe(1);
  expect(metadataCalls(fixture)).toBe(3);
  first.body.deals.length = 0;
  expect((await load())).toEqual(second);
});

test('different webhooks on the same portal and different server instances never share snapshots', async () => {
  const { fixture, options, load } = setup({ items: [deal(1)] });
  await load();
  options.env.BITRIX24_WEBHOOK_URL = WEBHOOK.replace('/7/', '/8/');
  fixture.state.items[0].opportunity = '20';
  expect((await load()).body.rooms[1].amount).toBe('20');
  expect(metadataCalls(fixture)).toBe(6);
  options.env.BITRIX24_WEBHOOK_URL = WEBHOOK;
  expect((await load()).body.rooms[1].amount).toBe('10');
  const servers = [createServer(options), createServer(options)];
  try {
    for (const server of servers) {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/report`);
      expect(response.status).toBe(200);
    }
    expect(metadataCalls(fixture)).toBe(12);
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
});

test('expired metadata failure never falls back to old values or poisons the next load', async () => {
  const { fixture, load, advance } = setup();
  await load(); advance(META_TTL);
  const original = fixture.state.fields.ufCrmProperty;
  delete fixture.state.fields.ufCrmProperty;
  expect(await load()).toEqual({ status: 502, body: { error: 'CRM_READ_ERROR' } });
  expect(fixture.state.retryWaits || 0).toBe(0); // valid response, invalid domain metadata
  fixture.state.fields.ufCrmProperty = original;
  expect((await load()).status).toBe(200);
  expect(fixture.state.reads).toBe(2);
  expect(metadataCalls(fixture)).toBe(9);
});

test('metadata transport failures retry then recover, but partial metadata is never cached', async () => {
  const { fixture, load } = setup({ failures: 4, failMethod: 'batch' });
  expect((await load()).status).toBe(502);
  expect(fixture.state.retryWaits).toBe(3);
  expect(fixture.state.httpRequests).toHaveLength(4);
  expect((await load()).status).toBe(200);
  expect(metadataCalls(fixture)).toBe(3);
});

test('cache recalculates the Yerevan year without changing snapshot time or fetching CRM', async () => {
  const fixture = createFixture({ items: [deal(1, { ufCrmDate: '2026-01-01' }), deal(2, { ufCrmDate: '2027-01-01', opportunity: '25' })], time: '2026-12-31T19:59:59Z' });
  const load = createReportLoader(fixture);
  const first = await load();
  expect(first.body.year).toBe(2026);
  expect(first.body.months[0].amount).toBe('10');
  const requests = fixture.state.httpRequests.length;
  fixture.state.time = '2026-12-31T20:00:00Z';
  const next = await load();
  expect(next.body.year).toBe(2027);
  expect(next.body.months[0].amount).toBe('25');
  expect(next.body.updatedAt).toBe(first.body.updatedAt);
  expect(fixture.state.httpRequests).toHaveLength(requests);
});

test('year and update time are taken after completion, not before loading', async () => {
  const fixture = createFixture({ time: '2026-12-31T19:59:59Z', items: [deal(1, { ufCrmDate: '2027-01-01' })] });
  let release;
  fixture.state.gate = new Promise((resolve) => { release = resolve; });
  const pending = createReportLoader(fixture)();
  fixture.state.time = '2026-12-31T20:00:00Z';
  release();
  const report = await pending;
  expect(report.body.year).toBe(2027);
  expect(report.body.updatedAt).toBe('2026-12-31T20:00:00.000Z');
});

test('invalid configuration has no CRM calls, retries or cache fallback', async () => {
  const { fixture, options, load } = setup();
  await load();
  const calls = fixture.state.httpRequests.length;
  options.env.BITRIX24_WEBHOOK_URL = '';
  expect(await load()).toEqual({ status: 500, body: { error: 'CONFIGURATION_ERROR' } });
  expect(fixture.state.httpRequests).toHaveLength(calls);
  expect(fixture.state.retryWaits || 0).toBe(0);
});
