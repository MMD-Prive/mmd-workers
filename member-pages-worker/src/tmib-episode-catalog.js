const ACT_001_FRAMES = Object.freeze(
  Array.from({ length: 17 }, (_, index) => String(index + 4).padStart(2, "0")),
);

const CATALOG = Object.freeze({
  "act-001": Object.freeze({
    id: "act-001",
    actLabel: "ACT 001",
    title: "Four Strangers, One Summer",
    priceThb: 299,
    packageCode: "tmib_act_001",
    paymentStage: "tmib_story",
    storyPath: "/tmib/act-001",
    checkoutPath: "/pay/tmib?episode=act-001",
    status: "live",
    purchasable: true,
    membershipIncluded: true,
    frames: ACT_001_FRAMES,
  }),
});

export function normalizeTmibEpisodeId(value) {
  const id = String(value == null ? "" : value).trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : "";
}

export function getTmibEpisode(value) {
  const id = normalizeTmibEpisodeId(value);
  return id ? CATALOG[id] || null : null;
}

export function publicTmibEpisodeMetadata(value) {
  const episode = typeof value === "object" && value ? value : getTmibEpisode(value);
  if (!episode) return null;
  return Object.freeze({
    episode_id: episode.id,
    act_label: episode.actLabel,
    title: episode.title,
    price_thb: episode.priceThb,
    currency: "THB",
    package_code: episode.packageCode,
    status: episode.status,
    purchasable: episode.purchasable === true,
    membership_included: episode.membershipIncluded === true,
    story_path: episode.storyPath,
    checkout_path: episode.checkoutPath,
  });
}

export const TMIB_EPISODE_CATALOG = CATALOG;
