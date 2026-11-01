# MY MMS V9 booking presentation

The files in `page-map.json` match the saved, unpublished Webflow booking draft. The adapter uses the existing three booking stages, original field IDs, auth/consent gates and registered runtime scripts. It removes the obsolete guided skin and moves the existing form alert outside hidden stages.

`booking-v9.css` is the editable skin and is already embedded in `page-head.html`. Apply only the three mapped code surfaces when a Webflow update is separately approved. Preserve the existing footer and the two unchanged embeds. This package has no publish or deployment command.

Run from the repository root:

```sh
node --test webflow/mms/customer-booking-v9/test/booking-flow.test.mjs
```

The test fixtures capture the prior form contract and registered public scripts for offline regression checks. Fixture requests never reach production and never produce successful bookings. They are not production UI or evidence of authenticated LINE iPhone acceptance.
