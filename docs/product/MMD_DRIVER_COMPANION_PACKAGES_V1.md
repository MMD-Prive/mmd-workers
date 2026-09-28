# MMD Driver Companion Packages V1

Status: Public pilot product contract  
Date: 2026-09-22

## Positioning

This is **not** a generic taxi/ride-hailing listing. The customer is reserving a verified MMD Driver Companion in advance, with a defined time/distance package and MMD review before confirmation.

Public flow:

`/profiles → driver_companion → package → /booking?from=profiles&role=driver_companion&package=<key>`

## Public packages

| Key | Public name | Price | Included |
| --- | --- | ---: | --- |
| `pick_me_up` | PICK ME UP | ฿1,490 | ≤90 min / 20 km |
| `airport_please` | AIRPORT, PLEASE. | ฿1,890 | ≤2h / 40 km / 60 min airport wait after actual landing |
| `wait_for_me` | WAIT FOR ME | ฿2,690 | 3h / 50 km |
| `half_day_with_him` | HALF DAY WITH HIM | ฿3,490 | 4h / 70 km / multiple stops |

## Public add-ons

- Overtime: ฿790/hour
- Extra distance: ฿25/km
- Late night 22:00–06:00: +฿300
- Tollway: actual
- Parking: actual

## Website contract

### Profiles

Selecting `driver_companion` reveals package sales cards before the eligible model roster. Package cards remain hidden for all other roles.

### Booking

A valid package query parameter:

- preselects `Driver Companion`;
- preselects the `City & Travel` mood;
- shows the package name, price and included limits;
- carries package details into the Booking Request summary;
- carries the same details into the copied LINE request.

Only package keys in the canonical allowlist are accepted for UI selection. Unknown package values are ignored.

## Confirmation rule

A package click is not a confirmed job.

MMD must still verify:

1. Driver availability;
2. vehicle availability and policy eligibility;
3. route/service area;
4. package distance/time fit;
5. any applicable credential, insurance or vehicle requirements.

## Separation

MMS remains a separate service lane. Driver Companion packages do not authorize MMS service, private SIGIL access, or any other role.
