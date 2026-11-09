const { decimal, decimalText, add, compare, filterDeals } = require('./filter.cjs');
const { dateAt, periodRanges, defaultSelection } = require('./period.cjs');
const { fullAmount } = require('./chart.cjs');

const monthNames = ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս',
  'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'];
const unitMonths = { month: 1, quarter: 3, year: 12 };
const parts = date => date.split('-').map(Number);
function shiftDays(date, days) {
  const [year, month, day] = parts(date);
  return dateAt(year, month - 1, day + days);
}
function shiftMonths(date, months) {
  const [year, month, day] = parts(date);
  const end = dateAt(year, month + months, 0);
  return end.slice(0, 8) + String(Math.min(day, Number(end.slice(8)))).padStart(2, '0');
}
function periodStart(date, type) {
  const [year, month] = parts(date);
  const size = unitMonths[type];
  return dateAt(year, Math.floor((month - 1) / size) * size, 1);
}
function periodEnd(start, type) {
  return shiftDays(shiftMonths(start, unitMonths[type]), -1);
}

function comparisonRanges(period, context, selection, custom = {}) {
  if (period === 'custom') {
    const current = [{ min: custom.min ?? null, max: custom.max ?? null }];
    if (!custom.min || !custom.max) return { current, previous: null };
    const days = (Date.parse(custom.max) - Date.parse(custom.min)) / 86400000 + 1;
    return { current, previous: [{ min: shiftDays(custom.min, -days), max: shiftDays(custom.min, -1) }] };
  }
  const chosen = selection || defaultSelection(period, context);
  const current = periodRanges(period, context, chosen);
  if (period === 'all') return { current, previous: null };
  if (period === 'last-12') return { current, previous: current.map(({ min, max }) =>
    ({ min: shiftMonths(min, -12), max: shiftMonths(max, -12) })) };
  const values = [...new Set(period === 'year' ? [1] : chosen.values)].sort((a, b) => a - b);
  const consecutive = values.every((value, index) => index === 0 || value === values[index - 1] + 1);
  const offset = consecutive ? values.length * unitMonths[period] : 12;
  const previous = current.map(range => {
    const min = shiftMonths(range.min, -offset);
    // A completed February maps to the whole of January; only unfinished
    // periods preserve their day-of-month rather than the calendar endpoint.
    const max = range.max === periodEnd(range.min, period)
      ? periodEnd(min, period) : shiftMonths(range.max, -offset);
    return { min, max };
  });
  return { current, previous };
}

function totals(deals) {
  return { count: deals.length, amount: decimalText(deals.reduce((sum, deal) =>
    add(sum, decimal(deal.amount)), { coefficient: 0n, scale: 0 })) };
}
function difference(current, previous) {
  const a = decimal(String(current), true), b = decimal(String(previous), true);
  const scale = Math.max(a.scale, b.scale);
  const left = a.coefficient * 10n ** BigInt(scale - a.scale);
  const right = b.coefficient * 10n ** BigInt(scale - b.scale);
  const delta = left - right, absolute = delta < 0n ? -delta : delta;
  const direction = delta > 0n ? 'up' : delta < 0n ? 'down' : 'flat';
  let percentage = null;
  if (right === 0n) percentage = delta === 0n ? '0%' : null;
  else {
    // Percentage in tenths; integer arithmetic rounds exact halves away from zero.
    const numerator = absolute * 1000n;
    const tenths = numerator / right + (numerator % right * 2n >= right ? 1n : 0n);
    percentage = `${tenths === 0n ? '' : delta < 0n ? '-' : '+'}${tenths / 10n}${tenths % 10n ? `,${tenths % 10n}` : ''}%`;
  }
  return { delta: decimalText({ coefficient: delta, scale }), percentage, direction };
}
function compactAmount(value) {
  const text = String(value), negative = text.startsWith('-');
  const number = decimal(text.replace(/^-/, ''), true);
  const magnitude = number.coefficient, base = 10n ** BigInt(number.scale);
  const suffixes = ['', 'հազ.', 'մլն', 'մլրդ'];
  let unit = 0;
  while (unit < 3 && magnitude >= base * 1000n ** BigInt(unit + 1)) unit++;
  const rounded = index => {
    const divisor = base * 1000n ** BigInt(index), numerator = magnitude * 100n;
    return numerator / divisor + (numerator % divisor * 2n >= divisor ? 1n : 0n);
  };
  let hundredths = rounded(unit);
  if (hundredths >= 100000n && unit < 3) hundredths = rounded(++unit);
  const digits = decimalText({ coefficient: hundredths, scale: 2 });
  return `${negative && hundredths ? '-' : ''}${fullAmount(digits).replace('.', ',')}${unit ? ` ${suffixes[unit]}` : ''} ֏`;
}
function fullKpiAmount(value) {
  const number = decimal(String(value), true);
  const divisor = 10n ** BigInt(number.scale);
  const numerator = number.coefficient * 100n;
  const rounded = numerator / divisor + (numerator % divisor * 2n >= divisor ? 1n : 0n);
  return `${fullAmount(String(rounded / 100n))},${String(rounded % 100n).padStart(2, '0')} ֏`;
}
function valueText(value, metric) {
  return metric === 'amount' ? compactAmount(value) : fullAmount(String(value));
}
function differenceText(change, metric) {
  return `${change.direction === 'up' ? '+' : ''}${valueText(change.delta, metric)} (${change.percentage ?? '—'})`;
}
function rangeText(ranges) {
  if (!ranges) return '';
  const merged = [];
  for (const range of [...ranges].sort((a, b) => String(a.min).localeCompare(String(b.min)))) {
    const last = merged.at(-1);
    if (last?.max && range.min && shiftDays(last.max, 1) === range.min) last.max = range.max;
    else merged.push({ ...range });
  }
  const display = date => date ? date.split('-').reverse().join('.') : '…';
  return merged.map(({ min, max }) => min === max ? display(min) : `${display(min)} – ${display(max)}`).join('; ');
}
function periodLabel(start, type) {
  const [year, month] = parts(start);
  return type === 'year' ? String(year) : type === 'month' ? `${monthNames[month - 1]} ${year}`
    : `${['I', 'II', 'III', 'IV'][Math.floor((month - 1) / 3)]} եռամսյակ ${year}`;
}

function rankings(deals, period, context, type) {
  const first = period === 'last-12' ? periodRanges(period, context)[0].min : context.firstDate;
  if (!first || first > context.today) return { count: [], amount: [] };
  const buckets = new Map();
  for (let start = periodStart(first, type); start <= context.today; start = shiftMonths(start, unitMonths[type])) {
    buckets.set(start, { start, label: periodLabel(start, type), incomplete: periodEnd(start, type) > context.today,
      count: 0, amount: { coefficient: 0n, scale: 0 } });
  }
  for (const deal of deals) {
    if (deal.date < first || deal.date > context.today) continue;
    const bucket = buckets.get(periodStart(deal.date, type));
    if (bucket) { bucket.count++; bucket.amount = add(bucket.amount, decimal(deal.amount)); }
  }
  return Object.fromEntries(['count', 'amount'].map(metric => {
    const compareValues = (a, b) => metric === 'count' ? Math.sign(a.count - b.count) : compare(a.amount, b.amount);
    const sorted = [...buckets.values()].sort((a, b) => compareValues(b, a) || b.start.localeCompare(a.start));
    let rank = 0;
    return [metric, sorted.map((row, index) => {
      if (!index || compareValues(row, sorted[index - 1]) !== 0) rank = index + 1;
      return { start: row.start, label: row.label, incomplete: row.incomplete, rank,
        value: metric === 'amount' ? decimalText(row.amount) : String(row.count) };
    })];
  }));
}

function timeSeries(deals, ranges, interval, history) {
  if (!ranges) return null;
  const buckets = new Map();
  const keyFor = date => interval === 'day' ? date : date.slice(0, 7);
  for (const range of [...ranges].sort((a, b) => String(a.min).localeCompare(String(b.min)))) {
    const min = range.min || history.min, max = range.max || history.max;
    if (!min || !max || min > max) continue;
    for (let start = min; start <= max;) {
      const end = interval === 'day' ? start : [periodEnd(periodStart(start, 'month'), 'month'), max].sort()[0];
      buckets.set(keyFor(start), { min: start, max: end, count: 0, amount: { coefficient: 0n, scale: 0 } });
      start = shiftDays(end, 1);
    }
  }
  for (const deal of deals) {
    const bucket = buckets.get(keyFor(deal.date));
    if (bucket && deal.date >= bucket.min && deal.date <= bucket.max) {
      bucket.count++; bucket.amount = add(bucket.amount, decimal(deal.amount));
    }
  }
  return [...buckets.values()].map(bucket => ({ ...bucket, amount: decimalText(bucket.amount) }));
}

function detailRows(deals) {
  return [...deals].sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id);
}

function calculateKpis(deals, { period, context, selection, custom, filters = {} }) {
  // Explicitly separate non-date filters so the current date selection cannot
  // accidentally intersect the baseline or the independent ranking windows.
  const { rooms, complexes, area, amount } = filters;
  const eligible = filterDeals(deals, { rooms, complexes, area, amount });
  const ranges = comparisonRanges(period, context, selection, custom);
  const selected = { current: filterDeals(eligible, { dateRanges: ranges.current }),
    previous: ranges.previous ? filterDeals(eligible, { dateRanges: ranges.previous }) : null };
  const current = totals(selected.current);
  const previous = selected.previous ? totals(selected.previous) : null;
  const days = custom?.min && custom?.max ? (Date.parse(custom.max) - Date.parse(custom.min)) / 86400000 + 1 : null;
  const interval = period === 'month' || (period === 'custom' && days !== null && days <= 31) ? 'day' : 'month';
  const history = deals.reduce((bounds, deal) => ({ min: !bounds.min || deal.date < bounds.min ? deal.date : bounds.min,
    max: !bounds.max || deal.date > bounds.max ? deal.date : bounds.max }), { min: null, max: null });
  const ranking = period === 'all' || period === 'last-12';
  const types = period === 'all' ? ['month', 'quarter', 'year'] : period === 'last-12' ? ['month'] : [];
  return { current, previous, ranges, ranking, selected,
    series: { current: timeSeries(selected.current, ranges.current, interval, history),
      previous: timeSeries(selected.previous || [], ranges.previous, interval, history) },
    changes: previous ? { count: difference(current.count, previous.count), amount: difference(current.amount, previous.amount) } : null,
    rankings: Object.fromEntries(types.map(type => [type, rankings(eligible, period, context, type)])) };
}
module.exports = { fullKpiAmount, comparisonRanges, difference, valueText, differenceText, rangeText, calculateKpis, compactAmount, detailRows };
