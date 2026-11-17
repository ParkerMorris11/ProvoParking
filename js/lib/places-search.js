// Google Places search for the map search box: any address or business in the Provo area.
// Uses Places Autocomplete (New) with one session token per search, then ONE lookup for the picked place
// that asks only for its location and address. Google lists those sessions as free and the lookup as the
// "Essentials" tier (10,000 free a month). Every failure (no key, Places not enabled, offline) returns
// nothing, so the search box keeps working with our own lots and buildings.

// Utah County and a little beyond. A bias, not a limit: typing a farther place can still match.
const BIAS = { west: -112.05, east: -111.45, south: 39.95, north: 40.5 };
const MIN_CHARS = 3;

export function createPlacesSearch({ getGoogle = () => globalThis.google, bias = BIAS } = {}) {
  let library = null, broken = false, token = null;

  async function load() {
    if (broken) return null;
    if (library) return library;
    const g = getGoogle();
    if (typeof g?.maps?.importLibrary !== "function") return null;
    try {
      library = await g.maps.importLibrary("places");
      if (!library?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) { broken = true; library = null; }
    } catch { broken = true; library = null; }
    return library;
  }

  return {
    /** Up to 5 { id, title, subtitle, prediction } for what was typed, or [] when Places can't answer. */
    async suggest(input) {
      const text = String(input || "").trim();
      if (text.length < MIN_CHARS) return [];
      const lib = await load();
      if (!lib) return [];
      try {
        token ||= new lib.AutocompleteSessionToken();
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text, sessionToken: token, locationBias: bias, includedRegionCodes: ["us"],
        });
        return (suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 5).map(p => ({
          id: p.placeId,
          title: p.mainText?.text || p.text?.text || "Place",
          subtitle: p.secondaryText?.text || "Google Places",
          prediction: p,
        }));
      } catch {
        broken = true; // Places not enabled for this key, or blocked: stop asking
        return [];
      }
    },

    /** Looks up a picked suggestion. Returns { lat, lng, title, address } or null. Ends the search session. */
    async resolve(suggestion) {
      try {
        const place = suggestion.prediction.toPlace();
        await place.fetchFields({ fields: ["location", "formattedAddress"], sessionToken: token || undefined });
        token = null; // a pick ends the session; the next search starts a new one
        const lat = place.location?.lat?.(), lng = place.location?.lng?.();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng, title: suggestion.title, address: place.formattedAddress || suggestion.subtitle };
      } catch { token = null; return null; }
    },

    /** Forget the current session (the search box was cleared). */
    reset() { token = null; },
    get available() { return !broken; },
  };
}
