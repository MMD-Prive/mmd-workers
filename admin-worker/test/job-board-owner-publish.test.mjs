import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminJobBoardPublish } from "../src/job-board-owner-publish.js";

test("admin job board publish preserves the short broadcast URL", async () => {
  const upstreamBroadcast = "https://mmdbkk.com/j/ABCDEF123456";
  const env = {
    PUBLIC_JOB_BOARD_WORKER: {
      fetch: async (request) => {
        assert.equal(request.url, "https://public-job-board.internal/__internal/job-board/publish");
        assert.equal(request.method, "POST");
        return Response.json({
          ok: true,
          job: {
            id: "JOB-20260929-ABCDEF123456",
            broadcast_url: upstreamBroadcast,
          },
        }, { status: 201 });
      },
    },
  };

  const response = await handleAdminJobBoardPublish(
    new Request("https://mmdbkk.com/v1/admin/job-board/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        board_text: "งานถ่ายแบบ 2 ชั่วโมง\nลูกค้านิสัยดี มีมารยาท",
        customer_gender: "male",
      }),
    }),
    env,
    { role: "owner" },
  );

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.broadcast_url, upstreamBroadcast);
  assert.equal(data.job.broadcast_url, upstreamBroadcast);
  assert.equal(data.board_destination, "https://sigil.mmdbkk.com/public/api/jobs/JOB-20260929-ABCDEF123456");
  assert.match(data.broadcast_url, /^https:\/\/mmdbkk\.com\/j\/ABCDEF123456$/);
});
