const periods = [
  ['month', 'Ամիս'], ['quarter', 'Եռամսյակ'], ['year', 'Տարի'],
  ['last-12', 'Վերջին 12 ամիս'], ['all', 'Ամբողջ ժամանակահատված'],
  ['custom', 'Կամայական միջակայք'],
];

function dateAt(year, month, day) {
  const value = new Date(0);
  value.setUTCFullYear(year, month, day);
  return value.toISOString().slice(0, 10);
}
function calendarContext(deals = [], now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Yerevan', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const { year, month, day } = parts;
  const today = dateAt(year, month - 1, day);
  const firstDate = deals.reduce((first, deal) => first === null || deal.date < first ? deal.date : first, null);
  const firstYear = firstDate && firstDate <= today ? Number(firstDate.slice(0, 4)) : year;
  return { year, month, quarter: Math.ceil(month / 3), today, firstDate,
    years: Array.from({ length: year - firstYear + 1 }, (_, i) => firstYear + i) };
}
function defaultSelection(period, context) {
  return { year: context.year, ...(period === 'year' ? {} : { values: [context[period]] }) };
}
function initialSelections(context) {
  // Month and quarter initialize on their first visit, using that day's calendar.
  return { month: null, quarter: null, year: defaultSelection('year', context) };
}
function reconcileSelections(selections, context) {
  return Object.fromEntries(['month', 'quarter', 'year'].map(period => {
    const previous = selections[period];
    if (!previous) return [period, null];
    const year = context.years.includes(previous.year) ? previous.year : context.year;
    if (period === 'year') return [period, { year }];
    const limit = year === context.year ? context[period] : period === 'month' ? 12 : 4;
    const values = [...new Set(previous.values)].filter(value => value >= 1 && value <= limit).sort((a, b) => a - b);
    return [period, { year, values: values.length ? values : [context[period]] }];
  }));
}
function togglePeriodValue(values, value) {
  return values.includes(value)
    ? values.length > 1 ? values.filter(item => item !== value) : values
    : [...values, value].sort((a, b) => a - b);
}
function periodRanges(period, context, selection = defaultSelection(period, context)) {
  const { today, firstDate } = context;
  if (period === 'all') return firstDate && firstDate <= today ? [{ min: firstDate, max: today }] : [];
  if (period === 'last-12') return [{ min: dateAt(context.year, context.month - 12, 1), max: today }];
  const { year } = selection;
  const offsets = period === 'year' ? [[0, 12]]
    : period === 'month' ? selection.values.map(month => [month - 1, month])
      : period === 'quarter' ? selection.values.map(quarter => [(quarter - 1) * 3, quarter * 3]) : null;
  if (!offsets) throw new Error('Unknown calendar period');
  return offsets.map(([start, end]) => ({ min: dateAt(year, start, 1), max: [dateAt(year, end, 0), today].sort()[0] }))
    .filter(range => range.min <= range.max);
}
module.exports = { periods, dateAt, calendarContext, defaultSelection, initialSelections, reconcileSelections, togglePeriodValue, periodRanges };
