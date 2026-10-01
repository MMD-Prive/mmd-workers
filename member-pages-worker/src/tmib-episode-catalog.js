const ACT_001_FRAMES = Object.freeze(
  Array.from({ length: 17 }, (_, index) => String(index + 4).padStart(2, "0")),
);

const PUBLIC_FRAMES = Object.freeze(Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, "0")));

const CATALOG = Object.freeze({
  "act-001": Object.freeze({
    id: "act-001",
    actLabel: "ACT 001",
    title: "Four Strangers, One Summer",
    priceThb: 0,
    historicalPriceThb: 299,
    packageCode: "tmib_act_001",
    paymentStage: "tmib_story",
    storyPath: "/tmib/act-001",
    checkoutPath: null,
    status: "live",
    purchasable: false,
    membershipIncluded: false,
    freePublic: true,
    frames: ACT_001_FRAMES,
  }),
  "act-001-ep01": Object.freeze({
    id: "act-001-ep01",
    actLabel: "ACT 001",
    title: "คืนแรกที่ความเกรงใจเริ่มเบาลง",
    priceThb: 0,
    packageCode: "",
    paymentStage: "",
    storyPath: "/tmib/act-001#ep01-preview",
    checkoutPath: null,
    status: "live",
    purchasable: false,
    membershipIncluded: false,
    freePublic: true,
    frames: PUBLIC_FRAMES,
  }),
  "act-001-ep02": Object.freeze({
    id: "act-001-ep02",
    actLabel: "ACT 001",
    title: "แผนของวันพรุ่งนี้เริ่มจากการเปิดแผนที่",
    priceThb: 0,
    packageCode: "",
    paymentStage: "",
    storyPath: "/tmib/act-001#ep02-preview",
    checkoutPath: null,
    status: "live",
    purchasable: false,
    membershipIncluded: false,
    freePublic: true,
    frames: PUBLIC_FRAMES,
  }),
  "act-001-ep03": Object.freeze({
    id: "act-001-ep03",
    actLabel: "ACT 001",
    title: "เรื่องที่ HITO อยากให้เพื่อนรู้",
    priceThb: 0,
    packageCode: "",
    paymentStage: "",
    storyPath: "/tmib/act-001#ep03-preview",
    checkoutPath: null,
    status: "live",
    purchasable: false,
    membershipIncluded: false,
    freePublic: true,
    frames: PUBLIC_FRAMES,
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
    free_public: episode.freePublic === true,
    story_path: episode.storyPath,
    checkout_path: episode.checkoutPath,
  });
}

export const TMIB_EPISODE_CATALOG = CATALOG;
