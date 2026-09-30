// HYPE_JOB_DAILY formatter: fixed section order, HTML-escaped, split only at section/item boundaries.
import { SECTION_ORDER } from "./builder.js";
import { escapeHtml } from "./util.js";

export const TELEGRAM_PART_LIMIT = 3800;

function renderItem(entry) {
  return `• ${escapeHtml(entry.text)}\n  Next: ${escapeHtml(entry.next)}`;
}

function emptyLine(digest, key) {
  const f = digest.failed;
  const unavailable = (key === "jobs_today" || key === "upcoming") ? f.sessions
    : key === "payment" ? (f.review && f.payments)
    : key === "customer" ? f.recovery
    : false;
  return unavailable
    ? "• unknown (source unreachable)\n  Next: see SYSTEM WATCH"
    : "• none\n  Next: no action";
}

// Returns [{ key, title, blocks: string[] }] where each block is one whole item.
export function renderSections(digest) {
  const out = [];
  for (const [key, title] of SECTION_ORDER) {
    if (key === "summary") {
      const lines = digest.summary.length
        ? digest.summary.map((line, i) => `${i + 1}) ${escapeHtml(line)}`)
        : ["ไม่มี P0 วันนี้"];
      out.push({ key, title, blocks: ["วันนี้ควรเคลียร์ก่อน:", ...lines] });
      continue;
    }
    const entries = digest.sections[key] || [];
    if (key === "p0") {
      const blocks = entries.length
        ? entries.map((entry) => renderItem(entry))
        : ["• no P0 today\n  Next: no action"];
      if (digest.p0_overflow > 0) blocks.push(`+${digest.p0_overflow} more in sections below`);
      out.push({ key, title, blocks });
      continue;
    }
    out.push({ key, title, blocks: entries.length ? entries.map(renderItem) : [emptyLine(digest, key)] });
  }
  return out;
}

export function formatDigest(digest, limit = TELEGRAM_PART_LIMIT) {
  const header = `🧾 <b>HYPE JOB DAILY — ${escapeHtml(digest.date_ict)}</b>`;
  const units = [];
  for (const section of renderSections(digest)) {
    const head = `<b>${escapeHtml(section.title)}</b>`;
    const whole = `${head}\n${section.blocks.join("\n")}`;
    if (whole.length <= limit - header.length - 2) {
      units.push(whole);
      continue;
    }
    // Section itself too large: split between items only, repeating the section title.
    let current = head;
    for (const block of section.blocks) {
      const candidate = `${current}\n${block}`;
      if (candidate.length > limit - header.length - 2 && current !== head && current !== `${head} (cont.)`) {
        units.push(current);
        current = `${head} (cont.)\n${block}`;
      } else {
        current = candidate;
      }
    }
    units.push(current);
  }
  const parts = [];
  let current = header;
  for (const unit of units) {
    const candidate = `${current}\n\n${unit}`;
    if (candidate.length > limit && current !== header) {
      parts.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  parts.push(current);
  return parts;
}
