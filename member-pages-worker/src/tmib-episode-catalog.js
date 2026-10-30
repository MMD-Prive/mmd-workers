const ACT_001_FRAMES = Object.freeze(
  Array.from({ length: 17 }, (_, index) => String(index + 4).padStart(2, "0")),
);

export const TMIB_RELEASE_POLICY = Object.freeze({
  publicFreeActIds: Object.freeze(["act-001"]),
  membershipMinimumLevel: "elite",
  publicFreeEpisodesThrough: null,
  memberGateStartsAtEpisode: null,
});

const CATALOG = Object.freeze({
  "act-001": Object.freeze({
    id: "act-001",
    actId: "act-001",
    episodeNumber: 1,
    actLabel: "ACT 001",
    title: "Four Strangers, One Summer",
    priceThb: 0,
    packageCode: "tmib_act_001_public",
    paymentStage: "tmib_story",
    storyPath: "/tmib/act-001",
    checkoutPath: "",
    status: "archived",
    accessMode: "public_free",
    publicFree: true,
    purchasable: false,
    membershipIncluded: false,
    frames: ACT_001_FRAMES,
  }),
  "act-001-ep01": Object.freeze({
    id: "act-001-ep01",
    actId: "act-001",
    episodeNumber: 1,
    actLabel: "ACT 001",
    title: "คืนแรกที่ความเกรงใจเริ่มเบาลง",
    priceThb: 0,
    packageCode: "",
    paymentStage: "",
    storyPath: "/tmib/act-001#ep01-preview",
    checkoutPath: "",
    status: "live",
    accessMode: "public_free",
    publicFree: true,
    purchasable: false,
    membershipIncluded: false,
    contentKind: "image_sequence",
    fullTextReady: true,
    frames: Object.freeze(Array.from({length:20}, (_, i) => String(i + 1).padStart(2, "0"))),
  }),
  "act-001-ep02": Object.freeze({
    id: "act-001-ep02",
    actId: "act-001",
    episodeNumber: 2,
    actLabel: "ACT 001",
    title: "แผนของวันพรุ่งนี้เริ่มจากการเปิดแผนที่",
    priceThb: 0,
    packageCode: "",
    paymentStage: "",
    storyPath: "/tmib/act-001#ep02-preview",
    checkoutPath: "",
    status: "live",
    accessMode: "public_free",
    publicFree: true,
    purchasable: false,
    membershipIncluded: false,
    contentKind: "image_sequence",
    fullTextReady: true,
    frames: Object.freeze(Array.from({length:20}, (_, i) => String(i + 1).padStart(2, "0"))),
  }),
  "act-001-ep03": Object.freeze({
    id: "act-001-ep03",
    actId: "act-001",
    episodeNumber: 3,
    actLabel: "ACT 001",
    title: "เรื่องที่ HITO อยากให้เพื่อนรู้",
    priceThb: 0,
    packageCode: "",
    paymentStage: "",
    storyPath: "/tmib/act-001#ep03-preview",
    checkoutPath: "",
    status: "pending",
    accessMode: "public_free",
    publicFree: true,
    purchasable: false,
    membershipIncluded: false,
    contentKind: "image_sequence",
    fullTextReady: false,
    frames: Object.freeze(Array.from({length:20}, (_, i) => String(i + 1).padStart(2, "0"))),
  }),
});

export function normalizeTmibEpisodeId(value) {
  const id = String(value == null ? "" : value).trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : "";
}

export function getTmibEpisode(value) {
  const id = normalizeTmibEpisodeId(value);
  return id && Object.hasOwn(CATALOG, id) ? CATALOG[id] : null;
}

// Only a registered catalog record can grant public access. A URL prefix is not proof.
export function isTmibPublicEpisode(value) {
  const episode = getTmibEpisode(typeof value === "object" && value ? value.id : value);
  return Boolean(episode && episode.status === "live" && TMIB_RELEASE_POLICY.publicFreeActIds.includes(episode.actId));
}

export function publicTmibEpisodeMetadata(value) {
  const episode = typeof value === "object" && value ? value : getTmibEpisode(value);
  if (!episode) return null;
  const publicFree = isTmibPublicEpisode(episode);
  return Object.freeze({
    episode_id: episode.id,
    episode_number: episode.episodeNumber,
    act_id: episode.actId,
    act_label: episode.actLabel,
    title: episode.title,
    price_thb: publicFree ? 0 : episode.priceThb,
    currency: "THB",
    package_code: episode.packageCode,
    status: episode.status,
    access_mode: publicFree ? "public_free" : episode.accessMode,
    public_free: publicFree,
    purchasable: !publicFree && episode.purchasable === true,
    membership_included: !publicFree && episode.membershipIncluded === true,
    public_free_act_ids: TMIB_RELEASE_POLICY.publicFreeActIds,
    membership_minimum_level: TMIB_RELEASE_POLICY.membershipMinimumLevel,
    public_free_episodes_through: TMIB_RELEASE_POLICY.publicFreeEpisodesThrough,
    member_gate_starts_at_episode: TMIB_RELEASE_POLICY.memberGateStartsAtEpisode,
    story_path: episode.storyPath,
    checkout_path: publicFree ? "" : episode.checkoutPath,
  });
}

export const TMIB_EPISODE_CATALOG = CATALOG;
