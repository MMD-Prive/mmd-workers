const BUILD = "SIGIL_FRONTEND_PREVIEW_V1";
const CANONICAL_ORIGIN = "https://sigil.mmdbkk.com";
const RENEWAL_PROOF_ENDPOINT = "/api/pay/renewal/proof";
const TURNSTILE_SITE_KEY = "0x4AAAAAACIE9VleQdOBRfBG";

const SIGIL_LOGO_IMAGE =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
const BLACK_CARD_IMAGE =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a22f53633aaf32d040022d4_Line-Kenji.webp";
const PROMPTPAY_URL = "https://promptpay.io/0829528889";
const PAYPAL_URL = "https://www.paypal.com/ncp/payment/M697T7AW2QZZJ";

const PLACEHOLDER_ROUTES = new Map([
  ["/trust/inme", {
    title: "INME Trust Access",
    eyebrow: "MMD / INME",
    copy: "Clean SIGIL frontend shell reserved for membership trust and renewal entry. Backend ownership remains separate.",
    api: "POST /v1/membership/request",
  }],
  ["/inme", {
    title: "INME Member Entry",
    eyebrow: "MMD / Member",
    copy: "Frontend shell for the INME member entry path. This prevents origin fallback while the final UI is rebuilt.",
    api: "POST /v1/membership/request",
  }],
  ["/member/dashboard", {
    title: "Member Dashboard",
    eyebrow: "SIGIL / Member",
    copy: "Member dashboard shell. Data should come from existing member dashboard APIs, never from this frontend worker.",
    api: "GET /api/member/dashboard",
  }],
  ["/model/dashboard", {
    title: "Model Dashboard",
    eyebrow: "SIGIL / Model",
    copy: "Model dashboard shell. Session data should remain in backend model/session APIs.",
    api: "GET /v1/model/session/dashboard",
  }],
  ["/apply/public-model", {
    title: "Public Model Application",
    eyebrow: "SIGIL / Apply",
    copy: "Public model application shell. Submissions should post to the existing application backend.",
    api: "POST /sigil/api/public-model/apply",
  }],
  ["/partner", {
    title: "Partner Portal",
    eyebrow: "SIGIL / Partner",
    copy: "Partner portal shell. Partner records and approvals stay in backend partner APIs.",
    api: "GET /v1/partner/dashboard",
  }],
  ["/partner/model", {
    title: "Partner Model Portal",
    eyebrow: "SIGIL / Partner Model",
    copy: "Partner model shell for future referral and model submission workflows.",
    api: "POST /v1/partner/request",
  }],
  ["/partner/apply", {
    title: "Partner Application",
    eyebrow: "SIGIL / Partner Apply",
    copy: "Partner application shell. This worker only renders the UI; backend APIs own persistence and approval.",
    api: "POST /v1/partner/request",
  }],
]);

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      return withHeaders(json({ ok: false, error: "method_not_allowed" }, 405), env);
    }

    if (url.pathname === "/_frontend-health") {
      return withHeaders(json({
        ok: true,
        worker: "sigil-frontend-worker",
        build: env.SIGIL_FRONTEND_BUILD || BUILD,
        scope: "GET UI pages only",
      }), env);
    }

    if (isRenewalPagePath(url.pathname)) {
      return withHeaders(renderRenewalPage(request, env), env);
    }

    const placeholder = PLACEHOLDER_ROUTES.get(normalizePath(url.pathname));
    if (placeholder) {
      return withHeaders(renderPlaceholderPage(request, placeholder, env), env);
    }

    return withHeaders(renderNotFound(request, env), env);
  },
};

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/g, "") || "/";
}

function isRenewalPagePath(pathname) {
  const normalized = normalizePath(pathname);
  return normalized === "/pay/renewal" || normalized === "/_preview/pay/renewal";
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function htmlResponse(request, html, status = 200) {
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function withHeaders(response, env) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-sigil-frontend-owner", "sigil-frontend-worker");
  headers.set("x-mmd-sigil-frontend-build", env.SIGIL_FRONTEND_BUILD || BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function renderRenewalPage(request, env) {
  const turnstileSiteKey = String(env.TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY || "").trim();
  const turnstileEnabled = Boolean(turnstileSiteKey);
  const config = {
    endpoint: RENEWAL_PROOF_ENDPOINT,
    turnstileSiteKey,
    turnstileEnabled,
    maxFileBytes: 12 * 1024 * 1024,
  };
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Renew or Upgrade Access | SĪGIL</title>
  <style>
    .mmd-renewal-premium,
    .mmd-renewal-premium * { box-sizing: border-box; letter-spacing: 0; }
    .mmd-renewal-premium {
      min-height: 100vh;
      margin: 0;
      color: #f7efe0;
      background:
        radial-gradient(circle at 18% 0%, rgba(219, 179, 88, .18), transparent 24rem),
        radial-gradient(circle at 82% 18%, rgba(110, 82, 39, .22), transparent 27rem),
        linear-gradient(145deg, #040404 0%, #11100d 48%, #050504 100%);
      font-family: Inter, "Noto Sans Thai", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .mmd-renewal-premium-shell { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 26px 0 46px; }
    .mmd-renewal-premium-hero { display: grid; gap: 22px; align-items: center; padding: 10px 0 22px; }
    .mmd-renewal-premium-logo-wrap { position: relative; display: inline-flex; width: 118px; margin-bottom: 22px; overflow: hidden; }
    .mmd-renewal-premium-logo-wrap::after { content: ""; position: absolute; inset: -24px; transform: translateX(-150%) rotate(18deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.62), transparent); animation: mmd-renewal-logo-shine 4.2s ease-in-out infinite; pointer-events: none; }
    .mmd-renewal-premium-logo { position: relative; z-index: 1; width: 112px; height: auto; display: block; filter: drop-shadow(0 10px 28px rgba(226,187,104,.22)); }
    @keyframes mmd-renewal-logo-shine { 0%, 42% { transform: translateX(-150%) rotate(18deg); } 58%, 100% { transform: translateX(150%) rotate(18deg); } }
    .mmd-renewal-premium-kicker { margin: 0 0 10px; color: #d9b15e; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .mmd-renewal-premium-title { margin: 0; max-width: 760px; color: #fff8ea; font-size: clamp(44px, 8vw, 92px); line-height: .9; font-weight: 950; }
    .mmd-renewal-premium-lead { max-width: 760px; margin: 18px 0 0; color: #e8ddc9; font-size: 17px; line-height: 1.75; }
    .mmd-renewal-premium-note-grid { display: grid; gap: 10px; margin-top: 22px; }
    .mmd-renewal-premium-note { border-left: 3px solid #d8aa4d; padding: 12px 14px; background: rgba(255,255,255,.045); color: #efe2c7; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-premium-note strong { display: block; margin-bottom: 3px; color: #ffe7ad; font-size: 13px; text-transform: uppercase; }
    .mmd-renewal-premium-black-card { position: relative; min-height: 430px; overflow: hidden; border: 1px solid rgba(229,187,92,.34); border-radius: 8px; background: linear-gradient(145deg, #1a1711, #050505 58%, #171209); box-shadow: 0 34px 100px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.04); }
    .mmd-renewal-premium-black-card::before { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, rgba(255,255,255,.10), transparent 22%, transparent 66%, rgba(214,170,80,.16)); pointer-events: none; }
    .mmd-renewal-premium-card-image { position: absolute; inset: auto 0 0 auto; width: min(78%, 440px); height: 100%; object-fit: cover; object-position: center top; opacity: .70; filter: saturate(.92) contrast(1.08); }
    .mmd-renewal-premium-card-copy { position: relative; z-index: 1; max-width: 360px; padding: 28px; }
    .mmd-renewal-premium-card-label { margin: 0; color: #d7aa50; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .mmd-renewal-premium-card-title { margin: 10px 0 0; color: #fff5dd; font-size: clamp(32px, 5vw, 58px); line-height: .94; font-weight: 950; }
    .mmd-renewal-premium-card-copy p { margin: 14px 0 0; color: rgba(255,246,226,.82); line-height: 1.7; }
    .mmd-renewal-premium-layout { display: grid; gap: 18px; margin-top: 12px; }
    .mmd-renewal-premium-panel { border: 1px solid rgba(220,177,87,.18); border-radius: 8px; background: rgba(12,11,9,.80); box-shadow: 0 24px 70px rgba(0,0,0,.30); }
    .mmd-renewal-premium-panel-inner { padding: 18px; }
    .mmd-renewal-premium-heading { margin: 0 0 12px; color: #fff4dc; font-size: 21px; line-height: 1.25; }
    .mmd-renewal-premium-muted { margin: 0; color: #cbbfa9; font-size: 14px; line-height: 1.7; }
    .mmd-renewal-premium-options, .mmd-renewal-premium-upgrade { display: grid; gap: 10px; margin-top: 12px; }
    .mmd-renewal-premium-option { width: 100%; min-height: 98px; padding: 15px; border: 1px solid rgba(255,255,255,.11); border-radius: 8px; background: rgba(255,255,255,.04); color: #f4ead9; text-align: left; cursor: pointer; transition: border-color .2s ease, background .2s ease, transform .2s ease; }
    .mmd-renewal-premium-option:hover, .mmd-renewal-premium-option.is-active { border-color: rgba(222,180,93,.82); background: rgba(222,180,93,.12); transform: translateY(-1px); }
    .mmd-renewal-premium-option strong { display: block; margin-bottom: 6px; color: #fff7e8; font-size: 15px; line-height: 1.25; }
    .mmd-renewal-premium-option span { display: block; color: #d1c4aa; font-size: 13px; line-height: 1.55; }
    .mmd-renewal-premium-upgrade-row { display: grid; gap: 4px; padding: 13px 14px; border: 1px solid rgba(214,179,101,.16); border-radius: 8px; background: rgba(255,255,255,.035); }
    .mmd-renewal-premium-upgrade-row span { color: #d7aa50; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .mmd-renewal-premium-upgrade-row strong { color: #fff6df; font-size: 15px; }
    .mmd-renewal-premium-detail-list { display: grid; gap: 8px; margin-top: 12px; }
    .mmd-renewal-premium-detail-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.08); color: #f2e7d1; font-size: 14px; line-height: 1.45; }
    .mmd-renewal-premium-detail-row span:first-child { color: #b9ad98; }
    .mmd-renewal-premium-actions { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 15px; }
    .mmd-renewal-premium-link { display: inline-flex; min-height: 46px; align-items: center; justify-content: center; padding: 0 16px; border-radius: 8px; border: 1px solid rgba(226,187,104,.48); color: #15100a; background: linear-gradient(135deg, #f5d98f, #c18b34); font-size: 14px; font-weight: 900; text-decoration: none; }
    .mmd-renewal-premium-link-secondary { color: #f3dfb3; background: rgba(255,255,255,.04); }
    .mmd-renewal-premium-form { display: grid; gap: 13px; margin-top: 14px; }
    .mmd-renewal-premium-field { display: grid; gap: 7px; }
    .mmd-renewal-premium-label { color: #e8d8b9; font-size: 13px; font-weight: 800; }
    .mmd-renewal-premium-input, .mmd-renewal-premium-textarea { width: 100%; border: 1px solid rgba(255,255,255,.13); border-radius: 8px; background: rgba(255,255,255,.055); color: #fff8ec; font: inherit; font-size: 15px; line-height: 1.4; padding: 12px 13px; outline: none; }
    .mmd-renewal-premium-textarea { min-height: 92px; resize: vertical; }
    .mmd-renewal-premium-upload { position: relative; display: grid; place-items: center; min-height: 112px; padding: 14px; border: 1px dashed rgba(226,187,104,.45); border-radius: 8px; background: rgba(226,187,104,.055); color: #efdfbd; text-align: center; cursor: pointer; }
    .mmd-renewal-premium-file { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .mmd-renewal-premium-consent { display: flex; gap: 10px; align-items: flex-start; color: #e8dbc0; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-premium-consent input { margin-top: 5px; accent-color: #d7aa50; }
    .mmd-renewal-premium-turnstile { min-height: 70px; }
    .mmd-renewal-premium-turnstile.is-hidden { display: none; }
    .mmd-renewal-premium-submit { min-height: 52px; border: 0; border-radius: 8px; background: linear-gradient(135deg, #f7dc93, #be862f); color: #130e07; cursor: pointer; font-size: 15px; font-weight: 950; }
    .mmd-renewal-premium-submit:disabled { opacity: .64; cursor: wait; }
    .mmd-renewal-premium-status { display: none; margin-top: 14px; padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); color: #f5e6c7; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-premium-status.is-visible { display: block; }
    .mmd-renewal-premium-status.is-success { border-color: rgba(111,210,154,.34); background: rgba(111,210,154,.09); }
    .mmd-renewal-premium-status.is-warning { border-color: rgba(226,187,104,.34); background: rgba(226,187,104,.09); }
    .mmd-renewal-premium-status.is-error { border-color: rgba(232,117,117,.38); background: rgba(232,117,117,.10); }
    .mmd-renewal-premium-status strong { display: block; margin-bottom: 4px; color: #fff4df; font-size: 15px; }
    @media (min-width: 720px) {
      .mmd-renewal-premium-note-grid, .mmd-renewal-premium-options, .mmd-renewal-premium-upgrade, .mmd-renewal-premium-actions { grid-template-columns: repeat(3, 1fr); }
      .mmd-renewal-premium-actions { grid-template-columns: repeat(2, 1fr); }
      .mmd-renewal-premium-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
    }
    @media (min-width: 980px) {
      .mmd-renewal-premium-shell { padding-top: 38px; }
      .mmd-renewal-premium-hero { grid-template-columns: minmax(0, .95fr) minmax(410px, .82fr); }
      .mmd-renewal-premium-layout { grid-template-columns: minmax(0, .96fr) minmax(520px, 1.04fr); align-items: start; }
      .mmd-renewal-premium-panel-inner { padding: 22px; }
    }
    @media (max-width: 719px) {
      .mmd-renewal-premium-shell { width: min(100% - 18px, 1180px); padding-top: 18px; }
      .mmd-renewal-premium-black-card { min-height: 390px; }
      .mmd-renewal-premium-card-image { width: 100%; opacity: .42; }
      .mmd-renewal-premium-card-copy { padding: 22px; }
    }
  </style>
  ${turnstileEnabled ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>' : ""}
</head>
<body class="mmd-renewal-premium">
  <main data-mmd-renewal-premium data-build="${env.SIGIL_FRONTEND_BUILD || BUILD}">
    <div class="mmd-renewal-premium-shell">
      <section class="mmd-renewal-premium-hero" aria-labelledby="mmd-renewal-premium-title">
        <div>
          <span class="mmd-renewal-premium-logo-wrap"><img class="mmd-renewal-premium-logo" src="${SIGIL_LOGO_IMAGE}" alt="SĪGIL logo"></span>
          <p class="mmd-renewal-premium-kicker">SĪGIL Premium Renewal</p>
          <h1 id="mmd-renewal-premium-title" class="mmd-renewal-premium-title">Renew or Upgrade Access</h1>
          <p class="mmd-renewal-premium-lead">Submit a renewal or upgrade request for official review. Choose the access direction that matches your current status, attach proof, and the team will confirm the final amount from official records only.</p>
          <div class="mmd-renewal-premium-note-grid" aria-label="Renewal guidance">
            <div class="mmd-renewal-premium-note"><strong>Official check</strong>Proof is supporting evidence. Approval happens only after verified payment review.</div>
            <div class="mmd-renewal-premium-note"><strong>Upgrade path</strong>Standard Member can request Premium Membership. Current Client can request Black Card / Exclusive.</div>
            <div class="mmd-renewal-premium-note"><strong>Final amount</strong>Special discount tiers are estimates from approximate lifetime spend. Admin Confirmed Amount is final.</div>
          </div>
        </div>
        <div class="mmd-renewal-premium-black-card" aria-label="Black Card renewal visual">
          <img class="mmd-renewal-premium-card-image" src="${BLACK_CARD_IMAGE}" alt="SĪGIL private access visual">
          <div class="mmd-renewal-premium-card-copy">
            <p class="mmd-renewal-premium-card-label">Black Card / Exclusive</p>
            <h2 class="mmd-renewal-premium-card-title">Private access, verified by the team.</h2>
            <p>For upgrades and renewals that need careful review, verified payment, and final admin confirmation before status changes.</p>
          </div>
        </div>
      </section>

      <div class="mmd-renewal-premium-layout">
        <div class="mmd-renewal-premium-panel">
          <div class="mmd-renewal-premium-panel-inner">
            <h2 class="mmd-renewal-premium-heading">Access direction</h2>
            <p class="mmd-renewal-premium-muted">Use this selection to tell the review team what you are requesting. It does not auto-approve an upgrade or discount.</p>
            <div class="mmd-renewal-premium-options" data-mmd-renewal-packages>
              <button class="mmd-renewal-premium-option is-active" type="button" data-renewal-value="premium_membership_upgrade"><strong>Standard Member → Premium Membership</strong><span>For members renewing into a higher membership tier.</span></button>
              <button class="mmd-renewal-premium-option" type="button" data-renewal-value="black_card_exclusive"><strong>Current Client → Black Card / Exclusive</strong><span>For existing clients requesting private access review.</span></button>
              <button class="mmd-renewal-premium-option" type="button" data-renewal-value="special_discount_estimate"><strong>Special discount tier estimate</strong><span>Based on approximate lifetime spend. Final amount is Admin Confirmed Amount.</span></button>
            </div>
            <div class="mmd-renewal-premium-upgrade" aria-label="Upgrade review logic">
              <div class="mmd-renewal-premium-upgrade-row"><span>Membership path</span><strong>Standard Member → Premium Membership</strong></div>
              <div class="mmd-renewal-premium-upgrade-row"><span>Client path</span><strong>Current Client → Black Card / Exclusive</strong></div>
              <div class="mmd-renewal-premium-upgrade-row"><span>Discount review</span><strong>Estimated from lifetime spend; Admin Confirmed Amount is final</strong></div>
            </div>

            <h2 class="mmd-renewal-premium-heading" style="margin-top:22px">Payment method</h2>
            <div class="mmd-renewal-premium-options" data-mmd-renewal-methods>
              <button class="mmd-renewal-premium-option is-active" type="button" data-renewal-value="promptpay_bank_transfer"><strong>PromptPay / Bank Transfer</strong><span>Transfer to the locked renewal account, then attach proof for review.</span></button>
              <button class="mmd-renewal-premium-option" type="button" data-renewal-value="credit_card"><strong>PayPal / Card</strong><span>Card payment may include processing fees. Attach receipt after payment.</span></button>
              <button class="mmd-renewal-premium-option" type="button" data-renewal-value="admin_confirmed_amount"><strong>Admin Confirmed Amount</strong><span>Use when the team has already issued a final amount.</span></button>
            </div>

            <h2 class="mmd-renewal-premium-heading" style="margin-top:22px">Locked renewal payment details</h2>
            <p class="mmd-renewal-premium-muted">Check the account name and final amount before transfer. Status changes only after official verification.</p>
            <div class="mmd-renewal-premium-detail-list">
              <div class="mmd-renewal-premium-detail-row"><span>Bank</span><strong>TTB</strong></div>
              <div class="mmd-renewal-premium-detail-row"><span>Account name</span><strong>ธัชชะ ป</strong></div>
              <div class="mmd-renewal-premium-detail-row"><span>Account number</span><strong>233-2-98800-1</strong></div>
              <div class="mmd-renewal-premium-detail-row"><span>PromptPay</span><strong>082-952-8889</strong></div>
              <div class="mmd-renewal-premium-detail-row"><span>Card note</span><strong>Card payment may include approximately 4%+ processing fee</strong></div>
            </div>
            <div class="mmd-renewal-premium-actions">
              <a class="mmd-renewal-premium-link" href="${PROMPTPAY_URL}" target="_blank" rel="noopener">Open PromptPay</a>
              <a class="mmd-renewal-premium-link mmd-renewal-premium-link-secondary" href="${PAYPAL_URL}" target="_blank" rel="noopener">Open PayPal / Card</a>
            </div>
          </div>
        </div>

        <div class="mmd-renewal-premium-panel">
          <div class="mmd-renewal-premium-panel-inner">
            <h2 class="mmd-renewal-premium-heading">Proof for official review</h2>
            <p class="mmd-renewal-premium-muted">Upload supporting evidence only. The team must verify the real payment record before confirming renewal or upgrade.</p>
            <form class="mmd-renewal-premium-form" data-mmd-renewal-form enctype="multipart/form-data" novalidate>
              <input type="hidden" name="payment_type" value="renewal">
              <input type="hidden" name="session_id" data-mmd-renewal-session-id>
              <input type="hidden" name="payment_ref" data-mmd-renewal-payment-ref>
              <input type="hidden" name="transaction_ref" data-mmd-renewal-transaction-ref>
              <input type="hidden" name="selected_package" value="premium_membership_upgrade" data-mmd-renewal-selected-package>
              <input type="hidden" name="payment_method" value="promptpay_bank_transfer" data-mmd-renewal-payment-method>
              <input type="hidden" name="cf_turnstile_response" data-mmd-renewal-turnstile-token>

              <div class="mmd-renewal-premium-form-grid">
                <label class="mmd-renewal-premium-field"><span class="mmd-renewal-premium-label">Name used in system</span><input class="mmd-renewal-premium-input" name="display_name" autocomplete="name" required></label>
                <label class="mmd-renewal-premium-field"><span class="mmd-renewal-premium-label">Contact channel</span><input class="mmd-renewal-premium-input" name="contact_id" autocomplete="email" required></label>
                <label class="mmd-renewal-premium-field"><span class="mmd-renewal-premium-label">Amount paid / transferred</span><input class="mmd-renewal-premium-input" name="amount_paid" inputmode="decimal" placeholder="Example: 3000" required></label>
                <label class="mmd-renewal-premium-field"><span class="mmd-renewal-premium-label">Payment date and time</span><input class="mmd-renewal-premium-input" name="paid_at" type="datetime-local" required></label>
              </div>
              <label class="mmd-renewal-premium-field"><span class="mmd-renewal-premium-label">Package / discount note</span><input class="mmd-renewal-premium-input" name="package_note" placeholder="Mention lifetime spend estimate or admin quoted amount if applicable"></label>
              <label class="mmd-renewal-premium-field"><span class="mmd-renewal-premium-label">Review note</span><textarea class="mmd-renewal-premium-textarea" name="verification_note" placeholder="Example: transfer from another account name, split payment, or admin quote reference"></textarea></label>
              <label class="mmd-renewal-premium-upload"><span data-mmd-renewal-upload-label>Upload slip / receipt proof up to 12MB</span><input class="mmd-renewal-premium-file" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required data-mmd-renewal-file></label>
              <div class="mmd-renewal-premium-turnstile${turnstileEnabled ? "" : " is-hidden"}" data-mmd-renewal-turnstile><div data-mmd-renewal-turnstile-widget></div></div>
              <label class="mmd-renewal-premium-consent"><input type="checkbox" data-mmd-renewal-consent required><span>I understand that proof/slip is supporting evidence only. Renewal, upgrade, discount, and Black Card status are confirmed only after official verification.</span></label>
              <button class="mmd-renewal-premium-submit" type="submit" data-mmd-renewal-submit>Submit proof for official review</button>
              <div class="mmd-renewal-premium-status" data-mmd-renewal-status role="status" aria-live="polite"></div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </main>
  <script>
  (function () {
    var root = document.querySelector("[data-mmd-renewal-premium]");
    if (!root) return;
    var CONFIG = ${JSON.stringify(config)};
    var form = root.querySelector("[data-mmd-renewal-form]");
    var submit = root.querySelector("[data-mmd-renewal-submit]");
    var statusBox = root.querySelector("[data-mmd-renewal-status]");
    var fileInput = root.querySelector("[data-mmd-renewal-file]");
    var uploadLabel = root.querySelector("[data-mmd-renewal-upload-label]");
    var consent = root.querySelector("[data-mmd-renewal-consent]");
    var turnstileTokenInput = root.querySelector("[data-mmd-renewal-turnstile-token]");
    var turnstileWidgetId = null;
    var turnstileToken = "";
    function tokenPart() {
      var bytes = new Uint8Array(8);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    }
    function renewalRef(prefix) { return prefix + "_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "_" + tokenPart(); }
    function setHidden(selector, value) { var node = root.querySelector(selector); if (node) node.value = value; }
    function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function setStatus(kind, title, text) { statusBox.className = "mmd-renewal-premium-status is-visible is-" + kind; statusBox.innerHTML = "<strong>" + escapeHtml(title) + "</strong>" + escapeHtml(text); }
    function clearStatus() { statusBox.className = "mmd-renewal-premium-status"; statusBox.textContent = ""; }
    function activeOption(groupSelector, hiddenSelector) {
      var group = root.querySelector(groupSelector);
      var hidden = root.querySelector(hiddenSelector);
      if (!group || !hidden) return;
      group.addEventListener("click", function (event) {
        var option = event.target.closest("[data-renewal-value]");
        if (!option || !group.contains(option)) return;
        Array.prototype.forEach.call(group.querySelectorAll("[data-renewal-value]"), function (node) { node.classList.toggle("is-active", node === option); });
        hidden.value = option.getAttribute("data-renewal-value") || "";
      });
    }
    function readErrorCode(payload) {
      if (!payload) return "";
      if (typeof payload.error === "string") return payload.error;
      if (payload.error && payload.error.code) return payload.error.code;
      return payload.code || "";
    }
    function getErrorMessage(code) {
      var map = {
        validation_failed: "Please complete the required fields.",
        required_fields_missing: "Please complete the required fields.",
        missing_required_fields: "Please complete the required fields.",
        file_missing: "Please attach proof before submitting.",
        proof_missing: "Please attach proof before submitting.",
        turnstile_required: "Please complete Turnstile before submitting.",
        turnstile_token_missing: "Please complete Turnstile before submitting.",
        turnstile_failed: "Turnstile failed. Please try again.",
        turnstile_verification_failed: "Turnstile failed. Please try again.",
        turnstile_unconfigured: "Bot protection is not ready. Please contact the team.",
        duplicate_payment_ref: "This proof was already submitted.",
        duplicate: "This proof was already submitted."
      };
      return map[code] || "Submission failed. Please try again.";
    }
    function validateForm() {
      var required = [["display_name", "Please enter your system name."], ["contact_id", "Please enter a contact channel."], ["amount_paid", "Please enter the paid amount."], ["paid_at", "Please enter payment date and time."]];
      for (var i = 0; i < required.length; i += 1) {
        var field = form.elements[required[i][0]];
        if (!field || !String(field.value || "").trim()) { setStatus("error", "Missing information", required[i][1]); if (field && field.focus) field.focus(); return false; }
      }
      var file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (!file) { setStatus("error", "Proof required", "Please attach proof before submitting."); return false; }
      if (file.size > CONFIG.maxFileBytes) { setStatus("error", "File is too large", "Please use a file up to 12MB."); return false; }
      if (CONFIG.turnstileEnabled && !turnstileToken) { setStatus("error", "Turnstile required", "Please complete Turnstile before submitting."); return false; }
      if (!consent || !consent.checked) { setStatus("error", "Confirmation required", "Please confirm that proof is supporting evidence only."); return false; }
      return true;
    }
    function resetTurnstile() {
      turnstileToken = "";
      if (turnstileTokenInput) turnstileTokenInput.value = "";
      if (CONFIG.turnstileEnabled && window.turnstile && turnstileWidgetId !== null) { try { window.turnstile.reset(turnstileWidgetId); } catch (_) {} }
    }
    function renderTurnstile() {
      if (!CONFIG.turnstileEnabled || !window.turnstile) return;
      var container = root.querySelector("[data-mmd-renewal-turnstile-widget]");
      if (!container || turnstileWidgetId !== null) return;
      turnstileWidgetId = window.turnstile.render(container, {
        sitekey: CONFIG.turnstileSiteKey,
        callback: function (token) { turnstileToken = token; if (turnstileTokenInput) turnstileTokenInput.value = token; },
        "expired-callback": function () { resetTurnstile(); },
        "error-callback": function () { turnstileToken = ""; if (turnstileTokenInput) turnstileTokenInput.value = ""; }
      });
    }
    setHidden("[data-mmd-renewal-session-id]", renewalRef("renewal_session"));
    setHidden("[data-mmd-renewal-payment-ref]", renewalRef("renewal_pay"));
    setHidden("[data-mmd-renewal-transaction-ref]", renewalRef("renewal_txn"));
    activeOption("[data-mmd-renewal-packages]", "[data-mmd-renewal-selected-package]");
    activeOption("[data-mmd-renewal-methods]", "[data-mmd-renewal-payment-method]");
    if (fileInput) fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) { uploadLabel.textContent = "Upload slip / receipt proof up to 12MB"; return; }
      uploadLabel.textContent = file.name + " (" + Math.ceil(file.size / 1024) + " KB)";
      if (file.size > CONFIG.maxFileBytes) setStatus("error", "File is too large", "Please use a file up to 12MB.");
      else clearStatus();
    });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearStatus();
      if (!validateForm()) return;
      submit.disabled = true;
      submit.textContent = "Submitting...";
      if (turnstileTokenInput) turnstileTokenInput.value = turnstileToken;
      try {
        var data = new FormData(form);
        data.set("cf_turnstile_response", turnstileToken);
        var response = await fetch(CONFIG.endpoint, { method: "POST", body: data, credentials: "same-origin" });
        var payload = await response.json().catch(function () { return {}; });
        if (payload && payload.duplicate) { setStatus("warning", "Already submitted", "This proof is already waiting for official verification. No need to submit again if the details are correct."); resetTurnstile(); return; }
        if (!response.ok || !payload || payload.ok === false) throw new Error(getErrorMessage(readErrorCode(payload)));
        setStatus("success", "Proof received for official review", "The team will update membership status only after official payment verification.");
        form.reset();
        uploadLabel.textContent = "Upload slip / receipt proof up to 12MB";
        setHidden("[data-mmd-renewal-session-id]", renewalRef("renewal_session"));
        setHidden("[data-mmd-renewal-payment-ref]", renewalRef("renewal_pay"));
        setHidden("[data-mmd-renewal-transaction-ref]", renewalRef("renewal_txn"));
        setHidden("[data-mmd-renewal-selected-package]", "premium_membership_upgrade");
        setHidden("[data-mmd-renewal-payment-method]", "promptpay_bank_transfer");
        Array.prototype.forEach.call(root.querySelectorAll("[data-mmd-renewal-packages] [data-renewal-value]"), function (node, index) { node.classList.toggle("is-active", index === 0); });
        Array.prototype.forEach.call(root.querySelectorAll("[data-mmd-renewal-methods] [data-renewal-value]"), function (node, index) { node.classList.toggle("is-active", index === 0); });
        resetTurnstile();
      } catch (error) {
        setStatus("error", "Submission failed", error && error.message ? error.message : "Network or server error.");
        resetTurnstile();
      } finally {
        submit.disabled = false;
        submit.textContent = "Submit proof for official review";
      }
    });
    if (CONFIG.turnstileEnabled) {
      var timer = setInterval(function () { if (window.turnstile) { clearInterval(timer); renderTurnstile(); } }, 200);
    }
  })();
  </script>
</body>
</html>`;
  return htmlResponse(request, html);
}

function renderPlaceholderPage(request, page, env) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(page.title)} | SĪGIL Preview</title>
  <style>
    body { margin: 0; min-height: 100vh; color: #f8efe1; background: linear-gradient(145deg, #050505, #14100a 52%, #050505); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(980px, calc(100% - 28px)); margin: 0 auto; padding: 42px 0; }
    .shell { border: 1px solid rgba(222, 180, 93, .22); border-radius: 8px; background: rgba(12, 11, 9, .78); padding: clamp(22px, 5vw, 44px); box-shadow: 0 30px 90px rgba(0,0,0,.36); }
    .eyebrow { margin: 0 0 10px; color: #d8aa4d; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    h1 { margin: 0; color: #fff7e8; font-size: clamp(36px, 7vw, 72px); line-height: .95; }
    p { max-width: 680px; color: #e1d4bd; line-height: 1.75; }
    code { display: inline-block; margin-top: 10px; padding: 9px 10px; border-radius: 8px; color: #15100a; background: #e6bd68; font-weight: 800; }
  </style>
</head>
<body data-sigil-frontend-placeholder>
  <main>
    <section class="shell">
      <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.copy)}</p>
      <p>Backend contract remains outside this frontend worker:</p>
      <code>${escapeHtml(page.api)}</code>
    </section>
  </main>
</body>
</html>`;
  return htmlResponse(request, html);
}

function renderNotFound(request, env) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SĪGIL Frontend Not Found</title></head>
<body><main><h1>SĪGIL Frontend route not found</h1><p>Build ${escapeHtml(env.SIGIL_FRONTEND_BUILD || BUILD)}</p></main></body></html>`;
  return htmlResponse(request, html, 404);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
