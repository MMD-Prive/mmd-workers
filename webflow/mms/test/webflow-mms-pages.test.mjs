import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("therapist application contains eight skills and private upload flow", async () => {
  const html = await readFile(new URL("apply-therapist.html", applyBase), "utf8");
  const js = await readFile(new URL("apply-therapist.js", applyBase), "utf8");
  assert.equal((js.match(/\[\"[a-z_]+\",\"/g) || []).filter((item) => !item.includes("sukhumvit")).length >= 8, true);
  for (const skill of ["aroma_therapy_oil", "thai_massage", "sport_massage", "office_syndrome", "health_fitness_advisor", "thai_herbal_compress", "partner_present", "women_massage"]) {
    assert.match(js, new RegExp(skill));
  }
  assert.match(html, /name="gender_identity"/);
  assert.match(html, /name="sexual_orientation"/);
  assert.match(html, /data-sensitive-consent/);
  assert.match(html, /name="profile_photo"/);
  assert.match(html, /name="certificates"/);
  assert.match(html, /Private R2/);
  assert.match(html + js, /mms\/api\/uploads\/presign/);
  assert.doesNotMatch(html, /Inside MMS|MMS shop|หน้าร้าน MMS/i);
});

test("public therapist directory routes pre-booking into the member workflow", async () => {
  const html = await readFile(new URL("therapists.html", therapistsBase), "utf8");
  assert.match(html, /href="\/member\/mms-booking"/);
  assert.match(html, /ONLINE MALE THERAPIST DELIVERY/);
  assert.match(html, /Women Massage/);
  assert.equal((html.match(/mtd-service-card/g) || []).length >= 8, true);
});
