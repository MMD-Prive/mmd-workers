(function () {
  var root = document.querySelector('[data-sigilbk2]');
  if (!root) return;

  var selected = {
    jobType: { value: 'private', label: 'Private SIGIL' },
    packageTier: { value: 'premium', label: 'Premium / VIP+' },
    duration: { value: 'short', label: 'Short Session' },
    preference: { value: 'calm', label: 'Calm & Private' },
    models: []
  };

  var els = {
    jobType: root.querySelector('#sigilbk2SummaryJobType'),
    packageTier: root.querySelector('#sigilbk2SummaryPackage'),
    duration: root.querySelector('#sigilbk2SummaryDuration'),
    preference: root.querySelector('#sigilbk2SummaryPreference'),
    models: root.querySelector('#sigilbk2SummaryModels'),
    slots: root.querySelector('#sigilbk2SummarySlots'),
    continueBtn: root.querySelector('#sigilbk2Continue'),
    modelHint: root.querySelector('#sigilbk2ModelHint'),
    note: root.querySelector('#sigilbk2Note'),
    clientName: root.querySelector('#sigilbk2ClientName'),
    contact: root.querySelector('#sigilbk2Contact'),
    area: root.querySelector('#sigilbk2Area'),
    telegram: root.querySelector('#sigilbk2Telegram'),
    slot1: root.querySelector('#sigilbk2Slot1'),
    slot2: root.querySelector('#sigilbk2Slot2'),
    slot3: root.querySelector('#sigilbk2Slot3')
  };

  var optionButtons = Array.prototype.slice.call(root.querySelectorAll('[data-sigilbk2-option]'));
  var modelButtons = Array.prototype.slice.call(root.querySelectorAll('[data-sigilbk2-model]'));
  var draftKey = 'sigil_booking_request_draft_v2';

  function safeSetLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {}
  }

  function getSlots() {
    return [els.slot1, els.slot2, els.slot3]
      .filter(Boolean)
      .map(function (input, index) {
        return { priority: index + 1, value: input.value || '' };
      })
      .filter(function (slot) { return slot.value; });
  }

  function getPackageInheritance(value) {
    if (value === 'standard') return [];
    if (value === 'premium') return ['standard'];
    if (value === 'vip_plus') return ['premium', 'standard'];
    return [];
  }

  function getPackageFolder(value) {
    if (value === 'standard') {
      return {
        label: 'Standard Package',
        folder_id: '1SHK47mydJBtj1TlmOHrhYk7GN72swjvX',
        folder_url: 'https://drive.google.com/open?id=1SHK47mydJBtj1TlmOHrhYk7GN72swjvX&usp=drive_fs'
      };
    }

    if (value === 'vip_plus') {
      return {
        label: 'VIP / SVIP / Blackcard',
        folder_id: '1P8XRSgbRhpv4ELzVZ2NjA13X6LMYShfQ',
        folder_url: 'https://drive.google.com/open?id=1P8XRSgbRhpv4ELzVZ2NjA13X6LMYShfQ&usp=drive_fs'
      };
    }

    return {
      label: 'Premium Package',
      folder_id: '1ecvIZUYdjHAsZ-ujDbb1d76MXzx5BseN',
      folder_url: 'https://drive.google.com/open?id=1ecvIZUYdjHAsZ-ujDbb1d76MXzx5BseN&usp=drive_fs'
    };
  }

  function buildDraft() {
    var packageFolder = getPackageFolder(selected.packageTier.value);

    return {
      source: 'sigil_booking_request',
      version: 'v2',
      status: 'request_pending_admin_review',
      created_at: new Date().toISOString(),
      job_type: selected.jobType,
      package_tier: selected.packageTier,
      package_inherits: getPackageInheritance(selected.packageTier.value),
      package_asset_source: 'google_drive',
      package_folder: packageFolder,
      duration: selected.duration,
      preference: selected.preference,
      preferred_models: selected.models,
      preferred_slots: getSlots(),
      client_name: els.clientName ? els.clientName.value.trim() : '',
      contact: els.contact ? els.contact.value.trim() : '',
      area: els.area ? els.area.value.trim() : '',
      telegram_readiness: els.telegram ? els.telegram.value : 'unknown',
      note: els.note ? els.note.value.trim() : ''
    };
  }

  function buildRequestHref() {
    var draft = buildDraft();
    var params = new URLSearchParams();

    params.set('source', 'booking');
    params.set('mode', 'request');
    params.set('job_type', draft.job_type.value);
    params.set('package', draft.package_tier.value);
    params.set('duration', draft.duration.value);
    params.set('preference', draft.preference.value);

    if (draft.preferred_models.length) {
      params.set('models', draft.preferred_models.map(function (m) { return m.value; }).join(','));
    }

    if (draft.preferred_slots.length) {
      params.set('slots', draft.preferred_slots.map(function (s) { return s.value; }).join('|'));
    }

    if (draft.contact) params.set('contact', draft.contact.slice(0, 80));
    if (draft.area) params.set('area', draft.area.slice(0, 80));

    return '/sigil/booking/request?' + params.toString();
  }

  function updateSummary() {
    if (els.jobType) els.jobType.textContent = selected.jobType.label;
    if (els.packageTier) els.packageTier.textContent = selected.packageTier.label;
    if (els.duration) els.duration.textContent = selected.duration.label;
    if (els.preference) els.preference.textContent = selected.preference.label;

    if (els.models) {
      els.models.textContent = selected.models.length
        ? selected.models.map(function (m) { return m.label; }).join(', ')
        : 'No model selected';
    }

    var slots = getSlots();
    if (els.slots) {
      els.slots.textContent = slots.length
        ? slots.length + ' option' + (slots.length > 1 ? 's' : '')
        : 'No time selected';
    }

    if (els.continueBtn) {
      els.continueBtn.setAttribute('href', buildRequestHref());
    }

    safeSetLocalStorage(draftKey, JSON.stringify(buildDraft()));
  }

  function selectOption(button) {
    var type = button.getAttribute('data-sigilbk2-option');
    var value = button.getAttribute('data-value');
    var label = button.getAttribute('data-label');
    if (!type || !value || !label) return;

    selected[type] = { value: value, label: label };

    optionButtons.forEach(function (item) {
      if (item.getAttribute('data-sigilbk2-option') === type) {
        item.classList.toggle('is-selected', item === button);
      }
    });

    updateSummary();
  }

  function toggleModel(button) {
    var value = button.value || button.getAttribute('value');
    var label = button.getAttribute('data-label') || value;
    if (!value) return;

    var existingIndex = selected.models.findIndex(function (model) {
      return model.value === value;
    });

    if (existingIndex >= 0) {
      selected.models.splice(existingIndex, 1);
      button.classList.remove('is-selected');
    } else {
      if (selected.models.length >= 3) {
        if (els.modelHint) els.modelHint.textContent = 'เลือกได้สูงสุด 3 คนเท่านั้นค่ะ';
        return;
      }

      selected.models.push({ value: value, label: label });
      button.classList.add('is-selected');
    }

    if (els.modelHint) {
      els.modelHint.textContent = selected.models.length
        ? 'Selected ' + selected.models.length + '/3 model preference.'
        : 'You can select up to 3 models.';
    }

    updateSummary();
  }

  optionButtons.forEach(function (button) {
    button.addEventListener('click', function () { selectOption(button); });
  });

  modelButtons.forEach(function (button) {
    button.addEventListener('click', function () { toggleModel(button); });
  });

  [els.note, els.clientName, els.contact, els.area, els.telegram, els.slot1, els.slot2, els.slot3].forEach(function (input) {
    if (!input) return;
    input.addEventListener('input', updateSummary);
    input.addEventListener('change', updateSummary);
  });

  if (els.continueBtn) {
    els.continueBtn.addEventListener('click', function () {
      safeSetLocalStorage(draftKey, JSON.stringify(buildDraft()));
    });
  }

  var reveals = Array.prototype.slice.call(root.querySelectorAll('.sigilbk2-reveal'));
  if ('IntersectionObserver' in window && reveals.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });

    reveals.forEach(function (el) { observer.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  updateSummary();
})();
