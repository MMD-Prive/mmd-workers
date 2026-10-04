(() => {
  "use strict";

  const root = document.getElementById("mms-therapist-login");
  if (!root) return;

  const button = root.querySelector("[data-mms-therapist-line-login]");
  const stateCopy = root.querySelector("[data-auth-state-copy]");
  if (!button) return;

  const ready = root.dataset.authReady === "true";
  const liffId = String(root.dataset.liffId || "").trim();
  const authEndpoint = String(root.dataset.authEndpoint || "").trim();
  const postLoginRoute = String(root.dataset.postLoginRoute || "/male-massage/therapists/me").trim();

  const setState = (text) => {
    if (stateCopy) stateCopy.textContent = text;
  };

  const setBusy = (busy) => {
    button.disabled = busy;
    button.dataset.busy = busy ? "true" : "false";
  };

  if (!ready || !liffId || !authEndpoint) {
    button.setAttribute("aria-disabled", "true");
    button.dataset.ready = "false";
    setState("MMS กำลังเชื่อม Therapist Access ให้ครับ · ยังไม่เปิดใช้งานบน Production");
    button.addEventListener("click", (event) => event.preventDefault());
    return;
  }

  button.setAttribute("aria-disabled", "false");
  button.dataset.ready = "true";
  setState("ยืนยันตัวตนผ่าน LINE เพื่อเข้าสู่พื้นที่ Therapist ของคุณ");

  const pageUrl = new URL(window.location.href);
  const storageKey = "mms-therapist-invite-v1";
  const recoveryKey = "mms-therapist-line-recovery-v1";
  const storage = {
    get(key) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { window.sessionStorage.setItem(key, value); } catch {} },
    remove(key) { try { window.sessionStorage.removeItem(key); } catch {} },
  };
  const nested = new URL(pageUrl.searchParams.get("liff.state") || pageUrl.searchParams.get("liff_state") || pageUrl.pathname, pageUrl.origin);
  let inviteToken = pageUrl.searchParams.get("invite") || new URLSearchParams(pageUrl.hash.slice(1)).get("invite") || nested.searchParams.get("invite") || new URLSearchParams(nested.hash.slice(1)).get("invite") || "";
  if (inviteToken) storage.set(storageKey, JSON.stringify({ token: inviteToken, until: Date.now() + 30 * 60 * 1000 }));
  else {
    try { const saved = JSON.parse(storage.get(storageKey)); if (saved?.until > Date.now()) inviteToken = saved.token || ""; else storage.remove(storageKey); } catch { storage.remove(storageKey); }
  }
  const redirect = new URL("/male-massage/therapists/login", pageUrl.origin);
  if (inviteToken) redirect.hash = new URLSearchParams({ invite: inviteToken }).toString();
  function recoverLine() {
    if (storage.get(recoveryKey) || pageUrl.searchParams.get("line_recovery") === "1") {
      setState("LINE ยังยืนยันบัญชีไม่ได้ครับ ติดต่อพี่เปอร์เพื่อตรวจ LINE Login"); return;
    }
    storage.set(recoveryKey, "1"); redirect.searchParams.set("line_recovery", "1");
    window.liff.logout(); window.liff.login({ redirectUri: redirect.href });
  }

  async function authenticate() {
    if (!window.liff || typeof window.liff.init !== "function") {
      setState("ตอนนี้ยังเริ่ม LINE Login ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    setBusy(true);
    setState("MMS กำลังยืนยัน LINE ให้ครับ...");

    try {
      await window.liff.init({ liffId });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: redirect.href });
        return;
      }

      const idToken = window.liff.getIDToken();
      if (!idToken) { recoverLine(); return; }

      const response = await fetch(authEndpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_token: idToken,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        }),
      });

      let payload = null;
      try { payload = await response.json(); } catch {}

      if (!response.ok) {
        const code = String(payload?.error?.code || "");
        if (code === "LINE_ID_TOKEN_INVALID") {
          recoverLine();
        } else if (code === "THERAPIST_LINK_REQUIRED") {
          setState("LINE นี้ยังไม่ได้เชื่อมกับ Therapist Profile ครับ กรุณาใช้ลิงก์เปิดสิทธิ์ที่ MMS ส่งให้");
        } else if (code === "THERAPIST_ACCESS_DENIED") {
          setState("บัญชีนี้ยังเข้า Therapist Dashboard ไม่ได้ครับ กรุณาติดต่อ MMS");
        } else {
          setState("MMS ยังยืนยันตัวตนให้ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
        }
        return;
      }

      storage.remove(storageKey); storage.remove(recoveryKey);
      window.history.replaceState(null, "", pageUrl.pathname);
      const next = String(payload?.data?.next_route || postLoginRoute);
      window.location.assign(next.startsWith("/male-massage/therapists/") ? next : postLoginRoute);
    } catch {
      setState("MMS ยังยืนยันตัวตนให้ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  button.addEventListener("click", authenticate);
  if (["code", "liff.state", "liff_state"].some(key => pageUrl.searchParams.has(key))) authenticate();
})();

