const { calculateKpis, compactAmount, detailRows } = require('../../src/report/kpi.cjs');
const { calendarContext } = require('../../src/report/period.cjs');
const row = (id, date, amount = '10', extra = {}) => ({ id, date, amount, rooms: 2, area: '50', complex: 'tower', ...extra });
function run(deals, options = {}, now = '2026-11-15') {
  return calculateKpis(deals, { period: 'month', context: calendarContext(deals, new Date(now)), ...options });
}
test.each([
  ['0', '0 ֏'], ['999', '999 ֏'], ['1000', '1 հազ. ֏'], ['1000000', '1 մլն ֏'],
  ['1500000', '1,5 մլն ֏'], ['6158173250.9', '6,16 մլրդ ֏'], ['999999999', '1 մլրդ ֏'],
  ['999.999', '1 հազ. ֏'], ['999999.999', '1 մլն ֏'],
  ['-6158173250.9', '-6,16 մլրդ ֏'], ['9007199254740993.01', '9 007 199,25 մլրդ ֏'],
  ['1.005', '1,01 ֏'], ['-1.005', '-1,01 ֏'], ['0.3', '0,3 ֏'], ['-0.001', '0 ֏'],
])('compact amount %s is %s', (input, expected) => expect(compactAmount(input)).toBe(expected));

test('daily series exclude nonselected months and do not pad short months', () => {
  const deals = [row(1, '2025-03-01'), row(2, '2025-05-31', '20'), row(3, '2025-04-01', '1000'), row(4, '2024-05-31', '5')];
  const data = run(deals, { selection: { year: 2025, values: [5, 3] } });
  expect(data.series.current).toHaveLength(62);
  expect(data.series.current[31]).toEqual({ min: '2025-05-01', max: '2025-05-01', count: 0, amount: '0' });
  expect(data.series.current.at(-1).amount).toBe('20');
  expect(data.selected.current.map(d => d.id)).toEqual([1, 2]);
  expect(data.series.previous.at(-1).amount).toBe('5');
  const february = run([row(1, '2025-02-01')], { selection: { year: 2025, values: [2] } });
  expect(february.series.current).toHaveLength(28); expect(february.series.previous).toHaveLength(31);
  expect(february.series.current.at(-1).max).toBe('2025-02-28');
});

test('custom daily cutoff and partial monthly buckets preserve every exact amount', () => {
  const deals = [row(1, '2025-02-01', '.1'), row(2, '2025-02-01', '.2')];
  const daily = run(deals, { period: 'custom', custom: { min: '2025-01-15', max: '2025-02-14' } });
  expect(daily.series.current).toHaveLength(31);
  expect(daily.series.current.find(p => p.min === '2025-02-01')).toEqual({ min: '2025-02-01', max: '2025-02-01', count: 2, amount: '0.3' });
  const monthly = run(deals, { period: 'custom', custom: { min: '2025-01-15', max: '2025-02-15' } });
  expect(monthly.series.current).toEqual([
    { min: '2025-01-15', max: '2025-01-31', count: 0, amount: '0' },
    { min: '2025-02-01', max: '2025-02-15', count: 2, amount: '0.3' },
  ]);
});

test('last twelve months share precise baseline bounds across series, details and totals', () => {
  const deals = [row(1, '2024-12-01'), row(2, '2025-11-15'), row(3, '2025-11-16', '1000'),
    row(4, '2025-12-01', '20'), row(5, '2026-11-15', '20'), row(6, '2026-11-16', '1000')];
  const data = run(deals, { period: 'last-12' });
  expect(data.ranges).toEqual({ current: [{ min: '2025-12-01', max: '2026-11-15' }], previous: [{ min: '2024-12-01', max: '2025-11-15' }] });
  expect(data.selected.current.map(d => d.id)).toEqual([4, 5]); expect(data.selected.previous.map(d => d.id)).toEqual([1, 2]);
  expect(data.current.amount).toBe('40'); expect(data.previous.amount).toBe('20');
  expect(data.changes.amount.percentage).toBe('+100%');
  expect(data.series.current).toHaveLength(12); expect(data.series.previous).toHaveLength(12);
  expect(data.series.previous.at(-1)).toEqual({ min: '2025-11-01', max: '2025-11-15', count: 1, amount: '10' });
});

test('all-time and open custom history have one line and retain zeros under filters', () => {
  const deals = [row(1, '2025-01-10'), row(2, '2027-03-20')];
  const all = run(deals, { period: 'all', filters: { complexes: ['hills'] } });
  expect(all.series.previous).toBeNull(); expect(all.series.current).toHaveLength(23);
  expect(all.series.current.every(point => point.count === 0)).toBe(true);
  const custom = run(deals, { period: 'custom', custom: { min: '2027-01-01' } });
  expect(custom.previous).toBeNull(); expect(custom.series.current).toHaveLength(3);
  expect(custom.series.current.at(-1)).toEqual({ min: '2027-03-01', max: '2027-03-20', count: 1, amount: '10' });
  expect(run([], { period: 'custom' }).series.current).toEqual([]);
  expect(run([], { period: 'all' }).series.current).toEqual([]);
});

test('detail selection shares every non-date filter; ordering preserves duplicate deals', () => {
  const chosen = [row(3, '2026-11-15', '100'), row(2, '2026-11-15', '100'), row(1, '2026-11-10', '100'), row(4, '2026-10-15', '100')];
  const excluded = [{ complex: 'hills' }, { rooms: 3 }, { area: '99' }, { amount: '999' }]
    .flatMap((extra, i) => ['2026-11-15', '2026-10-15'].map((date, j) => row(10 + 2 * i + j, date, '100', extra)));
  const data = run([...chosen, ...excluded], { filters: { complexes: ['tower'], rooms: [2], area: { min: '50', max: '50' }, amount: { max: '200' } } });
  expect(detailRows(data.selected.current).map(d => d.id)).toEqual([2, 3, 1]);
  expect(data.selected.previous.map(d => d.id)).toEqual([4]);
  expect(data.series.current.at(-1)).toMatchObject({ count: 2, amount: '200' });
  expect(chosen.map(d => d.id)).toEqual([3, 2, 1, 4]);
});
