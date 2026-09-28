/* Source mirror for the Webflow model dashboard job identity claim loader.
 * It only activates when a signed job_claim is present in the LIFF URL/state.
 * External-browser auth must re-enter through the canonical LINE Mini App URL;
 * do not ask LINE Login to redirect back to an arbitrary current Webflow URL.
 */
(() => {
  if (location.pathname !== "/sigil/model/dashboard" || window.__mmdModelClaim) return;
  const url = new URL(location.href);
  const state = url.searchParams.get("liff.state");
  let claim = url.searchParams.get("job_claim") || "";
  if (!claim && state) {
    try {
      claim = new URL(state, "https://mmd.invalid").searchParams.get("job_claim") || "";
    } catch {}
  }
  if (!claim) return;
  window.__mmdModelClaim = 1;

  const MODEL_LIFF_ID = "2010864854-N34SgCqq";
  const MODEL_LIFF_URL = `https://miniapp.line.me/${MODEL_LIFF_ID}`;

  const card = document.createElement("div");
  card.style.cssText = "position:fixed;z-index:100000;inset:auto 14px 14px 14px;max-width:540px;margin:auto;padding:16px;border:1px solid rgba(232,196,119,.4);border-radius:18px;background:rgba(7,8,9,.96);color:#fff8ec;font:14px/1.6 system-ui;box-shadow:0 20px 60px #000";
  card.textContent = "กำลังยืนยัน LINE เพื่อเชื่อมงานกับ MMD APP…";
  document.body.append(card);
  const set = (text) => { card.textContent = text; };

  const miniAppTarget = () => {
    const target = new URL(`${MODEL_LIFF_URL}/`);
    target.searchParams.set("job_claim", claim);
    const lang = url.searchParams.get("lang");
    if (lang) target.searchParams.set("lang", lang);
    return target.toString();
  };

  const loadLiff = () => new Promise((resolve, reject) => {
    if (window.liff) return resolve();
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });

  (async () => {
    try {
      await loadLiff();
      await liff.init({ liffId: MODEL_LIFF_ID });
      if (!liff.isLoggedIn()) {
        if (liff.isInClient?.()) {
          liff.login();
          return;
        }
        location.replace(miniAppTarget());
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error("ยืนยัน LINE ไม่สำเร็จ");
      const response = await fetch("/v1/admin/job/create", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ operational_create_mode: "identity_claim", claim_token: claim, id_token: idToken }),
      });
      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw); } catch {}
      if (response.status === 202 || data.state === "identity_review_required") {
        set(data.message || "ยืนยัน LINE แล้ว · รอ MMD ตรวจเชื่อม Model");
        return;
      }
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || "เชื่อมงานไม่สำเร็จ");
      card.innerHTML = "";
      const message = document.createElement("div");
      message.textContent = data.message || "ยืนยัน LINE และเชื่อมงานสำเร็จ";
      card.append(message);
      if (data.next_url) {
        const link = document.createElement("a");
        link.href = data.next_url;
        link.textContent = "เปิดรายละเอียดงาน";
        link.style.cssText = "display:block;margin-top:10px;color:#f0d78f";
        card.append(link);
      }
    } catch (error) {
      set(error?.message || "เชื่อมงานไม่สำเร็จ กรุณาลองใหม่");
    }
  })();
})();
