import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker from "../src/index.js";

describe("MMS service-zone catalog facade", () => {
  it("proxies the canonical service-zone catalog through the MMS service binding", async () => {
    let upstreamUrl;
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/mms/service-zones", {
      method: "GET",
      headers: { accept: "application/json" },
    }), {
      MMS_WORKER: {
        async fetch(request) {
          upstreamUrl = new URL(request.url);
          return Response.json({
            ok: true,
            data: {
              version: "2026-09-09.v1",
              provinces: [{ code: "BKK", label_th: "กรุงเทพมหานคร", zone_count: 16 }],
              zones: [{ code: "BKK-SUKHUMVIT", province_code: "BKK", label_th: "สุขุมวิท · อโศก · ทองหล่อ" }],
            },
          });
        },
      },
    });

    assert.equal(response.status, 200);
    assert.equal(upstreamUrl.hostname, "mms.internal");
    assert.equal(upstreamUrl.pathname, "/mms/api/service-zones");
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.provinces[0].code, "BKK");
    assert.equal(payload.data.zones[0].code, "BKK-SUKHUMVIT");
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  });

  it("does not require member identity because geography labels are public catalog data", async () => {
    const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/api/mms/service-zones"), {
      MMS_WORKER: {
        async fetch() {
          return Response.json({ ok: true, data: { provinces: [], zones: [] } });
        },
      },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  });

  it("fails closed instead of inventing geography when the MMS binding is unavailable", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/mms/service-zones"), {});
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "MMS_UPSTREAM_NOT_CONFIGURED");
  });

  it("rejects writes to the catalog facade", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/mms/service-zones", { method: "POST" }), {
      MMS_WORKER: { async fetch() { throw new Error("must not be called"); } },
    });
    assert.equal(response.status, 405);
    assert.equal((await response.json()).error.code, "METHOD_NOT_ALLOWED");
  });
});
