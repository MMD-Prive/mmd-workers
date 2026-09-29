import currentWorker from "./mms-line-front-gate.js";
export { KenjiModelIdempotency } from "./mms-line-front-gate.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const AUTH_PROBE_PATHS = new Set([
  "/member/api/liff/status",
  "/member/api/liff/status/",
  "/member/api/liff/profile",
  "/member/api/liff/profile/",
]);
const STATUS_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const RECOVERY_TIMEOUT_FROM_MS = 12_000;
const RECOVERY_TIMEOUT_TO_MS = 18_000;

const UNRESOLVED_APP_ENTER_BLOCK = `    appEntered = true;
    document.body.classList.add("app-entered");
    introContinue.setAttribute("aria-expanded", "true");
    void boot({ existingProfileChecked: true });`;
const UNRESOLVED_PRE_APP_BLOCK = `    show("กำลังตรวจสอบข้อมูลสมาชิกเดิม");
    void boot({ existingProfileChecked: true });`;
const RESOLVED_PROFILE_BLOCK = `        if (started.member_resolved) {
          await readProfile({ hydrate: false });
          void hydrateMemberHome();
        }`;
const RESOLVED_PROFILE_APP_ENTER_BLOCK = `        if (started.member_resolved) {
          appEntered = true;
          document.body.classList.add("app-entered");
          introContinue.setAttribute("aria-expanded", "true");
          await readProfile({ hydrate: false });
          void hydrateMemberHome();
        }`;
const RENDER_SHOW_ANCHOR = `    show(screen.copy || "กำลังตรวจสอบข้อมูลให้ครับ");
    actions.replaceChildren();`;
const RENDER_UNRESOLVED_GATE = `    if (screen.key === "status_unresolved") {
      renderStatusUnresolved(screen);
      return;
    }
    show(screen.copy || "กำลังตรวจสอบข้อมูลให้ครับ");
    actions.replaceChildren();`;
const RENDER_FUNCTION_ANCHOR = "  function render(data) {";

const RECOVERY_MODE_CSS = `
    body.recovery-mode:not(.signup-mode) .member-nav,
    body.recovery-mode:not(.signup-mode) #profile,
    body.recovery-mode:not(.signup-mode) #signup,
    body.recovery-mode:not(.signup-mode) #app-status{display:none!important}
    body.recovery-mode:not(.signup-mode) .intro-screen{display:block!important;min-height:auto!important}
    body.recovery-mode:not(.signup-mode) .intro-continue{display:none!important}
    body.recovery-mode:not(.signup-mode) #actions{display:grid!important;width:min(100% - 52px,680px);max-width:680px;margin:18px 26px max(36px,env(safe-area-inset-bottom));gap:10px}
    body.recovery-mode:not(.signup-mode) #actions .form-stack{display:grid;gap:10px}
    body.recovery-mode:not(.signup-mode) #actions .form-stack label{display:grid;gap:6px;color:#eadcc1;font-size:13px}
    body.recovery-mode:not(.signup-mode) #actions .form-stack button{background:#c9a866;color:#171715;font-weight:800;text-align:center}
`;

const RECOVERY_RENDER_HELPER = `  function renderStatusUnresolved(screen) {
    document.body.classList.remove("app-entered");
    document.body.classList.add("recovery-mode");
    if (introContinue) {
      introContinue.disabled = true;
      introContinue.textContent = "Verify";
    }
    show(screen.copy || "กด Verify เพื่อตรวจข้อมูลสมาชิกเดิม");
    actions.replaceChildren();
    actions.style.setProperty("display", "grid", "important");
    const recoveryAction = (Array.isArray(screen.actions) ? screen.actions : []).find((action) =>
      String(action && action.id || "") === "recovery_evidence"
      && String(action && action.endpoint || "") === "/member/api/liff/recovery"
    );
    const endpoint = String(recoveryAction && recoveryAction.endpoint || "/member/api/liff/recovery");
    const form = document.createElement("form");
    form.className = "form-stack";
    form.setAttribute("aria-label", "Verify old MMD member info");

    const makeInput = (id, label, type, autocomplete) => {
      const row = document.createElement("label");
      row.textContent = label;
      const input = document.createElement("input");
      input.id = id;
      input.name = id;
      input.type = type;
      input.maxLength = id === "nickname" ? 120 : 160;
      input.autocomplete = autocomplete;
      row.append(input);
      return { row, input };
    };

    const email = makeInput("email", "อีเมล", "email", "email");
    const phone = makeInput("phone", "เบอร์", "tel", "tel");
    const nickname = makeInput("nickname", "ชื่อเล่นหรือนามแฝง", "text", "off");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Verify";
    form.append(email.row, phone.row, nickname.row, submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const body = {
        email: email.input.value.trim(),
        phone: phone.input.value.trim(),
        nickname: nickname.input.value.trim(),
      };
      for (const key of Object.keys(body)) if (!body[key]) delete body[key];
      if (!Object.keys(body).length) {
        show("กรอกอีเมล เบอร์ หรือชื่อเล่นหรือนามแฝงอย่างน้อย 1 อย่าง");
        return;
      }
      setBusy(true);
      show("กำลังส่งให้ MMD ตรวจสอบ");
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "accept": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) {
          show(payload?.error?.message || "ตอนนี้ยังส่งข้อมูลไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
          return;
        }
        actions.replaceChildren();
        actions.style.removeProperty("display");
        show("ส่งข้อมูลแล้ว\\nMMD กำลังตรวจสอบข้อมูลสมาชิกเดิม");
      } catch {
        show("ตอนนี้ยังส่งข้อมูลไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
      } finally {
        setBusy(false);
      }
    });

    actions.append(form);
  }

`;

function pathOf(request) {
  try { return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
  catch { return ""; }
}

function requestHadLiffSession(request) {
  const cookie = String(request.headers.get("cookie") || "");
  return cookie.split(";").some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
}

function isAnonymousAuthProbe(request) {
  return request.method === "GET"
    && AUTH_PROBE_PATHS.has(pathOf(request))
    && !requestHadLiffSession(request);
}

function isLiffSessionClearCookie(value) {
  const text = String(value || "");
  return text.includes(`${SESSION_COOKIE}=`) && /Max-Age=0(?:;|$)/i.test(text);
}

function guardAnonymousProbeClearCookie(request, response) {
  if (!isAnonymousAuthProbe(request) || response.status !== 401) return response;
  const setCookie = response.headers.get("set-cookie") || "";
  if (!isLiffSessionClearCookie(setCookie)) return response;

  // An anonymous probe that did not present a LIFF session must not clear a
  // newer session established concurrently by POST /member/api/liff/start.
  // Requests that did present a session still retain the normal fail-closed
  // invalid/expired-session clear behavior from member-pages-worker.
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("x-mmd-liff-cookie-race-guard", "ignored-anonymous-stale-clear-v1");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isStatusShell(request) {
  if (request.method !== "GET" || !STATUS_SHELL_PATHS.has(pathOf(request))) return false;
  try {
    const url = new URL(request.url);
    return String(url.searchParams.get("intent") || url.searchParams.get("liff_intent") || "").trim().toLowerCase() === "status";
  } catch { return false; }
}

function patchStatusUnresolvedRecoveryShell(html) {
  let patched = String(html || "");
  if (!patched.includes(RENDER_FUNCTION_ANCHOR)) return patched;
  if (!patched.includes("status_unresolved")) return patched;

  if (!patched.includes("body.recovery-mode:not(.signup-mode) #actions")) {
    patched = patched.replace("\n  </style>", `${RECOVERY_MODE_CSS}\n  </style>`);
  }
  if (!patched.includes("function renderStatusUnresolved(screen)")) {
    patched = patched.replace(RENDER_FUNCTION_ANCHOR, `${RECOVERY_RENDER_HELPER}${RENDER_FUNCTION_ANCHOR}`);
  }
  patched = patched.replace(UNRESOLVED_APP_ENTER_BLOCK, UNRESOLVED_PRE_APP_BLOCK);
  patched = patched.replaceAll(RESOLVED_PROFILE_BLOCK, RESOLVED_PROFILE_APP_ENTER_BLOCK);
  patched = patched.replace(RENDER_SHOW_ANCHOR, RENDER_UNRESOLVED_GATE);
  return patched;
}

async function extendStatusRecoveryWindow(request, response) {
  if (!isStatusShell(request) || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const original = await response.text();
  const from = `const HARD_TIMEOUT_MS = ${RECOVERY_TIMEOUT_FROM_MS};`;
  const to = `const HARD_TIMEOUT_MS = ${RECOVERY_TIMEOUT_TO_MS};`;
  const extended = original.includes(from) ? original.replaceAll(from, to) : original;
  const html = patchStatusUnresolvedRecoveryShell(extended);
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-hard-timeout-ms", String(RECOVERY_TIMEOUT_TO_MS));
  headers.set("x-mmd-liff-session-race-hotfix", "v1");
  headers.set("x-mmd-liff-unresolved-pre-app", "v1");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env = {}, ctx) {
    let response = await currentWorker.fetch(request, env, ctx);
    response = guardAnonymousProbeClearCookie(request, response);
    response = await extendStatusRecoveryWindow(request, response);
    return response;
  },
};
