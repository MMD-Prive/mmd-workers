import { RENEWAL_VIEW_VERSION, RENEWAL_VIEW_CSS, renewalViewHtml, createRenewalView } from "./liff-renewal-view.js";

export function isMyMmdRenewalEntry(request) {
  if (!(request instanceof Request) || !["GET", "HEAD"].includes(request.method)) return false;
  const url = new URL(request.url);
  if (url.pathname.toLowerCase().replace(/\/+$/, "") !== "/member/liff") return false;
  const stateValue = url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "";
  const state = new URLSearchParams(stateValue.includes("?") ? stateValue.slice(stateValue.indexOf("?") + 1) : stateValue);
  // Exactly the shell's precedence: top-level values win over liff.state.
  for (const key of ["intent", "liff_intent"]) {
    if (!url.searchParams.has(key) && state.has(key)) url.searchParams.set(key, state.get(key));
  }
  return String(url.searchParams.get("intent") || url.searchParams.get("liff_intent") || "").trim().toLowerCase() === "renew";
}

const ANCHORS = Object.freeze({
  card: '<div id="renewal-card"',
  afterCard: '<div class="card"><h2 data-copy="packageTitle"',
  client: '  async function loadRenewalCard() {',
  afterClient: '  function legacyCustomerView(data) {',
  showView: '  function showView(view, smooth = true) {',
  entry: 'if (profile || (preflightVerifiedSession && document.body.dataset.welcomeAudience === "existing")) {',
});
const once = (text, marker) => text.indexOf(marker) >= 0 && text.indexOf(marker) === text.lastIndexOf(marker);

export function enhanceRenewalShell(html) {
  if (typeof html !== "string" || html.length > 1024 * 1024 || html.includes('data-renewal-version="' + RENEWAL_VIEW_VERSION + '"')) return null;
  if (![...Object.values(ANCHORS), '</head>'].every(marker => once(html, marker))) return null;
  const cardStart = html.indexOf(ANCHORS.card), cardEnd = html.indexOf(ANCHORS.afterCard, cardStart);
  const clientStart = html.indexOf(ANCHORS.client), clientEnd = html.indexOf(ANCHORS.afterClient, clientStart);
  if (cardEnd <= cardStart || clientEnd <= clientStart) return null;
  const script = `  function atelierRenewalUI() {
    if (!atelierRenewalUI.instance) atelierRenewalUI.instance = (${createRenewalView.toString()})({
      document, fetcher: memberApiFetch, navigate: url => window.location.assign(url), showView,
      checkoutUrl: verifiedCheckoutUrl, getBusy: () => busy, setBusy,
    });
    return atelierRenewalUI.instance;
  }
  async function loadRenewalCard() { return atelierRenewalUI().load(); }
  function renderRenewalCard(card, offer) { return atelierRenewalUI().render(offer); }
  async function purchaseRenewal(packageCode) { return atelierRenewalUI().purchase(packageCode); }

`;
  // Replace the later client segment first so the earlier HTML offsets stay valid.
  let output = html.slice(0, clientStart) + script + html.slice(clientEnd);
  output = output.slice(0, cardStart) + renewalViewHtml() + '\n      ' + output.slice(cardEnd);
  output = output.replace(ANCHORS.showView, ANCHORS.showView + '\n    document.body.classList.toggle("mmd-renewal-view", view === "package");');
  // Skip only the redundant welcome click, never the LINE/session verification.
  // enterApp still waits for welcomeContextPromise and runs the existing boot.
  output = output.replace(ANCHORS.entry, 'if (CONFIG.intent === "renew" || profile || (preflightVerifiedSession && document.body.dataset.welcomeAudience === "existing")) {');
  output = output.replace('</head>', '<style data-mmd-renewal-style="' + RENEWAL_VIEW_VERSION + '">' + RENEWAL_VIEW_CSS + '</style></head>');
  output = output.replace('<title>MMD Privé</title>', '<title>ต่ออายุสมาชิก | MY MMD</title>');
  return output;
}

export async function applyMyMmdRenewalPageResponse(request, response) {
  if (!isMyMmdRenewalEntry(request) || request.method === "HEAD" || !(response instanceof Response)
      || response.status !== 200 || !String(response.headers.get("content-type") || "").includes("text/html")) return response;
  const html = await response.clone().text();
  const enhanced = enhanceRenewalShell(html);
  if (enhanced === null) {
    // Contract drift must be observable rather than partially splicing a shell.
    // The price guard still prevents an old page from charging unapproved prices.
    const headers = new Headers(response.headers);
    headers.set("x-mmd-renewal-ui", html.includes('data-renewal-version="' + RENEWAL_VIEW_VERSION + '"') ? RENEWAL_VIEW_VERSION : "shell-contract-mismatch");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length"); headers.delete("etag");
  headers.set("cache-control", "no-store"); headers.set("x-mmd-renewal-ui", RENEWAL_VIEW_VERSION);
  return new Response(enhanced, { status: response.status, statusText: response.statusText, headers });
}
