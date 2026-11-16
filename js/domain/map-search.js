// Suggestions come from the app's loaded parking and campus records.
const normalize = value => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function searchMapCatalog(query, { areas = [], destinations = [] } = {}) {
  const term = normalize(query);
  if (term.length < 2) return [];
  const words = term.split(' ');
  const results = [];
  const add = (entry, code, name) => {
    const normalizedCode = normalize(code), normalizedName = normalize(name);
    const haystack = `${normalizedCode} ${normalizedName}`;
    if (!words.every(word => haystack.includes(word))) return;
    const rank = normalizedCode === term ? 0 : normalizedName === term ? 1
      : normalizedCode.startsWith(term) ? 2 : normalizedName.startsWith(term) ? 3 : 4;
    results.push({ ...entry, rank });
  };
  for (const area of areas) {
    add({ type: 'lot', id: area.area_id, title: String(area.area_name || ''), subtitle: 'Parking area' }, area.lot_code, area.area_name);
  }
  for (const d of destinations) {
    add({ type: 'destination', id: d.destination_id, title: String(d.name || ''), subtitle: `BYU building · ${d.building_code || ''}` }, d.building_code, d.name);
  }
  return results.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 8).map(({ rank, ...entry }) => entry);
}
