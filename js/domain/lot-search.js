// Only intercept a complete lot-code query. Sentences stay in the trip interpreter.
export function findExactLot(query, areas) {
  const match = String(query).trim().match(/^(?:byu\s+)?(?:lot\s+)?(\d{1,3}[a-z]{1,3})$/i);
  if (!match) return [];
  const code = match[1].toUpperCase();
  return areas.filter(area => area.operator === 'BYU' && !area.is_sample_data
    && String(area.lot_code || '').toUpperCase() === code);
}
