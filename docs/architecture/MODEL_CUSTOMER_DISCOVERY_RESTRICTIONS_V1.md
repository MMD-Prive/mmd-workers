# Model customer discovery restrictions V1

Status: worker and paired Booking deployments completed in PR #2792 and
follow-ups on 2026-10-27 ICT. Actual signed-in allowed/blocked verification
remains pending; do not claim complete hiding across all MMD channels.

## Canonical ownership

Models.customer_discovery_policy_json is server-only. Provisioned field:
fldwY92oSYUKoRdLy. Blank preserves existing rules; malformed rules fail closed.
No real customer's block list has been populated by implementation work.

MY MODEL's YOU view contains a compact privacy panel. The normal Webflow
home uses `webflow/sigil/model/customer-discovery-privacy-entry-v1.js` to place
a link inside the existing verified workspace/account section. The link opens
the canonical apex `/sigil/model/dashboard/more#privacy-panel`, where the
existing signed Model session and privacy API remain authoritative. It carries
no customer identifier, callback token or query-supplied identity. The fragment
opens the panel, and rejected/stale writes leave controls disabled until reload.
The Thai navigation key is `myModel.privacy.open` in MMD-Prive/mmd-i18n.

The panel It selects a canonical
historical job, not a customer name, contact, free-typed member ID or hash.
The existing signed Model session owns the API:
GET|POST /v1/model/settings/customer-visibility.

A POST verifies the job's Models record link, a single linked Client, the
session's canonical member_id and the Members-to-Clients relationship. It
does not use names or retired Memberstack IDs. A per-Model coordinator serializes
source revision checks and Airtable writes. Stale revisions return 409.
Airtable remains canonical; the coordinator stores no policy/customer snapshot.
Blocking/unblocking does not cancel already-confirmed jobs or change finances.

## Viewer identity

The member service exposes a service-authenticated, read-only discovery viewer
endpoint. It never rotates the underlying member session, returns contacts,
or accepts a browser-claimed identity. It derives an opaque, purpose-scoped
SHA-256 binding from the server-verified canonical member_id:
mmd-discovery-member-v1:<canonical member id>. The Model writer derives the
same ref only after validating historical job/Client/Member linkage.

After a verified member login/session refresh on mmdbkk.com or www.mmdbkk.com,
the service issues __Secure-mmd_discovery_session. This is an opaque random
alias backed by LIFF_IDENTITY_KV, expires in 30 minutes, is HttpOnly/Secure,
SameSite=Strict, Domain=mmdbkk.com, Path=/sigil/api/.
The primary __Host member cookie remains host-only.
Every viewer read checks the source session again; expired, rotated, revoked,
unmatched and blocked sessions fail closed. The alias grants no membership tier.
Missing cross-site cookies on unrelated preview domains also fail closed.

sigil-booking PR #33 includes credentials on canonical API calls. Worker CORS
allows credentials only for explicitly configured exact origins. Media URLs
remain on sigil.mmdbkk.com; no storage URL enters the customer projection.

## Search and media

A restricted Model is omitted from blocked and anonymous discovery. Logging
out is not a bypass. Each media GET/HEAD checks the current canonical Model
policy before R2 reads, returns generic 404 on denial and uses no-store.
No block list, binding, denied count, or customer-specific deny reason is
returned in customer search. Existing tier/approval gates remain mandatory.

Policy schema:
```json
{
  "schema_version": "model_customer_discovery_v1",
  "require_verified_customer": true,
  "blocked_member_refs": ["64-character lowercase hex purpose-scoped binding"],
  "blocked_jobs": [{"member_ref": "same binding", "session_id": "owned job reference"}]
}
```

## Legacy public media closure

The asset-host route models.mmdbkk.com/* catches encoded path variants before
the R2 public custom-domain origin. Legacy models/* and the MMD Public/Private Models/* folder families return
410. Other static files remain in the same R2 bucket; the existing more-specific
studio/api and health owners are preserved.
The old /sigil/api/models/search/public-catalog returns 410 with empty items
when LEGACY_PUBLIC_MEDIA_CLOSED=true. Its direct public image URLs are retired.
Previously saved direct Model-storage image links will stop working; approved
media must use /sigil/api/models/media/:media_id. This does not delete objects.

The mmd-models managed r2.dev domain was read-only verified disabled. The only
enabled custom domain was models.mmdbkk.com. Recheck this before rollout and
monitor config drift. Files already downloaded to another device cannot be
recalled by a server-side block.

The Model settings API probes the live raw/encoded legacy paths and retired
catalog on every settings read/write. It requires 410 plus the correct route
owner before reporting ready or accepting a mutation. A Model cannot submit
its own readiness/isolation flag. Thus admin/presentation deployment preceding
the media deployment cannot falsely enable blocking.

## Release gates

1. All updated CI passes, including owner authorization, cross-host alias,
   read-only session validation, concurrent revisions, encoded paths, static
   assets, search privacy and media revocation.
2. Merge paired worker/frontend changes and confirm member, admin, presentation
   and booking deployments. Verify exact routes and static asset compatibility.
3. Verify an actual allowed, blocked and signed-out viewer on mobile, including
   GET/HEAD/ranges, saved media links, session expiry and source-session rotation.
4. Audit recommendation/detail surfaces before claiming complete hiding across
   every MMD channel. This release governs Booking search/media and retires
   the legacy anonymous storage/catalog channels.
