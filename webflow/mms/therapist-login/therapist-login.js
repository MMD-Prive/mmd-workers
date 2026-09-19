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
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      const idToken = window.liff.getIDToken();
      if (!idToken) throw new Error("ID_TOKEN_UNAVAILABLE");

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const inviteToken = String(hash.get("invite") || "").trim();
      if (inviteToken) {
        hash.delete("invite");
        const nextHash = hash.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`);
      }

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
        if (code === "THERAPIST_LINK_REQUIRED") {
          setState("LINE นี้ยังไม่ได้เชื่อมกับ Therapist Profile ครับ กรุณาใช้ลิงก์เปิดสิทธิ์ที่ MMS ส่งให้");
        } else if (code === "THERAPIST_ACCESS_DENIED") {
          setState("บัญชีนี้ยังเข้า Therapist Dashboard ไม่ได้ครับ กรุณาติดต่อ MMS");
        } else {
          setState("MMS ยังยืนยันตัวตนให้ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
        }
        return;
      }

      const next = String(payload?.data?.next_route || postLoginRoute);
      window.location.assign(next.startsWith("/male-massage/therapists/") ? next : postLoginRoute);
    } catch {
      setState("MMS ยังยืนยันตัวตนให้ไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  button.addEventListener("click", authenticate);
})();
