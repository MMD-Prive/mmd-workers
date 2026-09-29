# HYPE · REFUND COMPLETED Link Pack Policy

Status: locked by Boss Per on 2026-09-29.

## Owner rule

HYPE must collect the correct links for Per, but must not auto-send customer job links or model job/app links by itself.

## Pack order

The Telegram / owner pack must show links in this order:

1. Customer receipt URL
   - Purpose: refund receipt / proof returned to the customer.
   - This may be delivered automatically to the customer after Per uploads the refund receipt.

2. Customer job/confirm URL
   - Purpose: the customer opens or confirms the job.
   - Source of truth: the existing Session customer confirmation URL.
   - Do not synthesize or guess this URL from a job id. If no session URL is found, show `unavailable`.
   - Per sends this manually until an explicit Admin confirmation button exists.

3. Admin job URL
   - Purpose: owner/admin opens the internal job page.

4. Model job/app URL
   - Purpose: the model opens the job/app handoff.
   - Per sends this manually to the model.
   - Never send the customer receipt URL to the model.

## Future automation gate

Direct auto-send is not allowed for customer job/confirm URL or model job/app URL until the Admin UI has explicit owner-confirmed buttons:

- Send to customer
- Send to model

Both buttons must be permissioned, auditable, and must show the exact URL that will be sent before delivery.
