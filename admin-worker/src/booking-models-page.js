import copy from "./booking-models.copy.json" with { type: "json" };
export { copy as bookingModelsCopy };

export function renderBookingModelsPage(nonce) {
  const e = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const options = (values) => values.map(([value, label]) => '<option value="' + value + '">' + e(label) + '</option>').join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(copy.title)} · MMD</title><style nonce="${e(nonce)}">
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans Thai","SF Pro Text",sans-serif;color:#272b30;background:#fff;font-size:16px;line-height:1.55}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}a{color:#923b13;text-underline-offset:4px}button,.action{min-height:46px;border:1px solid #c7ccd2;border-radius:12px;background:#fff;color:#272b30;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px}button:disabled{opacity:.55;cursor:wait}button.primary{background:#fed7aa;border-color:#c47a38}input,select{width:100%;min-height:48px;padding:10px 12px;border:1px solid #aeb6c0;border-radius:10px;color:#272b30;background:#fff}input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #a93e09;outline-offset:3px}main{max-width:1180px;margin:auto;padding:24px 24px 64px}.top{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding-bottom:28px;border-bottom:1px solid #e1e4e8}.brand{font-size:12px;letter-spacing:.12em;font-weight:700;color:#545c66}.intro{margin:28px 0 24px}.intro h1{font-size:30px;line-height:1.4;letter-spacing:0;margin:0 0 8px;font-weight:650}.intro p{max-width:640px;margin:0;color:#545c66}.search-panel{background:#f7f8fa;border:1px solid #dce0e5;border-radius:18px;padding:20px}.search-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}label{display:block;font-size:14px;font-weight:650;margin-bottom:6px}.filter-row{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-top:16px}.link-button{color:#923b13;background:transparent;border-color:transparent}.status{margin:22px 0 12px;font-weight:650;min-height:25px}.notice{color:#545c66;font-size:14px;max-width:850px}.results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.model{border:1px solid #dce0e5;border-radius:16px;padding:16px;display:grid;grid-template-columns:88px minmax(0,1fr);gap:16px;align-items:start;background:#fff}.portrait{width:88px;aspect-ratio:3/4;background:#f0f2f5;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:8px;color:#626b76;text-align:center;font-size:11px}.portrait img{width:100%;height:100%;object-fit:cover}.portrait:has(img){padding:0}.model h2{font-size:20px;line-height:1.4;letter-spacing:0;margin:0 0 3px;overflow-wrap:anywhere}.code{font-size:12px;color:#626b76;margin:0;overflow-wrap:anywhere}.metrics{margin:8px 0;font-size:14px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.tag{display:inline-flex;border-radius:30px;background:#f0f2f5;border:1px solid #dce0e5;padding:3px 9px;font-size:12px;color:#404953}.tag.warn{background:#fff2df;border-color:#edc999;color:#78440a}.model button{padding:6px 12px;width:100%}.model-note{font-size:12px;color:#78440a;margin:9px 0 0}.footer-actions{margin:24px 0;text-align:center}.empty{grid-column:1/-1;border:1px dashed #c7ccd2;border-radius:16px;padding:36px 24px;text-align:center}.empty h2{font-size:19px}.empty p{color:#545c66}dialog{width:min(680px,calc(100% - 28px));max-height:90dvh;overflow:auto;border:1px solid #c7ccd2;border-radius:18px;padding:24px;color:#272b30;background:#fff}dialog::backdrop{background:rgb(25 29 34 / .45)}.dialog-top{display:flex;align-items:start;justify-content:space-between;gap:16px}.dialog-top h2{font-size:24px;margin:0;line-height:1.4;letter-spacing:0}.facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e2e5e9;border:1px solid #e2e5e9;border-radius:12px;overflow:hidden;margin:20px 0}.fact{background:#fff;padding:12px}.fact dt{font-size:12px;color:#626b76}.fact dd{margin:3px 0 0;overflow-wrap:anywhere}.reasons{font-size:14px;padding-left:22px}.dialog-links{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}[hidden]{display:none!important}@media(max-width:650px){main{padding:18px 16px 48px}.top{padding-bottom:18px}.intro{margin-top:22px}.intro h1{font-size:26px}.search-panel{padding:16px}.search-row{grid-template-columns:1fr}.search-row button{width:100%}.filter-row{grid-template-columns:1fr 1fr}.filter-row .link-button{grid-column:1/-1;min-height:36px;justify-content:start;padding-left:0}.results{grid-template-columns:1fr}.model{grid-template-columns:76px minmax(0,1fr);gap:13px}.portrait{width:76px}.model h2{font-size:19px}dialog{padding:18px}.facts{grid-template-columns:1fr 1fr}}
</style></head><body><main id="booking-model-manager"><nav class="top" aria-label="Admin"><a href="/internal/admin/dashboard">← ${e(copy.back)}</a><span class="brand">MMD PRIVÉ / BOOKING</span></nav><header class="intro"><h1>${e(copy.title)}</h1><p>${e(copy.subtitle)}</p></header><form id="model-search" class="search-panel" role="search"><div class="search-row"><div><label for="query">${e(copy.searchLabel)}</label><input id="query" name="q" type="search" maxlength="80" autocomplete="off" placeholder="${e(copy.searchPlaceholder)}"></div><button type="submit" class="primary">${e(copy.search)}</button></div><div class="filter-row"><div><label for="audience">${e(copy.audience)}</label><select id="audience">${options([["all",copy.all],["public",copy.public],["private",copy.private]])}</select></div><div><label for="attention">${e(copy.attention)}</label><select id="attention">${options([["all",copy.any],["missing_cover",copy.missingCover],["policy_review",copy.policyReview]])}</select></div><button id="clear" class="link-button" type="button">${e(copy.clear)}</button></div></form><p id="search-status" class="status" role="status" aria-live="polite"></p><p id="media-warning" class="notice" hidden></p><section id="model-results" class="results" aria-label="${e(copy.title)}"></section><div class="footer-actions"><button id="load-more" type="button" hidden>${e(copy.more)}</button></div><p class="notice">${e(copy.policyNote)}</p><p class="notice">${e(copy.source)}</p><dialog id="model-detail" aria-labelledby="detail-title"><div class="dialog-top"><div><span class="brand">MODEL PROFILE</span><h2 id="detail-title"></h2></div><button id="close-detail" type="button">${e(copy.close)}</button></div><div id="detail-content"></div></dialog></main><script nonce="${e(nonce)}">const COPY=${JSON.stringify(copy).replace(/</g,"\\u003c")};(${BOOKING_MODELS_CLIENT})(COPY);</script></body></html>`;
}

// Keep browser code as source text: Worker bundlers inject helpers into function bodies.
export const BOOKING_MODELS_CLIENT = String.raw`function bookingModelsClient(c) {
  const $ = id => document.getElementById(id);
  const form = $("model-search"), results = $("model-results"), status = $("search-status"), dialog = $("model-detail");
  let cursor = null, currentQuery = null, controller = null, generation = 0, active = true;
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = String(text); if (cls) el.className = cls; return el; };
  const metric = (value, unit) => value ? value + " " + unit : c.notSet;
  const reasonText = reason => c.reasons[reason] || c.needsReview;
  function clearSensitive() { results.replaceChildren(); $("detail-content").replaceChildren(); if (dialog.open) dialog.close(); }
  function failure(error) {
    if (error.status === 401 || error.status === 403) {
      clearSensitive(); cursor = null; $("load-more").hidden = true;
      status.textContent = error.status === 401 ? c.expired : c.forbidden;
      if (error.status === 401) { const link = node("a", c.login, "action"); link.href = "/internal/admin/login?next=%2Finternal%2Fadmin%2Fbooking-models"; results.append(link); }
    } else status.textContent = c.error;
  }
  function showDetail(model) {
    $("detail-title").textContent = model.name || c.noName;
    const content = $("detail-content"); content.replaceChildren();
    const facts = node("dl", null, "facts");
    const gate = (offered, allowed) => !offered ? c.notOffered : allowed ? c.passes : c.needsReview;
    for (const [label, value] of [[c.code, model.code || c.notSet],[c.modelId,model.model_id],[c.height,metric(model.height_cm,c.cm)],[c.weight,metric(model.weight_kg,c.kg)],[c.body,c.bodies[model.body_type] || c.notSet],[c.skin,c.skins[model.skin_tone] || c.notSet],[c.publicGate,gate(model.offers_public,model.public_profile_allowed)],[c.privateGate,gate(model.offers_private,model.private_profile_allowed)],[c.media,model.cover_status === "approved" ? c.coverReady : model.cover_status === "unavailable" ? c.coverUnavailable : c.noCover]]) {
      const fact = node("div", null, "fact"); fact.append(node("dt",label),node("dd",value)); facts.append(fact);
    }
    content.append(facts, node("h3", model.reasons.length ? c.next : c.noIssues));
    const reasons = node("ul", null, "reasons"); model.reasons.forEach(reason => reasons.append(node("li", reasonText(reason)))); content.append(reasons);
    content.append(node("p",c.reviewNote,"notice"));
    if (model.offers_private) content.append(node("p",c.privateNote,"notice"));
    const links = node("div",null,"dialog-links"), review = node("a",c.reviewMedia,"action");
    review.href = "/internal/admin/mmd-review"; links.append(review); content.append(links);
    dialog.showModal();
  }
  function card(model) {
    const article = node("article", null, "model"), portrait = node("div", model.cover_status === "unavailable" ? c.coverUnavailable : c.noCover, "portrait");
    if (model.cover_media_id && /^rec[a-zA-Z0-9]+$/.test(model.model_id) && /^media_[a-f0-9-]{36}$/i.test(model.cover_media_id)) {
      const img = node("img"); img.alt = model.name || c.noName; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.src = "/v1/admin/booking-models/" + model.model_id + "/cover?media_id=" + encodeURIComponent(model.cover_media_id);
      img.addEventListener("error", () => { portrait.replaceChildren(node("span",c.coverFailed)); }, {once:true}); portrait.replaceChildren(img);
    }
    const info = node("div"); info.append(node("h2", model.name || c.noName),node("p",model.code || model.model_id,"code"),node("p",metric(model.height_cm,c.cm) + " · " + metric(model.weight_kg,c.kg),"metrics"));
    const tags = node("div",null,"tags"); if (model.offers_public) tags.append(node("span",c.public,"tag")); if (model.offers_private) tags.append(node("span",c.private,"tag"));
    if (!model.public_profile_allowed && !model.private_profile_allowed) tags.append(node("span",c.needsReview,"tag warn")); info.append(tags);
    const button = node("button",c.detail); button.type="button"; button.addEventListener("click",()=>showDetail(model)); info.append(button);
    if (model.reasons.length) info.append(node("p",reasonText(model.reasons[0]),"model-note"));
    article.append(portrait,info); return article;
  }
  async function load(more = false) {
    if (!active) return;
    if (controller) controller.abort();
    const activeController = new AbortController(); controller = activeController; const version = ++generation;
    if (!more) { clearSensitive(); cursor = null; currentQuery = {q:$("query").value.trim(),audience:$("audience").value,attention:$("attention").value}; }
    const params = new URLSearchParams(currentQuery); if (more && cursor) params.set("cursor",cursor);
    status.textContent = c.loading; $("load-more").disabled = true;
    let timedOut = false; const timer = setTimeout(() => { timedOut = true; activeController.abort(); },30000);
    try {
      const response = await fetch("/v1/admin/booking-models?" + params, {credentials:"same-origin",cache:"no-store",signal:activeController.signal,referrerPolicy:"no-referrer"});
      if (!response.ok) { const error = new Error("request_failed"); error.status=response.status; throw error; }
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.items)) throw new Error("invalid_response");
      if (version !== generation || !active) return;
      data.items.forEach(model => results.append(card(model))); cursor=data.next_cursor;
      const count=results.querySelectorAll("article.model").length;
      status.textContent=count ? c.found.replace("{count}",count) : cursor ? c.emptyPage : c.empty;
      if (!count && !cursor) { const box=node("div",null,"empty"); box.append(node("h2",c.empty),node("p",c.emptyHelp)); results.append(box); }
      $("media-warning").hidden=data.media_status !== "unavailable"; $("media-warning").textContent=c.mediaDegraded;
      $("load-more").hidden=!cursor;
    } catch(error) { if (version === generation && (error.name !== "AbortError" || timedOut)) failure(error); }
    finally { clearTimeout(timer); if (version === generation) $("load-more").disabled=false; }
  }
  form.addEventListener("submit",event=>{event.preventDefault();load();});
  $("audience").addEventListener("change",()=>load()); $("attention").addEventListener("change",()=>load());
  $("clear").addEventListener("click",()=>{form.reset();load();});
  $("load-more").addEventListener("click",()=>load(true));
  $("close-detail").addEventListener("click",()=>{dialog.close();$("detail-content").replaceChildren();});
  dialog.addEventListener("close",()=> $("detail-content").replaceChildren());
  function conceal() { active=false; generation++; if(controller)controller.abort();clearSensitive();cursor=null;$("load-more").hidden=true; }
  document.addEventListener("visibilitychange",()=>{if(document.hidden)conceal();else{active=true;load();}});
  window.addEventListener("pagehide",conceal); window.addEventListener("pageshow",event=>{if(event.persisted){active=true;load();}});
  load();
}`;
