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
function axisScale(series, metric, narrow = false, fitData = false) {
  if (fitData) {
    const values = series.filter(Boolean).flat().map(point => decimal(String(point[metric]), true)).filter(Boolean);
    if (values.length) {
      const lower = values.reduce((a, b) => compare(a, b) < 0 ? a : b);
      const upper = values.reduce((a, b) => compare(a, b) > 0 ? a : b);
      if (compare(lower, upper) < 0) {
        const precision = Math.max(lower.scale, upper.scale);
        const lo = lower.coefficient * 10n ** BigInt(precision - lower.scale);
        const hi = upper.coefficient * 10n ** BigInt(precision - upper.scale);
        const step = stepFor({ coefficient: hi - lo, scale: precision }, 2, narrow ? 2 : 6, metric === 'count');
        const common = Math.max(precision, step.scale);
        const stride = step.coefficient * 10n ** BigInt(common - step.scale);
        const start = lo * 10n ** BigInt(common - precision), end = hi * 10n ** BigInt(common - precision);
        const ticks = [];
        for (let value = (start + stride - 1n) / stride * stride; value <= end; value += stride) {
          const text = decimalText({ coefficient: value, scale: common });
          ticks.push({ value: text, label: valueText(text, metric), fraction: Number((value - start) * 1000000n / (end - start)) / 1000000 });
        }
        if (ticks.length < 2) {
          ticks.splice(0, ticks.length, ...[lower, upper].map((value, index) => ({
            value: decimalText(value), label: valueText(decimalText(value), metric), fraction: index,
          })));
        }
        return { lower, upper, ticks };
      }
    }
  }
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
function dateParts(point, daily, narrow = false, shortYear = false) {
  const [year, month, day] = point.min.split('-');
  if (shortYear) return [daily ? `${day}.${month}.${year.slice(-2)}` : `${month}.${year.slice(-2)}`];
  return daily ? [`${day}.${month}`, year] : narrow ? [month, year] : [`${month}.${year}`];
}
module.exports = { axisScale, xTickIndices, dateParts };
