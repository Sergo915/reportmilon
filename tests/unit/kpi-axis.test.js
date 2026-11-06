const { compare, decimal } = require('../../src/report/filter.cjs');
const { axisScale, xTickIndices, dateParts } = require('../../src/report/kpi-axis.cjs');
const point = (count, amount = '0') => ({ min: '2025-02-01', max: '2025-02-01', count, amount });

test('count scale includes both series with integer, evenly spaced ticks and a nonzero zero scale', () => {
  const scale = axisScale([[point(0), point(1), point(2)], [point(0), point(3), point(7)]], 'count');
  expect(scale.ticks.map(tick => tick.value)).toEqual(['0', '2', '4', '6', '8']);
  expect(scale.ticks.map(tick => tick.fraction)).toEqual([0, .25, .5, .75, 1]);
  expect(axisScale([[point(0)]], 'count').ticks.map(tick => tick.value)).toEqual(['0', '1', '2']);
});

test('amount scale rounds exact decimal values without Number precision loss', () => {
  const scale = axisScale([[point(0, '0.1'), point(0, '9007199254740993.01')], [point(0, '9007199254740993.02')]], 'amount');
  expect(compare(scale.upper, decimal('9007199254740993.02'))).toBeGreaterThanOrEqual(0);
  expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
  expect(scale.ticks.every(tick => tick.label.endsWith('֏'))).toBe(true);
  expect(axisScale([[point(0, '0.1'), point(0, '0.2')]], 'amount').ticks.map(tick => tick.value)).toEqual(['0', '0.05', '0.1', '0.15', '0.2']);
  expect(axisScale([[point(0)]], 'amount').ticks.map(tick => tick.value)).toEqual(['0', '1', '2']);
  const cents = axisScale([[point(0, '0.01')]], 'amount');
  expect(cents.ticks.map(tick => tick.label)).toEqual(['0 ֏', '0,01 ֏', '0,02 ֏']);
});

test('X ticks use the current series length and preserve its first and last positions', () => {
  expect(xTickIndices(0)).toEqual([]);
  expect(xTickIndices(1)).toEqual([0]);
  expect(xTickIndices(2)).toEqual([0, 1]);
  expect(xTickIndices(28)).toEqual([0, 7, 14, 20, 27]);
  expect(xTickIndices(28, true)).toEqual([0, 14, 27]);
  expect(dateParts(point(1), true)).toEqual(['01.02', '2025']);
  expect(dateParts({ min: '2025-02-01', max: '2025-02-28' }, false)).toEqual(['02.2025']);
  expect(dateParts({ min: '2025-02-01', max: '2025-02-28' }, false, true)).toEqual(['02', '2025']);
});

test('narrow scale keeps 3 to 5 unique labels across decimal magnitudes', () => {
  for (const metric of ['count', 'amount']) for (const value of ['0.001', '0.01', '0.09', '0.2', '0.99', '1', '7', '9', '21', '99', '101', '999', '1001', '9007199254740993.01']) {
    if (metric === 'count' && value.includes('.')) continue;
    const scale = axisScale([[point(metric === 'count' ? value : 0, metric === 'amount' ? value : '0')]], metric, true);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
    expect(scale.ticks.length).toBeLessThanOrEqual(5);
    expect(new Set(scale.ticks.map(tick => tick.label)).size).toBe(scale.ticks.length);
  }
});
