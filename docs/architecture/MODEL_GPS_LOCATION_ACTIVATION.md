# MMD MODEL GPS Location Activation

Status: **READINESS ONLY — collection remains disabled by default**

## Privacy invariant

`/v1/model/settings/gps-visibility` is a permission switch only. It never accepts or stores latitude/longitude.

Actual device location may be requested only when all of these are true at the same time:

1. authenticated Model session is valid;
2. Model is active;
3. `gps_visibility_enabled = true`;
4. server confirms a current Active Job for that Model;
5. `MODEL_LOCATION_INGEST_ENABLED = true` has been explicitly enabled in production;
6. client UI has separately requested device geolocation at that moment.

If any gate is false, do not request GPS and do not ingest coordinates.

## Prepared endpoints

### Permission

- `GET /v1/model/settings/gps-visibility`
- `PATCH /v1/model/settings/gps-visibility`

Payload accepts only:

```json
{ "enabled": true }
```

### Model location capability

- `GET /v1/model/location/capability`

Returns permission/job/feature capability metadata. No raw coordinates.

### Latest-point channel

- `GET /v1/model/location/current`
- `POST /v1/model/location/current`
- `DELETE /v1/model/location/current`

`POST` accepts only the latest point fields:

```json
{
  "lat": 13.756331,
  "lng": 100.501762,
  "accuracy_m": 12.3,
  "captured_at": "2026-09-05T00:00:00.000Z"
}
```

Coordinates are stored only in `ModelLocationCoordinator` Durable Object, latest point only, with short TTL. They are not written to Airtable and no history endpoint exists.

The Model-facing `GET` returns sharing metadata only and never returns raw latitude/longitude.

### Service-only coordinate read

- `POST /__internal/model/location/current`

No public custom-host route is assigned to this endpoint. It requires dedicated service auth and re-checks permission + matching Active Job before returning an unexpired point.

## Current production flags

Keep these values until the customer ownership bridge and real LINE authenticated smoke are complete:

```toml
MODEL_LOCATION_INGEST_ENABLED = "false"
MODEL_LOCATION_CUSTOMER_READ_ENABLED = "false"
MODEL_LOCATION_RETENTION_SECONDS = "180"
```

Turning the dashboard GPS switch ON while these flags remain false grants permission only. It does not collect device location.

## Ephemeral deletion rules

Delete the current point immediately or fail closed when:

- Model turns GPS Visibility OFF;
- there is no current Active Job;
- the stored point belongs to a different session;
- point TTL expires;
- realtime room location policy disables/expires;
- the active job ends before the point TTL.

No historical archive should be created as part of this feature.

## Customer visibility gate

Do not expose a customer-facing raw-coordinate endpoint until canonical member ownership is proven server-side.

The future member facade must derive the current `session_id` and assigned `model_record_id` from the authenticated LIFF/member identity. Browser-supplied member/client/model/session identifiers must not choose what location is returned.

Tracking issue: #633.

## Realtime path

`realtime-worker` contains a fail-closed location policy:

- every room starts with location OFF;
- only the model room token may publish a location message;
- a dedicated authenticated internal service must explicitly enable a short-lived room location policy;
- latest location expires automatically;
- customer token cannot publish model location.

Production custom-host ownership for `/v1/rt/*` remains intentionally unresolved. A guarded manual workflow may deploy the implementation to workers.dev without claiming mmdbkk.com routes.

## Activation sequence

Do not skip or reorder the security gates.

1. Close #633 by proving the canonical Member/Client → Active Session ownership relationship.
2. Implement and test the member-owned location facade with no browser-selectable model/session IDs.
3. Prove genuine Published LINE Model session E2E.
4. Test GPS Visibility OFF → no geolocation request and no stored point.
5. Test GPS Visibility ON + no Active Job → no geolocation request and POST fails closed.
6. Test GPS Visibility ON + Active Job → capability allows request.
7. Enable `MODEL_LOCATION_INGEST_ENABLED=true` only after steps 1–6 pass.
8. Run authenticated Model latest-point smoke.
9. Run authenticated matching-customer read smoke.
10. Enable `MODEL_LOCATION_CUSTOMER_READ_ENABLED=true` only after customer ownership smoke passes.
11. If realtime delivery is adopted, separately approve/deploy its implementation and prove the chosen production route/service-binding ownership.
12. Confirm job end and permission OFF both purge current location.

## Non-goals

- no background GPS outside an Active Job;
- no GPS collection merely because the preference switch is ON;
- no Airtable latitude/longitude fields;
- no location history;
- no public model map;
- no arbitrary customer lookup by model/session ID;
- no location sharing to MMD staff by default;
- no inferred consent from job acceptance.
