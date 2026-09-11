# 2026-09-11 model link API route incident

Symptom on `/internal/admin/model-link`:

```text
Endpoint returned HTML · HTTP 404
```

Cause:

The owner page route was deployed, but the queue API path used by the page was not guaranteed by the exact Cloudflare route sync workflow:

```text
/v1/admin/models/activation-candidates?mode=line-link-claims
```

Resolution:

Add a dedicated workflow that syncs the model link queue and bind API routes on both apex and www, then smokes both endpoints for JSON unauthorized responses.
