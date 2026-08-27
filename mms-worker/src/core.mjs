export const MMS_SKILLS = Object.freeze([
  { code: "aroma_therapy_oil", label: "Aroma Therapy Oil Massage", th: "นวดผ่อนคลาย" },
  { code: "thai_massage", label: "Thai Massage", th: "นวดคลายเส้น" },
  { code: "sport_massage", label: "Sport Massage", th: "นวดแก้อาการ" },
  { code: "office_syndrome", label: "Office Syndrome", th: "นวดแก้อาการนั่งเป็นเวลานาน" },
  { code: "health_fitness_advisor", label: "Health and Fitness Advisor", th: "ให้คำปรึกษาทางด้านโภชนาการและการออกกำลังกาย" },
  { code: "thai_herbal_compress", label: "Thai herbal compress massage", th: "นวดประคบสมุนไพร" },
  { code: "partner_present", label: "Partner-Present Massage Session", th: "นวดโดยมีคู่หรือผู้ติดตามอยู่ด้วย" },
  { code: "women_massage", label: "Women Massage", th: "บริการนวดสำหรับลูกค้าผู้หญิง" },
]);

export const MMS_ZONES = Object.freeze([
  { code: "sukhumvit", label: "Sukhumvit" },
  { code: "sathorn_silom", label: "Sathorn / Silom" },
  { code: "rama9_ratchada", label: "Rama 9 / Ratchada" },
  { code: "ari_chatuchak", label: "Ari / Chatuchak" },
  { code: "latphrao_raminthra", label: "Lat Phrao / Ram Inthra" },
  { code: "onnut_bangna", label: "On Nut / Bang Na" },
  { code: "riverside_oldtown", label: "Riverside / Old Town" },
  { code: "thonburi", label: "Thonburi" },
  { code: "donmueang_laksi", label: "Don Mueang / Lak Si" },
  { code: "other_bangkok", label: "Other Bangkok" },
]);

const SKILL_LOOKUP = buildLookup(MMS_SKILLS);
const ZONE_LOOKUP = buildLookup(MMS_ZONES);
const APPLICATION_KEYS = new Set([
  "idempotency_key",
  "applicant_name",
  "nickname",
  "phone",
  "line_id",
  "gender_identity",
  "customer_gender_scope",
  "skills",
  "experience_years",
  "experience_months",
  "strengths",
  "worked_at_spa_before",
  "spa_name",
  "worked_independently_before",
  "independent_social",
  "current_profession",
  "qualification_note",
  "work_base_area",
  "mobility_scope",
  "coverage_area_note",
  "base_zone",
  "coverage_zones",
  "general_consent",
  "sexual_orientation",
  "sensitive_consent",
  "consent_notice_version",
  "language",
]);
const PREBOOKING_KEYS = new Set([
  "idempotency_key",
  "member_ref",
  "line_user_id",
  "recipient_gender",
  "zone",
  "service_date",
  "service_time",
  "duration_minutes",
  "skills",
  "requested_therapist_ids",
  "note",
  "language",
]);

export function applicationPayload(input) {
  const body = plainObject(input);
  rejectUnknownKeys(body, APPLICATION_KEYS);

  const idempotencyKey = token(body.idempotency_key, 120);
  const applicantName = text(body.applicant_name, 160);
  const nickname = text(body.nickname, 80);
  const phone = text(body.phone, 40);
  const lineId = text(body.line_id, 100);
  const genderIdentity = normalizeChoice(body.gender_identity, {
    male: "ชาย",
    "ชาย": "ชาย",
    prefer_not_to_say: "ไม่ประสงค์ระบุ",
    "ไม่ประสงค์ระบุ": "ไม่ประสงค์ระบุ",
  });
  const customerGenderScope = normalizeChoice(body.customer_gender_scope, {
    male: "ผู้ชาย",
    "ผู้ชาย": "ผู้ชาย",
    female: "ผู้หญิง",
    "ผู้หญิง": "ผู้หญิง",
    both: "ได้ทั้งคู่",
    "ได้ทั้งคู่": "ได้ทั้งคู่",
  });
  const skills = normalizeCatalogValues(body.skills, SKILL_LOOKUP, 1, 8, "skills");
  const currentProfession = text(body.current_profession, 200);
  const qualificationNote = text(body.qualification_note, 1200);
  const baseZone = body.base_zone ? normalizeCatalogValue(body.base_zone, ZONE_LOOKUP, "base_zone") : "";
  const coverageZones = body.coverage_zones == null
    ? []
    : normalizeCatalogValues(body.coverage_zones, ZONE_LOOKUP, 0, MMS_ZONES.length, "coverage_zones");
  const workBaseArea = text(body.work_base_area, 240) || (baseZone ? catalogLabel(baseZone) : "");
  const mobilityScope = normalizeChoice(body.mobility_scope, {
    local: "พื้นที่ฐานเป็นหลัก",
    "พื้นที่ฐานเป็นหลัก": "พื้นที่ฐานเป็นหลัก",
    nearby: "จังหวัดใกล้เคียง",
    "จังหวัดใกล้เคียง": "จังหวัดใกล้เคียง",
    nationwide: "ทั่วประเทศตามตกลง",
    "ทั่วประเทศตามตกลง": "ทั่วประเทศตามตกลง",
  });
  const coverageAreaNote = text(body.coverage_area_note, 1200);
  const experienceYears = integer(body.experience_years, 0, 60, "experience_years");
  const experienceMonths = integer(body.experience_months, 0, 11, "experience_months");
  const workedAtSpaBefore = boolean(body.worked_at_spa_before);
  const workedIndependentlyBefore = boolean(body.worked_independently_before);
  const generalConsent = boolean(body.general_consent);
  const sensitiveConsent = boolean(body.sensitive_consent);
  const sexualOrientation = normalizeOrientation(body.sexual_orientation);

  const errors = [];
  if (!idempotencyKey) errors.push("idempotency_key is required");
  if (!applicantName) errors.push("applicant_name is required");
  if (!phone && !lineId) errors.push("phone or line_id is required");
  if (!genderIdentity) errors.push("gender_identity is required");
  if (!customerGenderScope) errors.push("customer_gender_scope is required");
  if (!currentProfession) errors.push("current_profession is required");
  if (!workBaseArea) errors.push("work_base_area is required");
  if (!mobilityScope) errors.push("mobility_scope is required");
  if (!generalConsent) errors.push("general_consent is required");
  if (workedAtSpaBefore && !text(body.spa_name, 160)) errors.push("spa_name is required when worked_at_spa_before is true");
  if (workedIndependentlyBefore && !text(body.independent_social, 240)) errors.push("independent_social is required when worked_independently_before is true");
  if (sexualOrientation && !sensitiveConsent) errors.push("sensitive_consent is required when sexual_orientation is provided");
  if (!sexualOrientation && sensitiveConsent) errors.push("sexual_orientation is required when sensitive_consent is true");
  if (errors.length) throw validationError(errors);

  return {
    idempotency_key: idempotencyKey,
    applicant_name: applicantName,
    nickname,
    phone,
    line_id: lineId,
    gender_identity: genderIdentity,
    customer_gender_scope: customerGenderScope,
    skills,
    experience_years: experienceYears,
    experience_months: experienceMonths,
    strengths: text(body.strengths, 3000),
    worked_at_spa_before: workedAtSpaBefore,
    spa_name: workedAtSpaBefore ? text(body.spa_name, 160) : "",
    worked_independently_before: workedIndependentlyBefore,
    independent_social: workedIndependentlyBefore ? text(body.independent_social, 240) : "",
    current_profession: currentProfession,
    qualification_note: qualificationNote,
    work_base_area: workBaseArea,
    mobility_scope: mobilityScope,
    coverage_area_note: coverageAreaNote,
    base_zone: baseZone,
    coverage_zones: coverageZones,
    general_consent: true,
    sexual_orientation: sexualOrientation,
    sensitive_consent: sensitiveConsent,
    consent_notice_version: text(body.consent_notice_version, 80),
    language: language(body.language),
  };
}

export function prebookingPayload(input) {
  const body = plainObject(input);
  rejectUnknownKeys(body, PREBOOKING_KEYS);

  const idempotencyKey = token(body.idempotency_key, 120);
  const memberRef = token(body.member_ref, 120);
  const lineUserId = text(body.line_user_id, 120);
  const recipientGender = normalizeChoice(body.recipient_gender, {
    male: "ผู้ชาย",
    "ผู้ชาย": "ผู้ชาย",
    female: "ผู้หญิง",
    "ผู้หญิง": "ผู้หญิง",
    other: "อื่น ๆ / ให้ MMS ประสาน",
    manual: "อื่น ๆ / ให้ MMS ประสาน",
    "อื่น ๆ / ให้ mms ประสาน": "อื่น ๆ / ให้ MMS ประสาน",
    prefer_not_to_say: "ไม่ประสงค์ระบุ",
    "ไม่ประสงค์ระบุ": "ไม่ประสงค์ระบุ",
  });
  const zone = normalizeCatalogValue(body.zone, ZONE_LOOKUP, "zone");
  const skills = normalizeCatalogValues(body.skills, SKILL_LOOKUP, 1, 6, "skills");
  const date = isoDate(body.service_date);
  const time = clockTime(body.service_time);
  const duration = integer(body.duration_minutes, 60, 300, "duration_minutes");
  const requestedTherapists = uniqueStrings(body.requested_therapist_ids, 5, 80);

  const errors = [];
  if (!idempotencyKey) errors.push("idempotency_key is required");
  if (!memberRef && !lineUserId) errors.push("member_ref or line_user_id is required");
  if (!recipientGender) errors.push("recipient_gender is required");
  if (!zone) errors.push("zone is required");
  if (!date) errors.push("service_date must be YYYY-MM-DD");
  if (!time) errors.push("service_time must be HH:mm");
  if (errors.length) throw validationError(errors);

  return {
    idempotency_key: idempotencyKey,
    member_ref: memberRef,
    line_user_id: lineUserId,
    recipient_gender: recipientGender,
    zone,
    service_date: date,
    service_time: time,
    duration_minutes: duration,
    skills,
    requested_therapist_ids: requestedTherapists,
    note: text(body.note, 2000),
    language: language(body.language),
  };
}

export function normalizeTherapistRecord(record) {
  const fields = plainObject(record?.fields);
  return {
    record_id: text(record?.id, 80),
    therapist_id: token(fields["Therapist ID"], 80),
    display_name: text(fields["Display Name"], 120),
    gender_identity: text(fields["Gender Identity"], 40),
    customer_gender_scope: text(fields["Customer Gender Scope"], 40),
    verified_skills: normalizeCatalogValuesLoose(fields["Verified Skills"], SKILL_LOOKUP),
    base_zone: normalizeCatalogValueLoose(fields["Base Zone"], ZONE_LOOKUP),
    coverage_zones: normalizeCatalogValuesLoose(fields["Coverage Zones"], ZONE_LOOKUP),
    availability_status: text(fields["Availability Status"], 40),
    matching_enabled: Boolean(fields["Matching Enabled"]),
    manual_review_only: Boolean(fields["Manual Review Only"]),
    public_photo_url: safeUrl(fields["Public Photo URL"]),
    status: text(fields.Status, 40),
  };
}

export function matchTherapists(records, criteria) {
  const recipientGender = text(criteria?.recipient_gender, 80);
  const zone = normalizeCatalogValue(criteria?.zone, ZONE_LOOKUP, "zone");
  const skills = normalizeCatalogValues(criteria?.skills, SKILL_LOOKUP, 1, 6, "skills");
  const manualAudience = !["ผู้ชาย", "ผู้หญิง"].includes(recipientGender);

  if (manualAudience) {
    return { requires_manual_coordination: true, matches: [] };
  }

  const matches = records
    .map(normalizeTherapistRecord)
    .filter((therapist) => therapist.therapist_id && therapist.status === "Active")
    .filter((therapist) => therapist.matching_enabled && !therapist.manual_review_only)
    .filter((therapist) => acceptsGender(therapist.customer_gender_scope, recipientGender))
    .filter((therapist) => therapist.base_zone === zone || therapist.coverage_zones.includes(zone))
    .map((therapist) => {
      const skillMatches = skills.filter((skill) => therapist.verified_skills.includes(skill));
      return { ...therapist, matched_skills: skillMatches, match_score: skillMatches.length };
    })
    .filter((therapist) => therapist.match_score === skills.length)
    .sort((a, b) => {
      const availability = availabilityScore(b.availability_status) - availabilityScore(a.availability_status);
      if (availability !== 0) return availability;
      return a.display_name.localeCompare(b.display_name, "th");
    })
    .map(customerSafeTherapist);

  return { requires_manual_coordination: false, matches };
}

export function applicationAirtableFields(application, meta) {
  const redacted = {
    application_id: meta.application_id,
    gender_identity: application.gender_identity,
    customer_gender_scope: application.customer_gender_scope,
    skills: application.skills,
    experience_years: application.experience_years,
    experience_months: application.experience_months,
    current_profession: application.current_profession,
    work_base_area: application.work_base_area,
    mobility_scope: application.mobility_scope,
    coverage_area_note: application.coverage_area_note,
    base_zone: application.base_zone,
    coverage_zones: application.coverage_zones,
    language: application.language,
  };
  return compact({
    "Application ID": meta.application_id,
    "Applicant Name": application.applicant_name,
    Nickname: application.nickname,
    Phone: application.phone,
    "LINE ID": application.line_id,
    "Gender Identity": application.gender_identity,
    "Customer Gender Scope": application.customer_gender_scope,
    "Skills Claimed": application.skills.map(catalogLabel),
    "Experience Years": application.experience_years,
    "Experience Months": application.experience_months,
    Strengths: application.strengths,
    "Worked at Spa Before": application.worked_at_spa_before,
    "Spa Name": application.spa_name,
    "Worked Independently Before": application.worked_independently_before,
    "Independent Social": application.independent_social,
    "Current Profession": application.current_profession,
    "Qualification Note": application.qualification_note,
    "Work Base Area": application.work_base_area,
    "Mobility Scope": application.mobility_scope,
    "Coverage Area Note": application.coverage_area_note,
    "Base Zone": catalogLabel(application.base_zone),
    "Coverage Zones": application.coverage_zones.map(catalogLabel),
    "General Consent": true,
    "Application Status": "Submitted",
    "Idempotency Key": application.idempotency_key,
    "Submitted At": meta.submitted_at,
    "Payload JSON": JSON.stringify(redacted),
  });
}

export function applicationTelegramMessage(application, meta) {
  return [
    "🔔 MMS มีใบสมัคร Therapist ใหม่",
    `Reference: ${meta.application_id}`,
    "เปิด Airtable > MMS Therapist Applications เพื่อตรวจสอบข้อมูล",
  ].join("\n");
}

export function sensitiveAirtableFields(application, meta) {
  if (!application.sexual_orientation || !application.sensitive_consent) return null;
  return {
    "Therapist Application Ref": meta.application_id,
    "Gender Identity": application.gender_identity,
    "Sexual Orientation": application.sexual_orientation,
    "Sensitive Data Consent": "Granted",
    "Consent At": meta.submitted_at,
    "Consent Notice Version": application.consent_notice_version || "mms-sensitive-v1",
    "Collection Purpose": "Internal applicant support only",
    "Customer Visible": false,
    "Booking API Allowed": false,
    "Retention Status": "Active",
  };
}

export function prebookingAirtableFields(prebooking, meta) {
  const redacted = {
    prebooking_id: meta.prebooking_id,
    member_ref: prebooking.member_ref,
    recipient_gender: prebooking.recipient_gender,
    zone: prebooking.zone,
    service_date: prebooking.service_date,
    service_time: prebooking.service_time,
    duration_minutes: prebooking.duration_minutes,
    skills: prebooking.skills,
    requested_therapist_ids: prebooking.requested_therapist_ids,
  };
  return compact({
    "Prebooking ID": meta.prebooking_id,
    "Member Ref": prebooking.member_ref,
    "LINE User Hash": meta.line_user_hash,
    "Recipient Gender": prebooking.recipient_gender,
    Zone: catalogLabel(prebooking.zone),
    "Service Date": prebooking.service_date,
    "Service Time": prebooking.service_time,
    "Duration Minutes": prebooking.duration_minutes,
    "Selected Skills": prebooking.skills.map(catalogLabel),
    "Requested Therapist IDs": JSON.stringify(prebooking.requested_therapist_ids),
    "Matched Therapist IDs": JSON.stringify(meta.matched_therapist_ids || []),
    Status: meta.status || "Submitted",
    "Idempotency Key": prebooking.idempotency_key,
    "Coordinator Key": meta.coordinator_key,
    "Created At": meta.created_at,
    "Updated At": meta.updated_at,
    "Payload JSON": JSON.stringify(redacted),
  });
}

export function uploadRequest(input, limits = {}) {
  const body = plainObject(input);
  const allowed = new Set(["application_ref", "application_token", "kind", "filename", "content_type", "size"]);
  rejectUnknownKeys(body, allowed);
  const kind = normalizeChoice(body.kind, { profile_photo: "profile_photo", certificate: "certificate" });
  const filename = safeFilename(body.filename);
  const contentType = text(body.content_type, 100).toLowerCase();
  const size = integer(body.size, 1, Number(limits.maxBytes || 10 * 1024 * 1024), "size");
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const errors = [];
  if (!/^mmsapp_[a-f0-9]{24}$/.test(String(body.application_ref || ""))) errors.push("application_ref is invalid");
  if (!token(body.application_token, 200)) errors.push("application_token is required");
  if (!kind) errors.push("kind is invalid");
  if (!filename) errors.push("filename is invalid");
  if (!allowedTypes.has(contentType)) errors.push("content_type is not allowed");
  if (kind === "profile_photo" && contentType === "application/pdf") errors.push("profile_photo must be an image");
  if (errors.length) throw validationError(errors);
  return {
    application_ref: body.application_ref,
    application_token: token(body.application_token, 200),
    kind,
    filename,
    content_type: contentType,
    size,
  };
}

export function catalog() {
  return { skills: MMS_SKILLS, zones: MMS_ZONES, max_selected_skills: 6 };
}

function acceptsGender(scope, recipient) {
  if (scope === "ได้ทั้งคู่") return true;
  return (scope === "ผู้ชาย" && recipient === "ผู้ชาย") || (scope === "ผู้หญิง" && recipient === "ผู้หญิง");
}

function customerSafeTherapist(therapist) {
  return {
    therapist_id: therapist.therapist_id,
    display_name: therapist.display_name,
    verified_skills: therapist.verified_skills,
    base_zone: therapist.base_zone,
    coverage_zones: therapist.coverage_zones,
    availability_status: therapist.availability_status,
    public_photo_url: therapist.public_photo_url,
    matched_skills: therapist.matched_skills,
    match_score: therapist.match_score,
  };
}

function availabilityScore(value) {
  if (value === "Available") return 2;
  if (value === "Limited") return 1;
  return 0;
}

function normalizeOrientation(value) {
  return normalizeChoice(value, {
    heterosexual: "ชายรักหญิง — Heterosexual",
    straight: "ชายรักหญิง — Heterosexual",
    "ชายรักหญิง — heterosexual": "ชายรักหญิง — Heterosexual",
    gay: "ชายรักชาย — Gay",
    "ชายรักชาย — gay": "ชายรักชาย — Gay",
    bisexual: "Bisexual — ไบเซ็กชวล",
    bi: "Bisexual — ไบเซ็กชวล",
    "bisexual — ไบเซ็กชวล": "Bisexual — ไบเซ็กชวล",
    prefer_not_to_say: "ไม่ประสงค์ระบุ",
    "ไม่ประสงค์ระบุ": "ไม่ประสงค์ระบุ",
  });
}

function normalizeCatalogValues(value, lookup, min, max, field) {
  if (!Array.isArray(value)) throw validationError([`${field} must be an array`]);
  const values = [...new Set(value.map((item) => lookup.get(normalized(item))).filter(Boolean))];
  if (values.length < min || values.length > max || values.length !== new Set(value.map(normalized)).size) {
    throw validationError([`${field} must contain ${min}-${max} supported unique values`]);
  }
  return values;
}

function normalizeCatalogValue(value, lookup, field) {
  const normalizedValue = lookup.get(normalized(value));
  if (!normalizedValue) throw validationError([`${field} is invalid`]);
  return normalizedValue;
}

function normalizeCatalogValuesLoose(value, lookup) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => lookup.get(normalized(selectValue(item)))).filter(Boolean))];
}

function normalizeCatalogValueLoose(value, lookup) {
  return lookup.get(normalized(selectValue(value))) || "";
}

function selectValue(value) {
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return value;
}

function catalogLabel(code) {
  return MMS_SKILLS.find((item) => item.code === code)?.label || MMS_ZONES.find((item) => item.code === code)?.label || code;
}

function buildLookup(items) {
  const lookup = new Map();
  for (const item of items) {
    lookup.set(normalized(item.code), item.code);
    lookup.set(normalized(item.label), item.code);
    if (item.th) lookup.set(normalized(item.th), item.code);
  }
  return lookup;
}

function rejectUnknownKeys(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw validationError([`unsupported fields: ${unknown.join(", ")}`]);
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalized(value) {
  return String(selectValue(value) || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeChoice(value, choices) {
  return choices[normalized(value)] || "";
}

function text(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function token(value, max) {
  const result = String(value || "").trim().slice(0, max);
  return /^[A-Za-z0-9._:-]+$/.test(result) ? result : "";
}

function boolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function integer(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw validationError([`${field} must be an integer from ${min} to ${max}`]);
  return number;
}

function uniqueStrings(value, maxItems, maxLength) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw validationError(["requested_therapist_ids must be an array"]);
  const result = [...new Set(value.map((item) => token(item, maxLength)).filter(Boolean))];
  if (result.length > maxItems || result.length !== value.length) throw validationError([`requested_therapist_ids supports up to ${maxItems} unique ids`]);
  return result;
}

function isoDate(value) {
  const result = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return "";
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result ? "" : result;
}

function clockTime(value) {
  const result = String(value || "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result) ? result : "";
}

function safeFilename(value) {
  const raw = String(value || "").normalize("NFKC").trim();
  if (!raw || raw.length > 160 || raw.includes("/") || raw.includes("\\")) return "";
  return raw.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "-");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function language(value) {
  const result = normalized(value);
  return ["th", "en", "zh"].includes(result) ? result : "th";
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== "" && value !== undefined && value !== null));
}

function validationError(errors) {
  const error = new Error(errors.join("; "));
  error.name = "ValidationError";
  error.details = errors;
  return error;
}
