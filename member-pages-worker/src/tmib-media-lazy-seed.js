import { handleTmibStoryAccess } from "./tmib-story-access.js";

const MEDIA_PREFIX = "/member/api/liff/tmib/episodes/act-001/media/";
const SOURCE = Object.freeze({
  "04":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee360f89a9ca5e0c0b7_Act001-04.webp",
  "05":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee48e9802504a630aac_Act001-05.webp",
  "06":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee55311c16ac0fd3717_Act001-06.webp",
  "07":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee55311c16ac0fd3711_Act001-07.webp",
  "08":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee4c9788e452705189e_Act001-08.webp",
  "09":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee398c8be971e720527_Act001-09.webp",
  "10":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee522ca8de561dee2f9_Act001-10.webp",
  "11":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee301ac3c9c1ef9bd45_Act001-11.webp",
  "12":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee45ce4a1e5863d6fae_Act001-12.webp",
  "13":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee4988226d9712991b1_Act001-13.webp",
  "14":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee38f0ad73f5be6a05b_Act001-14.webp",
  "15":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee3011df9823caa37b1_Act001-15.webp",
  "16":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee49a50844e72f343f9_Act001-16.webp",
  "17":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee31d1339ae7916463a_Act001-17.webp",
  "18":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee3937ce85921f52645_Act001-018.webp",
  "19":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee30e7b5bff345ae730_Act001-019.webp",
  "20":"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaa0ee3924b5654536c39d9_Act001-020.webp"
});

function frameFrom(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.startsWith(MEDIA_PREFIX)) return "";
  const frame = path.slice(MEDIA_PREFIX.length);
  return Object.hasOwn(SOURCE, frame) ? frame : "";
}

export function isTmibAct001MediaPath(input) {
  return Boolean(frameFrom(input));
}

async function missingSeed(response) {
  if (response.status !== 503) return false;
  const clone = response.clone();
  const payload = await clone.json().catch(() => null);
  return payload?.error?.code === "TMIB_MEDIA_NOT_SEEDED";
}

async function seedFrame(env, frame) {
  const bucket = env.MMD_MODEL_ASSETS;
  if (!bucket?.put) return false;
  const sourceUrl = SOURCE[frame];
  if (!sourceUrl) return false;
  const response = await fetch(sourceUrl, {
    headers: { accept: "image/webp,image/*;q=0.8,*/*;q=0.1", "user-agent": "MMD-TMIB-Private-Media/1.0" },
    cf: { cacheTtl: 300, cacheEverything: true },
  }).catch(() => null);
  if (!response?.ok || !response.body) return false;
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("image/")) return false;
  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > 20 * 1024 * 1024) return false;
  await bucket.put(`tmib/act-001/${frame}.webp`, response.body, {
    httpMetadata: { contentType: "image/webp", cacheControl: "private, no-store" },
    customMetadata: { source: "webflow-migration", episode: "act-001", frame },
  });
  return true;
}

export async function handleTmibAct001Media(request, env = {}) {
  const frame = frameFrom(request.url);
  if (!frame) return new Response("Not found", { status: 404 });

  // First call performs all normal session/signature checks. Only a response
  // that passed them and reached the private bucket can report NOT_SEEDED.
  const first = await handleTmibStoryAccess(request, env);
  if (!(await missingSeed(first))) return first;

  const seeded = await seedFrame(env, frame);
  if (!seeded) return first;

  // Re-run the exact same signed request so delivery remains governed by the
  // original media handler. Never proxy the Webflow response directly.
  return handleTmibStoryAccess(request, env);
}

export const TMIB_ACT001_MEDIA_SOURCES = SOURCE;
