// Pure code preparation only: no credentials, network, bindings or deployment.
const startMarker = '  if (path.startsWith(`${CUSTOMER_API_BASE}/booking/`))';
const endMarker = '  if (path === `${CUSTOMER_API_BASE}/chat`';
export function repairBookingCatalog(live, source) {
  const start = live.indexOf(startMarker), end = live.indexOf(endMarker, start);
  const sourceStart = source.indexOf(startMarker), sourceEnd = source.indexOf(endMarker, sourceStart);
  if (start < 0 || end < start || sourceStart < 0 || sourceEnd < sourceStart || live.indexOf(startMarker, start + 1) !== -1) throw new Error('Ambiguous booking branch');
  const old = live.slice(start, end);
  // Require the proven defect; refuse to overwrite an unknown or already fixed release.
  if (!old.includes('await upstream.json11()')) throw new Error('Expected catalog reader defect absent');
  const helper = old.match(/return (json\d*)\(\{ok:false,error:\{code:'MMS_BOOKING_UPSTREAM_UNAVAILABLE'/)?.[1];
  if (!helper) throw new Error('Unknown response helper');
  // Lexical alias preserves Response.json() member calls and string literals.
  const block = `  {\n    const json = ${helper};\n${source.slice(sourceStart, sourceEnd)}  }\n\n`;
  const candidate = live.slice(0, start) + block + live.slice(end);
  if (candidate.slice(0, start) !== live.slice(0, start) || candidate.slice(start + block.length) !== live.slice(end)) throw new Error('Unrelated code changed');
  return candidate;
}
