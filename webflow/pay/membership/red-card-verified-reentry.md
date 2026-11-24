# Red Card verify before checkout (staging handoff)

The serving Webflow Designer page uses a page-level LV Max footer. The Compact V9
source in this directory is maintained separately. Apply the following three scoped
changes to the existing LV Max runtime, in the same release as the Red Card server
gate and LIFF re-entry. Preserve the LV Max template/style, existing URLs, and the
other packages' flows. Do not substitute the Compact V9 runtime for the footer.

1. Insert this first line in `returnPath(code)`. The verification return goes
   to the one Public Membership selector; do not inherit browser query data.

```js
if(code==="red_card")return "/pay/membership?package=red_card";
```

2. Insert the block below immediately before the current
   `if(response.status===401 ... LINE_SESSION_REQUIRED)`. Use the existing LV
   Max `busy`, `syncButtons`, `show`, `status` and `authUrl`.

```js
var errorCode=payload&&payload.error&&payload.error.code;
if(code==="red_card"&&((response.status===401&&errorCode==="LINE_SESSION_REQUIRED")||
  (response.status===409&&errorCode==="RED_CARD_ACCOUNT_VERIFICATION_REQUIRED"))){
  busy=false;
  syncButtons();
  show("ยืนยันบัญชี MY MMD ก่อนสมัคร Red Card ครับ เมื่อยืนยันแล้วจะกลับมาเลือก Red Card ได้อีกครั้ง","soft");
  if(status){
    var link=document.createElement("a");
    link.href=authUrl(code);
    link.textContent="ยืนยันบัญชี MY MMD";
    status.append(document.createTextNode(" "),link);
  }
  return;
}
```

3. After the existing `!response.ok || !payload || payload.ok!==true` failure
   check and before `safePay`, reject a legacy or incomplete Red Card response.

```js
if(code==="red_card"&&(!payload.package||payload.package.package_code!=="red_card"||
  payload.package.amount_thb!==11499||payload.package.duration_days!==730)){
  throw new Error("red_card_terms_unconfirmed");
}
```

The verification URL uses the existing LINE mini app with
`intent=status&return_to=%2Fpay%2Fmembership%3Fpackage%3Dred_card`.
The Worker returns to the selector only after a successful authenticated profile
read with the server member-binding marker. Unresolved users remain in MY MMD's
account-check / recovery instructions; no purchase occurs on return, and
the next user click repeats the definitive server gate. Do not auto-retry POST.
On signed-out and LINE-only test accounts, confirm no redirect to payment, no
intent, and no entitlement. On an approved linked fixture, verify same-context
return and a second explicit click, then verify existing authenticated checkout.
Test a 503 and another tier; do not click a real payment link during dry run.
