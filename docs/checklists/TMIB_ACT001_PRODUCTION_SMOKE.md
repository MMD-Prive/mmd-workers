# TMIB ACT 001 production smoke

1. Anonymous `GET /member/api/liff/tmib/episodes/act-001/access` fails closed with 401.
2. `/tmib/stories` and `/tmib/act-001` render public teaser content without protected frame URLs.
3. Active verified MMD membership opens Long Story and receives media map for frames 04-20.
4. Guest/trial/expired/blocked/revoked state does not open Long Story.
5. Single Episode purchase creates canonical 299 THB `tmib_act_001` intent and redirects only to signed `/sigil/pay?t=...`.
6. Pending proof does not grant access; Paid + Verified/Approved grants it.
7. Protected media URL rejects missing session, expired token and invalid signature.
8. Protected frame response is same-origin, private/no-store and noindex.
9. Reader watermark is identity-specific and common copy/drag/context-menu/print actions are suppressed.
10. Confirm production Webflow routes on both `mmdbkk.com` and `www.mmdbkk.com` after publish.
