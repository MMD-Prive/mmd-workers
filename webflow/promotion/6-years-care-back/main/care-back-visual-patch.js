(() => {
  "use strict";

  const root = document.getElementById("mmd-careback-six-v6");
  if (!root || root.dataset.careBackVisualPatchV1 === "1") return;
  root.dataset.careBackVisualPatchV1 = "1";

  const BOSS_IMAGE =
    "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a945475d69ecb5bcd8a4c05_Boss%20Per%20beside.webp";
  const WISH_IMAGE =
    "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a929ff50646bb6234f57e1a_MMD%206%20Y%20Mob.webp";

  const bossImage = root.querySelector(".mx-letter__portrait img");
  const wishImage = root.querySelector(".mx-wish__visual img");

  if (bossImage) {
    bossImage.src = BOSS_IMAGE;
    bossImage.alt = "Per · Founder of MMD Privé";
    bossImage.decoding = "async";
  }

  if (wishImage) {
    wishImage.src = WISH_IMAGE;
    wishImage.alt = "MMD Privé Six Years Birthday Wish";
    wishImage.loading = "lazy";
    wishImage.decoding = "async";
  }
})();
