(function () {
  "use strict";

  var root = document.getElementById("mmdProfilesV8");
  if (!root || root.dataset.roleCatalogReady === "true") return;
  root.dataset.roleCatalogReady = "true";

  var endpoint = "https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog";
  var femaleGate = "/believe/inme";
  var track = root.querySelector(".mp8-track--profiles");
  var stage2 = root.querySelector("[data-role-stage2]");
  var driverPackages = root.querySelector("[data-driver-packages]");
  var resultCount = root.querySelector("[data-result-count]");
  var empty = root.querySelector("[data-empty]");
  if (!track) return;

  var catalog = [];
  var activeRole = "";
  var activeGender = "all";

  var ROLE_LABELS = {
    everyday_companion: "เพื่อนคู่ใจ",
    driver_companion: "คนขับรถหล่อ",
    culinary_companion: "เชฟหล่อ",
    social_appearance: "คู่หูออกงาน",
    bangkok_companion: "เพื่อนเที่ยวกรุงเทพ",
    sport_activity: "หนุ่มสายกีฬา",
    wellness_companion: "หนุ่มสายสุขภาพ",
    business_companion: "หนุ่มออฟฟิศ",
    nightlife_companion: "เพื่อนสายปาร์ตี้",
    creative_companion: "เพื่อนสายศิลป์",
    medical_professional: "บุรุษทางการแพทย์"
  };

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
      th: {
        badge: "CURATED",
        line: "โปรไฟล์ที่ MMD อนุมัติสำหรับบทบาทนี้แล้ว",
        fit: "ก่อนยืนยันงาน",
        detail: "MMD จะตรวจคิว ขอบเขต และความเหมาะสมของทั้งสองฝ่ายก่อนยืนยันทุกครั้ง",
        cta: "ให้ MMD เช็กคิวและความเหมาะ",
        ctaFemale: "ไปที่ BELIEVE ก่อน",
        chooseRole: "เลือกบทบาทด้านบนก่อน แล้วรายชื่อที่เหมาะจะปรากฏตรงนี้",
        none: "ตอนนี้ยังไม่มีคนที่ MMD เปิดสำหรับบทบาทนี้"
      },
      en: {
        badge: "CURATED",
        line: "A profile MMD has approved for this role.",
        fit: "Before confirmation",
        detail: "MMD checks availability, boundaries, and mutual fit before every confirmation.",
        cta: "Ask MMD to check availability",
        ctaFemale: "Continue through BELIEVE",
        chooseRole: "Choose a role above first. Only eligible profiles will appear here.",
        none: "No MMD-approved profile is currently open for this role."
      },
      zh: {
        badge: "精选",
        line: "经 MMD 审核并批准用于此角色的公开资料。",
        fit: "确认之前",
        detail: "每次确认前，MMD 都会检查时间、边界与双方是否合适。",
        cta: "请 MMD 检查时间与匹配度",
        ctaFemale: "先进入 BELIEVE",
        chooseRole: "请先选择上方角色，仅显示符合资格的资料。",
        none: "目前此角色暂无经 MMD 批准公开的资料。"
      }
    };
    return sets[language()];
  }

  function validItem(item) {
    if (!item || item.visibility !== "public" || item.source !== "r2_public_model" || !item.display_name) return false;
    var roles = Array.isArray(item.approved_roles) ? item.approved_roles.filter(function (role) { return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role); }) : [];
    var genders = Array.isArray(item.accepted_customer_genders) ? item.accepted_customer_genders.filter(function (value) { return value === "male" || value === "female"; }) : [];
    if (!roles.length || !genders.length) return false;
    try {
      var url = new URL(item.image_url);
      return url.protocol === "https:" && url.hostname === "models.mmdbkk.com" && url.pathname.indexOf("/MMD%20Public%20Models/") === 0;
    } catch (_) { return false; }
  }

  function eligible(item) {
    if (!activeRole || item.approved_roles.indexOf(activeRole) === -1) return false;
    if (activeGender === "all") return true;
    return item.accepted_customer_genders.indexOf(activeGender) > -1;
  }

  function card(item, index) {
    var words = copy();
    var article = document.createElement("article");
    article.className = "mp8-profile is-visible";
    article.dataset.profile = "";
    article.dataset.name = item.display_name;
    article.dataset.roles = item.approved_roles.join(",");
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
    titleText.append(text("p", (ROLE_LABELS[activeRole] || "PUBLIC MODEL").toUpperCase()), text("h3", item.display_name));
    title.append(titleText, text("em", words.badge));
    body.append(title, text("p", words.line, "mp8-card__line"));

    var tags = document.createElement("div");
    tags.className = "mp8-tags";
    tags.append(text("span", ROLE_LABELS[activeRole] || activeRole));
    if (item.booking_mode === "brief_only") tags.append(text("span", "Brief only"));
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
    var bookingHref = "/booking?from=profiles&role=" + encodeURIComponent(activeRole) + "&model=" + encodeURIComponent(item.display_name);
    var femaleHref = femaleGate + "?from=profiles&role=" + encodeURIComponent(activeRole) + "&model=" + encodeURIComponent(item.display_name);
    var femaleFlow = activeGender === "female" || (activeGender === "all" && item.customer_scope === "female_only");
    link.href = femaleFlow ? femaleHref : bookingHref;
    link.append(text("span", femaleFlow ? words.ctaFemale : words.cta), text("b", "↗"));
    body.append(link);

    article.append(figure, body);
    return article;
  }

  function updateStats(count) {
    var stats = root.querySelectorAll(".mp8-hero__stats span b");
    if (stats[0]) stats[0].textContent = activeRole ? String(count).padStart(2, "0") : "—";
    if (stats[1]) stats[1].textContent = activeRole ? String(count).padStart(2, "0") : "—";
  }

  function render() {
    var words = copy();
    if (!activeRole) {
      track.replaceChildren();
      if (resultCount) resultCount.textContent = words.chooseRole;
      if (empty) empty.hidden = true;
      updateStats(0);
      return;
    }

    var items = catalog.filter(eligible);
    var fragment = document.createDocumentFragment();
    items.forEach(function (item, index) { fragment.appendChild(card(item, index)); });
    track.replaceChildren(fragment);

    if (resultCount) resultCount.textContent = items.length
      ? "แสดง " + items.length + " โปรไฟล์ · " + (ROLE_LABELS[activeRole] || activeRole)
      : words.none;
    if (empty) empty.hidden = items.length > 0;
    updateStats(items.length);
  }

  root.querySelectorAll("[data-role-value]").forEach(function (button) {
    button.addEventListener("click", function () {
      activeRole = button.dataset.roleValue || "";
      root.querySelectorAll("[data-role-value]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
      if (driverPackages) driverPackages.hidden = activeRole !== "driver_companion";
      if (stage2) stage2.hidden = false;
      render();
      var focusTarget = activeRole === "driver_companion" && driverPackages ? driverPackages : stage2;
      if (focusTarget && typeof focusTarget.scrollIntoView === "function") {
        focusTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });

  root.querySelectorAll("[data-gender-value]").forEach(function (button) {
    button.addEventListener("click", function () {
      activeGender = button.dataset.genderValue || "all";
      root.querySelectorAll("[data-gender-value]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
      render();
    });
  });

  track.replaceChildren();
  if (driverPackages) driverPackages.hidden = true;
  if (resultCount) resultCount.textContent = copy().chooseRole;
  updateStats(0);

  fetch(endpoint, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) throw new Error("catalog_http_" + response.status);
      return response.json();
    })
    .then(function (payload) {
      catalog = Array.isArray(payload && payload.items) ? payload.items.filter(validItem) : [];
      root.dataset.roleCatalogLoaded = "true";
      render();
    })
    .catch(function () {
      catalog = [];
      root.dataset.roleCatalogLoaded = "error";
      render();
    });
})();