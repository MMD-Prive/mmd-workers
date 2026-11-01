import { parseMarkedJson } from "./confirmation-details.js";
// Compatibility codec used by the separately owned MY MMD payment flow from #2740.
// D1 preference requests never write Session notes.
export function replaceMarker(note, data) {
  const kept = String(note || '').replace(/\[MMD BLACK CARD COMPANION PREFERENCE V1\]\s*\{[^\n]*?\}/g, '').trim();
  return [kept, '[MMD BLACK CARD COMPANION PREFERENCE V1] ' + JSON.stringify(data)].filter(Boolean).join('\n');
}

export const parseStored = raw => parseMarkedJson(String(raw || ""), "MMD BLACK CARD COMPANION PREFERENCE V1");
