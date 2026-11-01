const periods = [
  ['month', 'Ընթացիկ ամիս'], ['previous-month', 'Անցյալ ամիս'],
  ['quarter', 'Ընթացիկ եռամսյակ'], ['year', 'Ընթացիկ տարի'],
  ['last-12', 'Վերջին 12 ամիս'], ['all', 'Ամբողջ ժամանակահատված'],
  ['custom', 'Կամայական միջակայք'],
];

function periodRange(period, now = new Date()) {
  if (period === 'all') return { min: null, max: null };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Yerevan', year: 'numeric', month: 'numeric',
  }).formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  const year = parts.year, month = parts.month - 1;
  const bounds = {
    month: [month, month + 1], 'previous-month': [month - 1, month],
    quarter: [Math.floor(month / 3) * 3, Math.floor(month / 3) * 3 + 3],
    year: [0, 12], 'last-12': [month - 11, month + 1],
  }[period];
  if (!bounds) throw new Error('Unknown calendar period');
  const date = (offset, day) => {
    const value = new Date(0);
    value.setUTCFullYear(year, offset, day);
    return value.toISOString().slice(0, 10);
  };
  return { min: date(bounds[0], 1), max: date(bounds[1], 0) };
}
module.exports = { periods, periodRange };
