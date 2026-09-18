# TMIB ACT 001 route owners

| Surface | Owner |
| --- | --- |
| `/tmib/stories`, `/tmib/act-001` | Webflow public presentation |
| `/member/api/liff/tmib/episodes/act-001/*` | member-pages-worker via member-dashboard front gate |
| Payment intent and verification | payments-worker |
| Member entitlement truth | canonical My MMD member resolver |
| Protected media | private R2 `mmd-models` |

No Webflow/browser code is payment or entitlement authority.
