# MMD Memory — Canonical Model Registry Recovery V1

Status: CANONICAL OPERATING RULE
Owner: Per / MMD
Effective: 2026-09-19

## Purpose

When an approved Model exists in the reviewed Google Drive catalogue but is missing from the canonical Airtable `Models` registry, Create Job must recover the Model through approved owner discovery and canonical materialization. Per must not be asked to recreate the Model manually just because the canonical row is missing.

## Canonical recovery order

1. Search canonical Airtable `Models` first.
2. If the exact Model is not found, search only the approved Model Drive roots through the server-side Model Drive directory.
3. Drive is a discovery/migration source, not final booking authority.
4. Re-resolve the exact Drive folder server-side under an approved root before creating any canonical Model record.
5. Materialize one canonical `Models` record using the approved Drive folder identity and scope.
6. Re-run the normal Create Job search against canonical data.
7. Final Create Job still re-checks membership, entitlement, selected folder, lane, availability and private-work capability.

## Exact model-root rule

A Model folder may contain child folders whose names repeat the Model code, for example:

- `MMD Exclusive Models / Exclusive PN / EMs16`
- `MMD Exclusive Models / Exclusive PN / EMs16 / Review EMs16 Gohan`

If the search query has exactly one exact Model-root match, that exact root wins over descendant review/media/archive folders.

The descendant folder must not become a separate Model candidate.

This rule applies to nested folders such as:

- Review
- Media
- Private Pic / Clip
- Archive
- Reference
- Approval / Review material

provided they are descendants of the unique exact Model root.

## Ambiguity rule

Do not auto-materialize when there are multiple genuine exact Model roots or no unique exact root that safely identifies the Model.

True ambiguity remains fail-closed and requires owner review.

## Canonical fields from approved Drive ancestry

For a safely materialized Model, preserve at minimum:

- `working_name`
- `status = Active`
- `drive_folder_id`
- `drive_folder_url`
- `source_folder`
- `folder_scope_key`
- `can_work_private` / `can_work_public`
- canonical sales/visibility layer

Approved ancestry may establish migration-time access/work classification:

- Exclusive root -> Exclusive Models access
- Exclusive PN ancestry -> PN private service level / PN work format
- Exclusive VIP ancestry -> VIP private service level / VIP + PN work format

Create-time authority must use the resulting canonical fields, not raw folder text.

## Safety locks

- Never trust a browser-supplied Drive path, folder name, lane or service capability as authority.
- Never turn an unapproved Drive folder into a canonical Model.
- Never weaken membership or entitlement checks during recovery.
- Never infer unsupported capability-sensitive add-ons from Drive alone.
- Never create duplicate canonical Model records for the same approved `drive_folder_id` or `folder_scope_key`.
- Missing or conflicting identity remains fail-closed.

## Production verification

Any regression fix in this area must include:

1. focused unit/contract coverage for exact-root vs nested child-folder ambiguity;
2. production Drive smoke for a real approved Model folder;
3. production `/v1/admin/models/search` smoke for the relevant booking scope;
4. confirmation that the canonical Airtable Model row exists after lazy materialization;
5. verification on both `mmdbkk.com` and `www.mmdbkk.com` where applicable.

## Reference incident

EMs16 / Gohan exposed this failure mode on 2026-09-19.

The approved folder existed under:

`MMD Exclusive Models / Exclusive PN / EMs16`

but Drive search also returned:

`MMD Exclusive Models / Exclusive PN / EMs16 / Review EMs16 Gohan`

The two results were treated as ambiguous, so lazy materialization did not occur and Create Job showed no Model.

Canonical fix: prefer the unique exact Model root, exclude its nested review folder from Model candidates, materialize the canonical Model record, and retain fail-closed behavior for genuine ambiguity.

## Operator expectation

For future incidents of this class, diagnose and repair the registry projection first. Do not ask Per to manually duplicate the Model into Airtable as the normal workaround.
