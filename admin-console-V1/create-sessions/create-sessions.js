(function () {
  'use strict';

  var root = document.querySelector('[data-cs-root]');
  if (!root) return;

  var ASSETS = {
    hero: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c4422fc65b7aff00115_Admin%20CS%201.webp',
    findClient: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c44eecbadd1d6e6658b_Admin%20CS%202.webp',
    workType: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c4471a42a59c975e459_Admin%20CS%203.webp',
    lanePrivate: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a34e671a42a59c9771ec5_Admin%20CS%204.webp',
    lanePublic: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a34e69469eb00a39622b4_Admin%20CS%205.webp',
    selectModel: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c442a6dee9e17d06ae0_Admin%20CS%206.webp',
    readiness: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c446a094d32e0f9110d_Admin%20CS%207.webp',
    enterDetails: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c443052977cb156a5f0_Admin%20CS%208.webp',
    review: 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a4a2c44585299f4856ca931_Admin%20CS%209.webp'
  };

  var rootAdminBase = root.getAttribute('data-admin-base') || '';

  var CONFIG = window.MMD_CREATE_SESSIONS_CONFIG || {
    adminBase: rootAdminBase || 'https://mmdbkk.com',
    mock: new URLSearchParams(window.location.search).has('mock'),
    endpoints: {
      authPing: '/v1/admin/ping',
      memberSearch: '/v1/admin/member/search',
      membersList: '/v1/admin/members/list',
      modelsList: '/v1/admin/models/list',
      createSession: '/v1/admin/session/create',
      telegramDm: '/v1/admin/telegram/dm'
    },
    auth: {
      bearer: localStorage.getItem('mmd_admin_bearer') || '',
      confirmKey: localStorage.getItem('mmd_confirm_key') || ''
    }
  };

  if (!CONFIG.adminBase) CONFIG.adminBase = 'https://mmdbkk.com';

  var DRAFT_KEY = 'mmd_create_sessions_v14_draft';
  var SCHEMA_LOCK_VERSION = 'mmd-create-sessions-v14';

  var demoMembersResponse = {
    ok: true,
    items: [
      {
        client_id: 'cli_demo_001',
        client_name: 'Per Demo',
        username: 'per',
        package_code: 'VIP',
        tier: 'vip',
        membership_status: 'active',
        purchased_history: 'purchased',
        legacy_tags: ['#client', '#purchased', '-vip-', '#mem2026'],
        line_record_id: 'rec_demo_001',
        line_user_id: 'Udemo001',
        line_display_name: 'Per LINE',
        phone: '0900000001',
        confidence: 0.96
      },
      {
        client_id: 'cli_demo_002',
        client_name: 'Man 24',
        username: 'man24',
        package_code: 'Premium',
        tier: 'premium',
        membership_status: 'active',
        purchased_history: 'purchased',
        legacy_tags: ['#client', '#purchased', '#premium'],
        line_record_id: 'rec_demo_002',
        line_user_id: 'Udemo002',
        line_display_name: 'Man LINE',
        phone: '0900000002',
        confidence: 0.88
      },
      {
        client_id: 'cli_demo_003',
        client_name: 'Guest New',
        username: 'guestnew',
        package_code: '7days',
        tier: '7days',
        membership_status: 'guest',
        purchased_history: 'none',
        legacy_tags: ['#client', '#mem2026'],
        line_record_id: 'rec_demo_003',
        line_user_id: 'Udemo003',
        line_display_name: 'Guest LINE',
        phone: '0900000003',
        confidence: 0.75
      }
    ]
  };

  var demoModelsResponse = {
    ok: true,
    items: [
      {
        model_id: 'mdl_public_travel_ken',
        model_key: 'ken-public-travel',
        display_name: 'Ken',
        booking_visibility: 'public',
        status: 'active',
        folder: 'travel',
        job_types: ['travel'],
        tags: ['burn', 'live'],
        telegram_username: '@ken_demo',
        available: true
      },
      {
        model_id: 'mdl_public_extreme_ryu',
        model_key: 'ryu-public-extreme',
        display_name: 'Ryu',
        booking_visibility: 'public',
        status: 'active',
        folder: 'extreme',
        job_types: ['extreme'],
        tags: ['mk'],
        telegram_username: '@ryu_demo',
        available: true
      },
      {
        model_id: 'mdl_private_vip_nine',
        model_key: 'nine-private-vip',
        display_name: 'Nine',
        booking_visibility: 'private',
        status: 'active',
        folder: 'vip',
        job_types: ['vip'],
        tags: ['live'],
        telegram_username: '@nine_demo',
        available: true
      },
      {
        model_id: 'mdl_private_pn_max',
        model_key: 'max-private-pn',
        display_name: 'Max',
        booking_visibility: 'private',
        status: 'active',
        folder: 'pn',
        job_types: ['pn', 'vip'],
        tags: ['burn', 'mk', 'vip_compatible'],
        telegram_username: '@max_demo',
        available: true
      }
    ]
  };

  var state = {
    members: [],
    selectedMember: null,
    workType: '',
    modelFolder: '',
    allModels: [],
    filteredModels: [],
    selectedModel: null,
    created: null
  };

  var el = {
    search: root.querySelector('[data-cs-search]'),
    memberResults: root.querySelector('[data-cs-member-results]'),
    clientName: root.querySelector('#csClientName'),
    username: root.querySelector('#csUsername'),
    package: root.querySelector('#csPackage'),
    membershipStatus: root.querySelector('#csMembershipStatus'),
    memberNotice: root.querySelector('[data-cs-member-notice]'),

    laneShell: root.querySelector('[data-cs-lane-shell]'),
    laneTitle: root.querySelector('[data-cs-lane-title]'),
    laneNote: root.querySelector('[data-cs-lane-note]'),
    laneImage: root.querySelector('[data-cs-lane-image]'),

    modelLookupKey: root.querySelector('#csModelLookupKey'),
    modelPool: root.querySelector('#csModelPool'),
    modelResults: root.querySelector('[data-cs-model-results]'),
    modelCount: root.querySelector('[data-cs-model-count]'),
    selectedModelName: root.querySelector('[data-cs-selected-model-name]'),
    selectedModelMeta: root.querySelector('[data-cs-selected-model-meta]'),
    modelInitial: root.querySelector('[data-cs-model-initial]'),

    customerTelegram: root.querySelector('#csCustomerTelegram'),
    customerTelegramStatus: root.querySelector('#csCustomerTelegramStatus'),
    modelTelegram: root.querySelector('#csModelTelegram'),
    modelTelegramStatus: root.querySelector('#csModelTelegramStatus'),
    gateLabel: root.querySelector('[data-cs-gate-label]'),
    gateNotice: root.querySelector('[data-cs-gate-notice]'),

    date: root.querySelector('#csDate'),
    start: root.querySelector('#csStart'),
    duration: root.querySelector('#csDuration'),
    end: root.querySelector('#csEnd'),
    location: root.querySelector('#csLocation'),
    map: root.querySelector('#csMap'),
    amount: root.querySelector('#csAmount'),
    assignedPerson: root.querySelector('#csAssignedPerson'),
    handlingNote: root.querySelector('#csHandlingNote'),
    operationNote: root.querySelector('#csOperationNote'),

    flagBurn: root.querySelector('#csFlagBurn'),
    flagMk: root.querySelector('#csFlagMk'),
    flagLive: root.querySelector('#csFlagLive'),
    availableOnly: root.querySelector('#csAvailableOnly'),

    clientInitial: root.querySelector('[data-cs-client-initial]'),
    selectedClientName: root.querySelector('[data-cs-selected-client-name]'),
    selectedClientMeta: root.querySelector('[data-cs-selected-client-meta]'),
    selectedConfidence: root.querySelector('[data-cs-selected-confidence]'),

    clientTier: root.querySelector('[data-cs-client-tier]'),
    clientMembership: root.querySelector('[data-cs-client-membership]'),
    clientHistory: root.querySelector('[data-cs-client-history]'),
    clientPrivateHint: root.querySelector('[data-cs-client-private-hint]'),

    sumClient: root.querySelector('[data-cs-sum-client]'),
    sumWork: root.querySelector('[data-cs-sum-work]'),
    sumFolder: root.querySelector('[data-cs-sum-folder]'),
    sumModel: root.querySelector('[data-cs-sum-model]'),
    sumGate: root.querySelector('[data-cs-sum-gate]'),
    sumAmount: root.querySelector('[data-cs-sum-amount]'),

    reviewClient: root.querySelector('[data-cs-review-client]'),
    reviewWork: root.querySelector('[data-cs-review-work]'),
    reviewGroup: root.querySelector('[data-cs-review-group]'),
    reviewModel: root.querySelector('[data-cs-review-model]'),
    reviewReady: root.querySelector('[data-cs-review-ready]'),
    reviewAssigned: root.querySelector('[data-cs-review-assigned]'),

    nextAction: root.querySelector('[data-cs-next-action]'),
    nextCopy: root.querySelector('[data-cs-next-copy]'),
    status: root.querySelector('[data-cs-status]'),

    output: root.querySelector('[data-cs-output]'),
    outSession: root.querySelector('[data-cs-out-session]'),
    outPayment: root.querySelector('[data-cs-out-payment]'),
    outNotify: root.querySelector('[data-cs-out-notify]'),
    outStatus: root.querySelector('[data-cs-out-status]'),
    outCustomerMessage: root.querySelector('#csOutCustomerMessage'),
    outModelMessage: root.querySelector('#csOutModelMessage'),

    toast: root.querySelector('[data-cs-toast]')
  };

  var hookEls = {
    auth: root.querySelector('[data-cs-hook="auth"]'),
    member: root.querySelector('[data-cs-hook="member"]'),
    models: root.querySelector('[data-cs-hook="models"]'),
    create: root.querySelector('[data-cs-hook="create"]'),
    telegram: root.querySelector('[data-cs-hook="telegram"]')
  };

  function text(node, value) {
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function val(node) {
    return node ? node.value : '';
  }

  function setVal(node, value) {
    if (node) node.value = value == null ? '' : String(value);
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function checked(node) {
    return !!(node && node.checked);
  }

  function api(path) {
    return String(CONFIG.adminBase || '').replace(/\/$/, '') + path;
  }

  function hasAuth() {
    return !!(CONFIG.mock || (CONFIG.auth && (CONFIG.auth.bearer || CONFIG.auth.confirmKey)));
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('is-show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      el.toast.classList.remove('is-show');
    }, 2200);
  }

  function setStatus(message) {
    text(el.status, message || 'Ready.');
  }

  function setHook(name, stateName) {
    var node = hookEls[name];
    if (!node) return;
    node.setAttribute('data-state', stateName || 'idle');
  }

  function ensureAuth(message) {
    if (hasAuth()) return true;
    setHook('auth', 'danger');
    setStatus('ยังไม่ได้เชื่อม auth');
    showToast(message || 'ยังไม่ได้ใส่ ADMIN_BEARER หรือ X-Confirm-Key');
    return false;
  }

  function getHeaders() {
    var headers = { accept: 'application/json' };
    if (CONFIG.auth && CONFIG.auth.bearer) headers.Authorization = 'Bearer ' + CONFIG.auth.bearer;
    if (CONFIG.auth && CONFIG.auth.confirmKey) headers['X-Confirm-Key'] = CONFIG.auth.confirmKey;
    return headers;
  }

  async function requestJson(url, options) {
    var opts = options || {};
    var headers = Object.assign({}, getHeaders(), opts.headers || {});
    if (opts.body && !headers['content-type']) headers['content-type'] = 'application/json';

    var res = await fetch(url, Object.assign({ credentials: 'include', headers: headers }, opts));
    var data = {};
    try { data = await res.json(); } catch (error) { data = {}; }

    return { ok: res.ok, status: res.status, data: data };
  }

  function formatError(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.message || 'Unknown error';
  }

  function money(value) {
    var n = Number(String(value || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function folderLabelText(folder) {
    if (folder === 'travel') return 'Travel';
    if (folder === 'extreme') return 'Extreme';
    if (folder === 'vip') return 'VIP';
    if (folder === 'pn') return 'PN';
    return '-';
  }

  function applyAssets() {
    root.querySelectorAll('[data-cs-media]').forEach(function (img) {
      var key = img.getAttribute('data-cs-media');
      if (ASSETS[key]) img.src = ASSETS[key];
    });
    updateLaneThumb();
  }

  function updateLaneThumb() {
    if (!el.laneImage) return;
    if (state.workType === 'private') {
      el.laneImage.src = ASSETS.lanePrivate;
    } else if (state.workType === 'public') {
      el.laneImage.src = ASSETS.lanePublic;
    } else {
      el.laneImage.src = ASSETS.workType;
    }
  }

  function computeEndTime() {
    var start = val(el.start);
    var duration = val(el.duration) || '01:30';

    if (!start || !duration) {
      setVal(el.end, '');
      return '';
    }

    var sp = start.split(':').map(Number);
    var dp = duration.split(':').map(Number);
    var total = sp[0] * 60 + sp[1] + dp[0] * 60 + dp[1];
    total = total % (24 * 60);

    var hh = String(Math.floor(total / 60)).padStart(2, '0');
    var mm = String(total % 60).padStart(2, '0');
    var end = hh + ':' + mm;
    setVal(el.end, end);
    return end;
  }

  function setInitialNow() {
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    var hh = String(now.getHours()).padStart(2, '0');
    var min = String(now.getMinutes()).padStart(2, '0');

    if (!val(el.date)) setVal(el.date, yyyy + '-' + mm + '-' + dd);
    if (!val(el.start)) setVal(el.start, hh + ':' + min);
    computeEndTime();
  }

  function memberMeta(member) {
    if (!member) return '-';
    return [member.username, member.tier || member.package_code, member.membership_status, member.purchased_history]
      .filter(Boolean)
      .join(' · ') || '-';
  }

  function getClientBasics() {
    return {
      client_name: val(el.clientName) || (state.selectedMember && state.selectedMember.client_name) || '',
      username: val(el.username) || (state.selectedMember && state.selectedMember.username) || '',
      tier: normalize(val(el.package) || (state.selectedMember && (state.selectedMember.tier || state.selectedMember.package_code)) || ''),
      membership_status: normalize(val(el.membershipStatus) || (state.selectedMember && state.selectedMember.membership_status) || ''),
      purchased_history: (state.selectedMember && state.selectedMember.purchased_history) || '',
      legacy_tags: (state.selectedMember && state.selectedMember.legacy_tags) || []
    };
  }

  function getPrivateAssessment() {
    var basics = getClientBasics();
    var active = basics.membership_status === 'active';
    var premiumPlus = ['premium', 'vip', 'svip', 'blackcard'].indexOf(basics.tier) !== -1;
    var purchased = basics.purchased_history === 'purchased' || basics.legacy_tags.some(function (tag) {
      return normalize(tag).indexOf('purchased') !== -1;
    });

    if (!active) {
      return {
        state: 'hold',
        label: 'พักไว้ก่อน',
        note: 'ลูกค้ายังไม่ active หรือยังไม่พร้อมพอสำหรับ private'
      };
    }

    if (['vip', 'svip', 'blackcard'].indexOf(basics.tier) !== -1) {
      return {
        state: 'ok',
        label: 'ไปต่อได้',
        note: 'ลูกค้าอยู่ในระดับที่เหมาะกับ private lane'
      };
    }

    if (premiumPlus && purchased) {
      return {
        state: 'review',
        label: 'ควรเช็กเพิ่ม',
        note: 'ลูกค้าไปต่อได้ แต่ควรเช็กงานและความเหมาะสมอีกครั้ง'
      };
    }

    if (purchased) {
      return {
        state: 'review',
        label: 'เช็กก่อน',
        note: 'มี history แล้ว แต่ยังควรดู case-by-case'
      };
    }

    return {
      state: 'hold',
      label: 'ส่งให้พี่ดู',
      note: 'ยังไม่ควรพาเข้า private โดยอัตโนมัติ'
    };
  }

  function renderClientStatus() {
    var basics = getClientBasics();
    var assessment = getPrivateAssessment();

    text(el.clientTier, basics.tier || '-');
    text(el.clientMembership, basics.membership_status || '-');
    text(el.clientHistory, basics.purchased_history || 'none');
    text(el.clientPrivateHint, assessment.label || '-');
  }

  function renderMembers() {
    if (!state.members.length) {
      el.memberResults.innerHTML = '<div class="mmd-cs-v14__empty">ยังไม่ได้ค้น member</div>';
      return;
    }

    el.memberResults.innerHTML = '';

    state.members.forEach(function (member) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mmd-cs-v14__memberRow';
      btn.setAttribute('data-cs-member-id', member.client_id || member.username || member.client_name);

      if (state.selectedMember && state.selectedMember.client_id === member.client_id) {
        btn.classList.add('is-selected');
      }

      var tags = (member.legacy_tags || []).slice(0, 3).join(' · ');

      btn.innerHTML =
        '<div class="mmd-cs-v14__rowAvatar">' + String(member.client_name || 'C').charAt(0).toUpperCase() + '</div>' +
        '<div>' +
        '<strong class="mmd-cs-v14__rowTitle">' + (member.client_name || 'Unknown Member') + '</strong>' +
        '<p class="mmd-cs-v14__rowMeta">' + memberMeta(member) + (tags ? ' · ' + tags : '') + '</p>' +
        '</div>';

      el.memberResults.appendChild(btn);
    });
  }

  function selectMember(member) {
    state.selectedMember = member || null;

    if (member) {
      setVal(el.clientName, member.client_name || '');
      setVal(el.username, member.username || '');
      setVal(el.package, normalize(member.tier || member.package_code || ''));
      setVal(el.membershipStatus, normalize(member.membership_status || ''));

      text(el.clientInitial, String(member.client_name || 'C').charAt(0).toUpperCase());
      text(el.selectedClientName, member.client_name || '-');
      text(el.selectedClientMeta, memberMeta(member));
      text(el.selectedConfidence, member.confidence ? 'Confidence ' + Math.round(member.confidence * 100) + '%' : '-');
      text(el.memberNotice, 'เลือกลูกค้าแล้ว ตรวจประเภทงานและกลุ่มคนทำงานต่อได้');
    }

    renderMembers();
    renderClientStatus();
    updateAll();
  }

  function folderAllowsModel(model, folder) {
    if (!folder) return true;

    if (folder === 'pn') {
      if (model.folder === 'pn') return true;
      if ((model.job_types || []).map(normalize).indexOf('pn') !== -1) return true;
      if (model.folder === 'vip' && (model.tags || []).map(normalize).indexOf('vip_compatible') !== -1) return true;
      return false;
    }

    return model.folder === folder;
  }

  function hasTag(model, tag) {
    return normalize((model.tags || []).join(' ')).indexOf(tag) !== -1;
  }

  function filterModel(model) {
    var lookup = normalize(val(el.modelLookupKey));

    if (!folderAllowsModel(model, state.modelFolder)) return false;
    if (state.workType === 'public' && model.booking_visibility !== 'public') return false;
    if (state.workType === 'private' && model.booking_visibility !== 'private') return false;
    if (checked(el.availableOnly) && model.available !== true) return false;
    if (checked(el.flagBurn) && !hasTag(model, 'burn')) return false;
    if (checked(el.flagMk) && !hasTag(model, 'mk')) return false;
    if (checked(el.flagLive) && !hasTag(model, 'live')) return false;

    if (!lookup) return true;

    return normalize([
      model.model_key,
      model.display_name,
      model.model_id,
      model.folder,
      (model.job_types || []).join(' '),
      (model.tags || []).join(' ')
    ].join(' ')).indexOf(lookup) !== -1;
  }

  function renderModels() {
    if (!state.allModels.length) {
      el.modelResults.innerHTML = '<div class="mmd-cs-v14__empty">ยังไม่ได้โหลด models list</div>';
      text(el.modelCount, '0 models');
      return;
    }

    if (!state.modelFolder) {
      el.modelResults.innerHTML = '<div class="mmd-cs-v14__empty">เลือกกลุ่มคนทำงานก่อน แล้วค่อยคัดรายชื่อ</div>';
      text(el.modelCount, '0 models');
      return;
    }

    state.filteredModels = state.allModels.filter(filterModel);
    text(el.modelCount, state.filteredModels.length + ' models');

    if (!state.filteredModels.length) {
      el.modelResults.innerHTML = '<div class="mmd-cs-v14__empty">ไม่มีคนทำงานที่ตรงกับกลุ่มและ filter ตอนนี้</div>';
      return;
    }

    el.modelResults.innerHTML = '';

    state.filteredModels.forEach(function (model) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mmd-cs-v14__modelRow';
      btn.setAttribute('data-cs-model-id', model.model_id || model.model_key);

      if (state.selectedModel && state.selectedModel.model_id === model.model_id) {
        btn.classList.add('is-selected');
      }

      btn.innerHTML =
        '<div class="mmd-cs-v14__rowAvatar">' + String(model.display_name || 'M').charAt(0).toUpperCase() + '</div>' +
        '<div>' +
        '<strong class="mmd-cs-v14__rowTitle">' + (model.display_name || 'Model') + ' · ' + (model.model_key || '-') + '</strong>' +
        '<p class="mmd-cs-v14__rowMeta">' + [folderLabelText(model.folder), model.booking_visibility, model.telegram_username].filter(Boolean).join(' · ') + '</p>' +
        '</div>';

      el.modelResults.appendChild(btn);
    });
  }

  function renderSelectedModel() {
    var model = state.selectedModel;

    if (!model) {
      text(el.selectedModelName, '-');
      text(el.selectedModelMeta, '-');
      text(el.modelInitial, 'M');
      return;
    }

    text(el.selectedModelName, model.display_name || '-');
    text(el.selectedModelMeta, [model.model_key || model.model_id, folderLabelText(model.folder), model.booking_visibility].filter(Boolean).join(' · '));
    text(el.modelInitial, String(model.display_name || 'M').charAt(0).toUpperCase());
  }

  function selectModel(model) {
    state.selectedModel = model || null;

    if (model) {
      setVal(el.modelLookupKey, model.model_key || model.display_name || '');
      setVal(el.modelPool, model.folder || state.modelFolder || '');
      setVal(el.modelTelegram, model.telegram_username || '');
      if (model.telegram_username) setVal(el.modelTelegramStatus, 'linked');
    }

    renderModels();
    renderSelectedModel();
    updateAll();
  }

  function renderLaneSection() {
    updateLaneThumb();

    if (!state.workType) {
      text(el.laneTitle, 'เลือก lane ของงาน');
      text(el.laneNote, 'เลือกประเภทของงานก่อน ระบบจะเปิด step ถัดไปให้เอง');
      el.laneShell.innerHTML = '<div class="mmd-cs-v14__empty">เลือกประเภทของงานก่อน</div>';
      return;
    }

    if (state.workType === 'public') {
      text(el.laneTitle, 'เลือกกลุ่ม Public');
      text(el.laneNote, 'เลือกกลุ่มให้ตรงก่อนครับ แล้วค่อยดูรายชื่อ แบบนี้จะเร็วกว่าและมีความผิดพลาดน้อยกว่า');

      var htmlPublic = ''
        + '<div class="mmd-cs-v14__laneHint">Public flow จะไปต่อที่ Travel หรือ Extreme แล้วค่อยคัดคนทำงาน</div>'
        + '<div class="mmd-cs-v14__groupButtons">'
        + '  <button type="button" class="mmd-cs-v14__groupBtn ' + (state.modelFolder === 'travel' ? 'is-selected' : '') + '" data-cs-folder="travel"><span>Travel</span><small>เลือกกลุ่มนี้</small></button>'
        + '  <button type="button" class="mmd-cs-v14__groupBtn ' + (state.modelFolder === 'extreme' ? 'is-selected' : '') + '" data-cs-folder="extreme"><span>Extreme</span><small>เลือกกลุ่มนี้</small></button>'
        + '</div>';

      el.laneShell.innerHTML = htmlPublic;
      return;
    }

    var assessment = getPrivateAssessment();
    text(el.laneTitle, 'ตรวจสิทธิ์ก่อนงาน Private');
    text(el.laneNote, 'ถ้าเป็นงาน private อย่ารีบข้ามตรงนี้นะครับ ดูให้แน่ใจก่อนว่าลูกค้าอยู่ในจุดที่ควรไปต่อจริง ๆ');

    var assessmentClass = assessment.state === 'ok' ? 'is-ok' : assessment.state === 'review' ? 'is-review' : 'is-hold';

    var htmlPrivate = ''
      + '<div class="mmd-cs-v14__eligibilityBox">'
      + '  <div class="mmd-cs-v14__eligibilityTop">'
      + '    <strong class="mmd-cs-v14__pickedTitle">ผลประเมิน private</strong>'
      + '    <span class="mmd-cs-v14__eligibilityPill ' + assessmentClass + '">' + assessment.label + '</span>'
      + '  </div>'
      + '  <p class="mmd-cs-v14__laneHint">' + assessment.note + '</p>'
      + '  <div class="mmd-cs-v14__statusGrid">'
      + '    <div class="mmd-cs-v14__statusCard"><span>tier</span><strong>' + (getClientBasics().tier || '-') + '</strong></div>'
      + '    <div class="mmd-cs-v14__statusCard"><span>membership</span><strong>' + (getClientBasics().membership_status || '-') + '</strong></div>'
      + '    <div class="mmd-cs-v14__statusCard"><span>history</span><strong>' + ((getClientBasics().purchased_history || 'none')) + '</strong></div>'
      + '    <div class="mmd-cs-v14__statusCard"><span>next</span><strong>' + assessment.label + '</strong></div>'
      + '  </div>'
      + '</div>'
      + '<div class="mmd-cs-v14__sectionCopy" style="margin-top:6px;"><span>step 03B</span><h2 style="font-size:30px;margin-top:6px;">เลือกกลุ่ม Private</h2><p>เลือกกลุ่มให้ตรงก่อนครับ private ผิดกลุ่มทีหลังจะไล่แก้ยาวกว่างานทั่วไป</p></div>'
      + '<div class="mmd-cs-v14__groupButtons">'
      + '  <button type="button" class="mmd-cs-v14__groupBtn ' + (state.modelFolder === 'vip' ? 'is-selected' : '') + '" data-cs-folder="vip"><span>VIP</span><small>เลือกกลุ่มนี้</small></button>'
      + '  <button type="button" class="mmd-cs-v14__groupBtn ' + (state.modelFolder === 'pn' ? 'is-selected' : '') + '" data-cs-folder="pn"><span>PN</span><small>เลือกกลุ่มนี้</small></button>'
      + '</div>';

    el.laneShell.innerHTML = htmlPrivate;
  }

  function gateReady(value) {
    return value === 'linked' || value === 'verified';
  }

  function updateGate() {
    var customer = val(el.customerTelegramStatus) || 'missing';
    var model = val(el.modelTelegramStatus) || 'missing';
    var isPrivate = state.workType === 'private';
    var ok = isPrivate ? gateReady(customer) && gateReady(model) : true;
    var label = isPrivate ? (ok ? 'ready' : 'private gate blocked') : 'optional';

    text(el.gateLabel, label);
    el.gateLabel.className = 'mmd-cs-v14__readinessPill';
    el.gateLabel.classList.add(ok ? 'is-ok' : isPrivate ? 'is-hold' : 'is-review');

    text(
      el.gateNotice,
      isPrivate
        ? (ok ? 'Private readiness พร้อมแล้ว สามารถ create session ได้' : 'Private work ต้องมี Telegram linked หรือ verified ทั้งลูกค้าและคนทำงานก่อน')
        : 'Public work ไม่ block ด้วย Telegram แต่กรอกไว้เพื่อส่งต่อง่ายขึ้น'
    );

    return {
      ok: ok,
      label: label,
      customer: customer,
      model: model
    };
  }

  function buildPayload() {
    var basics = getClientBasics();
    var gate = updateGate();
    var model = state.selectedModel || {};

    return {
      schema_lock_version: SCHEMA_LOCK_VERSION,
      flow_version: 'sigil_internal_create_sessions_v14',
      source: 'sigil_internal_jobs_create_sessions',
      client_lineage: {
        client_id: (state.selectedMember && state.selectedMember.client_id) || '',
        client_name: basics.client_name,
        username: basics.username,
        package_code: basics.tier,
        tier: basics.tier,
        membership_status: basics.membership_status,
        purchased_history: basics.purchased_history,
        legacy_tags: basics.legacy_tags
      },
      work: {
        work_type: state.workType,
        job_visibility: state.workType === 'private' ? 'private' : state.workType === 'public' ? 'public' : '',
        model_folder: state.modelFolder,
        model_folder_label: folderLabelText(state.modelFolder)
      },
      model: {
        model_id: model.model_id || '',
        model_key: model.model_key || '',
        model_name: model.display_name || '',
        model_pool: state.modelFolder || '',
        booking_visibility: model.booking_visibility || '',
        telegram_username: model.telegram_username || ''
      },
      readiness_gate: {
        customer_telegram_username: String(val(el.customerTelegram) || ''),
        customer_telegram_status: gate.customer,
        model_telegram_username: String(val(el.modelTelegram) || ''),
        model_telegram_status: gate.model,
        current_gate_status: gate.label,
        block_activation_until_verified: state.workType === 'private'
      },
      job_details: {
        job_date: String(val(el.date) || ''),
        start_time: String(val(el.start) || ''),
        end_time: computeEndTime(),
        work_duration: String(val(el.duration) || ''),
        location_name: String(val(el.location) || ''),
        google_map_url: String(val(el.map) || '')
      },
      payment: {
        amount_thb: money(val(el.amount))
      },
      support: {
        assigned_person: String(val(el.assignedPerson) || 'Boss Per'),
        handling_note: String(val(el.handlingNote) || ''),
        operation_note: String(val(el.operationNote) || '')
      }
    };
  }

  function validatePayload(payload) {
    if (!payload.client_lineage.client_name && !payload.client_lineage.username) return 'ต้องมีข้อมูลลูกค้าก่อน';
    if (!payload.work.work_type) return 'เลือกประเภทของงานก่อน';
    if (!payload.work.model_folder) return 'เลือกกลุ่มคนทำงานก่อน';
    if (!payload.model.model_key && !payload.model.model_id) return 'เลือกคนทำงานก่อน';
    if (!payload.job_details.job_date) return 'กรอกวันที่งานก่อน';
    if (!payload.job_details.start_time) return 'กรอกเวลาเริ่มก่อน';
    if (!payload.job_details.location_name) return 'กรอกสถานที่ก่อน';
    if (!payload.payment.amount_thb) return 'กรอกยอดเงินก่อน';
    if (payload.work.work_type === 'private' && payload.readiness_gate.current_gate_status !== 'ready') return 'Private work ต้องผ่านการเช็กความพร้อมก่อน';
    return '';
  }

  function customerMessage(payload, out) {
    return [
      'สวัสดีครับ ' + (payload.client_lineage.client_name || 'คุณลูกค้า'),
      '',
      'ขอส่งลิงก์ยืนยันงานจาก MMD SĪGIL:',
      out.customer_confirmation_url || '',
      '',
      payload.job_details.job_date || payload.job_details.start_time ? 'วันเวลา: ' + [payload.job_details.job_date, payload.job_details.start_time].filter(Boolean).join(' · ') : '',
      payload.job_details.location_name ? 'สถานที่: ' + payload.job_details.location_name : '',
      payload.job_details.work_duration ? 'ระยะเวลา: ' + payload.job_details.work_duration : '',
      payload.payment.amount_thb ? 'ยอดที่ต้องตรวจสอบ: ' + Number(payload.payment.amount_thb).toLocaleString('th-TH') + ' THB' : ''
    ].filter(Boolean).join('\n');
  }

  function modelMessage(payload, out) {
    return [
      (payload.model.model_name || 'Model') + ' ครับ',
      '',
      'ขอส่งลิงก์ยืนยันงานจาก MMD SĪGIL:',
      out.model_confirmation_url || '',
      '',
      payload.job_details.job_date || payload.job_details.start_time ? 'วันเวลา: ' + [payload.job_details.job_date, payload.job_details.start_time].filter(Boolean).join(' · ') : '',
      payload.job_details.location_name ? 'สถานที่: ' + payload.job_details.location_name : '',
      payload.job_details.work_duration ? 'ระยะเวลา: ' + payload.job_details.work_duration : ''
    ].filter(Boolean).join('\n');
  }

  function buildTelegramDmPayload(targetRole, message) {
    var payload = buildPayload();

    return {
      schema_lock_version: SCHEMA_LOCK_VERSION,
      source: 'sigil_internal_create_sessions_v14',
      channel: 'telegram_dm',
      target_role: targetRole,
      session_id: state.created && state.created.session_id || '',
      payment_ref: state.created && state.created.payment_ref || '',
      telegram_username: targetRole === 'customer' ? payload.readiness_gate.customer_telegram_username : payload.readiness_gate.model_telegram_username,
      client_name: payload.client_lineage.client_name,
      model_name: payload.model.model_name,
      message: message
    };
  }

  function updateNextAction() {
    var title = 'Find member';
    var copy = 'เริ่มจาก member search ก่อนครับ';

    if (state.selectedMember || val(el.clientName)) {
      title = 'Choose work type';
      copy = 'เลือกประเภทของงานให้ถูกก่อนครับ';
    }

    if (state.workType) {
      title = 'Choose group';
      copy = 'เลือกกลุ่มคนทำงานให้ตรงกับงาน';
    }

    if (state.modelFolder) {
      title = 'Choose model';
      copy = 'คัดรายชื่อแล้วเลือกคนที่ตรงกับความต้องการลูกค้า';
    }

    if (state.selectedModel) {
      title = 'Check readiness';
      copy = 'ดูความพร้อมให้ครบก่อนกดสร้างงาน';
    }

    if (updateGate().ok) {
      title = 'Create session';
      copy = 'ถ้าทุกอย่างชัดแล้วค่อยกดครับ';
    }

    if (state.created) {
      title = 'Send message';
      copy = 'ตอนนี้ส่งต่อให้ลูกค้าและคนทำงานได้แล้ว';
    }

    text(el.nextAction, title);
    text(el.nextCopy, copy);
  }

  function updateSummary() {
    var payload = buildPayload();

    text(el.sumClient, payload.client_lineage.client_name || payload.client_lineage.username || '-');
    text(el.sumWork, payload.work.work_type || '-');
    text(el.sumFolder, payload.work.model_folder_label || '-');
    text(el.sumModel, payload.model.model_name || payload.model.model_key || '-');
    text(el.sumGate, payload.readiness_gate.current_gate_status || '-');
    text(el.sumAmount, payload.payment.amount_thb ? Number(payload.payment.amount_thb).toLocaleString('th-TH') + ' THB' : '-');

    text(el.reviewClient, payload.client_lineage.client_name || payload.client_lineage.username || '-');
    text(el.reviewWork, payload.work.work_type || '-');
    text(el.reviewGroup, payload.work.model_folder_label || '-');
    text(el.reviewModel, payload.model.model_name || payload.model.model_key || '-');
    text(el.reviewReady, payload.readiness_gate.current_gate_status || '-');
    text(el.reviewAssigned, payload.support.assigned_person || '-');

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (error) {}

    updateNextAction();
  }

  function updateAll() {
    computeEndTime();
    renderClientStatus();
    renderLaneSection();
    updateGate();
    updateSummary();
  }

  function tokenizeSearch(query) {
    return normalize(query)
      .split(/\s+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function memberMatchesQuery(member, query) {
    var tokens = tokenizeSearch(query);
    if (!tokens.length) return true;

    var haystack = normalize([
      member.client_name,
      member.username,
      member.phone,
      member.line_user_id,
      member.line_display_name,
      member.package_code,
      member.tier,
      member.membership_status,
      member.purchased_history,
      (member.legacy_tags || []).join(' ')
    ].join(' '));

    return tokens.every(function (token) {
      return haystack.indexOf(token) !== -1;
    });
  }

  async function fetchPing() {
    if (CONFIG.mock) return { ok: true, service: 'admin-worker' };

    var result = await requestJson(api(CONFIG.endpoints.authPing));
    if (!result.ok) throw new Error('auth ping failed (' + result.status + ')');
    if (!result.data || result.data.ok !== true) throw new Error('auth ping schema error');
    return result.data;
  }

  async function fetchMemberSearch(query) {
    if (CONFIG.mock) {
      return {
        ok: true,
        items: demoMembersResponse.items.filter(function (item) {
          return memberMatchesQuery(item, query);
        })
      };
    }

    var result = await requestJson(api(CONFIG.endpoints.memberSearch) + '?q=' + encodeURIComponent(query || ''));
    if (!result.ok) throw new Error('member search failed (' + result.status + ')');
    if (!result.data || result.data.ok !== true || !Array.isArray(result.data.items)) throw new Error('member search schema error');
    return result.data;
  }

  async function fetchRecentMembers() {
    if (CONFIG.mock) return demoMembersResponse;

    var result = await requestJson(api(CONFIG.endpoints.membersList));
    if (!result.ok) throw new Error('members list failed (' + result.status + ')');
    if (!result.data || result.data.ok !== true || !Array.isArray(result.data.items)) throw new Error('members list schema error');
    return result.data;
  }

  async function fetchModels() {
    if (CONFIG.mock) return demoModelsResponse;

    var result = await requestJson(api(CONFIG.endpoints.modelsList));
    if (!result.ok) throw new Error('models list failed (' + result.status + ')');
    if (!result.data || result.data.ok !== true || !Array.isArray(result.data.items)) throw new Error('models list schema error');
    return result.data;
  }

  async function postCreateSession(payload) {
    if (CONFIG.mock) {
      return {
        ok: true,
        session_id: 'sess_demo_' + Date.now(),
        payment_ref: 'pay_demo_' + Math.floor(Math.random() * 999999),
        status: 'created',
        customer_confirmation_url: '/member/api/jobs/customer-confirm?t=demo_customer',
        model_confirmation_url: '/model/api/jobs/confirm?t=demo_model',
        telegram_dm_status: 'not_sent'
      };
    }

    var result = await requestJson(api(CONFIG.endpoints.createSession), {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!result.ok) throw new Error('create session failed (' + result.status + ')');
    if (!result.data || result.data.ok !== true) throw new Error('create session schema error');
    return result.data;
  }

  async function postTelegramDm(payload) {
    if (CONFIG.mock) return { ok: true, status: 'sent_demo' };

    var result = await requestJson(api(CONFIG.endpoints.telegramDm), {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!result.ok) throw new Error('telegram dm failed (' + result.status + ')');
    if (!result.data || result.data.ok !== true) throw new Error('telegram dm schema error');
    return result.data;
  }

  function renderCreated(data, payload) {
    state.created = data || {};
    if (el.output) el.output.hidden = false;

    text(el.outSession, data.session_id || '-');
    text(el.outPayment, data.payment_ref || '-');
    text(el.outNotify, data.telegram_dm_status || 'not_sent');
    text(el.outStatus, data.status || 'created');

    setVal(el.outCustomerMessage, customerMessage(payload, data));
    setVal(el.outModelMessage, modelMessage(payload, data));
  }

  async function checkAuth() {
    if (!ensureAuth()) return;
    setHook('auth', 'warn');

    try {
      await fetchPing();
      setHook('auth', 'ok');
      setStatus('admin auth พร้อมแล้ว');
      showToast('auth พร้อมแล้วครับ');
    } catch (error) {
      setHook('auth', 'danger');
      setStatus(formatError(error));
      showToast(formatError(error));
    }
  }

  async function searchMembers() {
    if (!ensureAuth()) return;

    var query = val(el.search);
    setHook('member', 'warn');

    try {
      var data = await fetchMemberSearch(query);
      state.members = data.items.slice();
      renderMembers();
      setHook('member', 'ok');
      setStatus('โหลด member search แล้ว');
    } catch (error) {
      state.members = [];
      renderMembers();
      setHook('member', 'danger');
      setStatus(formatError(error));
      showToast(formatError(error));
    }
  }

  async function loadRecentMembers() {
    if (!ensureAuth()) return;

    setHook('member', 'warn');

    try {
      var data = await fetchRecentMembers();
      state.members = data.items.slice(0, 8);
      renderMembers();
      setHook('member', 'ok');
      setStatus('โหลด recent members แล้ว');
    } catch (error) {
      state.members = [];
      renderMembers();
      setHook('member', 'danger');
      setStatus(formatError(error));
      showToast(formatError(error));
    }
  }

  async function loadModels() {
    if (!ensureAuth()) return;

    setHook('models', 'warn');

    try {
      var data = await fetchModels();
      state.allModels = data.items.slice();
      renderModels();
      setHook('models', 'ok');
      setStatus('โหลด models list แล้ว');
      updateAll();
    } catch (error) {
      state.allModels = [];
      renderModels();
      setHook('models', 'danger');
      setStatus(formatError(error));
      showToast(formatError(error));
    }
  }

  async function createSession() {
    if (!ensureAuth()) return;

    var payload = buildPayload();
    var error = validatePayload(payload);

    if (error) {
      setStatus(error);
      showToast(error);
      return;
    }

    setHook('create', 'warn');

    try {
      var data = await postCreateSession(payload);
      renderCreated(data, payload);
      setHook('create', 'ok');
      setStatus('สร้าง session แล้ว');
      showToast('สร้าง session แล้วครับ');
      updateAll();
    } catch (errorCreate) {
      setHook('create', 'danger');
      setStatus(formatError(errorCreate));
      showToast(formatError(errorCreate));
    }
  }

  async function sendTelegramDm(targetRole) {
    if (!ensureAuth()) return;
    if (!state.created) {
      showToast('ยังไม่มี session ที่สร้างแล้ว');
      return;
    }

    var message = targetRole === 'customer' ? val(el.outCustomerMessage) : val(el.outModelMessage);
    if (!message) {
      showToast('message ยังว่างอยู่');
      return;
    }

    setHook('telegram', 'warn');

    try {
      var response = await postTelegramDm(buildTelegramDmPayload(targetRole, message));
      text(el.outNotify, response.status || 'sent');
      setHook('telegram', 'ok');
      showToast('ส่ง telegram dm แล้วครับ');
    } catch (error) {
      text(el.outNotify, 'failed');
      setHook('telegram', 'danger');
      setStatus(formatError(error));
      showToast(formatError(error));
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(buildPayload()));
    } catch (error) {}
    showToast('บันทึก draft แล้วครับ');
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      var draft = JSON.parse(raw);
      if (!draft) return;

      setVal(el.clientName, draft.client_lineage && draft.client_lineage.client_name);
      setVal(el.username, draft.client_lineage && draft.client_lineage.username);
      setVal(el.package, draft.client_lineage && draft.client_lineage.tier);
      setVal(el.membershipStatus, draft.client_lineage && draft.client_lineage.membership_status);
      setVal(el.customerTelegram, draft.readiness_gate && draft.readiness_gate.customer_telegram_username);
      setVal(el.customerTelegramStatus, draft.readiness_gate && draft.readiness_gate.customer_telegram_status || 'missing');
      setVal(el.modelTelegram, draft.readiness_gate && draft.readiness_gate.model_telegram_username);
      setVal(el.modelTelegramStatus, draft.readiness_gate && draft.readiness_gate.model_telegram_status || 'missing');
      setVal(el.date, draft.job_details && draft.job_details.job_date);
      setVal(el.start, draft.job_details && draft.job_details.start_time);
      setVal(el.duration, draft.job_details && draft.job_details.work_duration || '01:30');
      setVal(el.location, draft.job_details && draft.job_details.location_name);
      setVal(el.map, draft.job_details && draft.job_details.google_map_url);
      setVal(el.amount, draft.payment && draft.payment.amount_thb);
      setVal(el.assignedPerson, draft.support && draft.support.assigned_person || 'Boss Per');
      setVal(el.handlingNote, draft.support && draft.support.handling_note || '');
      setVal(el.operationNote, draft.support && draft.support.operation_note || '');
      state.workType = draft.work && draft.work.work_type || '';
      state.modelFolder = draft.work && draft.work.model_folder || '';

      Array.prototype.forEach.call(root.querySelectorAll('[data-cs-work]'), function (node) {
        node.classList.toggle('is-selected', node.getAttribute('data-cs-work') === state.workType);
      });

      renderLaneSection();
    } catch (error) {}
  }

  function resetAll() {
    state.members = [];
    state.selectedMember = null;
    state.workType = '';
    state.modelFolder = '';
    state.selectedModel = null;
    state.created = null;

    [
      el.search,
      el.clientName,
      el.username,
      el.modelLookupKey,
      el.modelPool,
      el.customerTelegram,
      el.modelTelegram,
      el.date,
      el.start,
      el.end,
      el.location,
      el.map,
      el.amount,
      el.handlingNote,
      el.operationNote
    ].forEach(function (node) {
      setVal(node, '');
    });

    setVal(el.package, '');
    setVal(el.membershipStatus, '');
    setVal(el.customerTelegramStatus, 'missing');
    setVal(el.modelTelegramStatus, 'missing');
    setVal(el.duration, '01:30');
    setVal(el.assignedPerson, 'Boss Per');

    if (el.flagBurn) el.flagBurn.checked = false;
    if (el.flagMk) el.flagMk.checked = false;
    if (el.flagLive) el.flagLive.checked = false;
    if (el.availableOnly) el.availableOnly.checked = true;

    text(el.clientInitial, 'C');
    text(el.selectedClientName, '-');
    text(el.selectedClientMeta, '-');
    text(el.selectedConfidence, '-');
    text(el.memberNotice, 'ยังไม่ได้เลือกลูกค้า');

    if (el.output) el.output.hidden = true;

    Array.prototype.forEach.call(root.querySelectorAll('[data-cs-work]'), function (node) {
      node.classList.remove('is-selected');
    });

    renderMembers();
    renderClientStatus();
    renderLaneSection();
    renderModels();
    renderSelectedModel();
    setInitialNow();
    updateAll();
    showToast('ล้างฟอร์มแล้วครับ');
  }

  function copyText(value) {
    if (!navigator.clipboard) {
      showToast('คัดลอกไม่สำเร็จครับ');
      return;
    }
    navigator.clipboard.writeText(String(value || '')).then(function () {
      showToast('คัดลอกแล้วครับ');
    }).catch(function () {
      showToast('คัดลอกไม่สำเร็จครับ');
    });
  }

  root.addEventListener('click', function (event) {
    var action = event.target.closest('[data-cs-action]');
    if (action) {
      var name = action.getAttribute('data-cs-action');

      if (name === 'check-auth') checkAuth();
      if (name === 'member-search') searchMembers();
      if (name === 'recent-members') loadRecentMembers();
      if (name === 'reload-models') loadModels();
      if (name === 'save-draft') saveDraft();
      if (name === 'create-session') createSession();
      if (name === 'send-customer-dm') sendTelegramDm('customer');
      if (name === 'send-model-dm') sendTelegramDm('model');
      if (name === 'copy-customer-message') copyText(val(el.outCustomerMessage));
      if (name === 'copy-model-message') copyText(val(el.outModelMessage));
      if (name === 'reset') resetAll();
      return;
    }

    var quick = event.target.closest('[data-cs-quick]');
    if (quick) {
      setVal(el.search, quick.getAttribute('data-cs-quick'));
      searchMembers();
      return;
    }

    var work = event.target.closest('[data-cs-work]');
    if (work) {
      state.workType = work.getAttribute('data-cs-work');
      state.modelFolder = '';
      state.selectedModel = null;
      setVal(el.modelPool, '');

      Array.prototype.forEach.call(root.querySelectorAll('[data-cs-work]'), function (node) {
        node.classList.toggle('is-selected', node === work);
      });

      renderLaneSection();
      renderModels();
      renderSelectedModel();
      updateAll();
      return;
    }

    var folder = event.target.closest('[data-cs-folder]');
    if (folder) {
      state.modelFolder = folder.getAttribute('data-cs-folder');
      state.selectedModel = null;
      setVal(el.modelPool, state.modelFolder);
      renderLaneSection();
      renderModels();
      renderSelectedModel();
      updateAll();
      return;
    }

    var memberRow = event.target.closest('[data-cs-member-id]');
    if (memberRow) {
      var id = memberRow.getAttribute('data-cs-member-id');
      selectMember(state.members.find(function (item) {
        return (item.client_id || item.username || item.client_name) === id;
      }));
      return;
    }

    var modelRow = event.target.closest('[data-cs-model-id]');
    if (modelRow) {
      var mid = modelRow.getAttribute('data-cs-model-id');
      selectModel(state.filteredModels.find(function (item) {
        return (item.model_id || item.model_key) === mid;
      }));
    }
  });

  [
    el.clientName,
    el.username,
    el.package,
    el.membershipStatus,
    el.modelLookupKey,
    el.customerTelegram,
    el.customerTelegramStatus,
    el.modelTelegram,
    el.modelTelegramStatus,
    el.date,
    el.start,
    el.duration,
    el.location,
    el.map,
    el.amount,
    el.assignedPerson,
    el.handlingNote,
    el.operationNote,
    el.flagBurn,
    el.flagMk,
    el.flagLive,
    el.availableOnly
  ].forEach(function (node) {
    if (!node) return;
    node.addEventListener('input', function () {
      renderModels();
      updateAll();
    });
    node.addEventListener('change', function () {
      renderModels();
      updateAll();
    });
  });

  if (el.search) {
    el.search.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchMembers();
      }
    });
  }

  if (hasAuth()) {
    setHook('auth', 'warn');
    setStatus('กด check auth เพื่อเช็กก่อนเริ่มครับ');
  } else {
    setHook('auth', 'danger');
    setStatus('ยังไม่ได้เชื่อม auth');
  }

  setHook('member', 'idle');
  setHook('models', 'idle');
  setHook('create', 'idle');
  setHook('telegram', 'idle');

  applyAssets();
  loadDraft();
  setInitialNow();
  renderMembers();
  renderClientStatus();
  renderLaneSection();
  renderSelectedModel();
  updateAll();
})();
