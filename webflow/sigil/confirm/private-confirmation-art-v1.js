/* Private SĪGIL confirmation backgrounds. The customer and model views reveal
 * these images only after their existing server-backed lane signals are set. */
(function () {
  if (document.getElementById("mmd-private-confirmation-art-v1")) return;

  const style = document.createElement("style");
  style.id = "mmd-private-confirmation-art-v1";
  style.textContent = `
    #mmd-payment-confirmation.atelier[data-atelier-world="private"] .atelier-picture {
      background: url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af837071e8a2fdb6ccdba34_payment-confirmation-desktop.png") center top / cover no-repeat;
    }
    #mmd-payment-confirmation.atelier[data-atelier-world="private"] .atelier-picture img {
      opacity: 0 !important;
    }
    @media (max-width: 600px) {
      #mmd-payment-confirmation.atelier[data-atelier-world="private"] .atelier-picture {
        background-image: url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af83707e60d5ea5c4417684_payment-confirmation-mobile.png");
      }
    }

    html body #mmd-job-confirm-v16.mmd-atelier[data-work-lane="private_model"]::before {
      background-image: linear-gradient(rgba(16,18,20,.62),rgb(16,18,20) 92%),
        url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af8370705da06bf8e807f22_job-confirmation-mobile.png") !important;
      background-position: 0 0, 50% 18% !important;
      background-size: auto, cover !important;
    }
    @media (min-width: 900px) {
      html body #mmd-job-confirm-v16.mmd-atelier[data-work-lane="private_model"]::before {
        background-image: linear-gradient(90deg,rgba(16,18,20,.96),rgba(16,18,20,.45)),
          linear-gradient(180deg,rgba(16,18,20,.2),transparent 35%,#101214),
          url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af8370727e8ba62816bdf8f_job-confirmation-desktop.png") !important;
        background-position: 0 0, 0 0, center top !important;
        background-size: 100% 100%, 100% 100%, cover !important;
      }
    }

    html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15::before {
      background-image: linear-gradient(180deg,rgba(9,7,6,.26),rgba(9,7,6,.94)),
        linear-gradient(90deg,rgba(9,7,6,.54),rgba(9,7,6,.48)),
        url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af83707272c86df4612da26_job-model-desktop.png") !important;
      background-position: 0 0, 0 0, center top !important;
      background-size: 100% 100%, 100% 100%, cover !important;
    }
    @media (max-width: 560px) {
      html[data-model-job-brand="private_model"] body #mmd-model-confirm-v15::before {
        background-image: linear-gradient(180deg,rgba(9,7,6,.20),rgba(9,7,6,.96)),
          linear-gradient(90deg,rgba(9,7,6,.42),rgba(9,7,6,.38)),
          url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6af83706129c1c7c8728cfb5_job-model-mobile.png") !important;
        background-position: 0 0, 0 0, center top !important;
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
