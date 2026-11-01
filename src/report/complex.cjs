const COMPLEX = 'Համալիր';
function enumId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
}

// Resolve names once per snapshot; never couple the report to a portal's UF IDs.
function complexField(fields) {
  const matches = fields.filter((field) => field.title === COMPLEX);
  const field = matches[0];
  if (matches.length !== 1 || field.type !== 'enumeration' || field.isMultiple !== false
    || !Array.isArray(field.items)) throw new Error('Invalid complex metadata');
  const ids = new Set();
  for (const entry of field.items) {
    const id = enumId(entry?.ID);
    if (!id || typeof entry.VALUE !== 'string' || ids.has(id)) throw new Error('Invalid complex options');
    ids.add(id);
  }
  const values = new Map();
  for (const [name, key] of [['Milon Tower', 'tower'], ['Milon Hills', 'hills']]) {
    const options = field.items.filter((entry) => entry.VALUE === name);
    if (options.length !== 1) throw new Error('Complex option must be unique');
    values.set(enumId(options[0].ID), key);
  }
  return { code: field.code, value: (raw) => values.get(enumId(raw)) ?? null };
}
module.exports = { COMPLEX, complexField };
