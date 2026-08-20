function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export async function handler() {
  return json(410, {
    ok: false,
    error: "netlify_line_webhook_retired",
    owner: "member-dashboard-chat-worker",
    endpoint: "https://mmdbkk.com/webhooks/line",
  });
}
