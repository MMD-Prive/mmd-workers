(function () {
  "use strict";

  var instance = null;
  var LANG_STORAGE_KEY = "mmd_model_lang";
  var SUPPORTED_LANGS = ["th", "en", "zh", "ja"];
  var DEFAULT_LANG = "th";
  var COPY = {
    th: {
      "lang.aria": "เลือกภาษา",
      "chip.console": "MODEL CONSOLE",
      "chip.assistant": "MMD ASSISTANT",
      "hero.kicker": "MMD . SIGIL",
      "hero.title": "Model Console",
      "hero.subtitle": "พร้อมแล้วค่อยขยับ",
      "hero.copy": "ดูสถานะงาน รับอัปเดต แชร์โลเคชัน ส่ง ETA และเช็กโปรไฟล์งานในหน้าเดียว",
      "hero.imageAlt": "Model Console hero",
      "hero.logoAlt": "MMD SIGIL logo",
      "label.session": "Session",
      "label.status": "Status",
      "label.eta": "ETA",
      "label.lastUpdate": "Last update",
      "label.availability": "Availability",
      "label.visibility": "Visibility",
      "label.gps": "GPS",
      "label.payout": "Payout",
      "label.currentEta": "Current ETA",
      "label.date": "Date",
      "label.time": "Time",
      "label.location": "Location",
      "label.travel": "Travel",
      "label.payment": "Payment",
      "label.openMap": "Open Map",
      "label.saveState": "Save state",
      "command.label": "Current Command",
      "command.title": "คำสั่งตอนนี้",
      "command.copy": "ดูคำสั่งหลักตรงนี้ก่อน แล้วค่อยกด action ที่ตรงกับสถานะจริง",
      "strip.label": "Status Strip",
      "strip.title": "สถานะที่ต้องรู้",
      "priority.label": "Priority Steps",
      "priority.title": "ทำตามลำดับนี้",
      "step.one": "STEP 1",
      "step.two": "STEP 2",
      "step.three": "STEP 3",
      "step.routeTitle": "เริ่มเดินทาง",
      "step.routeCopy": "กดเริ่ม route เมื่อออกเดินทางจริง เพื่อให้ทีมเห็นสถานะล่าสุด",
      "step.liveTitle": "Live location",
      "step.liveCopy": "เปิดหรือพักแชร์โลเคชันผ่าน admin-worker เท่านั้น",
      "step.etaTitle": "ส่ง ETA",
      "brief.label": "Session Brief",
      "brief.title": "รายละเอียดงาน",
      "assistant.label": "MMD Assistant / Client Read",
      "assistant.title": "อ่านลูกค้าก่อน",
      "assistant.clientRead": "Client read",
      "assistant.clientReadValue": "สุภาพ นุ่ม ชัดเจน มั่นใจ",
      "assistant.arrivalCue": "Arrival cue",
      "assistant.arrivalCueValue": "ส่ง ETA ก่อนเข้าล็อบบี้ทุกครั้ง",
      "assistant.note": "Assistant note",
      "assistant.noteValue": "ตอบสั้น กระชับ และอัปเดตตามจริงเท่านั้น",
      "timeline.label": "Session Timeline",
      "timeline.title": "ไทม์ไลน์งาน",
      "timeline.met": "เจอลูกค้าแล้ว",
      "timeline.started": "Start Work",
      "timeline.finished": "Finished",
      "timeline.separated": "Separated",
      "work.label": "Work Profile",
      "work.title": "โปรไฟล์งาน",
      "work.tabsAria": "แท็บโปรไฟล์งาน",
      "work.public": "Public",
      "work.private": "Private",
      "work.publicJob": "Public Job",
      "work.publicJobValue": "งานมาตรฐาน 5 ชม.",
      "work.publicMin": "Public Minimum Rate",
      "work.publicStandard": "Public Standard Rate",
      "work.publicMode": "Travel Model / Extreme Model",
      "work.travelModel": "Travel Model",
      "work.extremeModel": "Extreme Model",
      "work.privateJob": "Private Job",
      "work.privateJobValue": "งานมาตรฐาน 2 ชม.",
      "work.privateHours": "รับงานมากกว่า 2-5 ชม. ไหม",
      "work.accept": "รับ",
      "work.decline": "ไม่รับ",
      "work.pnMin": "PN Model Minimum Rate",
      "work.pnStandard": "PN Model Standard Rate",
      "work.vipMin": "VIP Model Minimum Rate",
      "work.vipStandard": "VIP Model Standard Rate",
      "budget.label": "Client Budget",
      "budget.title": "งบลูกค้า",
      "budget.level1": "Level 1 ปกติ",
      "budget.level2": "Level 2 กลาง",
      "budget.level3": "Level 3 สูง",
      "budget.level4": "Level 4 สูงสุด",
      "tools.label": "Profile / Payout / Compcard",
      "tools.title": "โปรไฟล์ / จ่ายเงิน / คอมป์การ์ด",
      "intel.label": "Client Intel",
      "intel.title": "ข้อมูลลูกค้า",
      "intel.tone": "Suggested tone",
      "intel.caution": "Caution",
      "intel.payment": "Payment gate",
      "intel.finish": "Finish flow",
      "action.startRoute": "Start Route",
      "action.arrived": "Arrived",
      "action.liveOn": "Start Live Location",
      "action.liveOff": "Stop Sharing",
      "action.sendEta": "Send current ETA",
      "action.delay": "Notify delay",
      "action.openMap": "Open Map",
      "action.viewBrief": "View Full Brief",
      "action.saveProfile": "Save Work Profile",
      "action.updateProfile": "Update Profile",
      "action.updatePayout": "Update Payout",
      "action.compcard": "Generate Compcard",
      "placeholder.eta": "18 min / entering lobby / traffic light",
      "value.waitEta": "รออัปเดต",
      "value.noUpdate": "ยังไม่มี",
      "value.visible": "Visible",
      "value.ready": "พร้อมรับคำสั่ง",
      "value.standby": "Stand by",
      "value.saved": "บันทึกแล้ว",
      "value.dirty": "มีการแก้ไข",
      "value.unsaved": "ยังไม่บันทึก",
      "value.liveOn": "LIVE ON",
      "value.liveOff": "LIVE OFF",
      "value.paymentPending": "Payment gate pending",
      "value.paymentCleared": "Payment gate cleared",
      "value.reviewBeforePayout": "Review before payout",
      "value.payoutHandoff": "Payout handoff pending",
      "value.awaitingRelease": "Awaiting release",
      "value.reviewPending": "Review pending",
      "value.pendingRelease": "Pending release",
      "value.awaitingRoute": "Awaiting route",
      "value.routeActive": "Live route active",
      "value.arrivedSite": "Arrived on site",
      "value.clientContact": "Client contact made",
      "value.sessionStarted": "Session started",
      "value.sessionWrapped": "Session wrapped",
      "value.departureComplete": "Departure complete",
      "value.trackingEnabled": "Tracking enabled",
      "value.inSession": "In session",
      "value.wrapUp": "Wrap up",
      "value.separated": "Separated",
      "value.onWay": "กำลังเดินทาง",
      "value.arrived": "ถึงจุดนัดหมาย",
      "value.met": "พบลูกค้าแล้ว",
      "intel.defaultTone": "Warm, calm, direct",
      "intel.defaultCaution": "Confirm lobby timing before stepping into the venue",
      "intel.finishReady": "Closeout ready. Keep notes short, factual, and review-safe.",
      "intel.finishDefault": "Finish in console, then hand off to review-safe payout flow",
      "note.readyWithT": "Webflow surface ready. Signed reference t detected.",
      "note.readyNoT": "Webflow surface ready. Signed reference uses t when present.",
      "note.loading": "Loading dashboard from admin-worker...",
      "note.loaded": "Dashboard loaded from admin-worker.",
      "note.loadFailed": "Dashboard could not load from admin-worker.",
      "note.dirty": "Work profile has unsaved changes. Save stays on the experience layer for now.",
      "note.previewSaved": "Preview profile saved locally.",
      "note.profileSending": "Sending profile update through admin-worker...",
      "note.profileAccepted": "Profile update accepted by admin-worker facade.",
      "note.profileRejected": "Profile update was not accepted.",
      "note.statusSending": "Sending status to admin-worker...",
      "note.statusUpdated": "Status updated through admin-worker.",
      "note.statusRejected": "Status update was not accepted.",
      "note.gpsAccepted": "GPS update accepted by admin-worker facade.",
      "note.gpsRejected": "GPS update was not accepted.",
      "note.liveSending": "Sending live location state through admin-worker...",
      "note.livePausing": "Sending live location pause through admin-worker...",
      "note.etaSending": "Sending ETA through admin-worker...",
      "note.etaAccepted": "ETA accepted by admin-worker facade.",
      "note.delaySending": "Sending delay notice through admin-worker...",
      "note.delayAccepted": "Delay notice accepted by admin-worker facade.",
      "note.utilitySending": "Sending {action} through admin-worker...",
      "note.utilityAccepted": "{action} accepted by admin-worker facade.",
      "note.utilityRejected": "{action} was not accepted.",
      "note.brief": "Full brief preview opened locally. Keep assistant reads on the experience layer.",
      "note.localStatus": "Preview status updated locally to {status}.",
      "note.timelineLocal": "Timeline status updated locally to {status}.",
      "error.startLocked": "Start Work is locked until final payment is confirmed.",
      "error.sequence": "That status is out of sequence. Refresh and follow the current session step.",
      "error.request": "Admin-worker request failed.",
      "value.etaLive": "ETA live",
      "value.etaSent": "ETA sent",
      "value.delayNotified": "Delay notified",
      "value.delayedUpdating": "Delayed · updating ETA",
      "value.delayedPrefix": "Delayed · {eta}",
      "value.routeStarted": "Route started"
    }
  };

  COPY.en = Object.assign({}, COPY.th, {
    "lang.aria": "Choose language",
    "hero.subtitle": "Move when it is clear",
    "hero.copy": "Check the job, send ETA, manage route status, and keep the team updated from one console.",
    "command.title": "Current Command",
    "command.copy": "Read the command here first, then tap the action that matches the real status.",
    "strip.title": "Status Snapshot",
    "priority.title": "Priority Steps",
    "step.routeTitle": "Start route",
    "step.routeCopy": "Start the route only when you are actually moving so the team sees the real state.",
    "step.liveCopy": "Start or pause live location through admin-worker only.",
    "step.etaTitle": "Send ETA",
    "brief.title": "Session Brief",
    "assistant.title": "Read the client first",
    "assistant.clientReadValue": "Polite, soft, clear, confident",
    "assistant.arrivalCueValue": "Send ETA before entering the lobby every time",
    "assistant.noteValue": "Keep replies short, direct, and true to the current state.",
    "timeline.title": "Session Timeline",
    "timeline.met": "Met",
    "work.title": "Work Profile",
    "work.tabsAria": "Work profile tabs",
    "work.publicJobValue": "Standard 5-hour job",
    "work.privateJobValue": "Standard 2-hour job",
    "work.privateHours": "Accept more than 2-5 hours?",
    "work.accept": "Accept",
    "work.decline": "Decline",
    "budget.title": "Client Budget",
    "budget.level1": "Level 1 Normal",
    "budget.level2": "Level 2 Mid",
    "budget.level3": "Level 3 High",
    "budget.level4": "Level 4 Top",
    "tools.title": "Profile / Payout / Compcard",
    "intel.title": "Client Intel",
    "value.waitEta": "Waiting",
    "value.noUpdate": "No update yet",
    "value.ready": "Ready for command",
    "value.saved": "saved",
    "value.dirty": "dirty",
    "value.unsaved": "unsaved",
    "value.onWay": "On the way",
    "value.arrived": "Arrived",
    "value.met": "Client met"
  });

  COPY.zh = Object.assign({}, COPY.en, {
    "lang.aria": "选择语言",
    "hero.title": "模特控制台",
    "hero.subtitle": "确认清楚再行动",
    "hero.copy": "在同一页查看工作状态、发送 ETA、管理路线和同步团队。",
    "label.session": "场次",
    "label.status": "状态",
    "label.lastUpdate": "最后更新",
    "label.availability": "可用状态",
    "label.visibility": "可见性",
    "label.payout": "付款释放",
    "label.currentEta": "当前 ETA",
    "label.date": "日期",
    "label.time": "时间",
    "label.location": "地点",
    "label.travel": "行程",
    "label.payment": "付款",
    "label.openMap": "打开地图",
    "label.saveState": "保存状态",
    "command.title": "当前指令",
    "command.copy": "先看这里的主要指令，再点击符合真实状态的操作。",
    "strip.title": "状态概览",
    "priority.title": "优先步骤",
    "step.routeTitle": "开始路线",
    "step.routeCopy": "真正出发后再开始路线，让团队看到准确状态。",
    "step.liveTitle": "实时位置",
    "step.liveCopy": "只通过 admin-worker 开启或暂停实时位置。",
    "step.etaTitle": "发送 ETA",
    "brief.title": "工作简报",
    "assistant.title": "先读客户信息",
    "assistant.clientReadValue": "礼貌、柔和、清楚、有信心",
    "assistant.arrivalCueValue": "每次进大厅前先发送 ETA",
    "assistant.noteValue": "回复要短、清楚，并只按真实状态更新。",
    "timeline.title": "工作时间线",
    "timeline.met": "已见客户",
    "timeline.started": "开始工作",
    "timeline.finished": "完成",
    "timeline.separated": "已分开",
    "work.title": "工作资料",
    "work.tabsAria": "工作资料标签",
    "work.public": "公开",
    "work.private": "私人",
    "work.publicJob": "公开工作",
    "work.publicJobValue": "标准 5 小时工作",
    "work.publicMin": "公开最低价",
    "work.publicStandard": "公开标准价",
    "work.privateJob": "私人工作",
    "work.privateJobValue": "标准 2 小时工作",
    "work.privateHours": "接受超过 2-5 小时吗？",
    "work.accept": "接受",
    "work.decline": "不接受",
    "budget.title": "客户预算",
    "budget.level1": "Level 1 普通",
    "budget.level2": "Level 2 中等",
    "budget.level3": "Level 3 高",
    "budget.level4": "Level 4 最高",
    "tools.title": "资料 / 付款 / 资料卡",
    "intel.title": "客户信息",
    "action.startRoute": "开始路线",
    "action.arrived": "已到达",
    "action.liveOn": "开启实时位置",
    "action.liveOff": "停止分享",
    "action.sendEta": "发送当前 ETA",
    "action.delay": "通知延迟",
    "action.openMap": "打开地图",
    "action.viewBrief": "查看完整简报",
    "action.saveProfile": "保存工作资料",
    "action.updateProfile": "更新资料",
    "action.updatePayout": "更新付款",
    "action.compcard": "生成资料卡",
    "value.waitEta": "等待更新",
    "value.noUpdate": "暂无更新",
    "value.ready": "准备接收指令",
    "value.standby": "待命",
    "value.saved": "已保存",
    "value.dirty": "有未保存修改",
    "value.unsaved": "未保存",
    "value.onWay": "路上",
    "value.arrived": "已到达",
    "value.met": "已见客户",
    "error.startLocked": "最终付款确认前不能开始工作。"
  });

  COPY.ja = Object.assign({}, COPY.en, {
    "lang.aria": "言語を選択",
    "hero.title": "モデルコンソール",
    "hero.subtitle": "確認してから動く",
    "hero.copy": "仕事の状態、ETA、ルート、チームへの共有をこの画面で管理します。",
    "label.session": "セッション",
    "label.status": "状態",
    "label.lastUpdate": "最終更新",
    "label.availability": "対応状況",
    "label.visibility": "表示",
    "label.payout": "支払い",
    "label.currentEta": "現在の ETA",
    "label.date": "日付",
    "label.time": "時間",
    "label.location": "場所",
    "label.travel": "移動",
    "label.payment": "支払い",
    "label.openMap": "地図を開く",
    "label.saveState": "保存状態",
    "command.title": "現在の指示",
    "command.copy": "まずここで指示を確認し、実際の状態に合う操作だけを押してください。",
    "strip.title": "ステータス概要",
    "priority.title": "優先ステップ",
    "step.routeTitle": "ルート開始",
    "step.routeCopy": "実際に移動を始めた時だけルートを開始し、チームに正しい状態を共有します。",
    "step.liveTitle": "ライブ位置情報",
    "step.liveCopy": "ライブ位置情報の開始と停止は admin-worker 経由だけで行います。",
    "step.etaTitle": "ETA を送信",
    "brief.title": "セッション概要",
    "assistant.title": "先にクライアントを読む",
    "assistant.clientReadValue": "丁寧、やわらかい、明確、自信あり",
    "assistant.arrivalCueValue": "ロビーに入る前に毎回 ETA を送る",
    "assistant.noteValue": "返信は短く、明確に、実際の状態だけを伝える。",
    "timeline.title": "セッションタイムライン",
    "timeline.met": "会いました",
    "timeline.started": "仕事開始",
    "timeline.finished": "完了",
    "timeline.separated": "解散済み",
    "work.title": "仕事プロフィール",
    "work.tabsAria": "仕事プロフィールタブ",
    "work.public": "公開",
    "work.private": "プライベート",
    "work.publicJob": "公開案件",
    "work.publicJobValue": "標準 5 時間案件",
    "work.publicMin": "公開最低料金",
    "work.publicStandard": "公開標準料金",
    "work.privateJob": "プライベート案件",
    "work.privateJobValue": "標準 2 時間案件",
    "work.privateHours": "2-5 時間以上も受けますか？",
    "work.accept": "受ける",
    "work.decline": "受けない",
    "budget.title": "クライアント予算",
    "budget.level1": "Level 1 通常",
    "budget.level2": "Level 2 中",
    "budget.level3": "Level 3 高",
    "budget.level4": "Level 4 最高",
    "tools.title": "プロフィール / 支払い / コンポジット",
    "intel.title": "クライアント情報",
    "action.startRoute": "ルート開始",
    "action.arrived": "到着",
    "action.liveOn": "ライブ位置情報を開始",
    "action.liveOff": "共有停止",
    "action.sendEta": "現在の ETA を送信",
    "action.delay": "遅延を通知",
    "action.openMap": "地図を開く",
    "action.viewBrief": "全概要を見る",
    "action.saveProfile": "仕事プロフィールを保存",
    "action.updateProfile": "プロフィール更新",
    "action.updatePayout": "支払い更新",
    "action.compcard": "コンポジット作成",
    "value.waitEta": "更新待ち",
    "value.noUpdate": "まだ更新なし",
    "value.ready": "指示待ち",
    "value.standby": "待機",
    "value.saved": "保存済み",
    "value.dirty": "未保存の変更あり",
    "value.unsaved": "未保存",
    "value.onWay": "移動中",
    "value.arrived": "到着済み",
    "value.met": "クライアント確認済み",
    "error.startLocked": "最終支払い確認前は Start Work できません。"
  });

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function trim(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function formatTemplate(value, data) {
    return String(value || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, key) {
      return data && data[key] !== undefined ? data[key] : match;
    });
  }

  function normalizeLang(value) {
    var lang = trim(value).toLowerCase();
    return SUPPORTED_LANGS.indexOf(lang) === -1 ? "" : lang;
  }

  function readStoredLang() {
    try {
      return normalizeLang(window.localStorage && window.localStorage.getItem(LANG_STORAGE_KEY));
    } catch (_error) {
      return "";
    }
  }

  function storeLang(lang) {
    try {
      if (window.localStorage) window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (_error) {
      return;
    }
  }

  function resolveLang() {
    var params = new URLSearchParams(window.location.search || "");
    var queryLang = normalizeLang(params.get("lang"));
    if (queryLang) {
      storeLang(queryLang);
      return queryLang;
    }
    return readStoredLang() || DEFAULT_LANG;
  }

  function isDefaultCopyValue(key, value) {
    var index;
    var lang;
    for (index = 0; index < SUPPORTED_LANGS.length; index += 1) {
      lang = SUPPORTED_LANGS[index];
      if (COPY[lang] && COPY[lang][key] === value) return true;
    }
    return false;
  }

  function copy(lang, key, data) {
    var table = COPY[lang] || COPY[DEFAULT_LANG];
    var value = (table && table[key]) || (COPY[DEFAULT_LANG] && COPY[DEFAULT_LANG][key]) || "";
    return data ? formatTemplate(value, data) : value;
  }

  function find(root, selector) {
    return root.querySelector(selector);
  }

  function findAll(root, selector) {
    return toArray(root.querySelectorAll(selector));
  }

  function currentDate() {
    return new Date();
  }

  function formatDate(date) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
    } catch (_error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function formatTime(date) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    } catch (_error) {
      return date.toTimeString().slice(0, 5);
    }
  }

  function formatStamp(date) {
    return formatDate(date) + " · " + formatTime(date);
  }

  function readSignedRef(root) {
    var params = new URLSearchParams(window.location.search || "");
    return trim(root.getAttribute("data-signed-ref")) || trim(params.get("t"));
  }

  function normalizeWorkerBase(value) {
    var raw = trim(value).replace(/\/+$/, "");
    if (!raw || raw === "/admin-worker") return "";
    return raw;
  }

  function buildApiUrl(state, path) {
    var base = normalizeWorkerBase(state.adminBase);
    var url = base + path;
    var separator = url.indexOf("?") === -1 ? "?" : "&";
    return url + separator + "t=" + encodeURIComponent(state.signedRef || "");
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (response) {
      return response.text().then(function (text) {
        var data = {};

        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_error) {
            data = {};
          }
        }

        if (!response.ok) {
          var error = new Error(
            (data.error && (data.error.message || data.error.code)) ||
              data.error ||
              "request_failed"
          );
          error.status = response.status;
          error.data = data;
          throw error;
        }

        return data;
      });
    });
  }

  function apiPost(state, path, payload) {
    return fetchJson(buildApiUrl(state, path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload || {})
    });
  }

  function mapTimelineActionToEvent(action) {
    if (action === "started") return "work_started";
    if (action === "finished") return "work_finished";
    if (action === "on_the_way") return "en_route";
    return action;
  }

  function deriveAvailability(state) {
    if (state.sessionStatus === "on_the_way" || state.sessionStatus === "en_route") return copy(state.lang, "value.onWay");
    if (state.sessionStatus === "arrived") return copy(state.lang, "value.arrived");
    if (state.sessionStatus === "met") return copy(state.lang, "value.met");
    if (state.sessionStatus === "started" || state.sessionStatus === "work_started") return copy(state.lang, "value.inSession");
    if (state.sessionStatus === "finished" || state.sessionStatus === "work_finished") return copy(state.lang, "value.wrapUp");
    if (state.sessionStatus === "separated") return copy(state.lang, "value.separated");
    if (state.liveOn) return copy(state.lang, "value.trackingEnabled");
    return copy(state.lang, "value.ready");
  }

  function deriveTravel(state) {
    if (state.sessionStatus === "on_the_way" || state.sessionStatus === "en_route") return copy(state.lang, "value.routeActive");
    if (state.sessionStatus === "arrived") return copy(state.lang, "value.arrivedSite");
    if (state.sessionStatus === "met") return copy(state.lang, "value.clientContact");
    if (state.sessionStatus === "started" || state.sessionStatus === "work_started") return copy(state.lang, "value.sessionStarted");
    if (state.sessionStatus === "finished" || state.sessionStatus === "work_finished") return copy(state.lang, "value.sessionWrapped");
    if (state.sessionStatus === "separated") return copy(state.lang, "value.departureComplete");
    if (state.liveOn) return copy(state.lang, "value.trackingEnabled");
    return copy(state.lang, "value.awaitingRoute");
  }

  function derivePayment(state) {
    if (state.finalPaymentStatus) return state.finalPaymentStatus;
    if (state.paymentStatus) return state.paymentStatus;
    if (state.sessionStatus === "started" || state.sessionStatus === "work_started") return copy(state.lang, "value.paymentCleared");
    if (state.sessionStatus === "finished" || state.sessionStatus === "work_finished") return copy(state.lang, "value.reviewBeforePayout");
    if (state.sessionStatus === "separated") return copy(state.lang, "value.payoutHandoff");
    return copy(state.lang, "value.paymentPending");
  }

  function derivePayout(state) {
    if (state.sessionStatus === "finished" || state.sessionStatus === "work_finished") return copy(state.lang, "value.reviewPending");
    if (state.sessionStatus === "separated") return copy(state.lang, "value.pendingRelease");
    return copy(state.lang, "value.awaitingRelease");
  }

  function deriveFinishIntel(state) {
    if (state.sessionStatus === "finished" || state.sessionStatus === "work_finished" || state.sessionStatus === "separated") {
      return copy(state.lang, "intel.finishReady");
    }
    return copy(state.lang, "intel.finishDefault");
  }

  function collectElements(root) {
    return {
      root: root,
      langButtons: findAll(root, "[data-lang-button]"),
      headerLive: find(root, "[data-header-live]"),
      commandLabel: find(root, "[data-command-label]"),
      lastUpdate: find(root, "[data-last-update]"),
      availability: find(root, "[data-availability]"),
      visibility: find(root, "[data-visibility]"),
      gps: find(root, "[data-gps]"),
      payout: find(root, "[data-payout]"),
      sessionIdLabel: find(root, "[data-session-id-label]"),
      sessionStatus: find(root, "[data-session-status]"),
      etaDisplay: find(root, "[data-eta-display]"),
      etaInput: find(root, "[data-eta-input]"),
      briefSession: find(root, "[data-brief-session]"),
      briefStatus: find(root, "[data-brief-status]"),
      briefDate: find(root, "[data-brief-date]"),
      briefTime: find(root, "[data-brief-time]"),
      briefLocation: find(root, "[data-brief-location]"),
      briefTravel: find(root, "[data-brief-travel]"),
      briefPayment: find(root, "[data-brief-payment]"),
      openMap: find(root, "[data-open-map]"),
      saveState: find(root, "[data-save-state]"),
      surfaceNote: find(root, "[data-surface-note]"),
      intelFinish: find(root, "[data-intel-finish]"),
      timelineButtons: findAll(root, "[data-timeline-action]"),
      tabButtons: findAll(root, "[data-tab-target]"),
      tabPanels: findAll(root, "[data-tab-panel]"),
      rateInputs: findAll(root, "[data-rate-input]"),
      chipButtons: findAll(root, "[data-chip-group]"),
      budgetButtons: findAll(root, "[data-budget-level]"),
      startRouteButtons: findAll(root, "[data-action-start-route]"),
      arrivedButtons: findAll(root, "[data-action-arrived]"),
      liveOnButtons: findAll(root, "[data-action-live-on]"),
      liveOffButtons: findAll(root, "[data-action-live-off]"),
      sendEtaButtons: findAll(root, "[data-action-send-eta]"),
      notifyDelayButtons: findAll(root, "[data-action-notify-delay]"),
      saveProfileButton: find(root, "[data-action-save-profile]"),
      viewBriefButton: find(root, "[data-action-view-brief]"),
      intelTone: find(root, "[data-intel-tone]"),
      intelCaution: find(root, "[data-intel-caution]"),
      intelPayment: find(root, "[data-intel-payment]"),
      utilityButtons: findAll(root, "[data-utility-action]")
    };
  }

  function createState(root, view) {
    var now = currentDate();
    var lang = resolveLang();

    return {
      lang: lang,
      sessionId: trim(root.getAttribute("data-session-id")) || "sess_preview",
      modelId: trim(root.getAttribute("data-model-id")) || "model_preview",
      signedRef: readSignedRef(root),
      adminBase: trim(root.getAttribute("data-admin-base")) || "",
      sessionStatus: trim(view.sessionStatus && view.sessionStatus.textContent) || "assigned",
      commandLabel: isDefaultCopyValue("value.standby", trim(view.commandLabel && view.commandLabel.textContent))
        ? copy(lang, "value.standby")
        : trim(view.commandLabel && view.commandLabel.textContent) || copy(lang, "value.standby"),
      etaText: isDefaultCopyValue("value.waitEta", trim(view.etaDisplay && view.etaDisplay.textContent))
        ? copy(lang, "value.waitEta")
        : trim(view.etaDisplay && view.etaDisplay.textContent) || copy(lang, "value.waitEta"),
      lastUpdate: isDefaultCopyValue("value.noUpdate", trim(view.lastUpdate && view.lastUpdate.textContent))
        ? copy(lang, "value.noUpdate")
        : trim(view.lastUpdate && view.lastUpdate.textContent) || copy(lang, "value.noUpdate"),
      visibility: isDefaultCopyValue("value.visible", trim(view.visibility && view.visibility.textContent))
        ? copy(lang, "value.visible")
        : trim(view.visibility && view.visibility.textContent) || copy(lang, "value.visible"),
      location: trim(view.briefLocation && view.briefLocation.textContent) || "Sukhumvit / Private Lounge",
      mapUrl: "",
      dateLabel: trim(view.briefDate && view.briefDate.textContent) || formatDate(now),
      timeLabel: trim(view.briefTime && view.briefTime.textContent) || "20:30",
      paymentStatus: "",
      finalPaymentStatus: "",
      gpsStatus: "",
      suggestedTone: trim(view.intelTone && view.intelTone.textContent),
      caution: trim(view.intelCaution && view.intelCaution.textContent),
      budgetLevel: "Level 2 กลาง",
      activeTab: "public",
      liveOn: false,
      dirty: false,
      saved: true,
      note: readSignedRef(root)
        ? copy(lang, "note.readyWithT")
        : copy(lang, "note.readyNoT")
    };
  }

  function setText(node, value) {
    if (!node) return;
    node.textContent = value;
  }

  function setPressed(node, pressed) {
    if (!node) return;
    node.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  function setSelected(node, selected) {
    if (!node) return;
    node.setAttribute("aria-selected", selected ? "true" : "false");
  }

  function setLanguage(view, state, lang) {
    var previousLang = state.lang;
    var previousCommand = state.commandLabel;
    var previousEta = state.etaText;
    var previousLastUpdate = state.lastUpdate;
    var previousVisibility = state.visibility;

    state.lang = normalizeLang(lang) || DEFAULT_LANG;
    storeLang(state.lang);

    if (isDefaultCopyValue("value.standby", previousCommand)) state.commandLabel = copy(state.lang, "value.standby");
    if (isDefaultCopyValue("value.waitEta", previousEta)) state.etaText = copy(state.lang, "value.waitEta");
    if (isDefaultCopyValue("value.noUpdate", previousLastUpdate)) state.lastUpdate = copy(state.lang, "value.noUpdate");
    if (isDefaultCopyValue("value.visible", previousVisibility)) state.visibility = copy(state.lang, "value.visible");
    if (state.note === copy(previousLang, "note.readyWithT")) state.note = copy(state.lang, "note.readyWithT");
    if (state.note === copy(previousLang, "note.readyNoT")) state.note = copy(state.lang, "note.readyNoT");

    renderSurface(view, state);
  }

  function applyAttributeCopy(node, lang) {
    var pairs = trim(node.getAttribute("data-i18n-attr")).split(/\s*,\s*/);
    var index;
    var pair;
    var separator;
    var attr;
    var key;

    for (index = 0; index < pairs.length; index += 1) {
      pair = pairs[index];
      separator = pair.indexOf(":");
      if (separator === -1) continue;
      attr = trim(pair.slice(0, separator));
      key = trim(pair.slice(separator + 1));
      if (attr && key) node.setAttribute(attr, copy(lang, key));
    }
  }

  function renderLanguage(view, state) {
    var nodes = findAll(view.root, "[data-i18n]");
    var attrNodes = findAll(view.root, "[data-i18n-attr]");
    var index;
    var button;

    for (index = 0; index < nodes.length; index += 1) {
      setText(nodes[index], copy(state.lang, nodes[index].getAttribute("data-i18n")));
    }

    for (index = 0; index < attrNodes.length; index += 1) {
      applyAttributeCopy(attrNodes[index], state.lang);
    }

    for (index = 0; index < view.langButtons.length; index += 1) {
      button = view.langButtons[index];
      button.classList.toggle("is-active", button.getAttribute("data-lang-button") === state.lang);
      setPressed(button, button.getAttribute("data-lang-button") === state.lang);
    }
  }

  function setLiveState(state, on) {
    state.liveOn = Boolean(on);
  }

  function updateTimestamp(state) {
    state.lastUpdate = formatStamp(currentDate());
  }

  function buildPayload(state, action, extra) {
    var payload = {
      action: action,
      event: mapTimelineActionToEvent(action),
      session_id: state.sessionId,
      model_id: state.modelId,
      source_surface: "webflow_model_console"
    };
    var key;

    if (!extra) return payload;

    for (key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) {
        payload[key] = extra[key];
      }
    }

    return payload;
  }

  function logMock(action, payload) {
    if (typeof console !== "undefined" && console.log) {
      console.log("[MMDModelConsole]", action, payload);
    }
  }

  function readEtaInput(view) {
    return trim(view.etaInput && view.etaInput.value);
  }

  function updateMapLink(view, state) {
    if (!view.openMap) return;
    view.openMap.href = state.mapUrl || ("https://maps.google.com/?q=" + encodeURIComponent(state.location || ""));
  }

  function renderTabs(view, state) {
    var index;
    var button;
    var panel;

    for (index = 0; index < view.tabButtons.length; index += 1) {
      button = view.tabButtons[index];
      button.classList.toggle("is-active", button.getAttribute("data-tab-target") === state.activeTab);
      setSelected(button, button.getAttribute("data-tab-target") === state.activeTab);
    }

    for (index = 0; index < view.tabPanels.length; index += 1) {
      panel = view.tabPanels[index];
      panel.hidden = panel.getAttribute("data-tab-panel") !== state.activeTab;
    }
  }

  function renderTimeline(view, state) {
    var index;
    var button;

    for (index = 0; index < view.timelineButtons.length; index += 1) {
      button = view.timelineButtons[index];
      button.classList.toggle(
        "is-active",
        mapTimelineActionToEvent(button.getAttribute("data-timeline-action")) === state.sessionStatus
      );
    }
  }

  function renderSurface(view, state) {
    var availability = deriveAvailability(state);
    var travel = deriveTravel(state);
    var payment = derivePayment(state);
    var payout = derivePayout(state);
    var finishIntel = deriveFinishIntel(state);
    var gpsLabel = state.liveOn ? copy(state.lang, "value.liveOn") : copy(state.lang, "value.liveOff");
    var saveState = copy(state.lang, "value.saved");

    if (state.dirty) saveState = copy(state.lang, "value.dirty");
    if (!state.dirty && state.saved) saveState = copy(state.lang, "value.saved");

    state.rootClass = state.liveOn ? "is-live" : "";

    renderLanguage(view, state);

    view.root.classList.toggle("is-live", state.liveOn);
    view.root.classList.toggle("is-dirty", state.dirty);
    view.root.classList.toggle("is-saved", !state.dirty && state.saved);

    if (view.headerLive) {
      view.headerLive.textContent = gpsLabel;
      view.headerLive.classList.toggle("is-live", state.liveOn);
      setPressed(view.headerLive, state.liveOn);
    }

    setText(view.commandLabel, state.commandLabel);
    setText(view.lastUpdate, state.lastUpdate);
    setText(view.availability, availability);
    setText(view.visibility, state.visibility);
    setText(view.gps, gpsLabel);
    setText(view.payout, payout);
    setText(view.sessionIdLabel, state.sessionId);
    setText(view.sessionStatus, state.sessionStatus);
    setText(view.etaDisplay, state.etaText);
    setText(view.briefSession, state.sessionId);
    setText(view.briefStatus, state.sessionStatus);
    setText(view.briefDate, state.dateLabel);
    setText(view.briefTime, state.timeLabel);
    setText(view.briefLocation, state.location);
    setText(view.briefTravel, travel);
    setText(view.briefPayment, payment);
    setText(view.saveState, saveState);
    setText(view.surfaceNote, state.note);
    setText(view.intelFinish, finishIntel);
    setText(view.intelTone, state.suggestedTone || copy(state.lang, "intel.defaultTone"));
    setText(view.intelCaution, state.caution || copy(state.lang, "intel.defaultCaution"));
    setText(view.intelPayment, payment);

    updateMapLink(view, state);
    renderTabs(view, state);
    renderTimeline(view, state);
  }

  function setNote(state, message) {
    state.note = message;
  }

  function isFinalPaymentConfirmed(state) {
    var value = trim(state && state.finalPaymentStatus).toLowerCase();
    return value === "final_payment_confirmed";
  }

  function statusErrorMessage(error, fallback) {
    var lang = (instance && instance.state && instance.state.lang) || DEFAULT_LANG;
    if (error && error.status === 423) {
      return copy(lang, "error.startLocked");
    }
    if (error && error.status === 409) {
      return copy(lang, "error.sequence");
    }
    return fallback || copy(lang, "error.request");
  }

  function combineTime(startTime, endTime) {
    if (startTime && endTime) return startTime + " - " + endTime;
    return startTime || endTime || "";
  }

  function applyDashboardSession(view, state, session) {
    if (!session) return;

    state.sessionId = trim(session.session_id) || state.sessionId;
    state.sessionStatus = trim(session.status) || state.sessionStatus;
    state.commandLabel = state.sessionStatus;
    state.dateLabel = trim(session.job_date) || state.dateLabel;
    state.timeLabel = combineTime(trim(session.start_time), trim(session.end_time)) || state.timeLabel;
    state.location = trim(session.location_name) || state.location;
    state.mapUrl = trim(session.google_map_url) || state.mapUrl;
    state.paymentStatus = trim(session.payment_status);
    state.finalPaymentStatus = trim(session.final_payment_status);
    state.gpsStatus = trim(session.gps_status);
    state.liveOn = state.gpsStatus.toLowerCase() === "active" || state.gpsStatus.toLowerCase() === "live";
    state.suggestedTone = trim(session.suggested_tone) || state.suggestedTone;
    state.caution = trim(session.caution) || state.caution;
    state.lastUpdate = trim(session.last_update) || state.lastUpdate;
    state.note =
      trim(session.console_popup) ||
      trim(session.do_note) ||
      trim(session.client_vibe) ||
      copy(state.lang, "note.loaded");

    renderSurface(view, state);
  }

  function loadDashboard(view, state) {
    if (!state.signedRef) {
      renderSurface(view, state);
      return Promise.resolve(null);
    }

    setNote(state, copy(state.lang, "note.loading"));
    renderSurface(view, state);

    return fetchJson(buildApiUrl(state, "/v1/model/session/dashboard"))
      .then(function (data) {
        applyDashboardSession(view, state, data.session);
        return data;
      })
      .catch(function (error) {
        setNote(state, statusErrorMessage(error, copy(state.lang, "note.loadFailed")));
        renderSurface(view, state);
        return null;
      });
  }

  function markDirty(view, state) {
    state.dirty = true;
    state.saved = false;
    setNote(state, copy(state.lang, "note.dirty"));
    renderSurface(view, state);
  }

  function collectChipGroup(view, groupName) {
    var values = [];
    var index;
    var button;

    for (index = 0; index < view.chipButtons.length; index += 1) {
      button = view.chipButtons[index];
      if (button.getAttribute("data-chip-group") === groupName && button.classList.contains("is-active")) {
        values.push(trim(button.getAttribute("data-chip-value")));
      }
    }

    return values;
  }

  function collectRates(view) {
    var rates = {};
    var index;
    var input;
    var name;

    for (index = 0; index < view.rateInputs.length; index += 1) {
      input = view.rateInputs[index];
      name = trim(input.getAttribute("data-rate-input"));
      rates[name] = trim(input.value);
    }

    return rates;
  }

  function collectWorkProfile() {
    if (!instance) return null;

    return {
      session_id: instance.state.sessionId,
      model_id: instance.state.modelId,
      source_surface: "webflow_model_console",
      public_profile: {
        job: "งานมาตรฐาน 5 ชม.",
        minimum_rate: collectRates(instance.view).public_minimum_rate || "",
        standard_rate: collectRates(instance.view).public_standard_rate || "",
        mode: collectChipGroup(instance.view, "public_mode")
      },
      private_profile: {
        job: "งานมาตรฐาน 2 ชม.",
        accepts_2_to_5_hours: collectChipGroup(instance.view, "private_hours")[0] || "",
        pn_minimum_rate: collectRates(instance.view).pn_minimum_rate || "",
        pn_standard_rate: collectRates(instance.view).pn_standard_rate || "",
        vip_minimum_rate: collectRates(instance.view).vip_minimum_rate || "",
        vip_standard_rate: collectRates(instance.view).vip_standard_rate || ""
      },
      client_budget: instance.state.budgetLevel
    };
  }

  function saveWorkProfile() {
    if (!instance) return null;

    var payload = collectWorkProfile();

    updateTimestamp(instance.state);
    if (!instance.state.signedRef) {
      instance.state.dirty = false;
      instance.state.saved = true;
      setNote(instance.state, copy(instance.state.lang, "note.previewSaved"));
      renderSurface(instance.view, instance.state);
      logMock("save_work_profile", payload);
      return payload;
    }

    setNote(instance.state, copy(instance.state.lang, "note.profileSending"));
    renderSurface(instance.view, instance.state);
    apiPost(instance.state, "/v1/model/session/update", payload)
      .then(function () {
        instance.state.dirty = false;
        instance.state.saved = true;
        updateTimestamp(instance.state);
        setNote(instance.state, copy(instance.state.lang, "note.profileAccepted"));
        renderSurface(instance.view, instance.state);
      })
      .catch(function (error) {
        setNote(instance.state, statusErrorMessage(error, copy(instance.state.lang, "note.profileRejected")));
        renderSurface(instance.view, instance.state);
      });
    return payload;
  }

  function setTimelineStatus(action) {
    if (!instance) return;

    var nextStatus = mapTimelineActionToEvent(action);
    var payload = buildPayload(instance.state, action, {
      status: nextStatus,
      eta_text: instance.state.etaText
    });

    if ((action === "started" || nextStatus === "work_started") && !isFinalPaymentConfirmed(instance.state)) {
      setNote(instance.state, copy(instance.state.lang, "error.startLocked"));
      renderSurface(instance.view, instance.state);
      return;
    }

    if (!instance.state.signedRef) {
      instance.state.sessionStatus = nextStatus;
      instance.state.commandLabel = nextStatus;
      updateTimestamp(instance.state);
      setNote(instance.state, copy(instance.state.lang, "note.localStatus", { status: nextStatus }));
      renderSurface(instance.view, instance.state);
      return;
    }

    setNote(instance.state, copy(instance.state.lang, "note.statusSending"));
    renderSurface(instance.view, instance.state);
    apiPost(instance.state, "/v1/model/session/status", payload)
      .then(function (data) {
        instance.state.sessionStatus = trim(data.status) || nextStatus;
        instance.state.commandLabel = instance.state.sessionStatus;
        updateTimestamp(instance.state);
        setNote(instance.state, copy(instance.state.lang, "note.statusUpdated"));
        renderSurface(instance.view, instance.state);
      })
      .catch(function (error) {
        setNote(instance.state, statusErrorMessage(error, copy(instance.state.lang, "note.statusRejected")));
        renderSurface(instance.view, instance.state);
      });
  }

  function postGpsUpdate(action, extra, successMessage) {
    if (!instance) return;

    var payload = buildPayload(instance.state, action, extra || {});

    if (!instance.state.signedRef) {
      logMock(action, payload);
      return;
    }

    apiPost(instance.state, "/v1/model/session/gps", payload)
      .then(function () {
        setNote(instance.state, successMessage || copy(instance.state.lang, "note.gpsAccepted"));
        renderSurface(instance.view, instance.state);
      })
      .catch(function (error) {
        setNote(instance.state, statusErrorMessage(error, copy(instance.state.lang, "note.gpsRejected")));
        renderSurface(instance.view, instance.state);
      });
  }

  function postStatus(action, extra, success) {
    if (!instance) return;

    var nextStatus = mapTimelineActionToEvent(action);
    var payload = buildPayload(instance.state, action, extra || {});
    payload.status = nextStatus;

    if ((action === "started" || nextStatus === "work_started") && !isFinalPaymentConfirmed(instance.state)) {
      setNote(instance.state, copy(instance.state.lang, "error.startLocked"));
      renderSurface(instance.view, instance.state);
      return;
    }

    if (!instance.state.signedRef) {
      instance.state.sessionStatus = nextStatus;
      instance.state.commandLabel = success || nextStatus;
      updateTimestamp(instance.state);
      setNote(instance.state, copy(instance.state.lang, "note.localStatus", { status: nextStatus }));
      renderSurface(instance.view, instance.state);
      logMock(action, payload);
      return;
    }

    setNote(instance.state, copy(instance.state.lang, "note.statusSending"));
    renderSurface(instance.view, instance.state);
    apiPost(instance.state, "/v1/model/session/status", payload)
      .then(function (data) {
        instance.state.sessionStatus = trim(data.status) || nextStatus;
        instance.state.commandLabel = success || instance.state.sessionStatus;
        updateTimestamp(instance.state);
        setNote(instance.state, copy(instance.state.lang, "note.statusUpdated"));
        renderSurface(instance.view, instance.state);
      })
      .catch(function (error) {
        setNote(instance.state, statusErrorMessage(error, copy(instance.state.lang, "note.statusRejected")));
        renderSurface(instance.view, instance.state);
      });
  }

  function setTimelineStatusLocalOnly(action) {
    if (!instance) return;

    instance.state.sessionStatus = action;
    instance.state.commandLabel = action;
    updateTimestamp(instance.state);
    setNote(instance.state, copy(instance.state.lang, "note.timelineLocal", { status: action }));
    renderSurface(instance.view, instance.state);
    logMock("timeline_status", buildPayload(instance.state, action, {
      eta_text: instance.state.etaText
    }));
  }

  function startRoute() {
    if (!instance) return;

    var etaValue = readEtaInput(instance.view);

    setLiveState(instance.state, true);
    instance.state.etaText = etaValue || copy(instance.state.lang, "value.etaLive");
    postStatus("on_the_way", {
      eta_text: instance.state.etaText,
      live_on: true
    }, copy(instance.state.lang, "value.routeStarted"));
    postGpsUpdate("gps", {
      eta_text: instance.state.etaText,
      live_on: true
    }, copy(instance.state.lang, "note.gpsAccepted"));
  }

  function arrived() {
    if (!instance) return;

    if (!readEtaInput(instance.view)) {
      instance.state.etaText = copy(instance.state.lang, "value.arrivedSite");
    }
    postStatus("arrived", {
      eta_text: instance.state.etaText
    }, "Arrived");
  }

  function setLive(on) {
    if (!instance) return;

    setLiveState(instance.state, on);
    updateTimestamp(instance.state);
    setNote(
      instance.state,
      instance.state.liveOn
        ? copy(instance.state.lang, "note.liveSending")
        : copy(instance.state.lang, "note.livePausing")
    );
    renderSurface(instance.view, instance.state);
    postGpsUpdate("set_live", {
      live_on: instance.state.liveOn,
      eta_text: instance.state.etaText
    });
  }

  function sendEta() {
    if (!instance) return;

    var etaValue = readEtaInput(instance.view);

    instance.state.etaText = etaValue || instance.state.etaText || copy(instance.state.lang, "value.etaSent");
    updateTimestamp(instance.state);
    setNote(instance.state, copy(instance.state.lang, "note.etaSending"));
    renderSurface(instance.view, instance.state);
    postGpsUpdate("send_eta", {
      eta_text: instance.state.etaText,
      live_on: instance.state.liveOn
    }, copy(instance.state.lang, "note.etaAccepted"));
  }

  function notifyDelay() {
    if (!instance) return;

    var etaValue = readEtaInput(instance.view);

    instance.state.etaText = etaValue
      ? copy(instance.state.lang, "value.delayedPrefix", { eta: etaValue })
      : copy(instance.state.lang, "value.delayedUpdating");
    updateTimestamp(instance.state);
    instance.state.commandLabel = copy(instance.state.lang, "value.delayNotified");
    setNote(instance.state, copy(instance.state.lang, "note.delaySending"));
    renderSurface(instance.view, instance.state);
    postGpsUpdate("notify_delay", {
      eta_text: instance.state.etaText
    }, copy(instance.state.lang, "note.delayAccepted"));
  }

  function activateTab(view, state, tabName) {
    state.activeTab = tabName;
    renderSurface(view, state);
  }

  function handleChipClick(view, state, button) {
    var groupName = trim(button.getAttribute("data-chip-group"));
    var singleSelect = button.getAttribute("data-chip-single") === "true";
    var groupButtons = findAll(view.root, '[data-chip-group="' + groupName + '"]');
    var index;

    if (singleSelect) {
      for (index = 0; index < groupButtons.length; index += 1) {
        groupButtons[index].classList.remove("is-active");
        setPressed(groupButtons[index], false);
      }
      button.classList.add("is-active");
      setPressed(button, true);
    } else {
      button.classList.toggle("is-active");
      setPressed(button, button.classList.contains("is-active"));
    }

    markDirty(view, state);
  }

  function handleBudgetClick(view, state, button) {
    var index;

    for (index = 0; index < view.budgetButtons.length; index += 1) {
      view.budgetButtons[index].classList.remove("is-active");
      setPressed(view.budgetButtons[index], false);
    }

    button.classList.add("is-active");
    setPressed(button, true);
    state.budgetLevel = trim(button.getAttribute("data-budget-level"));
    markDirty(view, state);
  }

  function handleUtility(view, state, action) {
    var path = action === "emergency" ? "/v1/model/session/emergency" : "/v1/model/session/update";
    var payload = buildPayload(state, action, {
      utility: action
    });

    updateTimestamp(state);
    setNote(state, copy(state.lang, "note.utilitySending", { action: action }));
    renderSurface(view, state);
    if (!state.signedRef) {
      logMock("utility_action", payload);
      return;
    }
    apiPost(state, path, payload)
      .then(function () {
        setNote(state, copy(state.lang, "note.utilityAccepted", { action: action }));
        renderSurface(view, state);
      })
      .catch(function (error) {
        setNote(state, statusErrorMessage(error, copy(state.lang, "note.utilityRejected", { action: action })));
        renderSurface(view, state);
      });
  }

  function bindEvents(view, state) {
    var index;
    var button;

    for (index = 0; index < view.startRouteButtons.length; index += 1) {
      view.startRouteButtons[index].addEventListener("click", startRoute);
    }

    for (index = 0; index < view.langButtons.length; index += 1) {
      button = view.langButtons[index];
      button.addEventListener("click", function (event) {
        setLanguage(view, state, event.currentTarget.getAttribute("data-lang-button"));
      });
    }

    for (index = 0; index < view.arrivedButtons.length; index += 1) {
      view.arrivedButtons[index].addEventListener("click", arrived);
    }

    for (index = 0; index < view.liveOnButtons.length; index += 1) {
      view.liveOnButtons[index].addEventListener("click", function () {
        setLive(true);
      });
    }

    for (index = 0; index < view.liveOffButtons.length; index += 1) {
      view.liveOffButtons[index].addEventListener("click", function () {
        setLive(false);
      });
    }

    for (index = 0; index < view.sendEtaButtons.length; index += 1) {
      view.sendEtaButtons[index].addEventListener("click", sendEta);
    }

    for (index = 0; index < view.notifyDelayButtons.length; index += 1) {
      view.notifyDelayButtons[index].addEventListener("click", notifyDelay);
    }

    if (view.headerLive) {
      view.headerLive.addEventListener("click", function () {
        setLive(!state.liveOn);
      });
    }

    for (index = 0; index < view.timelineButtons.length; index += 1) {
      button = view.timelineButtons[index];
      button.addEventListener("click", function (event) {
        setTimelineStatus(event.currentTarget.getAttribute("data-timeline-action"));
      });
    }

    for (index = 0; index < view.tabButtons.length; index += 1) {
      button = view.tabButtons[index];
      button.addEventListener("click", function (event) {
        activateTab(view, state, event.currentTarget.getAttribute("data-tab-target"));
      });
    }

    for (index = 0; index < view.rateInputs.length; index += 1) {
      view.rateInputs[index].addEventListener("input", function () {
        markDirty(view, state);
      });
    }

    for (index = 0; index < view.chipButtons.length; index += 1) {
      button = view.chipButtons[index];
      button.addEventListener("click", function (event) {
        handleChipClick(view, state, event.currentTarget);
      });
    }

    for (index = 0; index < view.budgetButtons.length; index += 1) {
      button = view.budgetButtons[index];
      button.addEventListener("click", function (event) {
        handleBudgetClick(view, state, event.currentTarget);
      });
    }

    if (view.saveProfileButton) {
      view.saveProfileButton.addEventListener("click", saveWorkProfile);
    }

    if (view.viewBriefButton) {
      view.viewBriefButton.addEventListener("click", function () {
        updateTimestamp(state);
        setNote(state, copy(state.lang, "note.brief"));
        renderSurface(view, state);
        logMock("view_full_brief", buildPayload(state, "view_full_brief", {
          session_status: state.sessionStatus
        }));
      });
    }

    for (index = 0; index < view.utilityButtons.length; index += 1) {
      button = view.utilityButtons[index];
      button.addEventListener("click", function (event) {
        handleUtility(view, state, event.currentTarget.getAttribute("data-utility-action"));
      });
    }
  }

  function init() {
    var root = document.getElementById("mmd-model-console");
    var view;
    var state;

    if (!root) return null;

    view = collectElements(root);
    state = createState(root, view);

    instance = {
      root: root,
      view: view,
      state: state
    };

    bindEvents(view, state);
    renderSurface(view, state);
    loadDashboard(view, state);
    return instance;
  }

  window.MMDModelConsole = {
    init: init,
    startRoute: startRoute,
    arrived: arrived,
    setLive: setLive,
    sendEta: sendEta,
    notifyDelay: notifyDelay,
    collectWorkProfile: collectWorkProfile
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
