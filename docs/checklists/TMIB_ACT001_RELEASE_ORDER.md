# TMIB ACT 001 release order

1. Merge backend gate and CI.
2. `member-pages-worker` production deploy completes.
3. Protected frames 04-20 seed and verify in private R2.
4. Publish Webflow `/tmib/stories` and `/tmib/act-001`.
5. Smoke anonymous fail-closed access, public teaser, canonical purchase redirect and member reader.

Do not publish a frontend that depends on the protected backend before the backend route and R2 objects are production-ready.
