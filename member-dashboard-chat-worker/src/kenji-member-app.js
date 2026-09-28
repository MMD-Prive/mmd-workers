const PAGE_PATHS = new Set(["/member/kenji", "/member/kenji/"]);
const CHAT_PATHS = new Set(["/api/member/kenji/chat", "/api/member/kenji/chat/"]);
const AI_CHAT_URL = "https://ai-worker.local/v1/ai/kenji/member-chat";
const MEMBER_TRUTH_URL = "https://member-pages-worker.internal/__internal/kenji/member-session-truth";
const MAX_MESSAGE = 800;

function text(value, max = 800) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizePath(request) {
  try { return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
  catch { return ""; }
}

export function isKenjiMemberPage(request) {
  return request instanceof Request && request.method === "GET" && PAGE_PATHS.has(normalizePath(request));
}

export function isKenjiMemberChat(request) {
  return request instanceof Request && request.method === "POST" && CHAT_PATHS.has(normalizePath(request));
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-mmd-kenji": "member-chat-v1",
    },
  });
}

function sameOriginAllowed(request) {
  const origin = text(request.headers.get("origin"), 300);
  if (!origin) return true;
  return origin === "https://mmdbkk.com" || origin === "https://www.mmdbkk.com";
}

async function readMemberTruth(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) return { ok: false, status: 503, reason: "member_truth_binding_missing" };
  const headers = new Headers({
    "content-type": "application/json",
    "x-mmd-internal-call": "true",
    "x-mmd-service-binding": "member-dashboard-chat-worker",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  let response;
  try {
    response = await env.MEMBER_PAGES_WORKER.fetch(new Request(MEMBER_TRUTH_URL, {
      method: "POST",
      headers,
      body: "{}",
    }));
  } catch {
    return { ok: false, status: 503, reason: "member_truth_unavailable" };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    return { ok: false, status: response.status === 401 ? 401 : 503, reason: payload?.error || "member_truth_unavailable" };
  }
  return { ok: true, payload };
}

function evidenceSources(truth) {
  const found = { state: "FOUND" };
  const unavailable = { state: "SOURCE_UNAVAILABLE" };
  return {
    rename_identity: truth?.display_name ? found : unavailable,
    line_oa_1to1: unavailable,
    line_crew: unavailable,
    chat_exports_attachments: unavailable,
    hashtags_tenure: unavailable,
    recognition_history: unavailable,
    membership_cycles: found,
    payment_evidence: unavailable,
    resolver_snapshot: found,
  };
}

function contextBundle(truth, message) {
  const displayName = text(truth?.display_name, 100);
  return {
    evaluated_at: new Date().toISOString(),
    identity: {
      state: displayName ? "known" : "review_required",
      preferred_name: displayName,
      confidence: displayName ? "high" : "low",
      source: "verified_member_session",
    },
    customer_context: {
      rename: displayName,
      latest_cycle: {
        package_code: text(truth?.membership?.level, 80),
        expire_at: text(truth?.membership?.expire_at, 80),
      },
      entitlement_snapshot: truth?.resolver_snapshot || {},
      evidence_sources: evidenceSources(truth),
    },
    current_message: message,
  };
}

async function askAiWorker(truth, message, env) {
  if (!env.AI_WORKER?.fetch) return { ok: false, status: 503, reason: "ai_worker_binding_missing" };
  let response;
  try {
    response = await env.AI_WORKER.fetch(new Request(AI_CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        "x-service-name": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({
        actor: { role: "system" },
        message,
        member_truth: truth,
        context_bundle: contextBundle(truth, message),
      }),
    }));
  } catch {
    return { ok: false, status: 503, reason: "ai_worker_unavailable" };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || payload?.data?.schema_version !== "mmd.kenji_member_chat.v1") {
    return { ok: false, status: 503, reason: "ai_worker_contract_unavailable" };
  }
  return { ok: true, data: payload.data };
}

export async function handleKenjiMemberChat(request, env = {}) {
  if (!sameOriginAllowed(request)) return json({ ok: false, error: "origin_not_allowed" }, 403);
  const body = await request.json().catch(() => null);
  const message = text(body?.message, MAX_MESSAGE);
  if (!message) return json({ ok: false, error: "message_required" }, 400);

  const truth = await readMemberTruth(request, env);
  if (!truth.ok) {
    return json({
      ok: false,
      error: truth.reason,
      verify_url: truth.status === 401 ? "/member/liff?intent=status" : null,
    }, truth.status);
  }

  const result = await askAiWorker(truth.payload, message, env);
  if (!result.ok) return json({ ok: false, error: result.reason }, result.status);

  return json({
    ok: true,
    reply: text(result.data.reply, 1200),
    action: result.data.action || null,
    intent: text(result.data.intent, 80),
    review_required: result.data?.safety?.review_required === true,
    member: {
      display_name: text(truth.payload.display_name, 100) || null,
      membership_label: text(truth.payload?.membership?.label, 80) || null,
    },
    authority: "ai-worker",
  });
}

export function renderKenjiMemberPage() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = \`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>KENJI | MY MMD</title><style nonce="\${nonce}">
:root{color-scheme:dark;--bg:#0b0b0c;--panel:#151516;--line:#2a2823;--gold:#dcc184;--cream:#f3eee2;--muted:#9d988e}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--cream);font-family:Inter,"Noto Sans Thai",system-ui,sans-serif}body{min-height:100dvh}
.app{min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto;max-width:720px;margin:auto;background:var(--bg)}
header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid var(--line);background:rgba(11,11,12,.94);backdrop-filter:blur(14px)}
.brand{font-size:16px;font-weight:900;letter-spacing:.12em}.brand small{display:block;margin-top:3px;color:var(--gold);font-size:8px;letter-spacing:.18em}.back{color:var(--muted);text-decoration:none;font-size:11px}
main{overflow:auto;padding:18px 14px 120px}.intro{margin:0 0 18px}.intro h1{margin:0;font-size:28px}.intro p{margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.55}
.chips{display:flex;gap:7px;overflow:auto;padding-bottom:4px;margin-bottom:16px}.chip{flex:none;border:1px solid var(--line);background:var(--panel);color:var(--cream);border-radius:99px;padding:8px 11px;font-size:10px}
.chat{display:grid;gap:10px}.msg{max-width:88%;padding:11px 12px;border-radius:16px;font-size:12px;line-height:1.55}.bot{justify-self:start;background:var(--panel);border:1px solid var(--line)}.user{justify-self:end;background:#252016;color:#f7e5b8;border:1px solid #564725}.action{display:inline-block;margin-top:9px;padding:8px 10px;border-radius:99px;border:1px solid #65532c;color:var(--gold);text-decoration:none;font-size:10px;font-weight:800}
.composer{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(720px,100%);padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(11,11,12,0),#0b0b0c 22%)}form{display:grid;grid-template-columns:1fr auto;gap:8px;padding-top:18px}textarea{resize:none;max-height:120px;min-height:44px;border:1px solid var(--line);border-radius:16px;background:#151516;color:var(--cream);padding:12px;font:inherit;font-size:12px;outline:none}button{border:0;border-radius:14px;background:var(--gold);color:#1b1710;font-weight:900;padding:0 16px}.status{min-height:16px;margin:4px 4px 0;color:var(--muted);font-size:9px}
</style></head><body><div class="app"><header><div class="brand">KENJI<small>MY MMD CONCIERGE</small></div><a class="back" href="/my-mmd/">MY MMD</a></header><main><section class="intro"><h1>มีอะไรให้ผมจัดการครับ</h1><p>พิมพ์มาได้เลย ผมจะใช้ข้อมูลที่ MY MMD ยืนยันแล้วและให้ ai-worker ช่วยวางทางต่อให้</p></section><div class="chips"><button class="chip" data-prompt="เช็กสมาชิกให้หน่อย">MEMBER</button><button class="chip" data-prompt="เช็ก Points ให้หน่อย">POINTS</button><button class="chip" data-prompt="ดูเรื่องชำระเงิน">PAYMENT</button><button class="chip" data-prompt="อยากจองโมเดล">BOOKING</button></div><section id="chat" class="chat"><div class="msg bot">พร้อมครับ พิมพ์เรื่องที่อยากให้ผมจัดการได้เลย</div></section></main><div class="composer"><form id="form"><textarea id="input" rows="1" maxlength="800" placeholder="บอก Kenji ได้เลย…"></textarea><button id="send" type="submit">ส่ง</button></form><div id="status" class="status"></div></div></div><script nonce="\${nonce}">
(()=>{const form=document.getElementById("form"),input=document.getElementById("input"),chat=document.getElementById("chat"),status=document.getElementById("status"),send=document.getElementById("send");
function add(text,role,action){const box=document.createElement("div");box.className="msg "+role;box.textContent=text;if(action&&action.url&&action.label){const a=document.createElement("a");a.className="action";a.href=action.url;a.textContent=action.label+" ↗";box.appendChild(document.createElement("br"));box.appendChild(a)}chat.appendChild(box);box.scrollIntoView({behavior:"smooth",block:"end"})}
async function ask(value){const message=(value||"").trim();if(!message)return;add(message,"user");input.value="";send.disabled=true;status.textContent="KENJI กำลังตรวจข้อมูล…";try{const r=await fetch("/api/member/kenji/chat",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({message})});const j=await r.json().catch(()=>null);if(r.status===401&&j?.verify_url){add("ต้องยืนยัน Member Session ก่อนครับ","bot",{label:"ยืนยันผ่าน LINE",url:j.verify_url})}else if(!r.ok||!j?.ok){add("ตอนนี้ผมยังอ่านข้อมูลที่ยืนยันไม่ได้ครับ ลองอีกครั้งได้เลย","bot")}else{add(j.reply||"ผมยังตอบจากข้อมูลที่ยืนยันไม่ได้ครับ","bot",j.action)}}catch{add("ตอนนี้ระบบ Kenji ยังไม่พร้อมครับ ลองอีกครั้งได้เลย","bot")}finally{send.disabled=false;status.textContent="";input.focus()}}
form.addEventListener("submit",e=>{e.preventDefault();ask(input.value)});document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>ask(b.dataset.prompt)));input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,120)+"px"})})();
</script></body></html>\`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": \`default-src 'self'; style-src 'self' 'nonce-\${nonce}'; script-src 'self' 'nonce-\${nonce}'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors 'self'\`,
      "x-robots-tag": "noindex, nofollow",
      "x-mmd-kenji": "member-app-v1",
    },
  });
}

export async function handleKenjiMemberSurface(request, env = {}) {
  if (isKenjiMemberPage(request)) return renderKenjiMemberPage();
  if (isKenjiMemberChat(request)) return handleKenjiMemberChat(request, env);
  return json({ ok: false, error: "not_found" }, 404);
}
