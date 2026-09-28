# MMD Existing Member Verify — 1 Year Final Lock

Status: CANONICAL / OWNER FINAL  
Effective: 2026-09-28 Asia/Bangkok  
Owner / final authority: Boss Per

## Final rule

For a customer who is already known to MMD and successfully matches the canonical existing-member identity through LINE/LIFF Verify:

- **Current / active / grace member:** Verify grants **+1 year** from the real existing membership expiry.
- **Former / expired member:** Verify grants **+1 year** from the successful canonical Verify date.
- The grant is idempotent. Reopening MY MMD, refreshing, or repeating Verify must not stack another year.
- A later paid signup/renewal is a separate membership transaction and adds the normal package term according to the package/payment authority.
- Points, coupon, payment verification, Black Card and SVIP remain separate authorities. Verify alone does not grant those benefits.

## Superseded rules

This lock supersedes any status-based existing-member rule that says:
- current member gets +180 days;
- expired member must renew first to receive only +90 days;
- login/Verify can never create an existing-member membership term.

Those older statements must not be used by runtime, Kenji, MY MMD or customer-facing copy.

## Required customer-facing summary

> กด Verify เพื่อรับสิทธิ์ต่ออายุสมาชิก 1 ปี ทั้งสมาชิกปัจจุบันและสมาชิกที่หมดอายุแล้ว เมื่อสมัครหรือต่ออายุอีกครั้ง ระบบจะรวมสิทธิ์ตามอายุแพ็กเกจที่ยืนยันใน My MMD

The final active-through date shown by My MMD after canonical application remains the membership truth.

## Safety

- Exact canonical identity match is required.
- Ambiguous or review-required identity remains fail-closed.
- The one-year grant must use an idempotent benefit/application key so repeated Verify cannot double-apply it.
- Historical Points may be reconstructed from MMD-owned LINE Official / Per Notes evidence without requiring old slips, but Points are not part of this one-year Verify grant.
