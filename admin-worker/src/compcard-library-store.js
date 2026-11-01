export const PREFIX = "compcard-library/v1/";
export const MAX_BYTES = 15 * 1024 * 1024;
export const TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["application/pdf", "pdf"]]);
export const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };
export const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
export const validId = value => /^[a-f0-9]{32}$/.test(value || "");
export const normalizeName = value => clean(value).normalize("NFKC").toLowerCase().replace(/[\s._-]+/gu, "");
export function classification(world="unknown",types=[]) {
  if (!["unknown","public","private"].includes(world) || !Array.isArray(types) || types.length>4 || !types.every(t=>["travel","extreme","pn","vip"].includes(t))) fail("classification_invalid");
  return {world,work_types:[...new Set(types)]};
}
export function bucket(env) {
  const b = env.PRIVATE_MODEL_MEDIA;
  if (!b?.get || !b?.put || !b?.list) fail("library_storage_unavailable", 503);
  return b;
}
export async function boundedBytes(body, limit = MAX_BYTES) {
  if (!body) fail("file_required");
  const reader = body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); fail("file_too_large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) fail("file_required");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  return bytes;
}
export function checkFile(bytes, mime) {
  if (!TYPES.has(mime)) fail("file_type_not_supported", 415);
  const prefix = new TextDecoder("latin1").decode(bytes.slice(0, 12));
  const valid = mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
    : mime === "image/webp" ? prefix.startsWith("RIFF") && prefix.slice(8,12) === "WEBP"
    : prefix.startsWith("%PDF-");
  if (!valid || bytes.length > MAX_BYTES) fail("file_content_mismatch", 415);
}
export async function digest(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2,"0")).join("");
}
const keyFor = id => PREFIX + "entries/" + id + ".json";
export async function readEntry(env, id) {
  if (!validId(id)) fail("compcard_not_found", 404);
  const obj = await bucket(env).get(keyFor(id));
  if (!obj) fail("compcard_not_found", 404);
  const item = await obj.json();
  if (item.schema !== "mmd_compcard_library_v1" || item.id !== id) fail("stored_record_invalid", 503);
  return { item, etag: obj.etag };
}
export function project(item, etag) {
  const { blob_key, created_by, updated_by, ...view } = item;
  return { ...view, etag, preview_url: item.content_type.startsWith("image/") ? `/v1/admin/compcards/${item.id}/file` : "", file_url: `/v1/admin/compcards/${item.id}/file` };
}
export async function importEntry(env, file, actor) {
  checkFile(file.bytes, file.content_type);
  const sha = await digest(file.bytes), id = (await digest(file.source.ref + ":" + sha)).slice(0,32);
  try { const old = await readEntry(env,id); return { item: project(old.item,old.etag), duplicate: true }; }
  catch (e) { if (e.status !== 404) throw e; }
  const blob_key = PREFIX + "blobs/" + sha + "." + TYPES.get(file.content_type);
  await bucket(env).put(blob_key, file.bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: file.content_type }, customMetadata: { sha256: sha } });
  const now = new Date().toISOString();
  const item = {
    schema: "mmd_compcard_library_v1", id, blob_key, sha256: sha, content_type: file.content_type, bytes: file.bytes.length,
    name: clean(file.name), original_name: clean(file.original_name,240), aliases: [...new Set([clean(file.name),clean(file.original_name,240)].filter(Boolean))],
    source: file.source, model_id: "", model_name: "", model_snapshot: null,
    ...classification(file.world,file.work_types), classification_source: file.classification_source || "",
    height_cm: file.height_cm || null, weight_kg: file.weight_kg || null, metrics_source: file.metrics_source || "",
    status: "unmatched", revision: 1, created_at: now, updated_at: now, created_by: actor.id, updated_by: actor.id,
  };
  const result = await bucket(env).put(keyFor(id), JSON.stringify(item), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
  if (!result) { const old = await readEntry(env,id); return { item: project(old.item,old.etag), duplicate: true }; }
  return { item: project(item,result.etag), duplicate: false };
}
export async function listEntries(env, query) {
  let cursor = clean(query.get("cursor"),2000), next = null; const items = [];
  const q = clean(query.get("q"),100).toLocaleLowerCase(), status = query.get("status") || "all";
  const world=query.get("world")||"all",workType=query.get("work_type")||"all";
  if(!["all","unknown","public","private"].includes(world)||!["all","travel","extreme","pn","vip"].includes(workType))fail("invalid_filter");
  if (!["all","unmatched","linked","retired","archived"].includes(status)) fail("invalid_filter");
  const seen = new Set();
  for (let page = 0; page < 5; page++) {
    const list = await bucket(env).list({ prefix: PREFIX + "entries/", limit: 50, ...(cursor ? {cursor} : {}) });
    const rows = await Promise.all(list.objects.map(async o => { const obj = await bucket(env).get(o.key); return obj ? { item: await obj.json(), etag: obj.etag } : null; }));
    for (const r of rows) {
      if (!r || r.item.schema !== "mmd_compcard_library_v1") continue;
      const x = r.item;
      if (status !== "all" && x.status !== status) continue;
      if(world!=="all"&&(x.world||"unknown")!==world)continue;
      if(workType!=="all"&&!(x.work_types||[]).includes(workType))continue;
      if (query.get("source_ref") && x.source?.ref !== query.get("source_ref")) continue;
      if (q && ![x.name,x.original_name,x.model_name,...x.aliases,x.source?.path].join(" ").toLocaleLowerCase().includes(q)) continue;
      items.push(project(x,r.etag));
    }
    if (list.truncated && !list.cursor) fail("invalid_storage_cursor",503);
    next = list.truncated ? list.cursor : null;
    if (next && (!next || next === cursor || seen.has(next))) fail("invalid_storage_cursor",503);
    if (items.length || !next) break;
    seen.add(next); cursor = next;
  }
  return { items, next_cursor: next };
}
export async function updateEntry(env, id, input, actor, model) {
  const {item,etag} = await readEntry(env,id);
  if (input.etag !== etag) fail("record_changed_reload",409);
  const next = structuredClone(item);
  if(input.world!==undefined || input.work_types!==undefined){
    const c=classification(input.world??item.world??"unknown",input.work_types??item.work_types??[]);
    if(c.world!==item.world || JSON.stringify(c.work_types)!==JSON.stringify(item.work_types)){Object.assign(next,c);next.classification_source="owner_review";}
  }
  if (input.name !== undefined) { next.name = clean(input.name); if (!next.name) fail("name_required"); }
  if (input.aliases !== undefined) {
    if (!Array.isArray(input.aliases) || input.aliases.length > 50) fail("aliases_invalid");
    next.aliases = [...new Set([item.original_name,item.name,...input.aliases.map(v=>clean(v)),next.name].filter(Boolean))];
  }
  for (const [field,min,max] of [["height_cm",100,230],["weight_kg",30,250]]) {
    if (input[field] !== undefined) {
      const n = input[field] === "" || input[field] === null ? null : Number(input[field]);
      if (n !== null && (!Number.isFinite(n) || n < min || n > max)) fail("metrics_invalid");
      if (next[field] !== n) { next[field] = n; next.metrics_source = "owner_review"; }
    }
  }
  if (input.model_id !== undefined) {
    next.model_id = model?.id || ""; next.model_name = model?.name || ""; next.model_snapshot = model || null;
    if (model) next.aliases = [...new Set([...next.aliases,model.name].filter(Boolean))];
    next.status = model ? "linked" : "unmatched";
  }
  if (input.status !== undefined) {
    if (!["unmatched","linked","retired","archived"].includes(input.status) || (input.status === "linked" && !next.model_id) || (input.status === "unmatched" && next.model_id)) fail("status_invalid");
    next.status = input.status;
  }
  next.revision++; next.updated_at = new Date().toISOString(); next.updated_by = actor.id;
  // Save the prior metadata, then use a compare-and-swap on the current record.
  // Concurrent editors cannot silently overwrite one another; original bytes are immutable.
  await bucket(env).put(PREFIX + "history/" + id + "/" + etag.replace(/[^a-zA-Z0-9_-]/g,"") + ".json",JSON.stringify(item),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
  const result = await bucket(env).put(keyFor(id),JSON.stringify(next),{onlyIf:{etagMatches:etag},httpMetadata:{contentType:"application/json"}});
  if (!result) fail("record_changed_reload",409);
  return project(next,result.etag);
}
