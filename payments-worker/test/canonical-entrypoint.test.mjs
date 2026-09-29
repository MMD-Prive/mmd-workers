import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.slip-evidence-file-forward.js";

test("canonical entrypoint keeps payment slip evidence evidence-only", async () => {
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("canonical entrypoint forwards uploaded slip files to Telegram", async () => {
  const telegramRequests = [];
  const env = {
    SLIP_EVIDENCE_TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "-1001",
    TG_THREAD_CONFIRM: "61",
    TELEGRAM_HTTP: {
      fetch: async (url, init) => {
        telegramRequests.push({ url, init });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  };

  const form = new FormData();
  form.set("payment_ref", "PAY-1");
  form.set("session_id", "S-1");
  form.set("payment_stage", "deposit");
  form.set("source_page", "sigil_pay_v22");
  form.set("file", new Blob(["fake-slip"], { type: "image/png" }), "slip.png");

  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence", {
    method: "POST",
    body: form,
  }), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.evidence_only, true);
  assert.equal(data.official_verification_required, true);
  assert.equal(data.file_received, true);
  assert.equal(data.file_meta.name, "slip.png");
  assert.equal(data.telegram_file.ok, true);
  assert.equal(data.telegram_file.method, "sendPhoto");
  assert.equal(data.storage, "telegram_file_forwarded_metadata_in_airtable");
  assert.equal(telegramRequests.length, 1);
  assert.match(telegramRequests[0].url, /\/sendPhoto$/);
  assert.equal(telegramRequests[0].init.body.get("chat_id"), "-1001");
  assert.ok(telegramRequests[0].init.body.get("photo"));
});

test("canonical entrypoint delegates normal payment paths to the base worker", async () => {
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/pay/unknown"), {});
  assert.equal(response.status, 404);
});
