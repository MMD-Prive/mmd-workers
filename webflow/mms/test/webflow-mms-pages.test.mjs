import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const bookingBase = new URL("../member-booking/", import.meta.url);
const applyBase = new URL("../apply-therapist/", import.meta.url);
const therapistsBase = new URL("../therapists/", import.meta.url);

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
  for (const imageIndex of ["01", "02", "03", "04", "05", "06", "07", "08", "09"]) {
    assert.match(html, new RegExp(`HIMA%20Apply%20Mod%20${imageIndex}\\.webp`));
  }
  assert.match(html, /data-branch-open/);
  assert.match(html, /data-application-step="5"/);
  assert.match(css, /^#mta3/m);
  assert.doesNotMatch(html + css + js, /mta4(?:a|b|c|d|e|f|inject|h1|h2|h3)/i);

  for (const skill of ["aroma_therapy_oil", "thai_massage", "sport_massage", "office_syndrome", "health_fitness_advisor", "thai_herbal_compress", "partner_present", "women_massage"]) {
    assert.match(js, new RegExp(skill));
  }
  for (const field of ["current_profession", "qualification_note", "work_base_area", "mobility_scope", "coverage_area_note"]) {
    assert.match(html, new RegExp(`name="${field}"`));
    assert.match(js, new RegExp(`${field}:`));
  }

  assert.doesNotMatch(js, /\bbase_zone\s*:/);
  assert.doesNotMatch(js, /\bcoverage_zones\s*:/);
  assert.match(html, /name="gender_identity"/);
  assert.match(html, /name="sexual_orientation"/);
  assert.match(html, /data-sensitive-consent/);
  assert.match(html, /name="profile_photo"/);
  assert.match(html, /name="certificates"/);
  assert.match(html, /Private R2/);
  assert.match(html + js, /mms\/api\/uploads\/presign/);
  assert.match(js, /draft\.application_token/);
  assert.match(js, /persistDraft\(\)/);
  assert.match(js, /if\(uploadResult\.failed\)/);
  assert.match(js, /allowedFile/);
  assert.match(js, /controller\.abort\(\)},45000\)/);
  assert.match(js, /form\.elements\.namedItem\(name\)/);
  assert.equal((html.match(/data-swipe-rail/g) || []).length, 5);
  assert.equal((html.match(/class="mta-accordion/g) || []).length, 4);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /mta-motion-ready/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /initAccordions/);
  assert.doesNotMatch(js, /form\.elements\[/);
  assert.doesNotMatch(js, /file\.lastModified/);
  assert.doesNotMatch(js, /localStorage\.removeItem\(storageKey\).*uploadFiles/);
  assert.doesNotMatch(html, /Inside MMS|MMS shop|หน้าร้าน MMS/i);
  assert.match(html, /https:\/\/lin\.ee\/WKKjnZ1/);
  assert.equal((html.match(/data-mmd-contrast-skip="world-headline"/g) || []).length, 5);
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
