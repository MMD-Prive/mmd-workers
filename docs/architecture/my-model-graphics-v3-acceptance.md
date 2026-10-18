# MY MODEL V3 graphics follow-up

Base: merged PR #2502 (5045247c9afe6c372637fc7859d5dc414b36939a), inspected on main 007fd415f391db3175873324945323eebe315d41.
This is MY MODEL `/sigil/model/dashboard`, not customer MY MMD.

The merged implementation already provides compact Home, Current Job first, account/profile/media/guide disclosures, four quick actions and HOME/JOBS/CONSOLE/YOU. Original native file inputs, consent, backend events, authentication and Rainy Glass remain unchanged.

V3 adds build-time SVG budgets and rejection of wrong viewBoxes, embedded raster/executable content and missing/oversized icons. The generated presentation embed remains byte-for-byte identical to the merged build: 45,209 UTF-8 bytes; SHA256 37c0cc017574a6e41199c4e4ec7442024ecee70f99d768b3be8f568b113a9d19. This follow-up changes build validation and tests only; no Worker deployment is needed.

| Source | ViewBox | Source bytes | Maximum bytes |
|---|---|---:|---:|
| current-job-etching.svg | 0 0 240 144 | 334 | 8192 |
| no-current-job.svg | 0 0 240 112 | 231 | 6144 |
| media-review-motif.svg | 0 0 160 96 | 261 | 5120 |
| icons.svg | 8 symbols, 0 0 24 24 each | 1240 | 12288 combined; 2048/symbol |

Three decorative accents total 826 bytes (including trailing newlines), below 24576. Bangkok Motif remains optional: existing CSS editorial hairlines satisfy the divider requirement without another asset/request. No additional decorative banner is needed.

Release acceptance must separately establish saved Webflow Embed hash, publication to origin and both custom domains, rendered UI, and physical LINE iPhone status. Unit tests and a merge do not establish authenticated production or physical-device acceptance.
