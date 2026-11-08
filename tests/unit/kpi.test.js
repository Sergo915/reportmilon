const { comparisonRanges, calculateKpis, difference, differenceText, valueText, rangeText } = require('../../src/report/kpi.cjs');
const { calendarContext } = require('../../src/report/period.cjs');
const { aggregate } = require('../../src/report/aggregate.cjs');
const { deal, fields } = require('../support/crm-fixture.cjs');
const row = (date, amount = '10', extra = {}) => ({ date, amount, rooms: 2, area: '50', complex: 'tower', ...extra });
const context = (now = '2026-11-15T10:00:00Z', deals = []) => calendarContext(deals, new Date(now));
const ranges = pairs => pairs.map(([min, max]) => ({ min, max }));
const run = (deals, options = {}, now) => calculateKpis(deals, { period: 'month', context: context(now, deals), ...options });

const fullCases = [
  ['month', 2025, [3, 4, 5], [['2024-12-01', '2024-12-31'], ['2025-01-01', '2025-01-31'], ['2025-02-01', '2025-02-28']]],
  ['month', 2025, [3, 5], [['2024-03-01', '2024-03-31'], ['2024-05-01', '2024-05-31']]],
  ['quarter', 2025, [2, 3], [['2024-10-01', '2024-12-31'], ['2025-01-01', '2025-03-31']]],
  ['quarter', 2025, [1, 3], [['2024-01-01', '2024-03-31'], ['2024-07-01', '2024-09-30']]],
  ['month', 2025, [1], [['2024-12-01', '2024-12-31']]],
  ['quarter', 2025, [1], [['2024-10-01', '2024-12-31']]],
  ['year', 2025, [], [['2024-01-01', '2024-12-31']]],
  ['month', 2025, [2], [['2025-01-01', '2025-01-31']]],
  ['month', 2024, [2], [['2024-01-01', '2024-01-31']]],
];
test.each(fullCases)('complete %s %i %j maps to full baseline units', (period, year, values, expected) => {
  const result = comparisonRanges(period, context(), { year, values });
  expect(result.previous).toEqual(ranges(expected));
  const deals = [...result.current.flatMap(r => [row(r.min, '20'), row(r.max, '20')]),
    ...expected.flatMap(([min, max]) => [row(min), row(max)]), row('2022-01-01', '1000'), row('2027-01-01', '1000')];
  const kpi = run(deals, { period, selection: { year, values } });
  expect(kpi.current).toEqual({ count: result.current.length * 2, amount: String(result.current.length * 40) });
  expect(kpi.previous).toEqual({ count: expected.length * 2, amount: String(expected.length * 20) });
  expect(kpi.changes.amount.percentage).toBe('+100%');
});
test.each([['month', Array.from({ length: 12 }, (_, i) => i + 1)], ['quarter', [1, 2, 3, 4]]])('all %s units select a previous full year', (period, values) => {
  const result = comparisonRanges(period, context(), { year: 2025, values });
  expect(rangeText(result.previous)).toBe('01.01.2024 – 31.12.2024');
});
test('selection order does not change the consecutive block, gaps are excluded', () => {
  const deals = [row('2025-03-01', '20'), row('2025-05-31', '30'), row('2025-04-15', '1000'),
    row('2024-03-01', '10'), row('2024-05-31', '15'), row('2024-04-15', '1000')];
  const kpi = run(deals, { selection: { year: 2025, values: [5, 3] } });
  expect(kpi.current).toEqual({ count: 2, amount: '50' });
  expect(kpi.previous).toEqual({ count: 2, amount: '25' });
  expect(rangeText(kpi.ranges.previous)).toBe('01.03.2024 – 31.03.2024; 01.05.2024 – 31.05.2024');
  expect(rangeText(comparisonRanges('month', context(), { year: 2025, values: [5, 3, 4] }).previous))
    .toBe('01.12.2024 – 28.02.2025');
});

test.each([
  ['month', [11], '2026-10-01', '2026-10-15'],
  ['quarter', [4], '2026-07-01', '2026-08-15'],
  ['year', [], '2025-01-01', '2025-11-15'],
  ['month', [10, 11], '2026-08-01', '2026-09-15'],
  ['quarter', [2, 3, 4], '2025-07-01', '2026-02-15'],
])('partial %s %j uses corresponding calendar portion', (period, values, min, max) => {
  const selection = { year: 2026, values };
  const result = comparisonRanges(period, context(), selection);
  expect(result.previous[0].min).toBe(min); expect(result.previous.at(-1).max).toBe(max);
  const next = new Date(`${max}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const kpi = run([row(min, '10'), row(max, '20'), row(next.toISOString().slice(0, 10), '1000')], { period, selection });
  expect(kpi.previous).toEqual({ count: 2, amount: '30' });
});
test('nonconsecutive selection clips only the unfinished correspondence', () => {
  expect(comparisonRanges('month', context(), { year: 2026, values: [9, 11] }).previous).toEqual(ranges([
    ['2025-09-01', '2025-09-30'], ['2025-11-01', '2025-11-15'],
  ]));
  expect(comparisonRanges('quarter', context(), { year: 2026, values: [1, 4] }).previous).toEqual(ranges([
    ['2025-01-01', '2025-03-31'], ['2025-10-01', '2025-11-15'],
  ]));
});
test.each([
  ['month', '2025-03-30', '2025-02-01', '2025-02-28'],
  ['month', '2024-03-30', '2024-02-01', '2024-02-29'],
  ['year', '2024-02-29', '2023-01-01', '2023-02-28'],
  ['month', '2026-01-15', '2025-12-01', '2025-12-15'],
  ['quarter', '2026-01-15', '2025-10-01', '2025-10-15'],
])('partial %s at %s clamps short months and crosses years', (period, now, min, max) => {
  expect(comparisonRanges(period, context(now)).previous).toEqual([{ min, max }]);
});
test('calendar transition is based on Yerevan rather than UTC', () => {
  expect(comparisonRanges('month', context('2026-10-31T20:00:00Z')).previous)
    .toEqual([{ min: '2026-10-01', max: '2026-10-01' }]);
});

test.each([
  ['2025-03-10', '2025-03-19', '2025-02-28', '2025-03-09'],
  ['2024-03-10', '2024-03-19', '2024-02-29', '2024-03-09'],
  ['2025-01-01', '2025-01-01', '2024-12-31', '2024-12-31'],
  ['2027-01-01', '2027-01-02', '2026-12-30', '2026-12-31'],
])('custom %s–%s counts inclusive calendar days', (min, max, baseMin, baseMax) => {
  const custom = { min, max };
  expect(comparisonRanges('custom', context(), null, custom)).toEqual({ current: [custom], previous: [{ min: baseMin, max: baseMax }] });
  const kpi = run([row(min, '20'), row(max, '20'), row(baseMin, '10'), row(baseMax, '10'), row('2022-01-01', '1000')], { period: 'custom', custom });
  expect(kpi.current).toEqual({ count: 2, amount: '40' });
  expect(kpi.previous).toEqual({ count: 2, amount: '20' });
});
test.each([{ min: null, max: null }, { min: '2026-01-01', max: null }, { min: null, max: '2027-12-31' }])('open custom range %j has no comparison', custom => {
  const kpi = run([row('2027-01-01')], { period: 'custom', custom });
  expect(kpi.current.count).toBe(1); expect(kpi.previous).toBeNull(); expect(kpi.changes).toBeNull();
});

test.each([
  ['100', '150', '+50 (+50%)'], ['100', '50', '-50 (-50%)'], ['3', '4', '+1 (+33,3%)'],
  ['0', '50', '+50 (—)'], ['0', '0', '0 (0%)'], ['50', '0', '-50 (-100%)'],
  ['16', '17', '+1 (+6,3%)'], ['16', '15', '-1 (-6,3%)'], ['100', '100', '0 (0%)'],
])('baseline %s to current %s displays %s', (baseline, current, text) => {
  expect(differenceText(difference(current, baseline), 'count')).toBe(text);
});
test.each([
  ['9007199254740993.01', '9007199254740993.02', '+0,01 ֏ (0%)', 'up'],
  ['9007199254740993.02', '9007199254740993.01', '-0,01 ֏ (0%)', 'down'],
  ['1.2', '1.1', '-0,1 ֏ (-8,3%)', 'down'], ['0.01', '0', '-0,01 ֏ (-100%)', 'down'],
  ['0', '0', '0 ֏ (0%)', 'flat'], ['0', '50', '+50 ֏ (—)', 'up'],
])('money %s → %s retains exact signed decimals', (baseline, current, text, direction) => {
  const delta = difference(current, baseline);
  expect(differenceText(delta, 'amount')).toBe(text); expect(delta.direction).toBe(direction);
});
test('totals preserve every digit and duplicate deals', () => {
  const kpi = run([row('2026-11-01', '9007199254740993.01'), row('2026-11-01', '.01'), row('2026-11-01', '.01')]);
  expect(kpi.current).toEqual({ count: 3, amount: '9007199254740993.03' });
  expect(valueText(kpi.current.amount, 'amount')).toBe('9 007 199,25 մլրդ ֏');
});

test('admission and every non-date filter apply to both periods and rankings', () => {
  const items = [deal(1, { ufCrmDate: '2026-11-10', opportunity: '100' }),
    deal(2, { ufCrmDate: '2026-11-15', opportunity: '200' }), deal(3, { ufCrmDate: '2026-10-15', opportunity: '150' })];
  for (const date of ['2026-11-10', '2026-10-10']) for (const extra of [
    { ufCrmComplex: '82' }, { ufCrmRooms: 3 }, { ufCrmArea: '99' }, { opportunity: '1000' },
    { ufCrmArea: null }, { ufCrmProperty: '72' },
  ]) items.push(deal(items.length + 1, { ufCrmDate: date, opportunity: '100', ...extra }));
  const snapshot = aggregate({ items, fields: Object.entries(fields).map(([code, field]) => ({ code, ...field })) },
    { portalOrigin: 'https://portal.example', now: new Date('2026-11-15') });
  const filters = { rooms: [2], complexes: ['tower'], area: { min: '50', max: '50' }, amount: { min: '100', max: '200' },
    date: { min: '2026-11-01' }, dateRanges: [{ min: '2026-11-01', max: '2026-11-15' }] };
  const kpi = run(snapshot.deals, { filters });
  expect(kpi.current).toEqual({ count: 2, amount: '300' }); expect(kpi.previous).toEqual({ count: 1, amount: '150' });
  expect(kpi.changes.count.percentage).toBe('+100%'); expect(kpi.changes.amount.percentage).toBe('+100%');
  const all = run(snapshot.deals, { period: 'all', filters });
  expect(all.current).toEqual({ count: 3, amount: '450' });
  expect(all.rankings.month.count.map(r => [r.label, r.value])).toEqual([['Նոյեմբեր 2026', '2'], ['Հոկտեմբեր 2026', '1']]);
  expect(snapshot.problems).toHaveLength(2);
  expect(run(snapshot.deals, { filters: { ...filters, rooms: [] } }).current.count).toBe(0);
});
test('empty current period can still have a nonzero baseline', () => {
  const kpi = run([row('2026-10-10')]);
  expect(kpi.current.count).toBe(0); expect(kpi.changes.count.percentage).toBe('-100%');
});

test('last twelve months include exact window endpoints, zero months and partial marker', () => {
  const kpi = run([row('2025-11-30', '1000'), row('2025-12-01', '10'), row('2026-11-15', '20'), row('2026-11-16', '1000')], { period: 'last-12' });
  expect(kpi.current).toEqual({ count: 2, amount: '30' });
  expect(kpi.rankings.month.count).toHaveLength(12);
  expect(kpi.rankings.month.amount.slice(0, 2).map(r => [r.label, r.value, r.incomplete])).toEqual([
    ['Նոյեմբեր 2026', '20', true], ['Դեկտեմբեր 2025', '10', false],
  ]);
  expect(kpi.rankings.month.amount.filter(r => r.value === '0')).toHaveLength(10);
  expect(kpi.previous).toEqual({ count: 0, amount: '0' });
  expect(run([], { period: 'last-12' }, '2026-11-30').rankings.month.count.every(r => !r.incomplete)).toBe(true);
});
test('all-time rankings sort independently, include zeros and preserve history under filters', () => {
  const deals = [['2025-01-10', 10, '10'], ['2025-02-10', 8, '100'], ['2025-03-10', 8, '10'], ['2026-03-10', 2, '1000']]
    .flatMap(([date, count, amount]) => Array.from({ length: count }, () => row(date, amount)));
  const kpi = run(deals, { period: 'all' }, '2026-05-15');
  expect(kpi.current).toEqual({ count: 28, amount: '2980' });
  expect(kpi.rankings.month.count.slice(0, 4).map(r => [r.label, r.rank, r.value])).toEqual([
    ['Հունվար 2025', 1, '10'], ['Մարտ 2025', 2, '8'], ['Փետրվար 2025', 2, '8'], ['Մարտ 2026', 4, '2'],
  ]);
  expect(kpi.rankings.month.amount.slice(0, 4).map(r => r.value)).toEqual(['2000', '800', '100', '80']);
  expect(kpi.rankings.month.count).toHaveLength(17);
  expect(kpi.rankings.quarter.count.slice(0, 2).map(r => [r.label, r.value])).toEqual([['I եռամսյակ 2025', '26'], ['I եռամսյակ 2026', '2']]);
  expect(kpi.rankings.year.amount.map(r => r.value)).toEqual(['2000', '980']);
  const empty = run(deals, { period: 'all', filters: { complexes: ['hills'] } }, '2026-05-15');
  expect(empty.rankings.month.count).toHaveLength(17);
  expect(empty.rankings.month.count.every(r => r.value === '0' && r.rank === 1)).toBe(true);
  expect(empty.rankings.month.count[0].label).toBe('Մայիս 2026');
});
test('equal decimal values have the same rank and newer periods first', () => {
  const kpi = run([row('2026-01-01', '10.0'), row('2026-02-01', '10.00')], { period: 'all' });
  expect(kpi.rankings.month.amount.slice(0, 2).map(r => [r.label, r.rank])).toEqual([['Փետրվար 2026', 1], ['Հունվար 2026', 1]]);
});
test.each([[[]], [[row('2027-01-01')]]])('no past history %j gives empty all-time and twelve zero months', deals => {
  expect(run(deals, { period: 'all' }).rankings.month.count).toEqual([]);
  const twelve = run(deals, { period: 'last-12' });
  expect(twelve.current.count).toBe(0); expect(twelve.rankings.month.count).toHaveLength(12);
});

const { quickSelection } = require('../../src/report/period.cjs');
test.each([
  ['current-month', 'month', { year: 2026, values: [11] }],
  ['current-year', 'year', { year: 2026 }],
  ['previous-month', 'month', { year: 2026, values: [10] }],
  ['previous-year', 'year', { year: 2025 }],
  ['last-12', 'last-12', undefined], ['all', 'all', undefined],
])('quick %s retains the complete KPI behavior of its calendar equivalent', (quick, period, selection) => {
  const deals = ['2023-07-10', '2025-01-01', '2025-11-15', '2026-10-01', '2026-10-31', '2026-11-01', '2026-11-15']
    .map(date => row(date));
  deals.push(row('2026-11-10', '1000', { complex: 'hills' }));
  const calendar = context(undefined, deals), filters = { complexes: ['tower'], area: { min: '50' } };
  const resolved = quickSelection(quick, calendar);
  expect(calculateKpis(deals, { ...resolved, context: calendar, filters }))
    .toEqual(calculateKpis(deals, { period, selection, context: calendar, filters }));
});
