import { renderCreateSessionPage, type InternalPageEnv } from "./internal-pages";

export interface OwnerCreateSessionEnv extends InternalPageEnv {
  ASSETS?: Fetcher;
}

const OWNER_HTML_ASSET = "/a/create-sessions-owner-v14.html";
const OWNER_CSS_ASSET = "/a/create-sessions-owner-v14.css";

const IMAGE_ASSETS: Record<string, string> = {
  hero: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c4422fc65b7aff00115_Admin%20CS%201.webp",
  findClient: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c44eecbadd1d6e6658b_Admin%20CS%202.webp",
  workType: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c4471a42a59c975e459_Admin%20CS%203.webp",
  selectModel: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c442a6dee9e17d06ae0_Admin%20CS%206.webp",
  readiness: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c446a094d32e0f9110d_Admin%20CS%207.webp",
  enterDetails: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c443052977cb156a5f0_Admin%20CS%208.webp",
  review: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c44585299f4856ca931_Admin%20CS%209.webp",
  lane: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a34e69469eb00a39622b4_Admin%20CS%205.webp",
};

const COMPAT_CSS = `
html,body{margin:0;min-height:100%;background:#06060a}
body{min-height:100vh}
.mmd-cs-v14 [hidden]{display:none!important}
.mmd-cs-v14 .is-ok{color:var(--ok)!important;border-color:rgba(116,215,160,.32)!important}
.mmd-cs-v14 .is-warn{color:var(--warn)!important;border-color:rgba(239,204,121,.30)!important}
.mmd-cs-v14 .is-bad{color:var(--danger)!important;border-color:rgba(222,133,133,.32)!important}
.mmd-cs-v14__light i.is-ok{background:var(--ok);box-shadow:0 0 12px rgba(116,215,160,.55)}
.mmd-cs-v14__light i.is-warn{background:var(--warn);box-shadow:0 0 12px rgba(239,204,121,.45)}
.mmd-cs-v14__light i.is-bad{background:var(--danger);box-shadow:0 0 12px rgba(222,133,133,.45)}
.mmd-cs-v14__connection{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 11px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.025);color:var(--text-dim);font-size:11px;font-weight:800}
.mmd-cs-v14__connection>i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.22)}
.mmd-cs-v14__connection.is-ok>i{background:var(--ok)}
.mmd-cs-v14__connection.is-warn>i{background:var(--warn)}
.mmd-cs-v14__connection.is-bad>i{background:var(--danger)}
.mmd-cs-v14__mode{color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
.mmd-cs-v14__compatFields{margin-top:14px}
.mmd-cs-v14__compatHidden{display:none!important}
.mmd-cs-v14__select{width:100%;min-height:52px;padding:0 14px;border-radius:16px;border:1px solid var(--line);background:rgba(8,8,13,.78);color:var(--text);font:inherit;outline:none}
.mmd-cs-v14__modelSelectWrap{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin-top:14px}
.mmd-cs-v14__modelSelectWrap .mmd-cs-v14__field{margin:0}
.mmd-cs-v14__runtimeCard{margin-top:12px;padding:14px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025)}
.mmd-cs-v14 .mmdop__empty{min-height:92px;display:grid;place-items:center;text-align:center;padding:18px;border:1px dashed var(--line);border-radius:18px;background:rgba(255,255,255,.022);color:var(--text-dim)}
.mmd-cs-v14 .mmdop__clientCard{width:100%;display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:13px;align-items:center;padding:15px;border:1px solid var(--line);border-radius:20px;background:rgba(8,8,13,.55);color:var(--text);text-align:left;cursor:pointer}
.mmd-cs-v14 .mmdop__clientCard+.mmdop__clientCard{margin-top:8px}
.mmd-cs-v14 .mmdop__clientCard.is-selected{border-color:rgba(212,181,106,.55);background:rgba(212,181,106,.07)}
.mmd-cs-v14 .mmdop__clientAvatar,.mmd-cs-v14 .mmdop__modelIcon{width:52px;height:52px;border-radius:17px;display:grid;place-items:center;border:1px solid rgba(212,181,106,.24);background:rgba(212,181,106,.08);color:var(--gold-soft);font-weight:950}
.mmd-cs-v14 .mmdop__clientMain strong,.mmd-cs-v14 .mmdop__modelCard strong{display:block;font-size:15px}
.mmd-cs-v14 .mmdop__clientMain span,.mmd-cs-v14 .mmdop__modelCard span{display:block;margin-top:4px;color:var(--text-dim);font-size:11px;line-height:1.45}
.mmd-cs-v14 .mmdop__tags{display:flex;justify-content:flex-end;gap:5px;flex-wrap:wrap}
.mmd-cs-v14 .mmdop__tag{min-height:25px;padding:0 8px;display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;color:var(--text-dim);font-size:10px;font-weight:800}
.mmd-cs-v14 .mmdop__tag--gold{color:var(--gold-soft);border-color:rgba(212,181,106,.28);background:rgba(212,181,106,.06)}
.mmd-cs-v14 .mmdop__tag--green{color:#dff8e8;border-color:rgba(116,215,160,.25);background:rgba(116,215,160,.06)}
.mmd-cs-v14 .mmdop__folder{min-height:155px;padding:18px;border:1px solid var(--line);border-radius:20px;background:radial-gradient(circle at 90% 0,rgba(212,181,106,.11),transparent 40%),rgba(255,255,255,.024);color:var(--text);text-align:left;cursor:pointer}
.mmd-cs-v14 .mmdop__folder+.mmdop__folder{margin-left:8px}
.mmd-cs-v14 [data-op-folder-grid]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mmd-cs-v14 .mmdop__folder span{display:block;color:var(--gold);font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.mmd-cs-v14 .mmdop__folder strong{display:block;margin-top:12px;font-size:28px;line-height:1}
.mmd-cs-v14 .mmdop__folder p{margin:10px 0 0;color:var(--text-dim);font-size:11px;line-height:1.55}
.mmd-cs-v14 .mmdop__folder em{display:inline-flex;margin-top:13px;color:var(--gold-soft);font-size:10px;font-style:normal;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
.mmd-cs-v14 .mmdop__folder.is-selected{border-color:rgba(212,181,106,.54);background:rgba(212,181,106,.07)}
.mmd-cs-v14 .mmdop__modelCard{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:13px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:18px;background:rgba(8,8,13,.55)}
.mmd-cs-v14 .mmdop__modelCard b{color:var(--gold);font-size:10px;text-transform:uppercase}
.mmd-cs-v14__readyBox{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;margin-top:12px;padding:14px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.022)}
.mmd-cs-v14__readyBox strong{display:block;font-size:13px}.mmd-cs-v14__readyBox p{margin:5px 0 0;font-size:11px}
.mmd-cs-v14__urlGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
.mmd-cs-v14__urlGrid label{display:grid;gap:6px;color:var(--text-dim);font-size:11px}
.mmd-cs-v14__urlGrid input{width:100%;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:13px;background:rgba(8,8,13,.7);color:var(--text)}
@media(max-width:760px){.mmd-cs-v14 [data-op-folder-grid],.mmd-cs-v14__urlGrid,.mmd-cs-v14__modelSelectWrap{grid-template-columns:1fr}.mmd-cs-v14 .mmdop__folder+.mmdop__folder{margin-left:0}.mmd-cs-v14 .mmdop__clientCard,.mmd-cs-v14 .mmdop__modelCard{grid-template-columns:52px 1fr}.mmd-cs-v14 .mmdop__tags{grid-column:1/-1;justify-content:flex-start}}
`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addAttrToId(html: string, id: string, attr: string): string {
  const pattern = new RegExp(`id=["']${escapeRegExp(id)}["']`, "i");
  return html.replace(pattern, (match) => `${match} ${attr}`);
}

function addAttrToMarker(html: string, marker: string, attr: string): string {
  return html.replace(marker, `${marker} ${attr}`);
}

function addImageSource(html: string, key: string, src: string): string {
  const marker = `data-cs-media="${key}"`;
  return html.replace(marker, `${marker} src="${src}"`);
}

function transformOwnerHtml(source: string): string {
  let html = source;

  html = html.replace(
    '<section class="mmd-cs-v14" data-cs-root data-admin-base="https://mmdbkk.com">',
    '<section class="mmd-cs-v14" data-cs-root data-mmd-create-session-pro data-admin-base="">'
  );

  const markerAttrs: Array<[string, string]> = [
    ["data-cs-search", "data-op-client-query"],
    ["data-cs-member-results", "data-op-client-results"],
    ["data-cs-selected-client-name", "data-op-selected-client-name"],
    ["data-cs-selected-client-meta", "data-op-selected-client-meta"],
    ["data-cs-selected-confidence", "data-op-selected-confidence"],
    ["data-cs-client-initial", "data-op-client-initial"],
    ["data-cs-member-notice", "data-op-lineage-notice"],
    ["data-cs-lane-shell", "data-op-folder-grid"],
    ["data-cs-lane-note", "data-op-folder-helper"],
    ["data-cs-gate-label", "data-op-gate-label"],
    ["data-cs-gate-notice", "data-op-gate-notice"],
    ["data-cs-next-action", "data-op-next-action"],
    ["data-cs-next-copy", "data-op-next-copy"],
    ["data-cs-status", "data-op-status"],
    ["data-cs-sum-client", "data-op-stat-client"],
    ["data-cs-sum-work", "data-op-stat-work"],
    ["data-cs-sum-folder", "data-op-stat-folder data-op-rail-folder"],
    ["data-cs-sum-model", "data-op-stat-model"],
    ["data-cs-sum-gate", "data-op-stat-gate"],
    ["data-cs-output", "data-op-output"],
    ["data-cs-out-session", "data-op-out-session-id"],
    ["data-cs-out-payment", "data-op-out-payment-ref"],
  ];
  for (const [marker, attr] of markerAttrs) html = addAttrToMarker(html, marker, attr);

  const idAttrs: Array<[string, string]> = [
    ["csClientName", "data-op-client-name"],
    ["csUsername", "data-op-username"],
    ["csPackage", "data-op-package"],
    ["csMembershipStatus", "data-op-membership-status"],
    ["csModelLookupKey", "data-op-model-lookup-key"],
    ["csModelPool", "data-op-model-pool"],
    ["csCustomerTelegram", "data-op-customer-telegram"],
    ["csCustomerTelegramStatus", "data-op-customer-telegram-status"],
    ["csModelTelegram", "data-op-model-telegram"],
    ["csModelTelegramStatus", "data-op-model-telegram-status"],
    ["csDate", "data-op-date"],
    ["csStart", "data-op-start"],
    ["csDuration", "data-op-duration"],
    ["csEnd", "data-op-end"],
    ["csLocation", "data-op-location"],
    ["csMap", "data-op-map"],
    ["csAmount", "data-op-amount"],
    ["csAssignedPerson", "data-op-human-assistant"],
    ["csHandlingNote", "data-op-handling-note"],
    ["csOperationNote", "data-op-note"],
    ["csOutCustomerMessage", "data-op-out-customer-message"],
    ["csOutModelMessage", "data-op-out-model-message"],
  ];
  for (const [id, attr] of idAttrs) html = addAttrToId(html, id, attr);

  const directReplacements: Array<[string, string]> = [
    ['data-cs-action="check-auth"', 'data-cs-action="check-auth" data-op-check-session'],
    ['data-cs-action="member-search"', 'data-cs-action="member-search" data-op-search-client'],
    ['data-cs-action="recent-members"', 'data-cs-action="recent-members" data-op-load-recent'],
    ['data-cs-action="reload-models"', 'data-cs-action="reload-models" data-op-refresh-models'],
    ['data-cs-action="save-draft"', 'data-cs-action="save-draft" data-op-save-draft'],
    ['data-cs-action="reset"', 'data-cs-action="reset" data-op-new'],
    ['data-cs-action="create-session"', 'data-cs-action="create-session" data-op-create'],
    ['data-cs-action="copy-customer-message"', 'data-cs-action="copy-customer-message" data-op-copy-customer-msg'],
    ['data-cs-action="copy-model-message"', 'data-cs-action="copy-model-message" data-op-copy-model-msg'],
    ['data-cs-action="send-customer-dm"', 'data-cs-action="send-customer-dm" data-op-push-line'],
    ['data-cs-work="public"', 'data-cs-work="public" data-op-work-type="public"'],
    ['data-cs-work="private"', 'data-cs-work="private" data-op-work-type="private"'],
    ['data-cs-hook="auth"', 'data-cs-hook="auth" data-op-hook="auth"'],
    ['data-cs-hook="member"', 'data-cs-hook="member" data-op-hook="lineage"'],
    ['data-cs-hook="models"', 'data-cs-hook="models" data-op-hook="models"'],
    ['data-cs-hook="create"', 'data-cs-hook="create" data-op-hook="create"'],
    ['data-cs-hook="telegram"', 'data-cs-hook="telegram" data-op-hook="push"'],
  ];
  for (const [from, to] of directReplacements) html = html.replace(from, to);

  for (const [key, src] of Object.entries(IMAGE_ASSETS)) {
    if (key === "lane") continue;
    html = addImageSource(html, key, src);
  }
  html = html.replace('data-cs-lane-image alt="เลือก lane"', `data-cs-lane-image src="${IMAGE_ASSETS.lane}" alt="เลือก lane"`);

  html = html.replace(
    '<div class="mmd-cs-v14__lights" aria-label="System status">',
    '<div class="mmd-cs-v14__lights" aria-label="System status"><span class="mmd-cs-v14__connection" data-op-connection><i></i><span>Checking</span></span>'
  );

  html = html.replace(
    '<div class="mmd-cs-v14__toolbarActions">',
    '<div class="mmd-cs-v14__toolbarActions"><a class="mmd-cs-v14__btn" href="/internal/admin/control-room">control room</a><button class="mmd-cs-v14__btn" type="button" data-op-demo-client>demo</button><button class="mmd-cs-v14__btn" type="button" data-op-clear-client>clear client</button>'
  );

  html = html.replace(
    '<p class="mmd-cs-v14__statusCopy" data-cs-status data-op-status>ยังไม่ได้เชื่อม auth</p>',
    '<div><span class="mmd-cs-v14__mode" data-op-search-mode>Cloud</span><p class="mmd-cs-v14__statusCopy" data-cs-status data-op-status>กำลังตรวจ admin session</p></div>'
  );

  html = html.replace(
    '<div class="mmd-cs-v14__summaryCard">\n            <span>work</span>',
    '<div class="mmd-cs-v14__summaryCard"><span>package</span><strong data-op-stat-package>-</strong><small>package / membership tier</small></div><div class="mmd-cs-v14__summaryCard">\n            <span>work</span>'
  );
  html = html.replace(
    '</div>\n        </div>\n      </div>\n\n      <div class="mmd-cs-v14__heroArt">',
    '</div><div class="mmd-cs-v14__summaryCard"><span>status</span><strong data-op-stat-status>Not ready</strong><small>current create readiness</small></div>\n        </div>\n      </div>\n\n      <div class="mmd-cs-v14__heroArt">'
  );

  html = html.replace(
    '<div class="mmd-cs-v14__pickedCard">',
    '<div class="mmd-cs-v14__pickedCard"><span class="mmd-cs-v14__readinessPill" data-op-lineage-badge>Not selected</span>'
  );

  html = html.replace(
    '<div class="mmd-cs-v14__notice" data-cs-member-notice data-op-lineage-notice>ยังไม่ได้เลือกลูกค้า</div>',
    `<div class="mmd-cs-v14__fields mmd-cs-v14__fields--4 mmd-cs-v14__compatFields">
      <label class="mmd-cs-v14__field"><span>LINE display</span><input data-op-line-display type="text" readonly /></label>
      <label class="mmd-cs-v14__field"><span>LINE user ID</span><input data-op-line-user-id type="text" readonly /></label>
      <label class="mmd-cs-v14__field"><span>LINE record ID</span><input data-op-line-record-id type="text" readonly /></label>
      <label class="mmd-cs-v14__field"><span>Legacy tags</span><input data-op-legacy-tags type="text" readonly /></label>
    </div><div class="mmd-cs-v14__notice" data-cs-member-notice data-op-lineage-notice>ยังไม่ได้เลือกลูกค้า</div>`
  );

  html = html.replace(
    '<div class="mmd-cs-v14__resultList mmd-cs-v14__resultList--models" data-cs-model-results>',
    `<div class="mmd-cs-v14__modelSelectWrap"><label class="mmd-cs-v14__field"><span>Model จาก entitlement-aware pool</span><select class="mmd-cs-v14__select" data-op-model-select><option value="">เลือกกลุ่มก่อน</option></select></label><div class="mmd-cs-v14__mode" data-op-model-rule>-</div></div><div class="mmd-cs-v14__resultList mmd-cs-v14__resultList--models mmd-cs-v14__compatHidden" data-cs-model-results>`
  );
  html = html.replace('<div class="mmd-cs-v14__inlinePicked">', '<div class="mmd-cs-v14__inlinePicked" data-op-model-preview>');

  html = html.replace(
    '<div class="mmd-cs-v14__fields mmd-cs-v14__fields--2">\n                <label class="mmd-cs-v14__field">\n                  <span>Google Map URL</span>',
    `<input type="hidden" data-op-payment-type value="full" />
      <input type="hidden" data-op-payment-method value="promptpay" />
      <input type="hidden" data-op-points-mode value="auto" />
      <input type="hidden" data-op-escalation-owner value="Boss Per" />
      <div class="mmd-cs-v14__fields mmd-cs-v14__fields--2">\n                <label class="mmd-cs-v14__field">\n                  <span>Google Map URL</span>`
  );

  html = html.replace(
    '<div class="mmd-cs-v14__dockActions">',
    '<div class="mmd-cs-v14__dockActions"><button type="button" class="mmd-cs-v14__btn" data-op-fill-demo>fill demo</button>'
  );
  html = html.replace(
    '</div>\n    </div>\n\n    <section class="mmd-cs-v14__section mmd-cs-v14__section--output"',
    '</div><div class="mmd-cs-v14__readyBox"><div><strong data-op-ready-label>กำลังตรวจความพร้อม</strong><p data-op-ready-copy>ระบบจะเปิด Create เมื่อข้อมูลจำเป็นครบ</p></div><button type="button" class="mmd-cs-v14__btn" data-op-debug-toggle>debug</button></div>\n    </div>\n\n    <section class="mmd-cs-v14__section mmd-cs-v14__section--output"'
  );

  html = html.replace('data-cs-out-status', 'data-cs-out-status data-op-out-line-status');
  html = html.replace('data-cs-out-notify', 'data-cs-out-notify data-op-out-telegram-status');
  html = html.replace(
    '<div class="mmd-cs-v14__outputActions">',
    `<div class="mmd-cs-v14__urlGrid">
      <label>Customer confirmation<input readonly data-op-out-customer-url /></label>
      <label>Model confirmation<input readonly data-op-out-model-url /></label>
      <label>Member return<input readonly data-op-out-member-url /></label>
      <label>Model return<input readonly data-op-out-model-return-url /></label>
    </div><div class="mmd-cs-v14__outputActions"><button type="button" class="mmd-cs-v14__btn" data-op-copy-customer-link>copy customer link</button><button type="button" class="mmd-cs-v14__btn" data-op-copy-model-link>copy model link</button>`
  );
  html = html.replace('send customer dm</button>', 'send customer LINE</button>');
  html = html.replace('send model dm</button>', 'model message ready</button>');

  html = html.replace(
    '<div class="mmd-cs-v14__toast" data-cs-toast></div>',
    '<section class="mmd-cs-v14__section mmd-cs-v14__compatHidden" data-op-debug-panel hidden><pre data-op-payload>{}</pre></section><p class="mmd-cs-v14__compatHidden" data-op-rail-folder-copy></p><div class="mmd-cs-v14__toast" data-cs-toast></div>'
  );

  html = html.replace('class="mmd-cs-v14__section mmd-cs-v14__section--search"', 'id="client-search" class="mmd-cs-v14__section mmd-cs-v14__section--search"');
  html = html.replace('<section class="mmd-cs-v14__section">\n          <div class="mmd-cs-v14__sectionHead">\n            <div class="mmd-cs-v14__sectionCopy">\n              <span>step 02</span>', '<section id="work-panel" class="mmd-cs-v14__section">\n          <div class="mmd-cs-v14__sectionHead">\n            <div class="mmd-cs-v14__sectionCopy">\n              <span>step 02</span>');
  html = html.replace('class="mmd-cs-v14__section mmd-cs-v14__section--models"', 'id="model-panel" class="mmd-cs-v14__section mmd-cs-v14__section--models"');
  html = html.replace('<section class="mmd-cs-v14__section">\n          <div class="mmd-cs-v14__sectionHead">\n            <div class="mmd-cs-v14__sectionCopy">\n              <span>system check</span>', '<section id="gate-panel" class="mmd-cs-v14__section">\n          <div class="mmd-cs-v14__sectionHead">\n            <div class="mmd-cs-v14__sectionCopy">\n              <span>system check</span>');

  return html;
}

async function readAssetText(request: Request, env: OwnerCreateSessionEnv, path: string): Promise<string> {
  if (!env.ASSETS) return "";
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  const response = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET" }));
  if (!response.ok) return "";
  return response.text();
}

export async function renderOwnerCreateSessionPage(request: Request, env: OwnerCreateSessionEnv): Promise<Response> {
  const [sourceHtml, sourceCss] = await Promise.all([
    readAssetText(request, env, OWNER_HTML_ASSET),
    readAssetText(request, env, OWNER_CSS_ASSET),
  ]);

  if (!sourceHtml || !sourceCss) {
    const fallback = renderCreateSessionPage(env);
    const headers = new Headers(fallback.headers);
    headers.set("x-mmd-create-session-ui", "fallback-current-runtime");
    return new Response(fallback.body, { status: fallback.status, statusText: fallback.statusText, headers });
  }

  const body = transformOwnerHtml(sourceHtml);
  const page = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<meta name="theme-color" content="#06060a" />
<title>MMD Privé · Create Session</title>
<style>${sourceCss}\n${COMPAT_CSS}</style>
</head>
<body>
${body}
<script>window.MMD_CREATE_SESSION_CONFIG={adminBase:location.origin};</script>
<script src="/a/create-session.js?v=owner-v14-vnext2" defer></script>
</body>
</html>`;

  return new Response(page, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-mmd-create-session-ui": "owner-v14-vnext2-restored",
      "x-mmd-create-session-runtime": "current-entitlement-aware",
      "x-mmd-create-session-interface": "guided-simple-v2",
    },
  });
}
