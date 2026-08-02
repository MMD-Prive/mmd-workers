import { MutationError } from "./campaign-mutation-core.js";

const API = "https://api.airtable.com/v0";
const CAMPAIGN_ID = "mmd_6th_anniversary_2026";
const APP = { key:"fld3OLCT6vIT7pmWs",claimId:"fld8UXQ0YHWedaObv",campaignId:"fldjymvFmTTKRGmyL",
  type:"flda1YNZ48ueWAXJs",status:"fldutWFQp4TejsRfl",before:"fldDNVApi3Br0B9qm",after:"fldHjI2ISADG3Lvcz",
  retries:"fldc1UrE1pR7aRjlK",error:"fldKJYqVe59Lp9o3I",appliedAt:"fldruEy5tvClA4CUi",appliedBy:"fldqTJ5R2dsZurC1X",
  createdAt:"fldYUvE7zoMX31BtL",requestId:"fldfCWLL9Ix5QiOTN",updatedAt:"fldvCpHnIc2VLzPax" };
const MEMBER_PACKAGE = { email:"fld25NnjluFneSgZc",packageCode:"fldwp9jcvsHd1J6W4",status:"fldeJDrGbpKXdORQY",
  start:"flddb8reg1p3mieWn",end:"fldEB5ShHgAjj24c7",paymentRef:"fldC5Ndz5XIOLJTe2",promoCode:"fldJYUncsL7NwVpCG",
  campaignCode:"fldbJQgqPUPVRQ3NL",promoApplied:"fld8Mrd5Z7xVwLvaa",promoNote:"flddEfww1a5i8NwdC",claimId:"fldKbUOKp86G9hmMd" };
const MEMBER = { email:"fldcoz7nK6O0XWWGH",compatEmail:"fldgxTkuNR86HCuVB",memberId:"fld3hISS6bp1fjOQT" };
const POINTS = { primary:"fldihpQMxX4xZwLUa",email:"fldhJOrzDUwHr18gE",points:"fldpgsITgYMNjAeEV",source:"fldvMTFjpTUojO7QE",
  note:"fld5MP3XFJ9ZC2jsB",claimId:"fld5blR0Rd9ESIT24",campaignId:"fldaSma7eijbrgrRx",key:"flds5SvWQGmJ7HoQ6",
  postedAt:"fldaGmp5d5LIUqJUc",createdBy:"fldqGaLpknmu84dKo",status:"fldnTeyFxPOknCyjg" };
const AUDIT = { action:"fldJm0W0cL6vQH3pG",timestamp:"fldWQUyiizhJakk95",actor:"fld1SLfgMZrZRoK84",entityType:"flda0UF0K7aYI2G0Q",
  details:"fldcPkD8QHNS2O6rx",session:"fldIKfvCRiOV4XN2j",requestId:"fldIJTCPhoL6RNJWP",eventType:"fldoAu14JWm4gUbe6",
  after:"fldcGk6eAA41bsxZX",reason:"fldeIkKKMmLN8QAnj",claimId:"fldVtBO0jBMcrVshF",key:"fldySzuIWzzCp56m2",before:"fld6y23ZJs9rOey6T" };

export class AirtableCampaignMutationStore {
  constructor(env) {
    this.env = env;
    if (env.CAMPAIGN_SCHEMA_VERSION !== "2026-08-final") throw new MutationError("campaign_schema_version_missing");
    this.tables = {
      applications: required(env.AIRTABLE_TABLE_CAMPAIGN_BENEFIT_APPLICATIONS, "benefit_applications_table_missing"),
      memberPackages: required(env.AIRTABLE_TABLE_MEMBER_PACKAGES, "member_packages_table_missing"),
      members: required(env.AIRTABLE_TABLE_MEMBERS, "members_table_missing"),
      points: required(env.AIRTABLE_TABLE_POINTS_LEDGER, "points_table_missing"),
      audits: required(env.AIRTABLE_TABLE_ACTIVITY_LOGS, "activity_logs_table_missing"),
    };
    this.pointsExpiryField = required(env.AT_POINTS__EXPIRES_AT, "points_expiry_field_missing");
  }

  async getApplication(key) {
    const record = await this.#find(this.tables.applications, `{${APP.key}}='${escapeFormula(key)}'`);
    return record ? application(record, true) : null;
  }

  async reserveApplication(item, input, previous) {
    const now = new Date().toISOString();
    const fields = { [APP.key]:item.idempotencyKey,[APP.claimId]:input.claimId,[APP.campaignId]:CAMPAIGN_ID,
      [APP.type]:item.benefitType,[APP.status]:"applying",[APP.before]:JSON.stringify(previous?.after ?? null),
      [APP.retries]:Number(previous?.retryCount || 0)+(previous?1:0),[APP.appliedBy]:input.actor.id,
      [APP.createdAt]:previous?.createdAt||now,[APP.requestId]:input.requestId,[APP.updatedAt]:now };
    let record;
    if (previous?.recordId) record = await this.#write(`${this.tables.applications}/${previous.recordId}`, "PATCH", fields);
    else record = await this.#write(this.tables.applications, "POST", fields);
    const reserved = application(record, false);
    await this.#audit(input, "benefit_application_reserved", previous, reserved, item.idempotencyKey);
    return reserved;
  }

  async markApplication(current, status, mutation, input) {
    const now = new Date().toISOString();
    const fields = { [APP.status]:status,[APP.after]:JSON.stringify(mutation || null),[APP.error]:mutation?.error||"",
      [APP.appliedAt]:status==="applied"?now:null,[APP.appliedBy]:input.actor.id,[APP.requestId]:input.requestId,[APP.updatedAt]:now };
    const record = await this.#write(`${this.tables.applications}/${current.recordId}`, "PATCH", fields);
    const next = application(record, false);
    await this.#audit(input, `benefit_application_${status}`, current, next, current.idempotencyKey);
    return next;
  }

  async applyMembershipAtomically(input, items) {
    const target = await this.#resolveTargetPackage(input);
    if (!target) throw new MutationError("target_member_package_not_found", true);
    const extension = items.find((item) => item.benefitType === "membership_extension");
    const upgrade = items.find((item) => item.benefitType === "membership_upgrade");
    const newExpiry = extension?.payload?.newExpiry || upgrade?.payload?.newExpiry;
    if (!newExpiry) throw new MutationError("membership_new_expiry_missing", true);
    const before = target.fields || {};
    const fields = {
      [MEMBER_PACKAGE.end]: dateOnly(newExpiry),
      [MEMBER_PACKAGE.packageCode]: upgrade ? "premium" : String(before[MEMBER_PACKAGE.packageCode] || extension?.payload?.tier || ""),
      [MEMBER_PACKAGE.status]: "active",
      [MEMBER_PACKAGE.promoCode]: CAMPAIGN_ID,
      [MEMBER_PACKAGE.campaignCode]: CAMPAIGN_ID,
      [MEMBER_PACKAGE.promoApplied]: true,
      [MEMBER_PACKAGE.promoNote]: `claim=${input.claimId};request=${input.requestId}`,
      [MEMBER_PACKAGE.claimId]: input.claimId,
    };
    const updated = await this.#write(`${this.tables.memberPackages}/${target.id}`, "PATCH", fields);
    const result = { recordId: target.id, previousExpiry: before[MEMBER_PACKAGE.end] || null,
      previousTier: before[MEMBER_PACKAGE.packageCode] || null, newExpiry: dateOnly(newExpiry),
      newTier: updated.fields?.[MEMBER_PACKAGE.packageCode] || fields[MEMBER_PACKAGE.packageCode] };
    await this.#audit(input, "membership_campaign_mutated", before, result, items.map((item)=>item.idempotencyKey).join(","));
    return result;
  }

  async applyPoints(input, item) {
    const email = await this.#resolveMemberEmail(input.memberId);
    if (!email) throw new MutationError("member_email_not_found", true);
    const fields = { [POINTS.primary]:`${input.claimId}:anniversary_points`,[POINTS.email]:email,[POINTS.points]:Number(item.payload?.points),
      [POINTS.source]:"system",[POINTS.note]:`Anniversary Care Back; expires=${item.payload?.expiresAt}`,[POINTS.claimId]:input.claimId,
      [POINTS.campaignId]:CAMPAIGN_ID,[POINTS.key]:item.idempotencyKey,[POINTS.postedAt]:new Date().toISOString(),
      [POINTS.createdBy]:input.actor.id,[POINTS.status]:"posted",[this.pointsExpiryField]:item.payload?.expiresAt };
    const created = await this.#write(this.tables.points, "POST", fields);
    const result = { recordId: created.id, points: Number(item.payload?.points), expiresAt: item.payload?.expiresAt };
    await this.#audit(input, "anniversary_points_posted", null, result, item.idempotencyKey);
    return result;
  }

  async #resolveTargetPackage(input) {
    const recordId = String(input.paymentTruth?.targetMemberPackageId || "");
    if (/^rec[a-zA-Z0-9]{14}$/.test(recordId)) return this.#get(this.tables.memberPackages, recordId);
    const email = await this.#resolveMemberEmail(input.memberId);
    if (!email) return null;
    const records = await this.#list(this.tables.memberPackages, `LOWER({${MEMBER_PACKAGE.email}})='${escapeFormula(email.toLowerCase())}'`,
      [{ field: MEMBER_PACKAGE.end, direction: "desc" }], 10);
    const expected = dateOnly(input.membershipEndSnapshot);
    return records.find((record) => dateOnly(record.fields?.[MEMBER_PACKAGE.end]) === expected) || records[0] || null;
  }

  async #resolveMemberEmail(memberId) {
    const raw = String(memberId || "");
    let record = null;
    if (/^mmd_rec_rec[a-zA-Z0-9]{14}$/.test(raw)) record = await this.#get(this.tables.members, raw.slice(8));
    else record = await this.#find(this.tables.members, `{${MEMBER.memberId}}='${escapeFormula(raw)}'`);
    return String(record?.fields?.[MEMBER.email] || record?.fields?.[MEMBER.compatEmail] || "").trim().toLowerCase();
  }

  async #audit(input,eventType,before,after,key) {
    const fields = { [AUDIT.action]:eventType,[AUDIT.timestamp]:new Date().toISOString().slice(0,10),[AUDIT.actor]:input.actor.id,
      [AUDIT.details]:JSON.stringify({campaignId:CAMPAIGN_ID,claimId:input.claimId,timestamp:new Date().toISOString()}),
      [AUDIT.session]:input.actor.sessionId,[AUDIT.requestId]:input.requestId,[AUDIT.eventType]:eventType,
      [AUDIT.before]:JSON.stringify(before??null),[AUDIT.after]:JSON.stringify(after??null),[AUDIT.reason]:input.reason||"",
      [AUDIT.claimId]:input.claimId,[AUDIT.key]:key||"" };
    await this.#write(this.tables.audits,"POST",fields);
  }

  async #find(table,formula){return (await this.#list(table,formula,[],1))[0]||null;}
  async #list(table,formula,sort=[],maxRecords=100){const q=new URLSearchParams({maxRecords:String(maxRecords),filterByFormula:formula});sort.forEach((s,i)=>{q.set(`sort[${i}][field]`,s.field);q.set(`sort[${i}][direction]`,s.direction);});const d=await this.#request(`${table}?${q}`);return d.records||[];}
  async #get(table,id){return this.#request(`${table}/${encodeURIComponent(id)}`);}
  async #write(path,method,fields){return this.#request(path,{method,body:JSON.stringify({fields,typecast:false})});}
  async #request(path,init={}){const base=required(this.env.AIRTABLE_BASE_ID,"airtable_base_id_missing"),token=required(this.env.AIRTABLE_API_KEY,"airtable_api_key_missing");
    const url=new URL(`${API}/${encodeURIComponent(base)}/${path}`);url.searchParams.set("returnFieldsByFieldId","true");
    const response=await fetch(url,{...init,headers:{authorization:`Bearer ${token}`,"content-type":"application/json"}});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new MutationError(`airtable_${response.status}`,false);return data;}
}

function application(record,wasExisting){const f=record.fields||{};let after=null;try{after=JSON.parse(f[APP.after]||"null");}catch{}return {recordId:record.id,idempotencyKey:f[APP.key],benefitType:f[APP.type],status:f[APP.status],retryCount:Number(f[APP.retries]||0),createdAt:f[APP.createdAt],after,wasExisting};}
function required(value,code){const s=String(value||"").trim();if(!s)throw new MutationError(code);return s;}
function escapeFormula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");}
function dateOnly(v){const d=new Date(v);if(!v||Number.isNaN(d.getTime()))return "";return d.toISOString().slice(0,10);}
