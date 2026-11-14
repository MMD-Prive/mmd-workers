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
  `;
  (document.head || document.documentElement).appendChild(style);
})();
