# Relax Spa by 9: referrals, agreements and settlement

The Owner page and MY Partner page present the existing spa ledger. This guide
records the v2 operating contract. It is not evidence of deployment, spa
acceptance, real receipts, refunds or transfers.

## Access and scope

- MY Partner: `/partner/dashboard/relax-spa?t=<existing-partner-token>`. Partners
  can submit and read only their own referrals and referral payouts. They cannot
  approve agreements, quote, link jobs, record money, settle or close services.
- MMS Owner: `/internal/admin/mms/relax-spa`, using the existing signed browser
  session. All financial and lifecycle commands are Owner-only.
- Public Relax Spa pages and the customer MY MMS app keep their routes.

## V2 operating sequence

1. Partner recommends an existing Active Therapist. Owner records the spa's
   acceptance or refusal with an evidence reference.
2. Owner creates a v2 agreement. A draft can be incomplete and cannot be quoted.
   A confirmed agreement requires the Therapist, spa `relax-spa-by-9`, positive
   integer duration, a fixed Therapist amount inclusive of travel, customer amount
   before discounts, an explicit share basis and allocation among spa, Partner
   and MMS, terms reference, and confirmed round-trip travel evidence from the
   Therapist's home. The travel method records the actual transport mode. Travel is
   included in the Therapist amount and is never an extra deductible cost.
3. Allocation and amounts have no defaults. For `remaining_revenue`, the share
   basis is customer price before discounts minus the fixed Therapist amount
   including travel. For `received_revenue`, the share basis is customer price
   before discounts, and the complete allocation must exactly account for the
   customer price. The Owner enters share rates as percentages; the Therapist
   amount stays fixed and has no percentage field. A non-zero Partner share requires the explicit Partner
   account id. Agreement versions are immutable; make a new version for changed
   terms.
4. Owner creates a service draft from an accepted referral. The draft does not
   create an agreement or MMS Job. Owner selects a confirmed, scoped v2 agreement
   to produce a quote preview. Review the planned receipt, basis, fees/taxes and
   allocations before confirming the quote.
5. Owner links an existing canonical MMS Job for the same Therapist. The
   observed service duration must match the agreement. This ledger does not
   create, dispatch, start or complete a Job. The canonical payout must equal the
   Therapist amount already including travel; the Job must not also carry a travel
   charge, and a recorded full customer price must match the v2 customer amount.
   These checks prevent the existing generic booking/pricing path from silently
   adding travel or replacing the approved payout. The spa ledger only checks this
   existing Job data; keep generic booking/pricing routes and their records in
   their existing workflow. Legacy v1 service records remain
   historical and are not a basis for new v2 links; their existing receipt,
   settlement, payout and close controls remain available under historical
   revenue-share labels.
6. Owner records each actual receipt after inspecting amount, recipient,
   timestamp and unique transaction evidence. Partial receipts are shown. Only
   booked services accept receipts. Settlement requires the net amount to match
   the quote after approved discounts and refunds.
7. Owner may record a manual, inspected refund before settlement. It must match
   an approved refund adjustment, have evidence and timestamp, and remain within
   received amounts. No automatic payment or bank action occurs.
8. Owner approves settlement only after the canonical Job is Completed and
   net receipts match the approved expected amount. Largest-remainder allocation
   uses the server quote preview. Owner records each actual payout with recipient,
   time and unique evidence. Fee and tax adjustments also reserve an amount for
   a named bearer; record the actual expense payment and its evidence before
   closing. Close requires the completed canonical Job, approved settlement, all
   nonzero share payouts and all fee/tax expense evidence recorded.

Adjustments are explicit fixed-amount fee, discount, tax or refund entries, each
with a named bearer and evidence reference. The Owner form accepts amounts in
baht and converts them to integer satang for storage. Costs are not supported in v2. Fees
and taxes remain explicit named-bearer adjustments; discounts and refunds affect
expected net receipts. Historical v1 records remain labeled as historical
revenue shares and must not be described as net profit where cost evidence is
incomplete.

## Persistence and limits

`RELAX_SPA_LEDGER` is a SQLite-backed Durable Object in mms-worker. One object
serializes writes in storage transactions. Scoped request keys, payload
fingerprints, unique evidence checks, immutable agreements and unique canonical
Job links prevent duplicate decisions. An append-only action trail records the
verified actor and time. Failed transactions do not retain partial decisions.
Same-origin JSON POST is required at both browser gateways.

Receipt, payout and refund recording are manual evidence review, not bank
verification and not a mutation of the global Payments table. Do not book the
same earning through both this ledger and Model Partner Commissions. Storage or
catalog errors show unavailable, never a fake empty or paid state.

## Rollout evidence

Review and merge, then deploy the relevant Workers
under the separate approvals required for those actions. Verify Owner and two
Partner scopes on mobile, including that one Partner cannot read another's
records. Production receipt, refund, payout, closure, publication or deployment
requires its own authorization and evidence; a local test or HTTP 200 does not
provide that authorization.

## Formula and compatibility

Let C be the agreed customer price before discount and T the fixed Therapist
amount inclusive of home-to-spa round-trip travel. For remaining revenue, allocate
C - T across spa / referring Partner / MMS with explicit basis points totaling
10,000. For gross revenue, T + C * sum(basis points) / 10,000 must equal C exactly.
Floor each proportional share in integer satang, then allocate remaining satang
by largest fractional remainder; ties use spa, Partner, MMS order.

Subtract each fixed-satang adjustment from its named bearer after allocation.
No percentage fee/tax is inferred. Gross receipts must equal C minus discounts,
actual refunded amounts must equal approved refunds, and final shares plus
fee/tax reserves must equal gross receipts minus actual refunds. Negative party
shares and unallocated amounts fail closed. Before close, payout evidence and
fee/tax expense evidence must reconcile to that received net amount. No net
profit is asserted: the full business cost model is not available here.

The same existing object name `relax-spa-by-9:v1` and `state` storage key are
retained. V2 is additive JSON schema, with no namespace or Cloudflare migration
change. Historical v1 agreements, services, settlements and paid amounts are not
rewritten. New v1 agreement creation/job linking is refused. New agreements and
quotes are immutable versions; canonical duration, payout and any explicit price
are rechecked before approval and payout. Formula version, rounding policy and
allocation preview are frozen at quote; a mismatch blocks settlement.

Refunds are supported only within the explicitly approved refund adjustments
before settlement. An unagreed refund, reversal or change after settlement needs
separate reviewed reconciliation; the API refuses to rewrite approved or paid
amounts. Recorded references identify individual transactions, not a general
folder or a reusable screenshot. Evidence review remains Owner responsibility.
