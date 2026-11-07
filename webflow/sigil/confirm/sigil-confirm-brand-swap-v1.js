/*!
 * SĪGIL confirm pages — brand swap v1.0.0
 * Source of truth for the Webflow script `sigilconfirmbrandswap` (previously inline-only).
 * Loaded as a hosted script pinned to a commit SHA with SRI. Do not edit in Webflow.
 *
 * Pages: /sigil/confirm/{job-confirmation,job-model,payment-confirmation,model-confirmation}
 * - Replaces the brand block / logo with the SĪGIL SYSTEM logo.
 * - Rewrites visible "MMD PRIVÉ" -> "SĪGIL SYSTEM", "MY MMD"/"MMD" -> "SĪGIL" in text and title.
 * - Skips the logo swap when <html data-mmd-neutral> is set (neutral Partner-issued model links).
 * Behaviour is intentionally identical to the inline v1.0.0 that was live on 2026-11-07.
 */
(() => {
  if (!/^\/sigil\/confirm\/(job-confirmation|job-model|payment-confirmation|model-confirmation)/.test(location.pathname)) return;
  var L = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aee826654df354be4f72513_sigil-system-logo-v1.png",
    B = "SĪGIL SYSTEM",
    R = [[/MMD PRIV[ÉE]/gi, B], [/\b(?:MY|My) MMD\b/g, "SĪGIL"], [/\bMMD\b/g, "SĪGIL"]],
    q = 0;
  function T(s) { R.forEach(function (r) { s = s.replace(r[0], r[1]); }); return s; }
  function run() {
    q = 0;
    if (!document.body) return;
    document.querySelectorAll(".mjc16__brand,.mm15__brand").forEach(function (b) {
      if (document.documentElement.hasAttribute("data-mmd-neutral") || b.querySelector("img[data-sg]")) return;
      var i = document.createElement("img");
      i.src = L; i.alt = B; i.setAttribute("data-sg", "1");
      b.replaceChildren(i);
    });
    document.querySelectorAll(".mpc-brand img,img.mmd-jmcf__logo").forEach(function (i) {
      if (!i.hasAttribute("data-sg")) { i.src = L; i.alt = B; i.setAttribute("data-sg", "1"); }
    });
    var w = document.createTreeWalker(document.body, 4), n, a = [], p;
    while ((n = w.nextNode())) {
      p = n.parentNode.nodeName;
      if (p != "SCRIPT" && p != "STYLE" && /MMD/.test(n.nodeValue)) a.push(n);
    }
    a.forEach(function (x) { x.nodeValue = T(x.nodeValue); });
    if (/MMD/.test(document.title)) document.title = T(document.title);
  }
  function go() {
    var s = document.createElement("style");
    s.textContent = ".mjc16__brand::before,.mm15__brand::before{display:none!important}.mjc16__brand,.mm15__brand{min-height:0!important;padding:0!important;gap:0!important}.mjc16__assistant{padding-left:0!important}.mpc-brand strong,.mmd-jmcf__brandtitle{display:none!important}img[data-sg]{display:block!important;content:normal!important;aspect-ratio:auto!important;height:42px!important;width:auto!important;max-width:220px!important;object-fit:contain!important}";
    document.head.appendChild(s);
    run();
    new MutationObserver(function () { if (!q) { q = 1; requestAnimationFrame(run); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  document.readyState == "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
})();
