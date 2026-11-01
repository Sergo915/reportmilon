const { periodRange } = require('../../src/report/period.cjs');
const { calculate, toggleRoom, validateRange } = require('../../src/report/filter.cjs');
const { formatAmountInput, ungroupAmount } = require('../../src/report/amount-input.cjs');
const { aggregate } = require('../../src/report/aggregate.cjs');
const { deal, fields } = require('../support/crm-fixture.cjs');

test.each([
  ['month', '2026-11-01', '2026-11-30'], ['previous-month', '2026-10-01', '2026-10-31'],
  ['quarter', '2026-10-01', '2026-12-31'], ['year', '2026-01-01', '2026-12-31'],
  ['last-12', '2025-12-01', '2026-11-30'], ['all', null, null],
])('period %s has exact inclusive boundaries', (period, min, max) => {
  const date = periodRange(period, new Date('2026-11-15T10:00:00Z'));
  expect(date).toEqual({ min, max });
  if (!min) return;
  const offset = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
  const deals = [offset(min, -1), min, max, offset(max, 1)].map((date) => ({ date, rooms: 1, area: '1', amount: '10' }));
  expect(calculate(deals, 2026, { date }).rooms[0]).toEqual({ category: 1, amount: '20', count: 2 });
});
test.each([
  ['previous-month', '2027-01-15T00:00:00Z', '2026-12-01', '2026-12-31'],
  ['month', '2024-02-15T00:00:00Z', '2024-02-01', '2024-02-29'],
  ['year', '2026-12-31T19:59:59Z', '2026-01-01', '2026-12-31'],
  ['year', '2026-12-31T20:00:00Z', '2027-01-01', '2027-12-31'],
  ['quarter', '2026-03-31T20:00:00Z', '2026-04-01', '2026-06-30'],
  ['last-12', '2027-01-15T00:00:00Z', '2026-02-01', '2027-01-31'],
])('%s handles calendar transition at %s', (period, now, min, max) => {
  expect(periodRange(period, new Date(now))).toEqual({ min, max });
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
  const options = { complexes: ['tower', 'hills'], date: periodRange('year', new Date('2026-11-15')) };
  const total = () => calculate(snapshot.deals, 2026, options).rooms.reduce((sum, row) => sum + row.count, 0);
  expect(total()).toBe(3);
  options.date = periodRange('month', new Date('2026-11-15')); expect(total()).toBe(2);
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
