# MY MMD LIFF immediate member readback repair

## Confirmed existing implementation

The customer LIFF flow already verifies LINE, resolves canonical member identity through MEMBER_STATUS_RESOLVER -> mmd-auth-worker, creates the same-site session, reads membership/points and schedules history recovery on access. The structural member census is not evidence this flow does not exist. No identity matching, member creation, membership policy or points calculation is added here.

Live public inspection on 2026-10-16 confirmed `/member/liff?intent=status` returns 200 through member-dashboard-chat-worker and contains the 3-second queue escape plus the existing LIFF start and dashboard API paths. `/my-mmd/` still identifies Lovable presentation. No routing was changed.

## Defect and repair

The Worker-rendered LIFF shell serializes rotating-cookie reads but releases a queued read after 3 seconds even if the preceding request remains active. It also queues a historical preview ahead of the full member profile. A slow upstream can therefore reintroduce concurrent reads with the same old cookie, yielding 401 or leaving member data undisplayed after successful verification.

- Keep one credentialed read in flight through both headers and body.
- Abort a stalled request after 10 seconds; release the lane only after settlement.
- Bound buffered JSON response bytes to 2 MiB.
- Preserve response status/headers/body and recover the queue after errors.
- Prioritize canonical membership/profile before the historical estimate preview.

## Validation

67 local tests passed: slow body never overlaps the next member read, deadline abort ordering, queue recovery, profile priority, existing LINE/customer isolation, fresh resolver status/points changes, null versus zero, blocked/expired access, on-access history scheduling and LIFF shell regressions.

No production deployment or real-customer/session claim. Browser plugin connection failed with `Sheep MCP session closed: RPC INTERNAL`, so authenticated visual acceptance remains unavailable in this run. Production version provenance must be checked before deployment. Do not describe the repair as live merely because it is merged.
