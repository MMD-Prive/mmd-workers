# Local release preparation — not activated

The deployment workflow now requires repository variable `MMS_PROFILE_RELEASE_GATE` exactly `approved`. Missing/other values skip the deployment job, including dispatch. This is a local workflow change only: it cannot stop runs using older workflow revisions or external deployment tools. Before any merge, independently verify an actual production hold, existing gate value, queued/running deployments and all deployment credentials/paths. Do not set the variable or cancel jobs in this task.

`scripts/prepare-profile-bootstrap.mjs` exports a pure config transformer and a dormant entry source. These are preparation primitives, not a deploy command or a completed release artifact. Use only in a separately verified production-baseline checkout: add the dormant entry as `src/profile-bootstrap-entry.mjs` and the pause module, generate a candidate config with the reviewed tag, then bundle and compare to the baseline. It preserves existing exports/request handlers and does not import the new business coordinator. Bootstrap refuses requests if its write-pause flag is absent. Never generate a bootstrap from the current PR business tree. Production migration tag, baseline artifact pairing and actual namespace readback still require proof.

The profile handler and bootstrap wrapper support server-side `MMS_PROFILE_WRITES_PAUSED=true` for every non-read profile operation, including retries. Reads and preflight remain available. Existing active operations inside the coordinator are not cancelled; a pause response is not evidence of drain. The flag is deliberately absent from the active configuration in this patch.

Drain procedure for a separately approved release:

1. Inventory every writer of the same Airtable fields and R2 owner keys, including admin tools, automations and legacy Worker versions. Pause each at its authority boundary. The HTTP profile gate does not fence external Airtable writers.
2. Verify the pause on every profile mutation route with controlled synthetic accounts; confirm all traffic uses the paused generation and no bypass deployment remains.
3. Track already dispatched operations to authoritative terminal outcomes. A quiet interval, expired browser or equal readback is insufficient. Unknown Airtable attempts remain quarantined; do not switch writer generations while an old unfenced attempt could apply.
4. Keep the pause through lifecycle bootstrap, coordinated backend/frontend activation and controlled acceptance. Prepare a coordinator-compatible corrective candidate before release. Reopen only after separate approval and proof of drain; never use legacy writers as rollback.

Targeted tests cover mutation-route pause coverage, preserved read paths, baseline immutability, lifecycle conflicts and the workflow gate. They do not prove external writer drain, production hold, bootstrap artifact equivalence or operational settlement. These remain hard release gates. No production configuration or data was changed.
