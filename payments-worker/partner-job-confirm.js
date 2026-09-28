const AIRTABLE_API = "https://api.airtable.com/v0";

const SESSION = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  workLane: "fldzYGziqLqTQaoaK",
  workType: "fldZiv3GeiafJTuRv",
  partnerIdSnapshot: "fld0jkscGAtyX7i2J",
  partnerSnapshotJson: "fldxyZ7S3tjF8chGR",
  partnerConfirmationStatus: "fldrAQxUX4pRqz6qr",
  partnerConfirmationRevision: "fldhO72ZSYcyjbLzi",
  partnerNotificationStatus: "fldv1X9HIfgUjwpJw",
  partnerNotificationMessageId: "fldyG4XzAlMQz4gfG",
  partnerNotificationSentAt: "fldG2sWou0Zh18PHS",
  partnerNotificationError: "fldGLKYcQVPZelwue",
});

const PARTNER = Object.freeze({
  partnerId: "fldXb55aiAjNPOUWc",
  partnerName: "fldpJWfASq7PfkMgC",
  status: "fldajmg66pf2ifGPu",
  approvalStatus: "fldwRzdtIoPbHKr7n",
  telegramId: "fldi6XKGQAWUEdr3A",
  telegramUsername: "fldCqQx4XD7sf28SE",
  telegramVerificationStatus: "fldOPxUvKgAVW5a2M",
});

export async function notifyPartnerJobAfterOfficialVerify(env, input = {}) {
  const stage = code(input.stage || input.payment_stage || input.payment_type);
  const sessionId = text(input.session_id, 180);
  if (!sessionId || !["deposit", "full"].includes(stage)) {
    return { ok:true, skipped:true, reason:"partner_confirm_not_required_for_stage" };
  }

  const session = await findSession(env, sessionId);
  if (!session) return { ok:true, skipped:true, reason:"session_not_found" };
  const sf = session.fields || {};
  const partnerId = field(sf, SESSION.partnerIdSnapshot);
  if (!partnerId) return { ok:true, skipped:true, reason:"partner_snapshot_missing" };

  const existingDelivery = code(field(sf, SESSION.partnerNotificationStatus));
  const existingMessageId = field(sf, SESSION.partnerNotificationMessageId);
  if (existingDelivery === "sent" && existingMessageId) {
    return {
      ok:true,
      skipped:true,
      idempotent:true,
      reason:"partner_notification_already_sent",
      message_id:existingMessageId,
    };
  }

  const snapshot = parseObject(field(sf, SESSION.partnerSnapshotJson));
  const partnerRecordId = text(snapshot.partner_record_id, 40);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(partnerRecordId)) {
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"failed",
      [SESSION.partnerNotificationError]:"partner_record_snapshot_invalid",
    }).catch(() => null);
    await alertMmd(env, `Partner confirm blocked · ${safeRef(sessionId)} · partner snapshot invalid`).catch(() => null);
    return { ok:false, skipped:true, reason:"partner_record_snapshot_invalid" };
  }

  const partner = await getRecord(env, table(env, "AIRTABLE_TABLE_MODEL_PARTNERS", "tbl1ksDlsTiiGEHWe"), partnerRecordId);
  if (!partner) {
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"failed",
      [SESSION.partnerNotificationError]:"partner_record_missing",
    }).catch(() => null);
    return { ok:false, skipped:true, reason:"partner_record_missing" };
  }
  const pf = partner.fields || {};
  if (field(pf, PARTNER.partnerId) !== partnerId) {
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"failed",
      [SESSION.partnerNotificationError]:"partner_snapshot_mismatch",
    }).catch(() => null);
    return { ok:false, skipped:true, reason:"partner_snapshot_mismatch" };
  }

  const active = code(field(pf, PARTNER.status)) === "active";
  const recognized = code(field(pf, PARTNER.approvalStatus)) === "recognized";
  const telegramVerified = code(field(pf, PARTNER.telegramVerificationStatus)) === "verified";
  const telegramId = field(pf, PARTNER.telegramId);

  if (!active || !recognized) {
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"failed",
      [SESSION.partnerNotificationError]:"partner_not_active",
    }).catch(() => null);
    return { ok:false, skipped:true, reason:"partner_not_active" };
  }

  if (!telegramVerified || !/^\d{5,20}$/.test(telegramId)) {
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"unbound",
      [SESSION.partnerNotificationError]:"partner_telegram_unbound",
    }).catch(() => null);
    await alertMmd(
      env,
      `Partner Telegram unbound · ${field(pf, PARTNER.partnerName) || partnerId} · ${safeRef(sessionId)} · payment verified, manual follow-up required`
    ).catch(() => null);
    return { ok:true, skipped:true, reason:"partner_telegram_unbound" };
  }

  const currentRevision = Number(field(sf, SESSION.partnerConfirmationRevision) || 0) || 0;
  const revision = Math.max(1, currentRevision + 1);
  const client = customerSafeName(field(sf, SESSION.clientName));
  const model = text(field(sf, SESSION.modelName), 120) || "Model";
  const jobDate = text(field(sf, SESSION.jobDate), 40);
  const start = bangkokTime(field(sf, SESSION.startTime));
  const end = bangkokTime(field(sf, SESSION.endTime));
  const location = text(field(sf, SESSION.locationName), 160);
  const lane = text(field(sf, SESSION.workLane), 80);
  const workType = text(field(sf, SESSION.workType), 80);
  const partnerName = text(field(pf, PARTNER.partnerName), 120) || "Partner";

  await patchSession(env, session.id, {
    [SESSION.partnerConfirmationStatus]:"pending",
    [SESSION.partnerConfirmationRevision]:revision,
    [SESSION.partnerNotificationStatus]:"pending",
    [SESSION.partnerNotificationError]:"",
  });

  const message = [
    "<b>MMD · NEW JOB TO CONFIRM</b>",
    "",
    `<b>Customer:</b> ${escapeHtml(client || "MMD Client")}`,
    `<b>Model:</b> ${escapeHtml(model)}`,
    jobDate ? `<b>Date:</b> ${escapeHtml(jobDate)}` : "",
    start || end ? `<b>Time:</b> ${escapeHtml([start,end].filter(Boolean).join("–"))}` : "",
    location ? `<b>Location:</b> ${escapeHtml(location)}` : "",
    lane || workType ? `<b>Work:</b> ${escapeHtml([lane,workType].filter(Boolean).join(" · "))}` : "",
    "<b>Payment:</b> MMD verified",
    `<b>Ref:</b> <code>${escapeHtml(safeRef(sessionId))}</code>`,
    "",
    `${escapeHtml(partnerName)} กรุณายืนยันงานจากปุ่มด้านล่างครับ`,
  ].filter(Boolean).join("\n");

  const replyMarkup = {
    inline_keyboard:[
      [{ text:"✅ ยืนยันงาน", callback_data:`pjc|${session.id}|c` }],
      [{ text:"✏️ ขอแก้ไขรายละเอียด", callback_data:`pjc|${session.id}|x` }],
      [{ text:"❌ รับงานไม่ได้", callback_data:`pjc|${session.id}|d` }],
    ],
  };

  try {
    const telegram = await sendDirectTelegram(env, {
      chat_id:telegramId,
      text:message,
      reply_markup:replyMarkup,
    });
    const messageId = String(telegram?.telegram?.result?.message_id || telegram?.result?.message_id || "");
    const now = new Date().toISOString();
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"sent",
      [SESSION.partnerNotificationMessageId]:messageId,
      [SESSION.partnerNotificationSentAt]:now,
      [SESSION.partnerNotificationError]:"",
    });
    return {
      ok:true,
      sent:true,
      partner_id:partnerId,
      partner_username:field(pf, PARTNER.telegramUsername) || null,
      message_id:messageId || null,
      revision,
    };
  } catch (error) {
    const reason = text(error?.message || error || "partner_telegram_send_failed", 240);
    await patchSession(env, session.id, {
      [SESSION.partnerNotificationStatus]:"failed",
      [SESSION.partnerNotificationError]:reason,
    }).catch(() => null);
    await alertMmd(env, `Partner confirm send failed · ${partnerName} · ${safeRef(sessionId)}`).catch(() => null);
    return { ok:false, sent:false, reason:"partner_telegram_send_failed" };
  }
}

async function sendDirectTelegram(env, payload) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service?.fetch || !token) throw new Error("partner_telegram_transport_unavailable");
  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method:"POST",
    headers:{
      authorization:`Bearer ${token}`,
      "content-type":"application/json",
    },
    body:JSON.stringify({
      flow:"payment_verified",
      chat_id:payload.chat_id,
      text:payload.text,
      parse_mode:"HTML",
      disable_web_page_preview:true,
      reply_markup:payload.reply_markup,
    }),
  }));
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || body?.telegram?.ok === false) {
    throw new Error("partner_telegram_transport_failed");
  }
  return body;
}

async function alertMmd(env, textValue) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service?.fetch || !token) return { ok:false, skipped:true };
  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method:"POST",
    headers:{
      authorization:`Bearer ${token}`,
      "content-type":"application/json",
    },
    body:JSON.stringify({ flow:"alerts", text:text(textValue, 700) }),
  }));
  return { ok:response.ok };
}

async function findSession(env, sessionId) {
  const records = await listRecords(
    env,
    table(env, "AIRTABLE_TABLE_SESSIONS", "tblC98mKWbzmPuNzX"),
    `{session_id}='${formula(sessionId)}'`,
    2
  );
  if (records.length !== 1) return null;
  return records[0];
}

async function getRecord(env, tableId, recordId) {
  requireAirtable(env);
  const url = new URL(
    `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`
  );
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url, { headers:{ Authorization:`Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  if (!response.ok) return null;
  return response.json();
}

async function listRecords(env, tableId, filterByFormula, maxRecords=2) {
  requireAirtable(env);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableId)}`);
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url, { headers:{ Authorization:`Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return Array.isArray(body.records) ? body.records : [];
}

async function patchSession(env, recordId, fields) {
  requireAirtable(env);
  const tableId = table(env, "AIRTABLE_TABLE_SESSIONS", "tblC98mKWbzmPuNzX");
  const response = await fetch(
    `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`,
    {
      method:"PATCH",
      headers:{
        Authorization:`Bearer ${clean(env.AIRTABLE_API_KEY)}`,
        "content-type":"application/json",
      },
      body:JSON.stringify({ fields, typecast:true }),
    }
  );
  if (!response.ok) throw new Error(`airtable_patch_${response.status}`);
  return response.json();
}

function field(fields, key) {
  const value = fields?.[key];
  if (Array.isArray(value)) return value.length ? String(value[0]?.name || value[0] || "").trim() : "";
  if (value && typeof value === "object" && "name" in value) return String(value.name || "").trim();
  return String(value ?? "").trim();
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function customerSafeName(value) {
  const raw = text(value, 120);
  return raw.replace(/\s*-\s*(?:SVIP|VIP|BLACK\s*CARD|PREMIUM|STANDARD|ELITE|RED\s*CARD)\s*-?\s*$/i, "").trim();
}

function bangkokTime(value) {
  const raw = clean(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw.slice(0,5);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone:"Asia/Bangkok",
    hour:"2-digit",
    minute:"2-digit",
    hour12:false,
  }).format(date);
}

function safeRef(value) {
  const raw = text(value, 180);
  return raw.length <= 18 ? raw : `${raw.slice(0,10)}…${raw.slice(-5)}`;
}

function table(env, key, fallback) {
  return clean(env?.[key]) || fallback;
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) {
    throw new Error("airtable_not_ready");
  }
}

function formula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function code(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"");
}

function text(value, max=240) {
  return clean(value).replace(/[\u0000-\u001F\u007F]/g," ").slice(0,max);
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
