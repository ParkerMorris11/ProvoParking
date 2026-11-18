// Mobile sheet copy and the limited in-app destinations that may survive sign-in.
export function formatResultsTitle(count, destination) {
  if (!count) return "No matching parking sections";
  const place = destination === "Wilkinson Student Center" ? "the Wilk" : destination;
  if (place) return `${count} ${count === 1 ? "match" : "matches"} near ${place}`;
  return `${count} matching parking ${count === 1 ? "section" : "sections"}`;
}

export function parkingReturn(hash, destinationId) {
  if (typeof hash !== "string" || !/^(?:#car(?:\/[1-9]\d*)?|#area\/[1-9]\d*)$/.test(hash)) return null;
  return { hash, destinationId: Number.isSafeInteger(destinationId) && destinationId > 0 ? destinationId : null };
}
