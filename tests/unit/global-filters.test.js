const { periodRanges, calendarContext, initialSelections, reconcileSelections, defaultSelection, togglePeriodValue } = require('../../src/report/period.cjs');
const context = (now = '2026-11-15T10:00:00Z', deals = []) => calendarContext(deals, new Date(now));
const { calculate, toggleRoom, validateRange } = require('../../src/report/filter.cjs');
const { formatAmountInput, ungroupAmount } = require('../../src/report/amount-input.cjs');
const { aggregate } = require('../../src/report/aggregate.cjs');
const { deal, fields } = require('../support/crm-fixture.cjs');

test.each([
  ['month', '2026-11-01', '2026-11-15'],
  ['quarter', '2026-10-01', '2026-11-15'], ['year', '2026-01-01', '2026-11-15'],
  ['last-12', '2025-12-01', '2026-11-15'], ['all', '2023-07-10', '2026-11-15'],
])('period %s has exact inclusive boundaries through today', (period, min, max) => {
  const dateRanges = periodRanges(period, context(undefined, [{ date: '2023-07-10' }]));
  expect(dateRanges).toEqual([{ min, max }]);
  const offset = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
  const deals = [offset(min, -1), min, max, offset(max, 1)].map(date => ({ date, rooms: 1, area: '1', amount: '10' }));
  expect(calculate(deals, 2026, { dateRanges }).rooms[0]).toEqual({ category: 1, amount: '20', count: 2 });
});
test.each([
  ['month', '2024-02-15T00:00:00Z', '2024-02-01', '2024-02-15'],
  ['year', '2026-12-31T19:59:59Z', '2026-01-01', '2026-12-31'],
  ['year', '2026-12-31T20:00:00Z', '2027-01-01', '2027-01-01'],
  ['quarter', '2026-03-31T19:59:59Z', '2026-01-01', '2026-03-31'],
  ['quarter', '2026-03-31T20:00:00Z', '2026-04-01', '2026-04-01'],
  ['last-12', '2027-01-15T00:00:00Z', '2026-02-01', '2027-01-15'],
])('%s handles calendar transition at %s', (period, now, min, max) => {
  expect(periodRanges(period, context(now))).toEqual([{ min, max }]);
});
test.each([
  ['month', 2024, [2], '2024-02-01', '2024-02-29'],
  ['month', 2025, [2], '2025-02-01', '2025-02-28'],
  ['quarter', 2025, [1], '2025-01-01', '2025-03-31'],
  ['quarter', 2025, [2], '2025-04-01', '2025-06-30'],
  ['quarter', 2025, [3], '2025-07-01', '2025-09-30'],
  ['quarter', 2025, [4], '2025-10-01', '2025-12-31'],
  ['year', 2025, [], '2025-01-01', '2025-12-31'],
])('selected %s of %i includes its calendar endpoints', (period, year, values, min, max) => {
  const dateRanges = periodRanges(period, context(), { year, values });
  expect(dateRanges).toEqual([{ min, max }]);
  const offset = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
  const deals = [offset(min, -1), min, max, offset(max, 1)].map(date => ({ date, rooms: 1, area: '1', amount: '10' }));
  expect(calculate(deals, 2026, { dateRanges }).rooms[0].count).toBe(2);
});
test('calendar uses earliest admitted date, retains empty years, and handles no past sales', () => {
  expect(context(undefined, [{ date: '2025-01-01' }, { date: '2023-07-10' }])).toMatchObject({
    firstDate: '2023-07-10', years: [2023, 2024, 2025, 2026],
  });
  for (const deals of [[], [{ date: '2026-11-16' }], [{ date: '2027-01-01' }]]) {
    const calendar = context(undefined, deals);
    expect(calendar.years).toEqual([2026]);
    expect(periodRanges('all', calendar)).toEqual([]);
    for (const period of ['month', 'quarter', 'year', 'last-12', 'all']) {
      expect(calculate(deals.map(deal => ({ ...deal, rooms: 1, area: '1', amount: '10' })), 2026,
        { dateRanges: periodRanges(period, calendar) }).rooms.every(row => row.count === 0)).toBe(true);
    }
  }
});
test('selection reconciliation removes future values, repairs missing years and preserves valid memories', () => {
  const calendar = context('2026-05-15', [{ date: '2023-07-10' }]);
  expect(initialSelections(calendar)).toEqual({ month: null, quarter: null, year: { year: 2026 } });
  expect(defaultSelection('month', calendar)).toEqual({ year: 2026, values: [5] });
  expect(defaultSelection('quarter', calendar)).toEqual({ year: 2026, values: [2] });
  const state = { month: { year: 2026, values: [1, 12] }, quarter: { year: 2026, values: [1, 4] }, year: { year: 2023 } };
  expect(reconcileSelections(state, calendar)).toEqual({ month: { year: 2026, values: [1] }, quarter: { year: 2026, values: [1] }, year: { year: 2023 } });
  state.month.values = [12]; state.quarter.values = [4];
  expect(reconcileSelections(state, calendar)).toMatchObject({ month: { values: [5] }, quarter: { values: [2] } });
  state.month.year = 2024; state.quarter.year = 2024;
  expect(reconcileSelections(state, calendar)).toEqual(state);
  expect(reconcileSelections(state, context('2026-05-15', [{ date: '2025-01-01' }]))).toEqual({
    month: { year: 2026, values: [5] }, quarter: { year: 2026, values: [2] }, year: { year: 2026 },
  });
  const current = { ...state, year: { year: 2026 } };
  expect(reconcileSelections(current, context('2027-01-15', [{ date: '2023-01-01' }]))).toEqual(current);
  expect(state.month.values).toEqual([12]); // Input state was not mutated.
});
test('multi-selection toggles without removing the final value', () => {
  expect(togglePeriodValue([3], 1)).toEqual([1, 3]);
  expect(togglePeriodValue([1, 3], 1)).toEqual([3]);
  expect(togglePeriodValue([3], 3)).toEqual([3]);
});

test('complex OR intersects date, rooms and exact numeric ranges without changing problems or base aggregates', () => {
  const items = [
    deal(1, { opportunity: '12000000', ufCrmArea: '60', ufCrmDate: '2026-11-10' }),
    deal(2, { opportunity: '15000000', ufCrmArea: '60', ufCrmDate: '2026-11-11', ufCrmComplex: 82 }),
    deal(3, { opportunity: '20000000', ufCrmArea: '90', ufCrmRooms: 3, ufCrmDate: '2026-10-10' }),
    deal(4, { ufCrmComplex: '83', ufCrmDate: '2025-12-01' }),
    deal(5, { ufCrmComplex: null, ufCrmDate: null }),
  ];
  const snapshot = aggregate({ items, fields: Object.entries(fields).map(([code, field]) => ({ code, ...field })) },
    { portalOrigin: 'https://portal.example', now: new Date('2026-11-15') });
  expect(snapshot.deals.map((row) => row.complex)).toEqual(['tower', 'hills', 'tower', null]);
  expect(snapshot.problems.map((p) => p.id)).toEqual([5]);
  expect(snapshot.rooms.reduce((sum, row) => sum + row.count, 0)).toBe(4);
  const options = { complexes: ['tower', 'hills'], dateRanges: periodRanges('year', context()) };
  const total = () => calculate(snapshot.deals, 2026, options).rooms.reduce((sum, row) => sum + row.count, 0);
  expect(total()).toBe(3);
  options.dateRanges = periodRanges('month', context()); expect(total()).toBe(2);
  options.complexes = ['tower']; expect(total()).toBe(1);
  options.rooms = [3]; expect(total()).toBe(0);
  options.rooms = [1, 2, 3]; options.area = { min: '61' }; expect(total()).toBe(0);
  options.area = {}; options.amount = { max: '11999999' }; expect(total()).toBe(0);
  options.amount.max = '12000000'; expect(total()).toBe(1);
  expect(calculate(snapshot.deals, 2026, options).months[10]).toEqual({ category: 11, amount: '12000000', count: 1 });
  expect(snapshot.problems.map((p) => p.id)).toEqual([5]);
});

test('all rooms switches to one, supports a subset, and never removes the last selection', () => {
  expect(toggleRoom([1, 2, 3], 2, [1, 2, 3])).toEqual([2]);
  expect(toggleRoom([2], 3, [1, 2, 3])).toEqual([2, 3]);
  expect(toggleRoom([2, 3], 2, [1, 2, 3])).toEqual([3]);
  expect(toggleRoom([3], 3, [1, 2, 3])).toEqual([3]);
});

test.each([
  ['12500000', '12 500 000', '12500000'],
  ['12 500 000,50', '12 500 000,50', '12500000.5'],
  ['9007199254740993.01', '9 007 199 254 740 993.01', '9007199254740993.01'],
  ['12\u00a0500\u202f000', '12 500 000', '12500000'],
  ['0', '0', '0'], ['', '', null],
])('amount draft %s preserves exact numeric value', (text, formatted, normalized) => {
  expect(formatAmountInput(text).text).toBe(formatted);
  expect(validateRange('amount', { min: ungroupAmount(formatted), max: '' }).values.min).toBe(normalized);
});
test.each(['abc', '-1', '1.2.3', '65,', '1e6', '1,2 3'])('invalid amount %s remains invalid', (text) => {
  const formatted = formatAmountInput(text).text;
  expect(formatted).toBe(text);
  expect(validateRange('amount', { min: ungroupAmount(formatted), max: '' }).valid).toBe(false);
});
test('formatting keeps selection in the edited middle instead of at the end', () => {
  expect(formatAmountInput('129 500 000', 3, 7)).toEqual({ text: '129 500 000', start: 3, end: 7 });
  expect(formatAmountInput('12500', 2)).toEqual({ text: '12 500', start: 2, end: 2 });
});
