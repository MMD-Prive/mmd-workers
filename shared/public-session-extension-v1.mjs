const BANGKOK_TZ = "Asia/Bangkok";

export const PUBLIC_EXTENSION_POLICY_VERSION = "mmd_public_session_extension_v1_20260922";

const PACKAGE_RULES = Object.freeze({
  pick_me_up: Object.freeze({ mode:"flat", client:790, worker:550, midnight:"review" }),
  airport_please: Object.freeze({ mode:"flat", client:790, worker:550, midnight:"review" }),
  wait_for_me: Object.freeze({ mode:"flat", client:790, worker:550, midnight:"review" }),
  half_day_with_him: Object.freeze({ mode:"flat", client:790, worker:550, midnight:"review" }),

  cook_with_me: Object.freeze({ mode:"flat", client:690, worker:450, midnight:"review" }),
  dinner_made_for_you: Object.freeze({ mode:"flat", client:690, worker:450, midnight:"review" }),
  market_to_table: Object.freeze({ mode:"flat", client:690, worker:450, midnight:"review" }),
  private_table: Object.freeze({ mode:"flat", client:690, worker:450, midnight:"review" }),

  day_off_short: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  day_off_half_day: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  day_off_full_day: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  move_with_me: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  game_day: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  active_day: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  reset_with_me: Object.freeze({ mode:"clock", before:[1690,1000], after00:[2190,1350], after03:[2690,1700] }),
  wellness_day: Object.freeze({ mode:"clock", before:[1690,1000], after00:[2190,1350], after03:[2690,1700] }),
  slow_reset: Object.freeze({ mode:"clock", before:[1690,1000], after00:[2190,1350], after03:[2690,1700] }),
  night_out: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  dinner_to_midnight: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),
  own_the_night: Object.freeze({ mode:"clock", before:[990,650], after00:[1490,1000], after03:[1790,1200] }),

  dinner_guest: Object.freeze({ mode:"clock", before:[1290,850], after00:[1790,1200], after03:[2090,1400] }),
  event_partner: Object.freeze({ mode:"clock", before:[1290,850], after00:[1790,1200], after03:[2090,1400] }),
  formal_evening: Object.freeze({ mode:"clock", before:[1290,850], after00:[1790,1200], after03:[2090,1400] }),

  bangkok_with_me: Object.freeze({ mode:"clock", before:[1190,800], after00:[1690,1100], after03:[1990,1300] }),
  local_bangkok: Object.freeze({ mode:"clock", before:[1190,800], after00:[1690,1100], after03:[1990,1300] }),
  your_bangkok_day: Object.freeze({ mode:"clock", before:[1190,800], after00:[1690,1100], after03:[1990,1300] }),
});

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BANGKOK_TZ,
  year:"numeric", month:"2-digit", day:"2-digit",
  hour:"2-digit", minute:"2-digit", hourCycle:"h23",
});

function clean(value, max=160) {
  return String(value == null ? "" : value).trim().slice(0,max);
}
function parsed(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}
function localParts(date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((x)=>[x.type,x.value]));
  return {
    date:`${parts.year}-${parts.month}-${parts.day}`,
    hour:Number(parts.hour),
    minute:Number(parts.minute),
  };
}
function nextMinute(date) { return new Date(date.getTime()+60_000); }
function hasMidnightMinute(originalEnd, requestedEnd) {
  for(let t=new Date(originalEnd); t<requestedEnd; t=nextMinute(t)){
    const h=localParts(t).hour;
    if(h<6) return true;
  }
  return false;
}
function isUnsafeOvernightContinuation(originalEnd, requestedEnd) {
  const origin=localParts(originalEnd);
  for(let t=new Date(originalEnd); t<requestedEnd; t=nextMinute(t)){
    const p=localParts(t);
    if(p.hour>=6 && p.hour<12 && (p.date!==origin.date || origin.hour<6 || origin.hour>=18)) return true;
  }
  return false;
}
function clockRates(rule, hour) {
  if(hour>=3 && hour<6) return rule.after03;
  if(hour>=0 && hour<3) return rule.after00;
  return rule.before;
}
function money(n){ return Math.round((Number(n)||0)+Number.EPSILON); }

export function publicExtensionRule(packageCode) {
  return PACKAGE_RULES[clean(packageCode).toLowerCase()] || null;
}

export function pricePublicExtension(input={}) {
  const kind=clean(input.requestKind||"extend_time").toLowerCase();
  const packageCode=clean(input.packageCode).toLowerCase();
  const originalEnd=parsed(input.originalEndAt);
  const requestedEnd=parsed(input.requestedEndAt);

  if(kind==="change_plan") {
    return { ok:false, review_required:true, reason:"change_plan_requires_mmd_requote", policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }
  if(kind!=="extend_time") {
    return { ok:false, review_required:true, reason:"unsupported_extension_kind", policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }
  const rule=publicExtensionRule(packageCode);
  if(!rule) {
    return { ok:false, review_required:true, reason:"package_policy_missing", policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }
  if(!originalEnd || !requestedEnd || requestedEnd<=originalEnd) {
    return { ok:false, review_required:false, reason:"requested_end_must_be_after_official_end", policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }

  const minutes=Math.ceil((requestedEnd-originalEnd)/60_000);
  if(minutes<30 || minutes>360 || minutes%30!==0) {
    return { ok:false, review_required:false, reason:"extension_must_be_30_to_360_minutes_in_30_minute_steps", requested_minutes:minutes, policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }

  if(isUnsafeOvernightContinuation(originalEnd,requestedEnd)) {
    return { ok:false, review_required:true, reason:"after_0600_requires_mmd_review", requested_minutes:minutes, policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }
  if(rule.mode==="flat" && hasMidnightMinute(originalEnd,requestedEnd) && rule.midnight==="review") {
    return { ok:false, review_required:true, reason:"package_midnight_extension_requires_mmd_review", requested_minutes:minutes, policy_version:PUBLIC_EXTENSION_POLICY_VERSION };
  }

  let client=0, worker=0;
  const segments=new Map();
  for(let t=new Date(originalEnd); t<requestedEnd; t=nextMinute(t)){
    let pair;
    let band;
    if(rule.mode==="flat") {
      pair=[rule.client,rule.worker];
      band="flat";
    } else {
      const p=localParts(t);
      pair=clockRates(rule,p.hour);
      band=p.hour>=3&&p.hour<6?"after_0300":p.hour<3?"after_0000":"before_0000";
    }
    client+=pair[0]/60;
    worker+=pair[1]/60;
    const current=segments.get(band)||{minutes:0,client_rate_thb_per_hour:pair[0],model_rate_thb_per_hour:pair[1]};
    current.minutes+=1;
    segments.set(band,current);
  }

  return {
    ok:true,
    review_required:false,
    policy_version:PUBLIC_EXTENSION_POLICY_VERSION,
    package_code:packageCode,
    requested_minutes:minutes,
    customer_amount_thb:money(client),
    model_payout_thb:money(worker),
    segments:[...segments.entries()].map(([band,value])=>({band,...value})),
    official_end_changes_only_after:"model_approved+payment_verified+mmd_confirmed",
    prebook_after_midnight_premium_applied:false,
  };
}

async function sha256Hex(value) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value||"")));
  return [...new Uint8Array(bytes)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}

export async function extensionIdentity({sessionId,requestKind="extend_time",originalEndAt,requestedEndAt}) {
  const raw=[clean(sessionId),clean(requestKind),clean(originalEndAt),clean(requestedEndAt),PUBLIC_EXTENSION_POLICY_VERSION].join("|");
  const hash=await sha256Hex(raw);
  return {
    request_id:`ext_${hash.slice(0,24)}`,
    idempotency_key:`public_extension:${hash}`,
    payment_ref:`pay_ext_${hash.slice(0,24)}`,
    payout_adjustment_id:`payout_ext_${hash.slice(0,24)}`,
  };
}

export const PUBLIC_EXTENSION_INTERNALS = Object.freeze({ PACKAGE_RULES, localParts, isUnsafeOvernightContinuation });
