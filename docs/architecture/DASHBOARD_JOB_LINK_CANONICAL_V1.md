# Dashboard Job Link Canonical v1

Dashboard job rows must never point to an unimplemented dynamic browser route such as `/internal/admin/jobs/{session_id}`.

Canonical operator destination is `/internal/admin/jobs/all`.

When a verified `job_date` exists, the dashboard may preserve context as `/internal/admin/jobs/all?date=YYYY-MM-DD`.

The admin-worker response layer canonicalizes legacy dynamic job hrefs before they reach Webflow. Webflow remains presentation-only; Session/Job truth remains Worker/Airtable owned.
