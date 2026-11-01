const spaces = /[ \u00a0\u202f]/g;
// Strip grouping only from otherwise numeric drafts. Letters/signs stay invalid.
function ungroupAmount(text) {
  return /^[\d \u00a0\u202f]*(?:[.,]\d*)?$/.test(text) ? text.replace(spaces, '') : text;
}
function formatAmountInput(text, start = text.length, end = start) {
  const raw = ungroupAmount(text);
  if (!/^\d*(?:[.,]\d*)?$/.test(raw)) return { text, start, end };
  const formatted = raw.replace(/^\d+/, (whole) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  const position = (offset) => {
    const count = text.slice(0, offset).replace(spaces, '').length;
    if (!count) return 0;
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (formatted[i] !== ' ' && ++seen === count) return i + 1;
    }
    return formatted.length;
  };
  return { text: formatted, start: position(start), end: position(end) };
}
module.exports = { ungroupAmount, formatAmountInput };
