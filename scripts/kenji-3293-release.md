# Kenji #3293 · isolated upload candidate

The signed-in CTA remains an inbound reply only. The workflow never promotes a Worker, sends a LINE message, or touches membership grants. Traffic remains at 100% on the pinned live deployment after the upload. Promotion is a separately reviewed step.

The manifest pins the live Worker version, settings, script configuration, ETag, version-specific JavaScript and map, plus the SHA-256 of three reversible substitutions derived from merged #3293. The substitutions preserve line count; mappings on those changed lines may not reflect the overlay. The workflow checks syntax on the complete candidate before upload and verifies exact uploaded bytes and configuration, and refuses drift, a preexisting staged version, a replay, or a time at/after 1 December 00:00 Bangkok.

After merge: use workflow **Kenji #3293 upload-only** on main with the exact reviewed tooling SHA and its existing Owner approval reference. Review the upload receipt before any separate promotion. Then verify CARE BACK, โปรเดือนนี้ and โปรสมาชิก on an authorized LINE QA account. Do not use customer recipients. All three must send once with My Status button and final-line URL; no bonus credited assertion.
