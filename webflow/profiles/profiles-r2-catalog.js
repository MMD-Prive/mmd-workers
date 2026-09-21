(function () {
  "use strict";
  var root = document.getElementById("mmdProfilesV8");
  if (!root || root.dataset.r2CatalogReady === "true") return;
  root.dataset.r2CatalogReady = "true";
  var endpoint = "https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog";
  var femaleGate = "/believe/inme";
  var track = root.querySelector(".mp8-track--profiles");
  if (!track) return;
  var initialGender = "all";
  try { initialGender = new URLSearchParams(location.search).get("gender") || "all"; } catch (_) {}
  root.dataset.activeGender = ["all", "male", "female"].indexOf(initialGender) > -1 ? initialGender : "all";

  function text(tag, value, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }
  function language() {
    var value = "th";
    try { value = new URLSearchParams(location.search).get("lang") || localStorage.getItem("mmd_lang") || "th"; } catch (_) {}
    return ["th", "en", "zh"].indexOf(value) > -1 ? value : "th";
  }
  function copy() {
    var sets = {
      th: { badge: "PUBLIC", line: "โปรไฟล์ Public Model ที่อนุมัติให้แสดงบน MMD", fit: "ก่อนยืนยันงาน", detail: "MMD จะตรวจคิว ขอบเขต และความเหมาะสมของทั้งสองฝ่ายก่อนยืนยันทุกครั้ง", cta: "ให้ MMD เช็กคิวและความเหมาะ", ctaFemale: "ไปที่ BELIEVE ก่อน" },
      en: { badge: "PUBLIC", line: "A Public Model profile approved for display by MMD.", fit: "Before confirmation", detail: "MMD checks availability, boundaries, and mutual fit before every confirmation.", cta: "Ask MMD to check availability", ctaFemale: "Continue through BELIEVE" },
      zh: { badge: "公开", line: "经 MMD 审核后公开展示的 Public Model Profile。", fit: "确认之前", detail: "每次确认前，MMD 都会检查时间、边界与双方是否合适。", cta: "请 MMD 检查时间与匹配度", ctaFemale: "先进入 BELIEVE" }
    };
    return sets[language()];
  }
  function validItem(item) {
    if (!item || item.visibility !== "public" || item.source !== "r2_public_model" || !item.display_name) return false;
    try {
      var url = new URL(item.image_url);
      return url.protocol === "https:" && url.hostname === "models.mmdbkk.com" && url.pathname.indexOf("/MMD%20Public%20Models/") === 0;
    } catch (_) { return false; }
  }
  function card(item, index) {
    var words = copy();
    var article = document.createElement("article");
    article.className = "mp8-profile is-visible";
    article.dataset.profile = "";
    article.dataset.name = item.display_name;
    var accepted = Array.isArray(item.accepted_customer_genders) ? item.accepted_customer_genders.filter(function (value) { return value === "male" || value === "female"; }) : ["male", "female"];
    if (!accepted.length) accepted = ["male", "female"];
    article.dataset.travel = accepted.join(",");
    article.dataset.extreme = accepted.join(",");
    article.dataset.customerScope = item.customer_scope || "all_genders";
    article.dataset.r2Public = "true";

    var figure = document.createElement("figure");
    figure.className = "mp8-card__media";
    var image = document.createElement("img");
    image.src = item.image_url;
    image.alt = item.display_name + " — MMD Privé public profile";
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    figure.append(image, text("span", "PUBLIC FILE " + String(index + 1).padStart(2, "0")));

    var body = document.createElement("div");
    body.className = "mp8-card__body";
    var title = document.createElement("div");
    title.className = "mp8-card__title";
    var titleText = document.createElement("div");
    titleText.append(text("p", "PUBLIC MODEL"), text("h3", item.display_name));
    title.append(titleText, text("em", words.badge));
    body.append(title, text("p", words.line, "mp8-card__line"));

    var tags = document.createElement("div");
    tags.className = "mp8-tags";
    tags.append(text("span", "Public Model"));
    body.append(tags);

    var details = document.createElement("details");
    details.className = "mp8-details";
    var summary = document.createElement("summary");
    summary.append(text("span", words.fit), document.createElement("i"));
    var detailBody = document.createElement("div");
    detailBody.append(text("p", words.detail));
    details.append(summary, detailBody);
    body.append(details);

    var link = document.createElement("a");
    link.className = "mp8-card__cta";
    link.href = "/booking?from=profiles&model=" + encodeURIComponent(item.display_name);
    link.dataset.profileCta = "true";
    link.dataset.bookingHref = link.href;
    link.dataset.femaleHref = femaleGate + "?from=profiles&model=" + encodeURIComponent(item.display_name);
    link.dataset.defaultLabel = words.cta;
    link.dataset.femaleLabel = words.ctaFemale;
    link.append(text("span", words.cta), text("b", "↗"));
    body.append(link);
    article.append(figure, body);
    return article;
  }
  function syncCtas() {
    var gender = root.dataset.activeGender || "all";
    root.querySelectorAll("[data-r2-public] [data-profile-cta]").forEach(function (link) {
      var article = link.closest("[data-r2-public]");
      var femaleFlow = gender === "female" || (gender === "all" && article && article.dataset.customerScope === "female_only");
      link.href = femaleFlow ? link.dataset.femaleHref : link.dataset.bookingHref;
      var label = link.querySelector("span");
      if (label) label.textContent = femaleFlow ? link.dataset.femaleLabel : link.dataset.defaultLabel;
    });
  }
  root.addEventListener("profiles:filterchange", syncCtas);
  root.addEventListener("click", function (event) {
    var button = event.target.closest('[data-filter-group="gender"] [data-filter-value]');
    if (!button || !root.contains(button)) return;
    var gender = button.dataset.filterValue;
    if (["all", "male", "female"].indexOf(gender) === -1) return;
    root.dataset.activeGender = gender;
    Promise.resolve().then(syncCtas);
  });

  function updateStats(count) {
    var stats = root.querySelectorAll(".mp8-hero__stats span b");
    if (stats[0]) stats[0].textContent = String(count + 3).padStart(2, "0");
    if (stats[1]) stats[1].textContent = String(count).padStart(2, "0");
  }

  fetch(endpoint, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } })
    .then(function (response) { if (!response.ok) throw new Error("catalog_http_" + response.status); return response.json(); })
    .then(function (payload) {
      var items = Array.isArray(payload && payload.items) ? payload.items.filter(validItem) : [];
      if (!payload || payload.ok !== true || !items.length) return;
      var fragment = document.createDocumentFragment();
      items.forEach(function (item, index) { fragment.appendChild(card(item, index)); });
      track.replaceChildren(fragment);
      updateStats(items.length);
      if (typeof root.mmdProfilesRefresh === "function") root.mmdProfilesRefresh();
      syncCtas();
    })
    .catch(function () { root.dataset.r2CatalogFallback = "static"; });
})();
