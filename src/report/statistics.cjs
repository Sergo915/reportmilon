const { filterDeals, decimal, decimalText, add } = require('./filter.cjs');
const months = ['Հունվար','Փետրվար','Մարտ','Ապրիլ','Մայիս','Հունիս','Հուլիս','Օգոստոս','Սեպտեմբեր','Հոկտեմբեր','Նոյեմբեր','Դեկտեմբեր'];
function timeType(period) { return period === 'year' ? 'year' : period === 'quarter' ? 'quarter' : 'month'; }
function interval(value, step) { const d = decimal(value); const index = d.coefficient / (10n ** BigInt(d.scale) * BigInt(step)); return [index * BigInt(step), (index + 1n) * BigInt(step)]; }
const grouped = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function statistics(deals, filters, type) {
 const selected = filterDeals(deals, filters), buckets = new Map(); let amount = decimal('0', true);
 for (const deal of selected) {
  amount = add(amount, decimal(deal.amount)); let key, label, order;
  if (type === 'area' || type === 'amount') { const [a,b] = interval(deal[type], type === 'area' ? 10 : 10000000); key = String(a); label = type === 'area' ? `${grouped(a)}–${grouped(b)} մ²` : `${grouped(a / 1000000n)} մլն–${grouped(b / 1000000n)} մլն ֏`; order = a; }
  else if (type === 'complex') { key = deal.complex; label = key === 'tower' ? 'Թաուեր' : 'Հիլլս'; order = key === 'tower' ? 0 : 1; }
  else if (type === 'rooms') { key = String(deal.rooms); label = `${key} սենյակ`; order = deal.rooms; }
  else { const year = deal.date.slice(0,4), month = Number(deal.date.slice(5,7)), quarter = Math.ceil(month/3); key = type === 'year' ? year : `${year}-${String(type === 'quarter' ? quarter : month).padStart(2,'0')}`; label = type === 'year' ? year : type === 'quarter' ? `${['I','II','III','IV'][quarter-1]} ${year}` : `${months[month-1]} ${year}`; order = key; }
  if (!buckets.has(key)) buckets.set(key, { key, label, order, count: 0 }); buckets.get(key).count++;
 }
 const rows = [...buckets.values()].sort((a,b)=> a.order < b.order ? -1 : a.order > b.order ? 1 : 0).map(row => { let hash=0; for (const c of `${type}:${row.key}`) hash=(hash*31+c.charCodeAt(0))>>>0; const share=row.count/selected.length; return {...row, share, percent: `${(Math.round(share*1000)/10).toString().replace('.',',')}%`, color:`hsl(${(hash * 137.508) % 360} 65% ${50 + (hash % 3) * 8}%)`}; });
 return { count:selected.length, amount:decimalText(amount), rows };
}
module.exports = { statistics, timeType, interval };
