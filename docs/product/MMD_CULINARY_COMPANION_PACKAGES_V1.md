# MMD Culinary Companion Packages V1

Status: Public pilot product contract  
Date: 2026-09-22

## Positioning

Culinary Companion is an MMD role-first experience, not a generic restaurant delivery service and not automatically a licensed/professional private-chef service.

The customer reserves a person + time + culinary experience. Ingredient spend stays separate from the public package price.

Public flow:

`/profiles → culinary_companion → package → /booking?from=profiles&role=culinary_companion&package=<key>`

## Public packages

| Key | Public name | Price | Included |
| --- | --- | ---: | --- |
| `cook_with_me` | COOK WITH ME | ฿1,990 | 2h / 1–2 guests / cook together |
| `dinner_made_for_you` | DINNER, MADE FOR YOU | ฿2,990 | 3h / 1–2 guests / 2–3 dishes |
| `market_to_table` | MARKET TO TABLE | ฿3,790 | 4h / market + cooking |
| `private_table` | PRIVATE TABLE | ฿4,990 | 4h / verified culinary skill / menu planning + plating |

## Public rules

- Ingredients: actual cost, separate from service price.
- Overtime: ฿690/hour.
- Extra guest service fee: +฿500/person; ingredients remain actual cost.
- Parking or special travel: actual cost.
- Severe allergy or high-risk dietary restriction: manual review required before confirmation.
- The customer's kitchen/location must have the basic equipment required for the accepted menu, unless MMD explicitly confirms another arrangement.

## Skill / naming rule

Applicant-declared interest in `culinary_companion` does not make the person a professional chef.

`PRIVATE TABLE` must only be assigned when MMD has reviewed sufficient culinary experience/skill evidence for that specific offer. Public copy must not imply licensed or professional credentials that have not been verified.

## Website contract

### Profiles

Selecting `culinary_companion` reveals the Culinary package cards before the eligible model roster.

### Booking

A valid Culinary package query:

- preselects `Culinary Companion`;
- preselects `Easy Dinner`;
- shows package name, price and included scope;
- carries the package into Booking Summary and the copied LINE request;
- locks the service selector to the package's own service while that package is active.

Unknown package values are ignored.

## Confirmation rule

Package selection is only a request. MMD must verify:

1. approved Culinary Companion role;
2. verified culinary skill when the package requires it;
3. menu fit and kitchen/equipment fit;
4. severe allergies/dietary restrictions;
5. location/travel;
6. availability.

MMS and other service roles remain separate.
