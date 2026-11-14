/* Private SĪGIL confirmation backgrounds. The customer and model views reveal
 * these images only after their existing server-backed lane signals are set. */
(function () {
  if (document.getElementById("mmd-private-confirmation-art-v1")) return;

  const style = document.createElement("style");
  style.id = "mmd-private-confirmation-art-v1";
  style.textContent = `
    @font-face {
      font-family: "SĪGIL Text";
      src: url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2") format("woff2");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: "SĪGIL Text";
      src: url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2") format("woff2");
      font-style: normal;
      font-weight: 700;
      font-display: swap;
    }
    @font-face {
      font-family: "SĪGIL Display";
      src: url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69c36cc4b622e6eacbd3a371_SukhumvitSet-Regular.woff2") format("woff2");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: "SĪGIL Display";
      src: url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69c36cc407bb841fc6877608_SukhumvitSet-SemiBold.woff2") format("woff2");
      font-style: normal;
      font-weight: 600;
      font-display: swap;
    }

    html body #mmd-job-confirm-v16[data-work-lane="private_model"],
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15,
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] {
      font-family: "SĪGIL Text", "LINE Seed Sans TH", sans-serif !important;
      font-weight: 400 !important;
      line-height: 1.65 !important;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(h1,h2,h3,p,span,strong,a,button,small),
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 :is(h1,h2,h3,p,span,strong,a,button,small),
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(h1,h2,h3,p,span,strong,a,button,small) {
      font-family: "SĪGIL Text", "LINE Seed Sans TH", sans-serif !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(h1,h2,h3,.mjc16__model-name),
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 :is(h1,h2,h3),
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(h1,h2,h3) {
      font-family: "SĪGIL Display", "Sukhumvitset", sans-serif !important;
      font-weight: 600 !important;
      letter-spacing: -.025em !important;
      line-height: 1.28 !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] .mjc16__intro h1,
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 .mm15__intro h1,
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(.atelier-hero-copy h1,.mpc-shell h1) {
      font-size: clamp(31px, 3vw, 42px) !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] .mjc16__model-name {
      font-size: clamp(28px, 2.5vw, 34px) !important;
      line-height: 1.2 !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(.mjc16__eyebrow,.mjc16__section-kicker),
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 .mm15__intro::before,
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(.atelier-eyebrow,.mpc-kicker) {
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: .13em !important;
      line-height: 1.5 !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(.mjc16__rows,.mjc16__pricing,.mjc16__payment),
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 :is(.mm15__rows,.mm15__card,.mm15__confirm),
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(.mpc-lead,.mpc-summary,.mpc-status) {
      font-size: 15px !important;
      line-height: 1.65 !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(.mjc16__rows,.mjc16__pricing) :is(strong,b),
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 .mm15__rows :is(strong,b),
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] .mpc-summary :is(strong,b) {
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1;
      font-weight: 700 !important;
    }
    html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(.mjc16__paycta-btn,.mjc16__primary),
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 .mm15__primary,
    html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] .mpc-btn {
      font-size: 16px !important;
      font-weight: 700 !important;
      letter-spacing: 0 !important;
      line-height: 1.35 !important;
    }
    @media (max-width: 600px) {
      html body #mmd-job-confirm-v16[data-work-lane="private_model"] .mjc16__intro h1,
      html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 .mm15__intro h1,
      html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(.atelier-hero-copy h1,.mpc-shell h1) {
        font-size: 30px !important;
      }
      html body #mmd-job-confirm-v16[data-work-lane="private_model"] :is(.mjc16__rows,.mjc16__pricing,.mjc16__payment),
      html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 :is(.mm15__rows,.mm15__card,.mm15__confirm),
      html body #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(.mpc-lead,.mpc-summary,.mpc-status) {
        font-size: 14px !important;
      }
    }

    #mmd-payment-confirmation.atelier[data-atelier-world="private"]::before {
      content: "" !important;
      background-color: #0d0b0a !important;
      background-image: linear-gradient(180deg,transparent 60%,#0d0b0a 92%),
        linear-gradient(90deg,rgba(9,7,6,.82),rgba(9,7,6,.32) 58%,rgba(9,7,6,.08)),
        url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af837071e8a2fdb6ccdba34_payment-confirmation-desktop.png") !important;
      background-position: center center, center center, center top !important;
      background-size: 100% 100%, 100% 100%, contain !important;
      background-repeat: no-repeat !important;
      filter: none !important;
    }
    #mmd-payment-confirmation.atelier[data-atelier-world="private"] .atelier-hero {
      background: transparent !important;
      border-radius: 0 !important;
      overflow: visible !important;
    }
    #mmd-payment-confirmation.atelier[data-atelier-world="private"] .atelier-picture,
    #mmd-payment-confirmation.atelier[data-atelier-world="private"] .atelier-hero::after {
      display: none !important;
    }
    #mmd-payment-confirmation.atelier[data-atelier-world="private"] :is(.mpc-card,.atelier-card) {
      position: relative;
      z-index: 1;
      background: rgba(18,15,13,.92) !important;
      border: 1px solid rgba(227,189,124,.48) !important;
      box-shadow: 0 20px 64px rgba(0,0,0,.36) !important;
    }

    html body #mmd-job-confirm-v16.mmd-atelier[data-work-lane="private_model"]::before {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100dvh !important;
      background-color: #101214 !important;
      background-image: linear-gradient(180deg,transparent 60%,#101214 92%),
        linear-gradient(180deg,rgba(16,18,20,.36),rgba(16,18,20,.68)),
        url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af8370705da06bf8e807f22_job-confirmation-mobile.png") !important;
      background-position: center center, center center, center top !important;
      background-size: 100% 100%, 100% 100%, contain !important;
      background-repeat: no-repeat !important;
    }
    #mmd-job-confirm-v16[data-work-lane="private_model"] :is(.mjc16__card--job,.mjc16__card--pricing) {
      background: rgba(22,23,25,.92) !important;
      border: 1px solid rgba(227,189,124,.42) !important;
      box-shadow: 0 16px 48px rgba(0,0,0,.28) !important;
    }
    #mmd-job-confirm-v16[data-work-lane="private_model"] .mjc16__card--pricing {
      padding: 24px !important;
      border-radius: 8px !important;
    }
    @media (min-width: 601px) {
      html body #mmd-job-confirm-v16.mmd-atelier[data-work-lane="private_model"]::before {
        background-image: linear-gradient(180deg,transparent 60%,#101214 92%),
          linear-gradient(90deg,rgba(16,18,20,.84),rgba(16,18,20,.32) 64%,rgba(16,18,20,.08)),
          url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af8370727e8ba62816bdf8f_job-confirmation-desktop.png") !important;
      }
    }

    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15::before {
      background-color: #0d0b0a !important;
      background-image: linear-gradient(180deg,transparent 60%,#0d0b0a 92%),
        linear-gradient(90deg,rgba(9,7,6,.78),rgba(9,7,6,.34) 60%,rgba(9,7,6,.08)),
        url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af83707272c86df4612da26_job-model-desktop.png") !important;
      background-position: center center, center center, center top !important;
      background-size: 100% 100%, 100% 100%, contain !important;
      background-repeat: no-repeat !important;
      filter: none !important;
    }
    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15 :is(.mm15__card,.mm15__confirm) {
      background: rgba(18,15,13,.92) !important;
      border: 1px solid rgba(227,189,124,.42) !important;
      box-shadow: 0 16px 48px rgba(0,0,0,.28) !important;
    }
    @media (max-width: 600px) {
      #mmd-payment-confirmation.atelier[data-atelier-world="private"]::before {
        background-image: linear-gradient(180deg,transparent 60%,#0d0b0a 92%),
          linear-gradient(180deg,rgba(9,7,6,.08),rgba(9,7,6,.64)),
          url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af83707e60d5ea5c4417684_payment-confirmation-mobile.png") !important;
      }
      html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15::before {
        background-image: linear-gradient(180deg,transparent 60%,#0d0b0a 92%),
          linear-gradient(180deg,rgba(9,7,6,.18),rgba(9,7,6,.62)),
          url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af83706129c1c7c8728cfb5_job-model-mobile.png") !important;
      }
    }

    #mmd-job-confirm-v16[data-work-lane="private_model"] .mjc16__brand::before,
    html[data-model-job-brand="private_model"] #mmd-model-confirm-v15 .mm15__brand::before {
      display: none !important;
    }
    #mmd-job-confirm-v16[data-work-lane="private_model"] .mjc16__brand img,
    html[data-model-job-brand="private_model"] #mmd-model-confirm-v15 .mm15__brand img,
    #mmd-payment-confirmation[data-atelier-world="private"] .mpc-brand img {
      display: block !important;
      width: 196px !important;
      height: 98px !important;
      max-width: none !important;
      object-fit: contain !important;
      margin: -22px -42px !important;
      flex: none !important;
    }
    #mmd-payment-confirmation[data-atelier-world="private"] .mpc-brand strong {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  const logo2027 = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6aec9538faadf68fb64e70eb_SIGIL%20Logo%202027.webp";
  const previous = new WeakMap();
  const brands = [
    ["#mmd-job-confirm-v16 .mjc16__brand img", "#mmd-job-confirm-v16[data-work-lane='private_model']"],
    ["#mmd-model-confirm-v15 .mm15__brand img", "html[data-model-job-brand='private_model']"],
    ["#mmd-payment-confirmation .mpc-brand img", "#mmd-payment-confirmation[data-atelier-world='private']"]
  ];
  let queued = false;
  function updateLogo() {
    queued = false;
    for (const [imageSelector, privateSelector] of brands) {
      const isPrivate = !!document.querySelector(privateSelector);
      document.querySelectorAll(imageSelector).forEach((img) => {
        if (isPrivate) {
          if (img.getAttribute("src") === logo2027) return;
          previous.set(img, {src: img.getAttribute("src"), alt: img.getAttribute("alt")});
          img.src = logo2027;
          img.alt = "SĪGIL SYSTEM";
        } else if (previous.has(img) && img.getAttribute("src") === logo2027) {
          const original = previous.get(img);
          if (original.src === null) img.removeAttribute("src");
          else img.setAttribute("src", original.src);
          if (original.alt === null) img.removeAttribute("alt");
          else img.setAttribute("alt", original.alt);
          previous.delete(img);
        }
      });
    }
  }
  function queueUpdate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(updateLogo);
  }
  function observe() {
    updateLogo();
    new MutationObserver(queueUpdate).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-work-lane", "data-model-job-brand", "data-atelier-world"]
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe, {once: true});
  else observe();
})();
