import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const bookingBase = new URL("../member-booking/", import.meta.url);
const applyBase = new URL("../apply-therapist/", import.meta.url);
const therapistsBase = new URL("../therapists/", import.meta.url);
const therapistLoginBase = new URL("../therapist-login/", import.meta.url);

test("member booking uses the authenticated facade and never browser-supplies member identity", async () => {
  const html = await readFile(new URL("member-booking.html", bookingBase), "utf8");
  const js = await readFile(new URL("member-booking.js", bookingBase), "utf8");
  assert.match(html, /\/member\/api\/liff\/mms\/catalog/);
  assert.match(html, /\/member\/api\/liff\/mms\/match/);
  assert.match(html, /\/member\/api\/liff\/mms\/prebookings/);
  assert.doesNotMatch(html + js, /mms\.internal/);
  assert.doesNotMatch(js, /member_ref\s*:/);
  assert.match(js, /slice\(0,6\)/);
  assert.match(html, /intent=mms_booking/);
});

test("therapist application is the single canonical five-step source", async () => {
  const html = await readFile(new URL("apply-therapist.html", applyBase), "utf8");
  const css = await readFile(new URL("apply-therapist.css", applyBase), "utf8");
  const js = await readFile(new URL("apply-therapist.js", applyBase), "utf8");

  assert.equal((html.match(/id="mta3"/g) || []).length, 1);
  assert.equal((html.match(/data-step="[1-5]"/g) || []).length, 5);
  assert.match(html,/data-version="14-submission-recovery"/);
  assert.match(html,/data-submit-progress/);
  assert.match(html,/name="base_service_zone_code"/);
  assert.match(html,/name="profile_photo" type="file" accept=/);
  assert.doesNotMatch(html,/name="profile_photo"[^>]*required/);
  assert.match(html,/เชื่อมบัญชีแล้ว · เข้าแอป Therapist/);
  assert.match(js,/draft.submitted_payload\|\|applicationPayload/);
  assert.match(js,/upload.storage.airtable!=="synced"/);
  assert.match(js,/upload.application_id!==application.application_ref/);
  assert.match(js,/if\(uploadResult.failed\)/);
  assert.match(css,/mta-submit-progress/);
  assert.doesNotMatch(js,/stage.innerHTML=/);

});

test("therapist login stays fail-closed while being wired to its dedicated LIFF auth contract", async () => {
  const html = await readFile(new URL("therapist-login.html", therapistLoginBase), "utf8");
  const css = await readFile(new URL("therapist-login.css", therapistLoginBase), "utf8");
  const js = await readFile(new URL("therapist-login.js", therapistLoginBase), "utf8");

  assert.match(html, /id="mms-therapist-login"/);
  assert.match(html, /data-auth-ready="false"/);
  assert.match(html, /data-liff-id=""/);
  assert.match(html, /data-auth-endpoint="\/male-massage\/therapists\/api\/auth\/line"/);
  assert.match(html, /data-auth-me-endpoint="\/male-massage\/therapists\/api\/auth\/me"/);
  assert.match(html, /data-post-login-route="\/male-massage\/therapists\/me"/);
  assert.match(html + css, /6a9a47224e8a2b5b9bfeabfd_MMS%20Login\.webp/);
  assert.match(html, /6a9a49e5183c68d9d386030a_MMS%20Login%20Button\.webp/);
  assert.match(html, /static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
  assert.match(html, /data-mms-therapist-line-login/);
  assert.match(css, /LINE Seed Sans TH/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /root\.dataset\.authReady === "true"/);
  assert.match(js, /window\.liff\.getIDToken\(\)/);
  assert.match(js, /id_token:\s*idToken/);
  assert.match(js, /credentials:\s*"include"/);
  assert.match(js, /THERAPIST_LINK_REQUIRED/);
  assert.doesNotMatch(html + js, /\/member\/api\/liff\/start|intent=mms_booking/);
  assert.doesNotMatch(html + js, /mms\.internal|line_user_id\s*:/);
});

test("global voice and contrast source is syntactically valid", async () => {
  const source = await readFile(new URL("../../global/mmd-global-typography-voice-contrast.html", import.meta.url), "utf8");
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(script, "global source must contain one script block");
  assert.equal((source.match(/<script\b/g) || []).length, 1);
  assert.doesNotMatch(source, /\?dark:light\)\+\+/);
  assert.match(source, /\)dark\+\+;\s*else light\+\+;/);
  assert.doesNotThrow(() => new vm.Script(script[1]));
});

test("public therapist directory routes pre-booking into the member workflow", async () => {
  const html = await readFile(new URL("therapists.html", therapistsBase), "utf8");
  assert.match(html, /href="\/member\/mms-booking"/);
  assert.match(html, /ONLINE MALE THERAPIST DELIVERY/);
  assert.match(html, /Women Massage/);
  assert.equal((html.match(/mtd-service-card/g) || []).length >= 8, true);
});
