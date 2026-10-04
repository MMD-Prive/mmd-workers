# Rich Menu task destinations — owner decision 2026-10-04

This decision supersedes the blanket LIFF-first navigation rule in the earlier three-level action map. MY MMD is the customer app; MY MODEL is the worker app.

| Customer task | Response / destination |
| --- | --- |
| KENJI / SUPPORT | Bounded help in LINE; use existing เช็กสิทธิ์ and สนใจ commands. No app redirect merely to display generic help. |
| Browse models, service information, booking brief, Stories, Private introduction | Short LINE explanation with the relevant website URL, retaining existing source and entry_route parameters. |
| Read Private signup packages | Existing สนใจ command uses the canonical package catalog; signup continues via LIFF. Do not invent prices or promotions in menu copy. |
| Signup / own membership status | Existing Mini App / LIFF signup and MY MMD status entry. Renewal/payment continue through existing authenticated LIFF journeys. |

Private model browsing and booking still require fresh canonical membership truth before receiving their destination; the destination backend still enforces authentication and visibility. Generic help and viewing one's MY MMD status do not require a Private entitlement.

Artwork, installed bounded menu/index commands, global stop, owner takeover and broad auto-reply OFF remain in place. Runtime menu objects remain v4.15 because installed labels/actions and artwork are unchanged. Physical LINE taps and website navigation must still be checked after deploy.
