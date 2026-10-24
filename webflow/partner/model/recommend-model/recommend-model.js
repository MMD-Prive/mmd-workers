/* Personal Referral LV15. Presentation only; existing referral form owns submission. */
(function () {
  "use strict";
  const root = document.getElementById("mmdFriendReferralNext");
  if (!root || root.dataset.recommendVersion !== "15" || root.dataset.rm15Ready) return;
  root.dataset.rm15Ready = "1";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 899px)");
  const token = new URLSearchParams(window.location.search).get("t");
  const routes = new Set(["/partner", "/partner/dashboard", "/partner/referral", "/partner/model/recommend-model-apply"]);
  // Preserve the existing signed handoff only on the same-origin Partner routes.
  if (token) root.querySelectorAll("a[data-rm15-partner-link]").forEach((link) => {
    const url = new URL(link.getAttribute("href"), window.location.origin);
    if (url.origin === window.location.origin && routes.has(url.pathname)) {
      url.searchParams.set("t", token);
      link.setAttribute("href", url.pathname + url.search + url.hash);
    }
  });

  const tablist = root.querySelector("[data-rm15-tabs]");
  const tabs = Array.from(root.querySelectorAll("[data-rm15-tab]"));
  const panels = Array.from(root.querySelectorAll("[data-rm15-panel]"));
  let selected = 0;
  function selectStep(index, focus) {
    selected = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) tabs[index].focus({ preventScroll: true });
    if (!motion.matches && panels[index].animate) {
      panels[index].getAnimations().forEach((animation) => animation.cancel());
      panels[index].animate([{ opacity: .5, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  }
  if (tablist && tabs.length === 3 && panels.length === 3) {
    tablist.setAttribute("role", "tablist");
    tabs.forEach((tab, index) => {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panels[index].id);
      panels[index].setAttribute("role", "tabpanel");
      panels[index].setAttribute("aria-labelledby", tab.id);
      panels[index].tabIndex = 0;
      tab.addEventListener("click", () => selectStep(index, false));
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (selected + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (selected + tabs.length - 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        selectStep(next, true);
      });
    });
    root.dataset.rm15TabsReady = "1";
    tablist.hidden = false;
    selectStep(0, false);
  }
  function followHash() {
    if (window.location.hash === "#next") selectStep(2, false);
    if (window.location.hash === "#care") root.querySelector("#care").open = true;
  }
  followHash();
  window.addEventListener("hashchange", followHash);
  root.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");
    const target = document.getElementById(hash.slice(1));
    if (!target || !root.contains(target) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    followHash();
    target.scrollIntoView({ behavior: motion.matches ? "instant" : "smooth", block: "start" });
    if (link.classList.contains("rm15-skip")) target.focus({ preventScroll: true });
  }));

  // Native details work without JavaScript; only the opening motion is enhanced.
  root.querySelectorAll("details").forEach((details) => details.addEventListener("toggle", () => {
    if (!details.open || motion.matches) return;
    const body = details.querySelector(".rm15-details-body");
    if (body && body.animate) body.animate([{ opacity: .45, transform: "translateY(-4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" });
  }));

  const visual = root.querySelector("[data-rm15-visual]");
  const primary = root.querySelector("[data-rm15-primary]");
  const dock = root.querySelector("[data-rm15-dock]");
  let frame = 0;
  function updateScroll() {
    frame = 0;
    if (visual && !motion.matches) {
      const rect = visual.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const offset = Math.max(-10, Math.min(10, (window.innerHeight / 2 - rect.top - rect.height / 2) * .035));
        visual.style.setProperty("--rm15-photo-y", offset.toFixed(2) + "px");
      }
    }
    if (dock && primary) {
      const show = mobile.matches && primary.getBoundingClientRect().bottom < 0;
      // Keep a keyboard-focused CTA available even while the viewport changes.
      if (!show && dock.contains(document.activeElement)) return;
      dock.hidden = !show;
      root.toggleAttribute("data-rm15-dock-visible", show);
    }
  }
  function scheduleScroll() { if (!frame) frame = requestAnimationFrame(updateScroll); }
  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleScroll, { passive: true });
  window.addEventListener("pageshow", scheduleScroll);
  if (dock) dock.addEventListener("focusout", scheduleScroll);
  if (visual) {
    visual.addEventListener("pointerdown", (event) => {
      if (motion.matches) return;
      const rect = visual.getBoundingClientRect();
      visual.style.setProperty("--rm15-touch-x", ((event.clientX - rect.left) / rect.width * 100) + "%");
      visual.style.setProperty("--rm15-touch-y", ((event.clientY - rect.top) / rect.height * 100) + "%");
      visual.classList.add("is-touched");
    }, { passive: true });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => visual.addEventListener(name, () => visual.classList.remove("is-touched"), { passive: true }));
  }
  function motionChanged() {
    if (motion.matches) {
      if (root.getAnimations) root.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      if (visual) { visual.style.removeProperty("--rm15-photo-y"); visual.classList.remove("is-touched"); }
    }
    scheduleScroll();
  }
  if (motion.addEventListener) motion.addEventListener("change", motionChanged);
  updateScroll();

  // Percentage tracks three completed preparation tasks, never a timed fake counter.
  const loading = root.querySelector("[data-rm15-loading]");
  const progress = loading && loading.querySelector('[role="progressbar"]');
  const percent = root.querySelector("[data-rm15-percent]");
  let completed = 0;
  function completeTask() {
    completed += 1;
    const value = Math.round(completed / 3 * 100);
    root.style.setProperty("--rm15-loaded", value + "%");
    if (percent) percent.textContent = value + "%";
    if (progress) progress.setAttribute("aria-valuenow", String(value));
    if (completed === 3) {
      root.dataset.rm15Loaded = "1";
      window.setTimeout(() => { if (loading) loading.hidden = true; }, motion.matches ? 0 : 450);
    }
  }
  if (loading) loading.hidden = false;
  completeTask();
  const photo = root.querySelector("[data-rm15-hero]");
  let photoSettled = false;
  function settlePhoto() {
    if (photoSettled) return;
    photoSettled = true;
    if (photo && !photo.naturalWidth) {
      photo.hidden = true;
      const message = root.querySelector("[data-rm15-image-message]");
      if (message) message.hidden = false;
    }
    completeTask();
  }
  if (!photo || photo.complete) settlePhoto();
  else { photo.addEventListener("load", settlePhoto, { once: true }); photo.addEventListener("error", settlePhoto, { once: true }); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(completeTask, completeTask);
  else completeTask();
})();
