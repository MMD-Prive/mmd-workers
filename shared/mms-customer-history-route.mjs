export function isMmsCustomerHistoryPage(request) {
  const url = new URL(request.url);
  if (!["/member/liff", "/member/liff/"].includes(url.pathname)) return false;
  if (url.searchParams.get("view") === "mms-history") return true;
  const raw = url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "";
  let state = raw;
  try { state = decodeURIComponent(raw); } catch { return false; }
  const query = state.indexOf("?");
  return new URLSearchParams(query >= 0 ? state.slice(query + 1) : state).get("view") === "mms-history";
}
