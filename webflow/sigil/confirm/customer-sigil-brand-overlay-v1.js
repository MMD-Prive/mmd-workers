/*!
 * SĪGIL brand overlay for /sigil/confirm/job-confirmation.
 * Presentation only. Runs after the page's inline customer bridge (v10) has built
 * #mmd-job-confirm-v16: swaps the header brand to the SĪGIL mark + wordmark and
 * applies LINE Seed Sans TH, matching /sigil/pay. Contracts, data hooks and
 * payment logic are untouched. Public-lane jobs keep "MMD PRIVÉ".
 */
(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "/sigil/confirm/job-confirmation") return;
  if (window.__mmdSigilBrandOverlayV1) return;
  window.__mmdSigilBrandOverlayV1 = true;

  const ROOT_ID = "mmd-job-confirm-v16";
  const SVG = '<svg class="mjc16__sigil-mark" aria-label="SĪGIL" role="img" viewBox="0 0 283 360"><g fill="currentColor"><path d="M141.5,35 L201.5,85 L201.5,171 L180.5,157 L180.5,97 L141.5,63 L102.5,97 L102.5,143 L201.5,203 L201.5,274 L141.5,325 L80.5,275 L80.5,182 L101.5,196 L101.5,263 L141.5,298 L180.5,265 L180.5,217 L80.5,157 L80.5,85 Z"/><path d="M39.5,119 L61.5,100 L61.5,258 L39.5,241 Z M218.5,100 L240.5,119 L240.5,241 L218.5,258 Z"/></g></svg>';
  const CSS = `
#mmd-job-confirm-v16.mmd-atelier,#mmd-job-confirm-v16.mmd-atelier *:not(svg):not(svg *){font-family:"LINE Seed Sans TH","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
.mmd-atelier .mjc16__sigil-mark{color:#B28D50;width:20px;height:24px}
.mmd-atelier .mjc16__brand:has(.mjc16__sigil-mark)::before{display:none}
.mmd-atelier .mjc16__brand:has(.mjc16__sigil-mark){font-size:12px;font-weight:700;letter-spacing:.18em;gap:10px}
.mmd-atelier .mjc16__assistant{margin-left:0;letter-spacing:.02em}
`;

  function style() {
    if (document.getElementById("mmd-sigil-brand-overlay-v1")) return;
    const el = document.createElement("style");
    el.id = "mmd-sigil-brand-overlay-v1";
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  let publicLane = false;
  function apply() {
    const root = document.getElementById(ROOT_ID);
    const brand = root?.querySelector(".mjc16__brand");
    if (!brand) return false;
    const name = publicLane ? "MMD PRIVÉ" : "SĪGIL";
    const marked = !!brand.querySelector(".mjc16__sigil-mark");
    if (publicLane) {
      if (marked || brand.textContent !== name) brand.replaceChildren(document.createTextNode(name));
    } else if (!marked || brand.textContent.trim() !== name) {
      brand.innerHTML = SVG;
      brand.appendChild(document.createTextNode(name));
    }
    const eyebrow = root.querySelector(".mjc16__eyebrow");
    if (eyebrow && eyebrow.textContent !== name + " · BANGKOK") eyebrow.textContent = name + " · BANGKOK";
    const foot = root.querySelector(".mjc16__footer strong");
    if (foot && foot.textContent !== name + " · BANGKOK") foot.textContent = name + " · BANGKOK";
    return true;
  }

  async function readLane() {
    const tokens = new URL(location.href).searchParams.getAll("t");
    const token = tokens.length === 1 ? tokens[0].trim() : "";
    if (!token) return;
    try {
      const r = await fetch("https://sigil.mmdbkk.com/v1/confirm/details", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        body: JSON.stringify({ t: token, expected_role: "customer" }),
      });
      const d = await r.json().catch(() => ({}));
      publicLane = d?.model_work_lane === "public_model";
      apply();
    } catch (_) { /* default stays SĪGIL */ }
  }

  function boot() {
    style();
    apply();
    // The inline bridge may mount or rebuild its root after this script; writes are idempotent.
    new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
    readLane();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
