/* Partner introduction LV15. This page prepares a local message; it never submits a request. */
(function () {
  "use strict";
  const root = document.getElementById("mmd-referral-v7");
  if (!root || root.dataset.referralVersion !== "15" || root.dataset.rf15Ready) return;
  const q = (selector) => root.querySelector(selector);
  const qa = (selector) => Array.from(root.querySelectorAll(selector));
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 899px)");
  function tr(key, fallback) {
    try {
      const value = window.MMD_I18N && window.MMD_I18N.t("partner.referral." + key, { root: root });
      return typeof value === "string" && value.trim() ? value : fallback;
    } catch (_) { return fallback; }
  }

  // Only explicitly tagged, same-origin Partner destinations receive the existing token.
  const token = new URLSearchParams(window.location.search).get("t");
  const routes = new Set([
    "/partner", "/partner/model", "/partner/dashboard", "/partner/terms", "/partner/apply",
    "/partner/model/recommend-model", "/partner/model/recommend-model/fee"
  ]);
  if (token) qa("a[data-rf15-partner-link]").forEach((link) => {
    try {
      const url = new URL(link.getAttribute("href"), window.location.origin);
      if (url.origin === window.location.origin && routes.has(url.pathname)) {
        url.searchParams.set("t", token);
        link.setAttribute("href", url.pathname + url.search + url.hash);
      }
    } catch (_) { /* A malformed optional link must not block the page. */ }
  });

  const tablist = q("[data-rf15-tabs]");
  const tabs = qa("[data-rf15-tab]");
  const panels = qa("[data-rf15-panel]");
  let selected = 0;
  function selectMethod(index, focus, animate) {
    if (!tabs[index]) return;
    selected = index;
    const name = tabs[index].dataset.rf15Tab;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.rf15Panel !== name; });
    const panel = panels.find((item) => item.dataset.rf15Panel === name);
    if (focus) tabs[index].focus({ preventScroll: true });
    if (panel && animate && !motion.matches && panel.animate) {
      panel.getAnimations().forEach((animation) => animation.cancel());
      panel.animate([{ opacity: .45, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], {
        duration: 260, easing: "cubic-bezier(.22,1,.36,1)"
      });
    }
    scheduleScroll();
  }
  if (tablist && tabs.length === 4 && panels.length === 4 && tabs.every((tab) => panels.some((p) => p.dataset.rf15Panel === tab.dataset.rf15Tab))) {
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-orientation", "horizontal");
    tabs.forEach((tab, index) => {
      const panel = panels.find((item) => item.dataset.rf15Panel === tab.dataset.rf15Tab);
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;
      tab.addEventListener("click", () => selectMethod(index, false, true));
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (selected + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (selected + tabs.length - 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        selectMethod(next, true, true);
      });
    });
    tablist.hidden = false;
    root.dataset.rf15TabsReady = "1";
    // Scroll setup is initialized below; initial selection needs no scheduling.
    tabs.forEach((tab, index) => { tab.setAttribute("aria-selected", String(index === 0)); tab.tabIndex = index === 0 ? 0 : -1; });
    panels.forEach((panel) => { panel.hidden = panel.dataset.rf15Panel !== tabs[0].dataset.rf15Tab; });
  }

  const compose = q("[data-rf15-compose]");
  const menu = q(".rf15-menu");
  function revealHash(hash) {
    if (hash === "#referral-submit" && compose) compose.open = true;
  }
  revealHash(window.location.hash);
  window.addEventListener("hashchange", () => { revealHash(window.location.hash); scheduleScroll(); });
  qa('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");
    const target = document.getElementById(hash.slice(1));
    if (!target || !root.contains(target) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (menu) menu.open = false;
    window.history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    revealHash(hash);
    const focusTarget = target === compose ? target.querySelector("summary") : target;
    if (focusTarget) {
      if (!focusTarget.matches("a,button,input,select,textarea,summary,[tabindex]")) focusTarget.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
    }
    target.scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "start" });
    scheduleScroll();
  }));
  if (menu) {
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary").focus();
        event.preventDefault();
      }
    });
    document.addEventListener("pointerdown", (event) => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { menu.open = false; }));
  }
  qa("details").forEach((details) => details.addEventListener("toggle", () => {
    scheduleScroll();
    if (!details.open || motion.matches) return;
    const body = details.querySelector(".rf15-details-body,.rf15-compose-body,[data-rf15-details-body]");
    if (body && body.animate) body.animate([{ opacity: .5, transform: "translateY(-4px)" }, { opacity: 1, transform: "translateY(0)" }], {
      duration: 250, easing: "cubic-bezier(.22,1,.36,1)"
    });
  }));

  const form = q("[data-referral-form]");
  const fields = q("[data-rf15-fields]");
  const prepare = q("[data-rf15-prepare]");
  const status = q("[data-rf15-form-status]");
  const draftPanel = q("[data-rf15-draft]");
  const draftText = q("[data-rf15-draft-text]");
  const copyButton = q("[data-rf15-copy]");
  const lineLink = q("[data-rf15-line]");
  let currentDraft = "";
  function say(message) { if (status) status.textContent = message; }
  function selectedText(name) {
    const field = form && form.elements.namedItem(name);
    return field && field.selectedOptions && field.selectedOptions[0] ? field.selectedOptions[0].textContent.trim() : "";
  }
  function invalidateDraft() {
    if (!currentDraft) return;
    currentDraft = "";
    if (draftPanel) draftPanel.hidden = true;
    if (copyButton) copyButton.disabled = false;
    say(tr("form.changed", "ข้อมูลเปลี่ยนแล้ว กดเตรียมข้อความอีกครั้งก่อนส่งครับ"));
  }
  if (form && fields && prepare && draftPanel && draftText && copyButton && lineLink) {
    // Handlers are installed before enabling the fieldset. With JS unavailable the
    // disabled controls cannot leak a private brief through a native GET submission.
    form.addEventListener("submit", (event) => { event.preventDefault(); prepareMessage(); });
    function prepareMessage() {
      const brief = form.elements.namedItem("brief");
      const consent = form.elements.namedItem("consent");
      if (!form.checkValidity() || !brief.value.trim()) {
        say(tr("form.required", "เลือกข้อมูลที่จำเป็น เติมรายละเอียดสั้น ๆ และยืนยันว่าเจ้าตัวอนุญาตก่อนครับ"));
        const invalid = Array.from(form.elements).find((field) => field.willValidate && !field.checkValidity());
        if (invalid) { invalid.focus(); invalid.reportValidity(); }
        else { brief.focus(); }
        return;
      }
      if (!consent.checked) return;
      currentDraft = [
        tr("message.title", "สวัสดีครับเปอร์ ขอคุยเรื่องแนะนำนายแบบให้ MMD"),
        "",
        tr("message.role", "ผู้แนะนำ") + ": " + selectedText("referrerRole"),
        tr("message.tier", "Tier นายแบบ") + ": " + selectedText("modelLayer"),
        tr("message.method", "รูปแบบที่อยากคุย") + ": " + selectedText("dealType"),
        tr("message.work", "ประเภทงาน") + ": " + selectedText("jobType"),
        "",
        brief.value.trim(),
        "",
        tr("message.consent", "เจ้าตัวรับรู้และอนุญาตให้เชื่อมคุยแล้ว"),
        tr("message.agreement", "ขอคุยเรท หน้าที่ และเงื่อนไขกับเปอร์ให้ชัดก่อนเริ่มครับ")
      ].join("\n");
      draftText.value = currentDraft;
      draftPanel.hidden = false;
      copyButton.disabled = false;
      // Keep the established destination, with no brief or signed token in its URL.
      lineLink.setAttribute("href", "https://lin.ee/xRqsALs");
      try { window.sessionStorage.setItem("mmdReferralDraft", currentDraft); } catch (_) { /* Copy/open LINE still work. */ }
      say(tr("form.ready", "ข้อความพร้อมแล้ว คัดลอก เปิด LINE แล้ววางและกดส่งด้วยตัวเองครับ"));
      draftText.focus({ preventScroll: true });
      draftPanel.scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "nearest" });
      scheduleScroll();
    }
    prepare.addEventListener("click", prepareMessage);
    form.addEventListener("input", invalidateDraft);
    form.addEventListener("change", invalidateDraft);
    copyButton.addEventListener("click", async () => {
      if (!currentDraft || draftText.value !== currentDraft) return;
      copyButton.disabled = true;
      const copyingDraft = currentDraft;
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(copyingDraft);
        if (currentDraft === copyingDraft) say(tr("form.copied", "คัดลอกแล้ว เปิด LINE วางข้อความ แล้วกดส่งได้เลยครับ"));
      } catch (_) {
        if (currentDraft === copyingDraft) {
          draftText.focus();
          draftText.select();
          say(tr("form.copyFallback", "คัดลอกไม่สำเร็จ เลือกข้อความด้านบนแล้วคัดลอกด้วยตัวเอง จากนั้นเปิด LINE ครับ"));
        }
      } finally { copyButton.disabled = false; }
    });
    fields.disabled = false;
    const fallback = q("[data-rf15-js-fallback]");
    if (fallback) fallback.hidden = true;
  }

  const visual = q("[data-rf15-visual]");
  const primary = q("[data-rf15-primary]");
  const dock = q("[data-rf15-dock]");
  let frame = 0;
  function updateScroll() {
    frame = 0;
    if (visual && !motion.matches) {
      const rect = visual.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const offset = Math.max(-9, Math.min(9, (window.innerHeight / 2 - rect.top - rect.height / 2) * .03));
        visual.style.setProperty("--rf15-photo-y", offset.toFixed(2) + "px");
      }
    }
    if (dock && primary) {
      const composer = compose && compose.getBoundingClientRect();
      const composeVisible = composer && composer.top < window.innerHeight && composer.bottom > 0;
      const show = mobile.matches && primary.getBoundingClientRect().bottom < 0 && !composeVisible;
      if (!show && dock.contains(document.activeElement)) return;
      dock.hidden = !show;
      root.toggleAttribute("data-rf15-dock-visible", show);
    }
  }
  function scheduleScroll() { if (!frame) frame = requestAnimationFrame(updateScroll); }
  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleScroll, { passive: true });
  window.addEventListener("pageshow", scheduleScroll);
  if (dock) dock.addEventListener("focusout", scheduleScroll);
  root.addEventListener("focusin", () => requestAnimationFrame(() => {
    if (!dock || dock.hidden || dock.contains(document.activeElement)) return;
    const active = document.activeElement;
    if (!active || !root.contains(active)) return;
    const rect = active.getBoundingClientRect();
    const ceiling = dock.getBoundingClientRect().top - 12;
    if (rect.bottom > ceiling && rect.top < window.innerHeight) {
      window.scrollBy({ top: rect.bottom - ceiling, behavior: "instant" });
    }
  }));
  if (visual) {
    visual.addEventListener("pointerdown", (event) => {
      if (motion.matches) return;
      const rect = visual.getBoundingClientRect();
      visual.style.setProperty("--rf15-touch-x", ((event.clientX - rect.left) / rect.width * 100) + "%");
      visual.style.setProperty("--rf15-touch-y", ((event.clientY - rect.top) / rect.height * 100) + "%");
      visual.classList.add("is-touched");
    }, { passive: true });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => visual.addEventListener(name, () => visual.classList.remove("is-touched"), { passive: true }));
  }
  function motionChanged() {
    if (motion.matches) {
      if (root.getAnimations) root.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      if (visual) { visual.style.removeProperty("--rf15-photo-y"); visual.classList.remove("is-touched"); }
    }
    scheduleScroll();
  }
  if (motion.addEventListener) motion.addEventListener("change", motionChanged);

  // Progress reflects the actual completion of initialization, image, and fonts.
  const loading = q("[data-rf15-loading]");
  const progress = loading && loading.querySelector('[role="progressbar"]');
  const percent = q("[data-rf15-percent]");
  let completed = 0;
  function completeTask() {
    completed += 1;
    const value = Math.round(completed / 3 * 100);
    root.style.setProperty("--rf15-loaded", value + "%");
    if (percent) percent.textContent = value + "%";
    if (progress) progress.setAttribute("aria-valuenow", String(value));
    if (completed === 3) {
      root.dataset.rf15Loaded = "1";
      window.setTimeout(() => { if (loading) loading.hidden = true; }, motion.matches ? 0 : 450);
    }
  }
  if (loading) loading.hidden = false;
  root.dataset.rf15Ready = "1";
  completeTask();
  const photo = q("[data-rf15-photo]");
  let photoSettled = false;
  function settlePhoto() {
    if (photoSettled) return;
    photoSettled = true;
    if (photo && !photo.naturalWidth) {
      photo.hidden = true;
      const message = q("[data-rf15-image-message]");
      if (message) message.hidden = false;
    }
    completeTask();
  }
  if (!photo || photo.complete) settlePhoto();
  else { photo.addEventListener("load", settlePhoto, { once: true }); photo.addEventListener("error", settlePhoto, { once: true }); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(completeTask, completeTask);
  else completeTask();
  updateScroll();
})();
