const { decimal, compare, decimalText } = require('./filter.cjs');
const { valueText } = require('./kpi.cjs');

const zero = { coefficient: 0n, scale: 0 };
function ceilingRatio(value, step) {
  const scale = Math.max(value.scale, step.scale);
  const numerator = value.coefficient * 10n ** BigInt(scale - value.scale);
  const denominator = step.coefficient * 10n ** BigInt(scale - step.scale);
  return (numerator + denominator - 1n) / denominator;
}
function stepFor(value, minimumIntervals = 2, maximumIntervals = 4, integer = false) {
  if (!value.coefficient) return { coefficient: 1n, scale: 0 };
  const min = integer ? { coefficient: 1n, scale: 0 } : { coefficient: 1n, scale: 2 };
  const digits = value.coefficient.toString().length - value.scale;
  for (let power = digits - 3; power <= digits + 1; power++) {
    for (const base of [1n, 2n, 5n]) {
      const step = power < 0 ? { coefficient: base, scale: -power }
        : { coefficient: base * 10n ** BigInt(power), scale: 0 };
      if (min && compare(step, min) < 0) continue;
      const intervals = ceilingRatio(value, step);
      if (intervals >= BigInt(minimumIntervals) && intervals <= BigInt(maximumIntervals)) return step;
    }
  }
  return min;
}
function axisScale(series, metric, narrow = false) {
  const maximum = series.filter(Boolean).flat().reduce((max, point) => {
    const current = decimal(String(point[metric]), true) || zero;
    return compare(current, max) > 0 ? current : max;
  }, zero);
  const intervals = narrow ? 2 : 4;
  const step = stepFor(maximum, 2, intervals, metric === 'count');
  const count = maximum.coefficient ? Math.max(2, Number(ceilingRatio(maximum, step))) : 2;
  const upper = { coefficient: step.coefficient * BigInt(count), scale: step.scale };
  const ticks = Array.from({ length: count + 1 }, (_, i) => {
    const value = { coefficient: step.coefficient * BigInt(i), scale: step.scale };
    return { value: decimalText(value), label: valueText(decimalText(value), metric), fraction: i / count };
  });
  return { upper, ticks };
}
function xTickIndices(length, narrow = false) {
  if (length <= 0) return [];
  if (length <= 2) return Array.from({ length }, (_, i) => i);
  const count = Math.min(length, narrow ? 3 : 5);
  return Array.from({ length: count }, (_, i) => Math.round(i * (length - 1) / (count - 1)));
}
function dateParts(point, daily, narrow = false) {
  const [year, month, day] = point.min.split('-');
  return daily ? [`${day}.${month}`, year] : narrow ? [month, year] : [`${month}.${year}`];
}
module.exports = { axisScale, xTickIndices, dateParts };
