import { MutationError } from "./campaign-mutation-core.js";

const API = "https://api.airtable.com/v0";
const PAYMENT = { ref:"fldOO6SY49iDw8VBZ",status:"fldEJ1hmm7KwWuI6q",verification:"fldJ7a0Ube9F0bmRy",
  memberEmail:"fldC5GxsqpaX9X3P1",packageCode:"fldfyHYVrzbGPvMJR",stage:"fldrr9g8ZZjqAbdKQ",claimId:"fld0qxp5w6QwMiaue" };
const MEMBER_PACKAGE = { email:"fld25NnjluFneSgZc",packageCode:"fldwp9jcvsHd1J6W4",start:"flddb8reg1p3mieWn",
  end:"fldEB5ShHgAjj24c7",paymentRef:"fldC5Ndz5XIOLJTe2",status:"fldeJDrGbpKXdORQY" };
const MEMBER = { email:"fldcoz7nK6O0XWWGH",compatEmail:"fldgxTkuNR86HCuVB",memberId:"fld3hISS6bp1fjOQT" };

export class AirtablePaymentTruthStore {
  constructor(env) {
    this.env = env;
    this.payments = required(env.AIRTABLE_TABLE_PAYMENTS, "payments_table_missing");
    this.memberPackages = required(env.AIRTABLE_TABLE_MEMBER_PACKAGES, "member_packages_table_missing");
    this.members = required(env.AIRTABLE_TABLE_MEMBERS, "members_table_missing");
  }

  async verify(input) {
    if (input.paymentRequired && !input.paymentReference) throw new PaymentTruthError("verified_payment_required", 409);
    if (input.upgradeRequired && !input.upgradePaymentReference) throw new PaymentTruthError("verified_upgrade_payment_required", 409);
    if (input.paymentRequired && input.upgradeRequired && input.paymentReference === input.upgradePaymentReference) {
      throw new PaymentTruthError("distinct_renewal_and_upgrade_payments_required", 409);
    }
    const renewal = input.paymentRequired ? await this.#verifiedPayment(input.paymentReference, input.claimId, false) : null;
    const upgrade = input.upgradeRequired ? await this.#verifiedPayment(input.upgradePaymentReference, input.claimId, true) : null;
    let target = renewal ? await this.#packageByPaymentRef(input.paymentReference) : null;
    if (input.paymentRequired && (!target || lower(target.fields?.[MEMBER_PACKAGE.status]) !== "active")) {
      throw new PaymentTruthError("activated_membership_required", 409);
    }
    if (!target && input.memberId) target = await this.#packageByMember(input.memberId, input.membershipEndSnapshot);
    if (input.upgradeRequired && !target) throw new PaymentTruthError("upgrade_target_membership_required", 409);
    const targetEmail = lower(target?.fields?.[MEMBER_PACKAGE.email]);
    const renewalEmail = lower(renewal?.fields?.[PAYMENT.memberEmail]);
    const upgradeEmail = lower(upgrade?.fields?.[PAYMENT.memberEmail]);
    if (renewalEmail && targetEmail && renewalEmail !== targetEmail) throw new PaymentTruthError("payment_member_mismatch", 409);
    if (upgradeEmail && targetEmail && upgradeEmail !== targetEmail) throw new PaymentTruthError("upgrade_payment_member_mismatch", 409);
    return {
      paymentVerified: input.paymentRequired ? true : true,
      paymentReference: renewal?.fields?.[PAYMENT.ref] || null,
      upgradePaymentVerified: input.upgradeRequired ? true : false,
      upgradePaymentReference: upgrade?.fields?.[PAYMENT.ref] || null,
      targetMemberPackageId: target?.id || null,
      packageStartAt: target?.fields?.[MEMBER_PACKAGE.start] || null,
      packageEndAt: target?.fields?.[MEMBER_PACKAGE.end] || null,
    };
  }

  async #verifiedPayment(reference, claimId, upgrade) {
    const record = await this.#find(this.payments, `{${PAYMENT.ref}}='${escapeFormula(reference)}'`);
    const fields = record?.fields || {};
    if (!record || lower(fields[PAYMENT.status]) !== "paid" || lower(fields[PAYMENT.verification]) !== "verified") {
      throw new PaymentTruthError(upgrade ? "verified_upgrade_payment_required" : "verified_payment_required", 409);
    }
    if (String(fields[PAYMENT.claimId] || "") !== claimId) throw new PaymentTruthError("payment_claim_mismatch", 409);
    if (lower(fields[PAYMENT.stage]) !== "membership") throw new PaymentTruthError("membership_payment_required", 409);
    if (upgrade && lower(fields[PAYMENT.packageCode]) !== "premium") throw new PaymentTruthError("premium_upgrade_payment_required", 409);
    return record;
  }

  async #packageByPaymentRef(reference) {
    return this.#find(this.memberPackages, `{${MEMBER_PACKAGE.paymentRef}}='${escapeFormula(reference)}'`);
  }

  async #packageByMember(memberId, expectedExpiry) {
    let member = null;
    if (/^mmd_rec_rec[a-zA-Z0-9]{14}$/.test(memberId)) member = await this.#get(this.members, memberId.slice(8));
    else member = await this.#find(this.members, `{${MEMBER.memberId}}='${escapeFormula(memberId)}'`);
    const email = String(member?.fields?.[MEMBER.email] || member?.fields?.[MEMBER.compatEmail] || "").trim().toLowerCase();
    if (!email) return null;
    const records = await this.#list(this.memberPackages, `LOWER({${MEMBER_PACKAGE.email}})='${escapeFormula(email)}'`,
      [{field:MEMBER_PACKAGE.end,direction:"desc"}], 20);
    const expected = dateOnly(expectedExpiry);
    return records.find((record) => dateOnly(record.fields?.[MEMBER_PACKAGE.end]) === expected) || null;
  }

  async #find(table,formula){return (await this.#list(table,formula,[],1))[0]||null;}
  async #list(table,formula,sort,max){const q=new URLSearchParams({maxRecords:String(max),filterByFormula:formula,returnFieldsByFieldId:"true"});
    sort.forEach((s,i)=>{q.set(`sort[${i}][field]`,s.field);q.set(`sort[${i}][direction]`,s.direction);});return (await this.#request(`${table}?${q}`)).records||[];}
  async #get(table,id){return this.#request(`${table}/${encodeURIComponent(id)}?returnFieldsByFieldId=true`);}
  async #request(path){const base=required(this.env.AIRTABLE_BASE_ID,"airtable_base_id_missing"),token=required(this.env.AIRTABLE_API_KEY,"airtable_api_key_missing");
    const response=await fetch(`${API}/${encodeURIComponent(base)}/${path}`,{headers:{authorization:`Bearer ${token}`}});const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new MutationError(`airtable_${response.status}`);return data;}
}

function required(value,code){const s=String(value||"").trim();if(!s)throw new PaymentTruthError(code,503);return s;}
function escapeFormula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");}
function lower(v){return String(v||"").trim().toLowerCase();}
function dateOnly(v){const d=new Date(v);return !v||Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);}
export class PaymentTruthError extends Error { constructor(code,status=503){super(code);this.code=code;this.status=status;} }
