# MMS Digital application and upload completion

The six-step MMS worker application uses a mobile Digital form with a progress indicator, 16px inputs/body copy, accessible upload status, and sticky actions. The existing page and application endpoints remain compatible. Styling ships with the deployed application JS asset; no new Lovable dependency is added.

A file counts as complete only after private R2 storage and a successful Airtable attachment. The backend returns retryable UPLOAD_LINK_PENDING (503) rather than successful pending storage. It releases the grant after attachment failure and consumes it only after attachment succeeds. Retry with the same valid grant overwrites the same R2 object key.

The browser checks the application-bound upload receipt, retains the accepted application and upload progress in memory, freezes accepted non-file inputs, and retries only unfinished files in the same open page. It does not persist the application token. Closing/reloading the page does not preserve this upload-resume session. Network response loss after a committed upload may require another grant; this change does not claim exactly-once file storage in that case.

Unsupported Certificates now block submission with a clear error rather than being skipped. Upload errors distinguish accepted information from incomplete files; local-storage cleanup failure cannot reverse a completed success message. Receiving an application still does not approve employment or app access.

Validation: 99 backend/browser-contract tests pass, including attachment failure/retry, missing record or credentials, rejection of unlinked browser receipts, and application reuse. The frontend source passes Node syntax validation. These are mocked upload/DOM contracts and do not establish real phone, LINE webview, or private R2 upload acceptance. Merge/deploy and a real mobile form submission with one current photo remain required.

