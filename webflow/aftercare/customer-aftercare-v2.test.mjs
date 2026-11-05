import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { buildCustomerSessionTracker } from "../../payments-worker/customer-session-v2.js";

const source = readFileSync(new URL("./customer-aftercare-v2.js", import.meta.url), "utf8");
const fixtureToken = "customer-ui-fixture";

function verified({ approved = false, reviewed = false, state = "separated", available = true, sourceAvailable = true } = {}) {
  return {
    ok: true,
    role: "customer",
    session_id: "session-fixture",
    model_name: "Fixture Model",
    job_date: "2026-10-30",
    customer_session: {
      schema: "customer_session_v2",
      lifecycle_state: state,
      source_available: sourceAvailable,
      aftercare: { available, customer_approved: approved, review_submitted: reviewed },
    },
  };
}

function success(action, extra = {}) {
  return {
    ok: true,
    customer_approved: true,
    aftercare_complete: action === "submit_review",
    state: "under_review",
    private_care: { recommended: false, url: null },
    ...extra,
  };
}

// Minimal DOM fixture: run the real event handlers without browser or network dependencies.
class Element {
  constructor() {
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.attributes = {};
    this.handlers = {};
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
    };
    this.style = { setProperty() {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  focus() { this.focused = true; }
  scrollIntoView() {}
  async fire(event) {
    if (event === "click" && (this.disabled || this.fieldset?.disabled)) return;
    await this.handlers[event]?.({ preventDefault() {}, currentTarget: this });
  }
}

async function boot({ data = verified(), status = 200, token = fixtureToken, submit, storageBlocked = false } = {}) {
  const elements = new Map();
  const select = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const fields = select('[data-form-fields]');
  fields.disabled = true;
  const approve = select('[data-approve-completion]');
  approve.disabled = true;
  const form = select('[data-form="aftercare"]');
  form.values = new Map();
  const groups = new Map([
    ['[data-rating-value]', [1, 2, 3, 4, 5].map((value) => {
      const button = new Element();
      button.dataset.ratingValue = String(value);
      button.fieldset = fields;
      return button;
    })],
    ['[data-quick-tag]', ["on_time", "polite"].map((code) => {
      const button = new Element();
      button.dataset.quickTag = code;
      button.fieldset = fields;
      return button;
    })],
    ['[data-issue-tag]', ["privacy"].map((code) => {
      const button = new Element();
      button.dataset.issueTag = code;
      button.fieldset = fields;
      return button;
    })],
  ]);
  const root = new Element();
  root.querySelector = (selector) => groups.get(selector)?.[0] || select(selector);
  root.querySelectorAll = (selector) => groups.get(selector) || [];
  const requests = [];
  const storage = new Map();
  let nonce = 0;
  const context = {
    URL, URLSearchParams, AbortController,
    location: { search: token ? `?t=${encodeURIComponent(token)}` : "", origin: "https://mmdbkk.com" },
    document: {
      getElementById: () => null,
      createElement: (tag) => tag === "section" ? root : new Element(),
      body: { classList: { add() {} }, prepend() {} },
      head: { appendChild() {} },
    },
    window: { matchMedia: () => ({ matches: true }) },
    crypto: { randomUUID: () => `fixture-request-${++nonce}` },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error("storage_unavailable"); return storage.get(key); },
      setItem(key, value) { if (storageBlocked) throw new Error("storage_unavailable"); storage.set(key, value); },
    },
    FormData: class {
      constructor(target) { this.values = target.values; }
      get(key) { return this.values.get(key) || null; }
    },
    setTimeout: () => 1,
    clearTimeout() {},
    async fetch(url, init) {
      assert.equal(init.method, "POST");
      assert.equal(init.credentials, "omit");
      const body = JSON.parse(init.body);
      requests.push({ path: new URL(url).pathname, body });
      if (new URL(url).pathname === "/v1/confirm/details") {
        return { ok: status === 200, status, json: async () => structuredClone(data) };
      }
      assert.equal(new URL(url).pathname, "/v1/customer/session/aftercare");
      const result = submit ? await submit(body) : { data: success(body.action) };
      return { ok: (result.status || 200) < 400, status: result.status || 200, json: async () => result.data };
    },
  };
  vm.runInNewContext(source, context);
  await new Promise(setImmediate);
  return {
    root, select, groups, form, fields, approve, storage,
    requests,
    submissions: () => requests.filter((item) => item.path === "/v1/customer/session/aftercare").map((item) => item.body),
    rate: (value) => groups.get('[data-rating-value]')[value - 1].fire("click"),
    review: () => form.fire("submit"),
  };
}

test("completion CTA is outside the optional review form and existing navigation stays reachable", async () => {
  const ui = await boot();
  const markup = ui.root.innerHTML;
  assert.ok(markup.indexOf("data-approve-completion") < markup.indexOf('data-form="aftercare"'));
  assert.match(markup, /type="button" data-approve-completion disabled/);
  assert.match(markup, /วันนี้เป็นยังไงบ้างครับ <span class="sac2-optional">ไม่บังคับ/);
  assert.match(markup, /data-confirm-link href="\/sigil\/confirm\/job-confirmation\?t=/);
  assert.match(markup, /data-recovery-link href="\/sigil\/recovery\?t=/);
  assert.match(markup, />กลับ Session<\/a>/);
  assert.equal(ui.approve.disabled, false);
  assert.equal(ui.fields.disabled, true);
});

test("explicit completion approval sends no review and leaves optional review enabled", async () => {
  const ui = await boot();
  ui.form.values.set("private_model_message", "UNSENT_PRIVATE_MESSAGE");
  await ui.approve.fire("click");
  const [body] = ui.submissions();
  assert.deepEqual(Object.keys(body).sort(), ["action", "confirm_completed", "idempotency_key", "t"]);
  assert.equal(body.action, "approve_completion");
  assert.equal(body.confirm_completed, true);
  assert.equal(body.t, fixtureToken);
  assert.equal(ui.fields.disabled, false);
  assert.equal(ui.approve.disabled, true);
  assert.match(ui.select('[data-completion-status]').textContent, /บันทึกการยืนยันจบ Session แล้ว/);
  assert.equal(ui.select('[data-gate-badge]').textContent, "CONFIRMED");
  assert.equal(ui.form.values.get("private_model_message"), "UNSENT_PRIVATE_MESSAGE");
  await ui.approve.fire("click");
  assert.equal(ui.submissions().length, 1);
});

test("review requires prior approval and its own 1..5 rating, with distinct idempotency key", async () => {
  const ui = await boot();
  await ui.review();
  assert.equal(ui.submissions().length, 0);
  await ui.approve.fire("click");
  await ui.review();
  assert.equal(ui.submissions().length, 1);
  assert.match(ui.select('[data-toast]').textContent, /1–5/);
  await ui.rate(4);
  await ui.groups.get('[data-quick-tag]')[0].fire("click");
  await ui.groups.get('[data-issue-tag]')[0].fire("click");
  ui.form.values.set("private_model_message", "PRIVATE_MODEL_SENTINEL");
  ui.form.values.set("private_mmd_message", "PRIVATE_MMD_SENTINEL");
  await ui.review();
  const [approval, review] = ui.submissions();
  assert.equal(review.action, "submit_review");
  assert.equal(review.rating, 4);
  assert.deepEqual(review.quick_tags, ["on_time"]);
  assert.deepEqual(review.issue_tags, ["privacy"]);
  assert.equal(review.private_model_message, "PRIVATE_MODEL_SENTINEL");
  assert.equal(review.private_mmd_message, "PRIVATE_MMD_SENTINEL");
  assert.equal("confirm_completed" in review, false);
  assert.notEqual(review.idempotency_key, approval.idempotency_key);
  assert.equal(ui.fields.disabled, true);
  assert.match(ui.select('[data-result]').innerHTML, /ข้อมูลส่วนตัว/);
  assert.doesNotMatch(ui.select('[data-result]').innerHTML, /PRIVATE_MODEL_SENTINEL|PRIVATE_MMD_SENTINEL/);
  await ui.review();
  assert.equal(ui.submissions().length, 2);
});

test("reopening uses canonical approval and review flags, never a local completion guess", async () => {
  const approved = await boot({ data: verified({ approved: true, state: "under_review" }) });
  assert.equal(approved.approve.disabled, true);
  assert.equal(approved.fields.disabled, false);
  assert.equal(approved.submissions().length, 0);
  const reviewed = await boot({ data: verified({ approved: true, reviewed: true, state: "closed" }) });
  assert.equal(reviewed.approve.disabled, true);
  assert.equal(reviewed.fields.disabled, true);
  assert.equal(reviewed.select('[data-gate-badge]').textContent, "RECEIVED");
  assert.match(reviewed.root.innerHTML, /data-confirm-link href="\/sigil\/confirm\/job-confirmation\?t=/);
});

test("unverified or unavailable canonical sessions remain locked without legacy fallback", async () => {
  for (const options of [
    { token: "" },
    { status: 401, data: { ok: false, error: "confirmation_token_invalid" } },
    { data: { ...verified(), role: "model" } },
    { data: verified({ sourceAvailable: false }) },
    { data: verified({ available: false, state: "work_finished" }) },
    { data: verified({ state: "under_review" }) },
    { data: verified({ state: "closed" }) },
    { data: { ...verified(), session_status: "separated", customer_session: null } },
  ]) {
    const ui = await boot(options);
    assert.equal(ui.approve.disabled, true);
    assert.equal(ui.fields.disabled, true);
    await ui.approve.fire("click");
    await ui.review();
    assert.equal(ui.submissions().length, 0);
  }
});

test("a failed approval can retry with the same key even when storage is blocked", async () => {
  let attempt = 0;
  const ui = await boot({ storageBlocked: true, submit: async (body) => {
    if (++attempt === 1) throw new Error("offline");
    return { data: success(body.action) };
  } });
  await ui.approve.fire("click");
  assert.equal(ui.approve.disabled, false);
  assert.equal(ui.fields.disabled, true);
  await ui.approve.fire("click");
  assert.equal(ui.submissions()[0].idempotency_key, ui.submissions()[1].idempotency_key);
  assert.equal(ui.fields.disabled, false);
});

test("busy approval suppresses repeated clicks and review requests", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const ui = await boot({ submit: () => pending });
  const first = ui.approve.fire("click");
  assert.equal(ui.approve.disabled, true);
  await ui.approve.fire("click");
  await ui.review();
  assert.equal(ui.submissions().length, 1);
  resolve({ data: success("approve_completion", { idempotent: true }) });
  await first;
  assert.equal(ui.fields.disabled, false);
});

test("approval success without explicit backend confirmation cannot unlock review", async () => {
  for (const data of [{ ok: true, state: "under_review" }, { ok: true, customer_approved: true }]) {
    const ui = await boot({ submit: async () => ({ data }) });
    await ui.approve.fire("click");
    assert.equal(ui.fields.disabled, true);
    assert.equal(ui.approve.disabled, false);
    assert.doesNotMatch(ui.select('[data-completion-status]').textContent, /บันทึกการยืนยัน/);
  }
});

test("backend state or token rejection relocks actions and preserves console links", async () => {
  for (const error of ["aftercare_wait_for_separated", "aftercare_not_available", "confirmation_token_expired"]) {
    const ui = await boot({ submit: async () => ({ status: 409, data: { ok: false, error } }) });
    await ui.approve.fire("click");
    assert.equal(ui.approve.disabled, true);
    assert.equal(ui.fields.disabled, true);
    assert.match(ui.root.innerHTML, /data-confirm-link href="\/sigil\/confirm\/job-confirmation\?t=/);
  }
});

test("review approval rejection restores explicit approval and keeps draft feedback", async () => {
  const ui = await boot({ data: verified({ approved: true }), submit: async () => ({
    status: 409, data: { ok: false, error: "customer_completion_required" },
  }) });
  await ui.rate(3);
  ui.form.values.set("private_mmd_message", "DRAFT_PRIVATE_MESSAGE");
  await ui.review();
  assert.equal(ui.fields.disabled, true);
  assert.equal(ui.approve.disabled, false);
  assert.equal(ui.form.values.get("private_mmd_message"), "DRAFT_PRIVATE_MESSAGE");
});

test("private care remains available after review and rejects external returned destinations", async () => {
  for (const url of ["/sigil/recovery?t=care-fixture", "https://external.invalid/recovery?t=care-fixture"]) {
    const ui = await boot({ data: verified({ approved: true }), submit: async (body) => ({
      data: success(body.action, { private_care: { recommended: true, url } }),
    }) });
    await ui.rate(1);
    await ui.review();
    const result = ui.select('[data-result]').innerHTML;
    assert.match(result, /href="\/sigil\/recovery\?t=/);
    assert.match(result, /href="\/sigil\/confirm\/job-confirmation\?t=/);
    assert.doesNotMatch(result, /external\.invalid/);
  }
});

test("UI does not render credentials or account data as visible content", async () => {
  const ui = await boot({ data: { ...verified(), bank_account: "PRIVATE_ACCOUNT_SENTINEL" } });
  const visible = ui.root.innerHTML.replace(/<[^>]*>/g, "");
  assert.equal(visible.includes(fixtureToken), false);
  assert.equal(visible.includes("PRIVATE_ACCOUNT_SENTINEL"), false);
  for (const key of ui.storage.keys()) assert.equal(key.includes(fixtureToken), false);
});

test("existing confirmation CTA consumes the canonical tracker from separated through closed", async () => {
  const trackerSource = readFileSync(new URL("../sigil/confirm/customer-session-tracker-v2.js", import.meta.url), "utf8");
  for (const state of ["work_finished", "separated", "under_review", "payout_pending", "closed"]) {
    const elements = new Map();
    const root = new Element();
    root.querySelector = (selector) => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    root.querySelectorAll = () => [];
    const link = root.querySelector('[data-session-aftercare]');
    link.hidden = true;
    const tracker = buildCustomerSessionTracker({
      sessionFields: { model_session_state: state },
      jobFields: { status: state === "work_finished" ? "separated" : "work_finished" },
      token: fixtureToken,
    });
    const payload = { ...verified(), session_status: "work_finished", customer_session: tracker };
    const context = {
      URL,
      document: {
        readyState: "complete", hidden: false,
        getElementById: (id) => id === "mmd-job-confirm-v16" ? root : null,
        createElement: () => new Element(), head: { appendChild() {} }, addEventListener() {},
      },
      window: {
        location: { href: `https://mmdbkk.com/sigil/confirm/job-confirmation?t=${fixtureToken}` },
        setInterval: () => 1, addEventListener() {},
      },
      clearInterval() {},
      matchMedia: () => ({ matches: true }),
      async fetch(url, init) {
        assert.equal(new URL(url).pathname, "/v1/confirm/details");
        assert.equal(init.method, "POST");
        return { ok: true, json: async () => payload };
      },
    };
    vm.runInNewContext(trackerSource, context);
    await new Promise(setImmediate);
    assert.equal(link.hidden, state === "work_finished");
    if (state !== "work_finished") assert.equal(link.href, tracker.aftercare.url);
    else assert.equal(link.href, undefined);
  }
});
