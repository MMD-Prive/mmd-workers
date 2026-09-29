const AIRTABLE_API = "https://api.airtable.com/v0";
export const REFUND_OPS_PAGE_PATH = "/internal/admin/refunds";
export const REFUND_OPS_API_PREFIX = "/v1/admin/refunds";
export const REFUND_OPS_INTERNAL_INTAKE = "/v1/internal/refund-ops/intake";
export const REFUND_RECEIPT_MEDIA_PATH = "/refund-receipt/media";

const clean = (value, max = 2000) => String(value ?? "").trim().slice(0, max);
const html = (value) => clean(value, 5000).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));

function amountText(value, max = 80) {
  return clean(value, max).replace(/[,\s]+/g, "").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function currencyText(value) {
  return clean(value || "THB", 12).toUpperCase().replace(/[^A-Z]/g, "") || "THB";
}

function payloadRefundAmount(payload = {}) {
  return amountText(payload.owner_refund_amount || payload.refund_amount_due || payload.refund_amount || payload.amount_to_refund || "");
}

function tableId(env = {}) {
  return clean(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e", 120);
}

function airtableEnv(env = {}) {
  return {
    baseId: clean(env.AIRTABLE_BASE_ID, 120),
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 300),
    table: tableId(env),
  };
}

async function airtable(env, suffix = "", init = {}) {
  const cfg = airtableEnv(env);
  if (!cfg.baseId || !cfg.token || !cfg.table) throw new Error("airtable_env_missing");
  const response = await fetch(`${AIRTABLE_API}/${cfg.baseId}/${encodeURIComponent(cfg.table)}${suffix}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store, private" },
  });
}

function parsePayload(record = {}) {
  const raw = clean(record?.fields?.payload_json, 20000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicItem(record = {}) {
  const f = record.fields || {};
  const p = parsePayload(record);
  const refundAmount = payloadRefundAmount(p);
  const refundCurrency = currencyText(p.owner_refund_currency || p.refund_currency || "THB");
  return {
    record_id: clean(record.id, 120),
    inbox_id: clean(f.inbox_id, 160),
    status: clean(f.status || "new", 80),
    created_at: clean(f.created_at, 80),
    customer_name: clean(f.member_name || p.customer_name || "", 160),
    purpose: clean(p.purpose || "unknown", 40),
    bank_name: clean(p.bank_name || "", 120),
    account_name: clean(p.account_name_masked || "", 160),
    account_number_masked: clean(p.account_number_masked || "", 80),
    account_changed: p.account_changed === true,
    account_change_review_required: p.account_change_review_required === true,
    linked_session_id: clean(p.session_id || "", 120),
    linked_job_id: clean(p.job_id || "", 120),
    refund_amount_due: refundAmount,
    refund_currency: refundCurrency,
    owner_refund_note: clean(p.owner_refund_note || p.refund_reason || "", 500),
    owner_refund_reference: clean(p.owner_refund_reference || "", 160),
    receipt_uploaded: Boolean(p.receipt_r2_key),
    receipt_uploaded_at: clean(p.receipt_uploaded_at || "", 80),
    customer_receipt_delivery_status: clean(p.customer_receipt_delivery_status || "", 80),
    customer_receipt_delivery_mode: clean(p.customer_receipt_delivery_mode || "", 80),
  };
}

async function listItems(env) {
  const params = new URLSearchParams();
  params.set("maxRecords", "100");
  params.set("filterByFormula", "OR({intent}='refund_bank_detail',{intent}='bank_detail_ops')");
  params.set("sort[0][field]", "created_at");
  params.set("sort[0][direction]", "desc");
  const payload = await airtable(env, `?${params.toString()}`);
  return (Array.isArray(payload.records) ? payload.records : []).map(publicItem);
}

async function findByInboxId(env, inboxId) {
  const escaped = clean(inboxId, 160).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const params = new URLSearchParams({ maxRecords:"2", filterByFormula:`{inbox_id}='${escaped}'` });
  const payload = await airtable(env, `?${params.toString()}`);
  const rows = Array.isArray(payload.records) ? payload.records : [];
  return rows.length === 1 ? rows[0] : null;
}

function escapeFormula(value, max = 200) {
  return clean(value, max).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findPriorRefundAccount(env, { lineUserId = "", jobId = "", sessionId = "", currentInboxId = "" } = {}) {
  const lineId = clean(lineUserId, 120);
  const job = clean(jobId, 120);
  const session = clean(sessionId, 120);
  if (!lineId || (!job && !session)) return null;
  const formula = `AND({line_user_id}='${escapeFormula(lineId)}',OR({intent}='refund_bank_detail',{intent}='bank_detail_ops'))`;
  const params = new URLSearchParams({ maxRecords:"20", filterByFormula:formula });
  params.set("sort[0][field]", "created_at");
  params.set("sort[0][direction]", "desc");
  const payload = await airtable(env, `?${params.toString()}`);
  const rows = Array.isArray(payload.records) ? payload.records : [];
  for (const row of rows) {
    if (clean(row?.fields?.inbox_id, 160) === clean(currentInboxId, 160)) continue;
    const prior = parsePayload(row);
    if (job && clean(prior.job_id, 120) !== job) continue;
    if (!job && session && clean(prior.session_id, 120) !== session) continue;
    const fingerprint = clean(prior.account_fingerprint, 80).toLowerCase();
    if (/^[a-f0-9]{64}$/.test(fingerprint)) return { record:row, payload:prior, fingerprint };
  }
  return null;
}

function privateBucket(env = {}) {
  const bucket = env.LINE_SLIP_EVIDENCE;
  return bucket && typeof bucket.get === "function" && typeof bucket.put === "function" ? bucket : null;
}

async function loadPrivateDetail(env, record) {
  const payload = parsePayload(record);
  const key = clean(payload.private_detail_key, 500);
  const bucket = privateBucket(env);
  if (!key || !bucket) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const detail = JSON.parse(await object.text());
    return {
      bank_name: clean(detail.bank_name, 120),
      account_name: clean(detail.account_name, 200),
      account_number: clean(detail.account_number, 120),
      purpose: clean(detail.purpose || payload.purpose || "unknown", 40),
    };
  } catch {
    return null;
  }
}

function internalAuthorized(request) {
  return clean(request.headers.get("x-mmd-internal-call"), 20).toLowerCase() === "true" &&
    clean(request.headers.get("x-mmd-service-binding"), 80) === "member-dashboard-chat-worker";
}

export async function handleRefundOpsInternalIntake(request, env = {}) {
  if (!internalAuthorized(request)) return json({ ok:false, error:"not_found" }, 404);
  const body = await request.json().catch(() => ({}));
  const inboxId = clean(body.inbox_id, 160);
  if (!inboxId || !/^refund_[A-Za-z0-9_.:-]{4,150}$/.test(inboxId)) return json({ ok:false, error:"invalid_inbox_id" }, 400);

  const existing = await findByInboxId(env, inboxId).catch(() => null);
  if (existing?.id) return json({ ok:true, deduped:true, record_id:existing.id });

  const accountFingerprint = clean(body.account_fingerprint, 80).toLowerCase();
  const jobId = clean(body.job_id, 120);
  const sessionId = clean(body.session_id, 120);
  const prior = /^[a-f0-9]{64}$/.test(accountFingerprint)
    ? await findPriorRefundAccount(env, {
        lineUserId: body.line_user_id,
        jobId,
        sessionId,
        currentInboxId: inboxId,
      }).catch(() => null)
    : null;
  const accountChanged = Boolean(prior?.fingerprint && prior.fingerprint !== accountFingerprint);

  const refundAmount = amountText(body.refund_amount_due || body.amount_to_refund || body.refund_amount || body.amount || "");
  const refundCurrency = currencyText(body.refund_currency || body.currency || "THB");
  const payload = {
    schema: "mmd_refund_bank_detail_v1",
    purpose: clean(body.purpose || "unknown", 40),
    bank_name: clean(body.bank_name, 120),
    account_name_masked: clean(body.account_name_masked, 160),
    account_number_masked: clean(body.account_number_masked, 80),
    account_fingerprint: /^[a-f0-9]{64}$/.test(accountFingerprint) ? accountFingerprint : null,
    account_changed: accountChanged,
    account_change_review_required: accountChanged,
    previous_account_inbox_id: accountChanged ? clean(prior?.record?.fields?.inbox_id, 160) || null : null,
    private_detail_key: clean(body.private_detail_key, 500),
    source_image_key: clean(body.source_image_key, 500),
    session_id: sessionId || null,
    job_id: jobId || null,
    customer_name: clean(body.customer_name, 160) || null,
    refund_amount_due: refundAmount || null,
    refund_currency: refundCurrency,
    refund_reason: clean(body.refund_reason || body.reason || "", 500) || null,
    money_truth_mutated: false,
    payment_proof_created: false,
  };

  const amountNote = payload.refund_amount_due ? ` · amount ${payload.refund_amount_due} ${payload.refund_currency}` : "";
  const fields = {
    inbox_id: inboxId,
    source: "line_ofc",
    intent: payload.purpose === "refund" ? "refund_bank_detail" : "bank_detail_ops",
    member_name: payload.customer_name || "",
    line_user_id: clean(body.line_user_id, 120),
    admin_note: payload.account_changed
      ? `ACCOUNT CHANGED · Refund account received as separate evidence · ${payload.bank_name || "bank"} · ${payload.account_number_masked || "masked"}${amountNote}`
      : payload.purpose === "refund"
        ? `Refund account received · ${payload.bank_name || "bank"} · ${payload.account_number_masked || "masked"}${amountNote}`
        : `Bank detail received · ${payload.bank_name || "bank"} · ${payload.account_number_masked || "masked"}`,
    payload_json: JSON.stringify(payload),
    status: "new",
    error_message: "",
  };
  const created = await airtable(env, "", { method:"POST", body:JSON.stringify({ fields }) });
  return json({
    ok:true,
    deduped:false,
    record_id:created.id || null,
    account_changed:accountChanged,
    account_change_review_required:accountChanged,
    previous_account_inbox_id:accountChanged ? clean(prior?.record?.fields?.inbox_id, 160) || null : null,
    refund_amount_due:payload.refund_amount_due,
    refund_currency:payload.refund_currency,
  });
}

async function patchRecord(env, record, fields) {
  return airtable(env, `/${encodeURIComponent(record.id)}`, { method:"PATCH", body:JSON.stringify({ fields }) });
}

function receiptSigningSecret(env = {}) {
  return clean(env.REFUND_RECEIPT_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN, 500);
}

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(clean(secret, 500)),
    { name:"HMAC", hash:"SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(value || "")));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left, right) {
  const a = clean(left, 200);
  const b = clean(right, 200);
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signedReceiptMediaUrl(env, inboxId, now = Date.now()) {
  const secret = receiptSigningSecret(env);
  if (!secret) return "";
  const expires = Math.floor(now / 1000) + 7 * 24 * 60 * 60;
  const subject = `refund_receipt_v1|${clean(inboxId, 160)}|${expires}`;
  const signature = await hmacHex(secret, subject);
  const url = new URL(`https://www.mmdbkk.com${REFUND_RECEIPT_MEDIA_PATH}`);
  url.searchParams.set("i", clean(inboxId, 160));
  url.searchParams.set("e", String(expires));
  url.searchParams.set("s", signature);
  return url.toString();
}

async function handleReceiptMedia(request, env) {
  const url = new URL(request.url);
  const inboxId = clean(url.searchParams.get("i"), 160);
  const expires = Number(url.searchParams.get("e"));
  const signature = clean(url.searchParams.get("s"), 200).toLowerCase();
  const secret = receiptSigningSecret(env);
  const now = Math.floor(Date.now() / 1000);
  if (!secret || !inboxId || !Number.isInteger(expires) || expires <= now || expires > now + 8 * 24 * 60 * 60 || !/^[a-f0-9]{64}$/.test(signature)) {
    return json({ ok:false, error:"invalid_or_expired_receipt_link" }, 403);
  }
  const expected = await hmacHex(secret, `refund_receipt_v1|${inboxId}|${expires}`);
  if (!timingSafeEqual(expected, signature)) return json({ ok:false, error:"invalid_or_expired_receipt_link" }, 403);

  const record = await findByInboxId(env, inboxId);
  if (!record) return json({ ok:false, error:"refund_task_not_found" }, 404);
  const payload = parsePayload(record);
  const key = clean(payload.receipt_r2_key, 500);
  const bucket = privateBucket(env);
  if (!key || !bucket) return json({ ok:false, error:"refund_receipt_missing" }, 404);
  const object = await bucket.get(key);
  if (!object) return json({ ok:false, error:"refund_receipt_missing" }, 404);
  const mime = clean(object?.httpMetadata?.contentType || payload.receipt_mime_type || "application/octet-stream", 120);
  const headers = new Headers({
    "content-type": mime,
    "cache-control": "private, no-store, max-age=0",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
    "x-mmd-route-owner": "admin-worker",
  });
  if (Number.isFinite(Number(object?.size))) headers.set("content-length", String(Number(object.size)));
  return new Response(request.method.toUpperCase() === "HEAD" ? null : object.body, { status:200, headers });
}

async function notifyRefundReceiptToLine(env, record, payload, mediaUrl, file) {
  const service = env.MEMBER_DASHBOARD_CHAT_WORKER;
  const lineUserId = clean(record?.fields?.line_user_id, 120);
  if (!lineUserId) return { ok:false, skipped:true, reason:"line_user_id_missing" };
  if (!mediaUrl) return { ok:false, skipped:true, reason:"receipt_signing_unavailable" };
  if (!service || typeof service.fetch !== "function") return { ok:false, skipped:true, reason:"member_dashboard_binding_missing" };

  const response = await service.fetch(new Request("https://member-dashboard-chat-worker.local/__internal/line/refund-receipt-notify", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-mmd-internal-call":"true",
      "x-mmd-service-binding":"admin-worker",
    },
    body:JSON.stringify({
      line_user_id: lineUserId,
      customer_name: clean(record?.fields?.member_name || payload.customer_name, 160),
      inbox_id: clean(record?.fields?.inbox_id, 160),
      job_id: clean(payload.job_id, 120),
      session_id: clean(payload.session_id, 120),
      refund_amount: payloadRefundAmount(payload),
      refund_currency: currencyText(payload.owner_refund_currency || payload.refund_currency || "THB"),
      refund_note: clean(payload.owner_refund_note || "", 500),
      refund_reference: clean(payload.owner_refund_reference || "", 160),
      receipt_url: mediaUrl,
      confirmation_url: mediaUrl,
      mime_type: clean(file?.type, 120),
      byte_size: Number(file?.size) || 0,
      money_truth_mutated: false,
    }),
  }));
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok && body?.ok === true,
    skipped: body?.skipped === true,
    reason: clean(body?.reason || body?.error, 120) || null,
    mode: clean(body?.mode, 80) || null,
    status: response.status,
  };
}

async function handleReceiptUpload(request, env) {
  const form = await request.formData().catch(() => null);
  if (!form) return json({ ok:false, error:"invalid_form" }, 400);
  const inboxId = clean(form.get("inbox_id"), 160);
  const file = form.get("file");
  if (!inboxId || !(file instanceof File)) return json({ ok:false, error:"inbox_and_file_required" }, 400);
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return json({ ok:false, error:"unsupported_file_type" }, 415);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return json({ ok:false, error:"file_size_invalid" }, 413);

  const record = await findByInboxId(env, inboxId);
  if (!record) return json({ ok:false, error:"refund_task_not_found" }, 404);
  const bucket = privateBucket(env);
  if (!bucket) return json({ ok:false, error:"private_bucket_missing" }, 503);

  const payload = parsePayload(record);
  const ownerRefundAmount = amountText(form.get("refund_amount") || form.get("amount_to_refund") || "") || payloadRefundAmount(payload);
  const ownerRefundCurrency = currencyText(form.get("refund_currency") || payload.refund_currency || "THB");
  const ownerRefundNote = clean(form.get("refund_note"), 500) || clean(payload.refund_reason || "", 500);
  const ownerRefundReference = clean(form.get("refund_reference"), 160);
  if (clean(payload.purpose, 40) === "refund" && !ownerRefundAmount) return json({ ok:false, error:"refund_amount_required" }, 400);

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const now = new Date();
  const key = `owner-refund-receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}/${encodeURIComponent(inboxId)}/receipt.${extension}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType:file.type },
    customMetadata: { schema:"mmd_refund_receipt_v1", inbox_id:inboxId, source:"owner_upload" },
  });

  payload.receipt_r2_key = key;
  payload.receipt_uploaded_at = now.toISOString();
  payload.receipt_mime_type = file.type;
  payload.receipt_byte_size = file.size;
  payload.owner_refund_amount = ownerRefundAmount || null;
  payload.owner_refund_currency = ownerRefundCurrency;
  payload.owner_refund_note = ownerRefundNote || null;
  payload.owner_refund_reference = ownerRefundReference || null;
  payload.refund_completed_by = "owner";
  payload.money_truth_mutated = false;
  await patchRecord(env, record, {
    status:"completed",
    payload_json:JSON.stringify(payload),
    admin_note:`${clean(record.fields?.admin_note, 1200)} · Refund receipt uploaded ${now.toISOString()}${ownerRefundAmount ? ` · amount ${ownerRefundAmount} ${ownerRefundCurrency}` : ""}`.slice(0,1800),
  });

  let notification = { ok:false, skipped:true, reason:"not_attempted", mode:null };
  let mediaUrl = "";
  try {
    mediaUrl = await signedReceiptMediaUrl(env, inboxId, now.getTime());
    notification = await notifyRefundReceiptToLine(env, record, payload, mediaUrl, file);
  } catch {
    notification = { ok:false, skipped:false, reason:"line_notification_failed", mode:null };
  }
  payload.customer_receipt_delivery_status = notification.ok ? "sent" : (notification.skipped ? "skipped" : "failed");
  payload.customer_receipt_delivery_mode = notification.mode || null;
  payload.customer_receipt_delivery_at = new Date().toISOString();
  payload.customer_receipt_delivery_reason = notification.reason || null;
  payload.customer_receipt_confirmation_url_issued = Boolean(mediaUrl);
  payload.customer_receipt_confirmation_url_issued_at = mediaUrl ? new Date().toISOString() : null;
  await patchRecord(env, record, {
    status:"completed",
    payload_json:JSON.stringify(payload),
    admin_note:`${clean(record.fields?.admin_note, 1200)} · Refund receipt uploaded ${now.toISOString()}${ownerRefundAmount ? ` · amount ${ownerRefundAmount} ${ownerRefundCurrency}` : ""} · LINE ${payload.customer_receipt_delivery_status}`.slice(0,1800),
  }).catch(() => null);

  return json({
    ok:true,
    inbox_id:inboxId,
    status:"completed",
    uploaded_at:now.toISOString(),
    refund_amount:ownerRefundAmount || null,
    refund_currency:ownerRefundCurrency,
    confirmation_url:mediaUrl || null,
    line_notification:{
      sent:notification.ok === true,
      skipped:notification.skipped === true,
      reason:notification.reason || null,
      mode:notification.mode || null,
    },
    money_truth_mutated:false,
  });
}

function pageHtml() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Refund Ops · MMD</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0a09;color:#f4efe6;font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:960px;margin:auto;padding:24px 16px 80px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:20px}.top h1{margin:0;font-size:26px}.sub{color:#a99e8e}.grid{display:grid;gap:12px}.card{border:1px solid #2f2a23;background:#151310;border-radius:18px;padding:16px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tag{font-size:12px;border:1px solid #514737;border-radius:999px;padding:4px 8px;color:#dec89b}.bank{font-size:20px;font-weight:800;margin:10px 0}.muted{color:#a99e8e}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}button,.btn{appearance:none;border:1px solid #6f6048;background:#211d17;color:#f7e7c3;border-radius:12px;padding:10px 12px;font-weight:700;cursor:pointer;text-decoration:none}.primary{background:#d5b36b;color:#15110b;border-color:#d5b36b}.done{opacity:.62}.empty{padding:36px;text-align:center;color:#968b7c}.detail,.owner-fields,.confirm{margin-top:10px;padding:12px;background:#0f0e0c;border-radius:12px}.detail{display:none}.detail.open{display:block}.num{font:700 19px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}.status{font-size:12px;margin-left:auto}.upload-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden}.owner-fields{display:grid;grid-template-columns:160px 1fr;gap:8px}.owner-fields label{font-size:11px;color:#a99e8e;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.owner-fields input,.owner-fields textarea{width:100%;border:1px solid #3b3328;background:#0b0a09;color:#f4efe6;border-radius:10px;padding:10px;font:14px/1.4 inherit}.owner-fields textarea{min-height:42px;resize:vertical}.confirm a{word-break:break-all;color:#f7e7c3}.danger{color:#ffbd9e}@media(max-width:600px){.top{align-items:flex-start}.card{border-radius:16px}.status{width:100%;margin-left:0}.actions button,.actions .btn{flex:1 1 46%}.owner-fields{grid-template-columns:1fr}}
</style></head><body><main class="wrap"><div class="top"><div><div class="sub">OWNER OPS</div><h1>Refund Accounts</h1><div class="sub">รูปบัญชีจาก LINE → ใส่ยอดคืน → Copy → โอน → อัปโหลดสลิปกลับ → ส่ง confirmation ให้ลูกค้า</div></div><a class="btn" href="/internal/admin/control-room">Control Room</a></div><div id="list" class="grid"><div class="empty">กำลังโหลด…</div></div></main><script>
const esc=s=>String(s??"").replace(/[&<>"\\x27]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\\x27":"&#39;"}[c]));
const money=v=>{const n=Number(String(v||"").replace(/,/g,""));return Number.isFinite(n)&&n>0?n.toLocaleString("th-TH")+" บาท":"ยังไม่ระบุยอดคืน"};
async function api(path,opts={}){const r=await fetch("/v1/admin/refunds"+path,{credentials:"include",cache:"no-store",...opts});const p=await r.json().catch(()=>({}));if(!r.ok||p.ok===false)throw new Error(p.error||r.status);return p}
async function copy(v){await navigator.clipboard.writeText(v)}
async function detail(id,btn){const box=document.querySelector("[data-detail=\""+CSS.escape(id)+"\"]");if(box.dataset.loaded==="1"){box.classList.toggle("open");return}btn.disabled=true;try{const p=await api("/detail?inbox_id="+encodeURIComponent(id));box.innerHTML="<div class=\"muted\">"+esc(p.detail.bank_name||"")+"</div><div>"+esc(p.detail.account_name||"")+"</div><div class=\"num\">"+esc(p.detail.account_number||"")+"</div><div class=\"actions\"><button data-copy-name>Copy ชื่อ</button><button class=\"primary\" data-copy-number>Copy เลขบัญชี</button><button data-copy-all>Copy พร้อมยอด</button></div>";box.querySelector("[data-copy-name]").onclick=()=>copy(p.detail.account_name||"");box.querySelector("[data-copy-number]").onclick=()=>copy(p.detail.account_number||"");box.querySelector("[data-copy-all]").onclick=()=>{const card=box.closest("[data-card]");const amount=card.querySelector("[data-refund-amount]").value.trim();copy(["โอนคืนลูกค้า","ธนาคาร: "+(p.detail.bank_name||""),"ชื่อบัญชี: "+(p.detail.account_name||""),"เลขบัญชี: "+(p.detail.account_number||""),amount?"ยอดคืน: "+money(amount):""].filter(Boolean).join("\\n"))};box.dataset.loaded="1";box.classList.add("open")}finally{btn.disabled=false}}
async function upload(id,file,card){if(!file)return;const amount=card.querySelector("[data-refund-amount]").value.trim();const note=card.querySelector("[data-refund-note]").value.trim();const ref=card.querySelector("[data-refund-ref]").value.trim();if(!amount){card.querySelector("[data-up-status]").innerHTML="<span class=\"danger\">กรุณาใส่ยอดคืนก่อนอัปโหลดสลิป</span>";return}const fd=new FormData();fd.append("inbox_id",id);fd.append("file",file);fd.append("refund_amount",amount);fd.append("refund_currency","THB");fd.append("refund_note",note);fd.append("refund_reference",ref);card.querySelector("[data-up-status]").textContent="กำลังอัปโหลด…";try{const p=await api("/receipt",{method:"POST",body:fd});card.classList.add("done");card.querySelector("[data-up-status]").textContent="อัปโหลดสลิปแล้ว ✓";const url=p.confirmation_url||"";if(url){card.querySelector("[data-confirm]").innerHTML="<strong>Confirmation URL</strong><br><a target=\"_blank\" rel=\"noreferrer\" href=\""+esc(url)+"\">"+esc(url)+"</a><div class=\"actions\"><button data-copy-confirm>Copy URL</button></div>";card.querySelector("[data-copy-confirm]").onclick=()=>copy(url)}}catch(e){card.querySelector("[data-up-status]").textContent="อัปโหลดไม่สำเร็จ · "+e.message}}
function cardHtml(x){const cls=x.receipt_uploaded?"done":"";const state=x.receipt_uploaded?"DONE":"NEEDS YOU";const source=x.linked_job_id?("Job "+x.linked_job_id):x.linked_session_id?("Session "+x.linked_session_id):"จาก LINE OA";const uploadState=x.receipt_uploaded?(x.customer_receipt_delivery_status==="sent"?"อัปโหลดสลิปแล้ว · ส่ง LINE แล้ว ✓":"อัปโหลดสลิปแล้ว ✓"):"หลังโอน อัปโหลดสลิปตรงนี้";const changed=x.account_changed?"<span class=\"tag\">ACCOUNT CHANGED</span>":"";return "<article class=\"card "+cls+"\" data-card=\""+esc(x.inbox_id)+"\"><div class=\"row\"><span class=\"tag\">"+esc((x.purpose||"UNKNOWN").toUpperCase())+"</span>"+changed+"<strong>"+esc(x.customer_name||"LINE customer")+"</strong><span class=\"status muted\">"+state+"</span></div><div class=\"bank\">"+esc(x.bank_name||"Bank detail")+" · "+esc(x.account_number_masked||"••••")+"</div><div class=\"muted\">"+esc(source)+" · "+esc(money(x.refund_amount_due))+"</div><div class=\"owner-fields\"><label>ยอดคืน</label><input data-refund-amount inputmode=\"decimal\" placeholder=\"เช่น 4500\" value=\""+esc(x.refund_amount_due||"")+"\"><label>หมายเหตุลูกค้า</label><textarea data-refund-note placeholder=\"เช่น คืนยอดจากงานที่ยกเลิก\">"+esc(x.owner_refund_note||"")+"</textarea><label>Ref/วันที่โอน</label><input data-refund-ref placeholder=\"optional\" value=\""+esc(x.owner_refund_reference||"")+"\"></div><div class=\"actions\"><button type=\"button\" data-open>เปิดเลขบัญชี</button><button type=\"button\" class=\"btn primary\" data-upload-trigger>อัปโหลดสลิปคืน</button><input class=\"upload-file\" data-file type=\"file\" accept=\"image/jpeg,image/png,image/webp\" aria-label=\"เลือกสลิปคืนเงิน\"></div><div class=\"muted\" data-up-status>"+uploadState+"</div><div class=\"detail\" data-detail=\""+esc(x.inbox_id)+"\"></div><div class=\"confirm\" data-confirm></div></article>"}
async function load(){const p=await api("/list");const root=document.getElementById("list");root.innerHTML=p.items.length?p.items.map(cardHtml).join(""):"<div class=\"empty\">ยังไม่มี Refund Account ที่ต้องทำ</div>";root.querySelectorAll("[data-card]").forEach(card=>{const id=card.dataset.card;const file=card.querySelector("[data-file]");const trigger=card.querySelector("[data-upload-trigger]");card.querySelector("[data-open]").onclick=e=>detail(id,e.currentTarget);trigger.onclick=()=>file.click();file.onchange=e=>upload(id,e.target.files?.[0],card)})}
load().catch(e=>document.getElementById("list").innerHTML="<div class=\"empty\">โหลดไม่สำเร็จ · "+esc(e.message)+"</div>");
</script></body></html>`;
}

export async function handleRefundOpsRequest(request, env = {}, { isAuthed } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === REFUND_OPS_INTERNAL_INTAKE && method === "POST") return handleRefundOpsInternalIntake(request, env);
  if (path === REFUND_RECEIPT_MEDIA_PATH && (method === "GET" || method === "HEAD")) return handleReceiptMedia(request, env);

  const authed = typeof isAuthed === "function" ? await isAuthed(request, env) : false;
  if (!authed) {
    if (path === REFUND_OPS_PAGE_PATH) {
      return new Response(null, { status:303, headers:{ location:`/internal/admin/login?next=${encodeURIComponent(REFUND_OPS_PAGE_PATH)}`, "cache-control":"no-store" } });
    }
    return json({ ok:false, error:"unauthorized" }, 401);
  }

  if (path === REFUND_OPS_PAGE_PATH && (method === "GET" || method === "HEAD")) {
    return new Response(method === "HEAD" ? null : pageHtml(), { status:200, headers:{ "content-type":"text/html; charset=utf-8", "cache-control":"no-store, private", "x-mmd-route-owner":"admin-worker" } });
  }
  if (path === `${REFUND_OPS_API_PREFIX}/list` && method === "GET") return json({ ok:true, items:await listItems(env) });
  if (path === `${REFUND_OPS_API_PREFIX}/detail` && method === "GET") {
    const record = await findByInboxId(env, url.searchParams.get("inbox_id"));
    if (!record) return json({ ok:false, error:"refund_task_not_found" }, 404);
    const detail = await loadPrivateDetail(env, record);
    if (!detail) return json({ ok:false, error:"private_detail_missing" }, 404);
    return json({ ok:true, detail });
  }
  if (path === `${REFUND_OPS_API_PREFIX}/receipt` && method === "POST") return handleReceiptUpload(request, env);
  return null;
}
