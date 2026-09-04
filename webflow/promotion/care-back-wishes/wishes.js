(function () {
  "use strict";

  var root = document.querySelector("#mmd6-wishes[data-wishes-page]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";

  var config = {
    liffId: root.dataset.liffId || "2010298002-mbx9kqQn",
    identityStart: root.dataset.identityStart || "/member/api/liff/start",
    wishesEndpoint: root.dataset.wishesEndpoint || "/member/api/liff/wishes",
    fallback: root.dataset.fallback || "/member/dashboard"
  };
  var busy = false;
  var sessionReady = false;
  var stateNodes = root.querySelectorAll("[data-state]");

  function setState(name) {
    stateNodes.forEach(function (node) {
      node.classList.toggle("is-current", node.dataset.state === name);
    });
  }

  function safeJson(response) {
    return response.json().catch(function () { return {}; });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function displayDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("th-TH", {
      day: "numeric", month: "short", year: "numeric"
    }).format(date);
  }

  function renderWishes(items) {
    var list = root.querySelector("[data-wish-list]");
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<li class="mw-empty">ยังไม่มีคำอวยพรที่เผยแพร่ในขณะนี้</li>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var message = escapeHtml(item.text || "").replace(/\n/g, "<br>");
      var date = displayDate(item.created_at || item.createdAt);
      return '<li class="mw-wish">' + message + (date ? "<time>" + escapeHtml(date) + "</time>" : "") + "</li>";
    }).join("");
  }

  function loadLiff() {
    if (window.liff) return Promise.resolve(window.liff);
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
      script.onload = function () { window.liff ? resolve(window.liff) : reject(new Error("liff_unavailable")); };
      script.onerror = function () { reject(new Error("liff_unavailable")); };
      document.head.appendChild(script);
    });
  }

  async function establishSession() {
    if (sessionReady) return { state: "member" };
    var liff = await loadLiff();
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) return { state: "guest" };

    var idToken = liff.getIDToken();
    if (!idToken) throw new Error("id_token_unavailable");

    var response = await fetch(config.identityStart, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ id_token: idToken, intent: "care_back_wishes" })
    });
    var data = await safeJson(response);
    if (!response.ok || data.ok === false) {
      if (response.status === 401) return { state: "guest" };
      throw new Error((data.error && data.error.code) || data.code || "identity_start_failed");
    }
    if (!data.data || data.data.member_resolved !== true) return { state: "not-member" };
    sessionReady = true;
    return { state: "member" };
  }

  async function load() {
    setState("loading");
    try {
      var identity = await establishSession();
      if (identity.state !== "member") {
        setState(identity.state);
        return;
      }
      var response = await fetch(config.wishesEndpoint, {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
      var data = await safeJson(response);
      if (response.status === 401) { sessionReady = false; setState("guest"); return; }
      if (response.status === 403 || (data.error && data.error.code === "MEMBER_REQUIRED")) { setState("not-member"); return; }
      if (!response.ok || data.ok === false) throw new Error((data.error && data.error.code) || data.code || "wishes_unavailable");
      renderWishes(data.wishes || []);
      setState("member");
    } catch (error) {
      root.querySelector("[data-error-message]").textContent =
        error && error.message === "liff_unavailable"
          ? "กรุณาเปิดลิงก์นี้จาก LINE เพื่อยืนยันตัวตนครับ"
          : "ระบบยังเชื่อมต่อพื้นที่คำอวยพรไม่ได้ กรุณาลองใหม่อีกครั้งครับ";
      setState("error");
    }
  }

  root.querySelector("[data-login]").addEventListener("click", function () {
    loadLiff().then(function (liff) {
      return liff.init({ liffId: config.liffId }).then(function () {
        liff.login({ redirectUri: window.location.href });
      });
    }).catch(function () { window.location.assign(config.fallback); });
  });
  root.querySelector("[data-retry]").addEventListener("click", load);

  var textarea = root.querySelector("textarea");
  var count = root.querySelector("[data-count]");
  textarea.addEventListener("input", function () {
    count.textContent = textarea.value.length + " / 600";
  });

  root.querySelector("[data-wish-form]").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;

    var text = textarea.value.trim();
    var message = root.querySelector("[data-form-message]");
    var button = event.currentTarget.querySelector('button[type="submit"]');
    message.hidden = true;
    if (text.length < 2) {
      message.textContent = "กรุณาเขียนข้อความอย่างน้อย 2 ตัวอักษรครับ";
      message.hidden = false;
      return;
    }

    busy = true;
    button.disabled = true;
    try {
      var identity = await establishSession();
      if (identity.state !== "member") { setState(identity.state); return; }
      var response = await fetch(config.wishesEndpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ text: text })
      });
      var data = await safeJson(response);
      if (response.status === 401) { sessionReady = false; setState("guest"); return; }
      if (response.status === 403) { setState("not-member"); return; }
      if (!response.ok || data.ok === false) throw new Error((data.error && data.error.code) || data.code || "save_failed");

      textarea.value = "";
      count.textContent = "0 / 600";
      message.style.color = "#2d6b52";
      message.textContent = data.pending
        ? "ระบบรับข้อความแล้วครับ ข้อความจะแสดงหลังการพิจารณา"
        : "บันทึกแล้วครับ";
      message.hidden = false;
      renderWishes(data.wishes || []);
    } catch (error) {
      message.style.color = "#a5433d";
      message.textContent = "ยังบันทึกไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้งครับ";
      message.hidden = false;
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  load();
}());
