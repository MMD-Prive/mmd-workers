import { TMIB_PUBLIC_NARRATION } from "./tmib-public-episode-narration.js";
import { getTmibEpisode, isTmibPublicEpisode } from "./tmib-episode-catalog.js";
import { publicEpisodeMedia } from "./tmib-public-episode-media.js";
import { handleTmibStoryAccess } from "./tmib-story-access.js";

// Introductory copy is transcribed verbatim from the current website.
// These are complete owner-curated IMAGE sequences, not invented long-form prose.
const COPY = Object.freeze({
  "act-001-ep01": Object.freeze({
    intro: "ตอนเปิดเรื่องของ HIRO × HITO — จากคำขอพักค้าง ไปจนถึงเกมที่ทำให้ระยะห่างของคนเพิ่งรู้จักค่อย ๆ เบาลง",
  }),
  "act-001-ep02": Object.freeze({
    intro: "จากแผนที่บนโต๊ะของ HIRO ไปถึงความเงียบเหนือกรุงเทพที่ King Power Mahanakhon — วันที่ HITO กับ HIRO เริ่มเลือกใช้เวลาร่วมกันโดยตั้งใจ",
  }),
  "act-001-ep03": Object.freeze({
    intro: "บางเรื่อง HITO ไม่ได้ปิดบัง — เขาแค่ยังไม่เคยเจอคนที่อยากเล่าให้ฟัง",
  }),
});

function episodeFrom(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const match = url.pathname.replace(/\/+$/, "").match(/^\/member\/api\/liff\/tmib\/episodes\/(act-001-ep0[1-3])\/content$/);
  const episode = match && getTmibEpisode(match[1]);
  return episode && episode.contentKind === "image_sequence" ? episode : null;
}

function json(data, status = 200) {
  return Response.json(data, {status, headers:{
    "cache-control":"private, no-store",
    "x-content-type-options":"nosniff",
    "x-mmd-tmib-story":"public-image-sequence-v1",
    "x-robots-tag":"noarchive, nosnippet",
    ...(status === 405 ? {allow:"GET"} : {}),
  }});
}

export function isTmibPublicEpisodeContentPath(input) { return Boolean(episodeFrom(input)); }

export async function handleTmibPublicEpisodeContent(request, env = {}) {
  const episode = episodeFrom(request.url);
  if (!episode) return json({ok:false,error:{code:"TMIB_EPISODE_NOT_FOUND"}},404);
  if (request.method !== "GET") return json({ok:false,error:{code:"METHOD_NOT_ALLOWED"}},405);
  if (!isTmibPublicEpisode(episode)) return json({ok:false,granted:false,episode_id:episode.id,error:{code:"TMIB_CONTENT_NOT_RELEASED"}},503);
  if (episode.frames.length !== 20 || episode.frames.some(frame => !publicEpisodeMedia(episode.id, frame))) {
    return json({ok:false,error:{code:"TMIB_SEQUENCE_INCOMPLETE"}},503);
  }
  const url = new URL(request.url);url.pathname = `/member/api/liff/tmib/episodes/${episode.id}/access`;url.search="";
  const response = await handleTmibStoryAccess(new Request(url,{method:"GET",headers:request.headers}),env);
  const access = await response.json();
  if (!response.ok || access.granted !== true) return json(access,response.status);
  return json({...access,
    content_kind:TMIB_PUBLIC_NARRATION[episode.id] ? "illustrated_story" : "image_sequence",
    full_text_ready:Boolean(TMIB_PUBLIC_NARRATION[episode.id]),
    publication_ready:Boolean(TMIB_PUBLIC_NARRATION[episode.id]),
    story:{
      schema:"tmib_public_story_v1",
      episode_id:episode.id,
      title:episode.title,
      intro:COPY[episode.id].intro,
      narration:TMIB_PUBLIC_NARRATION[episode.id]?.sections || [],
      source:TMIB_PUBLIC_NARRATION[episode.id] ? {file_id:TMIB_PUBLIC_NARRATION[episode.id].source_id,sha256:TMIB_PUBLIC_NARRATION[episode.id].source_sha256} : null,
      frames:episode.frames.map(frame => ({
        frame,
        caption:`EP${String(episode.episodeNumber).padStart(2,"0")} · ${frame} / 20`,
        alt:`${episode.title} — ภาพ ${Number(frame)} จาก 20`,
      })),
    },
  });
}
