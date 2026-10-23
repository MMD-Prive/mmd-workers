# MY MMS customer release package

This private source snapshot pins the approved customer skin, live therapist search and ETA support to `MMD-Prive/my-mms-therapist@8b4d2356e602df0a146d8c65bdb28ea123cdd313` (PR 7 merged). The source repository remains the presentation owner.

`manifest.json` records the source commit, Git tree, file count, archive SHA-256 and deployment tag. All 150 archived source files were checked against their Git blob hashes. The archive uses sorted paths, zero timestamps and fixed file ownership for reproducibility. It contains source files only, without dependencies, credentials or build output.

The presentation workflow verifies the checksum, extracts this package, installs from the included frozen Bun lockfile, runs TypeScript/tests/build with `VITE_MMS_LIVE=true`, and performs the existing Worker dry-run. Release metadata comes from the same verified manifest. This removes the dependency on the older PR 4 GitHub Release archive and cross-repository download credentials.

Production deployment remains a separate manual workflow dispatch on main. Updating or merging this package does not deploy it, change routes or alter backend/session bindings. Worker-owned customer chat was updated separately in mmd-workers PR 2629 and is not part of this presentation Worker package.

To update again, package an exact reviewed source commit, verify every file against the source Git tree, update the archive and manifest together, then run `node --test scripts/my-mms-customer-release.test.mjs` and the presentation CI before merging. Retain previous package commits for rollback.
