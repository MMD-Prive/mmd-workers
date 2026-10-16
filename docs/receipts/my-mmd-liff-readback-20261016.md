# MY MMD LIFF readback repair — 2026-10-16

Existing LINE verification resolves canonical identity and session before membership, points and history reads. No identity or ledger changes.

Removed the 3-second queue escape: one credentialed read remains in flight through response body; stalled requests abort at 10 seconds, responses are bounded at 2 MiB and errors release the queue. Membership/profile reads have priority over history preview. Preview is enqueued independently of profile success.

Validation: full test:member-pages-liff suite 508/508 passed locally, plus 3/3 focused queue regression tests. VM harnesses supply the browser globals used by the production shell. The stale history regression now releases the first queued response and awaits both reads; its stale-data assertions are retained.

Live inspection before release: /member/liff?intent=status returned 200 with the old queue escape. No authenticated customer acceptance performed. Browser connector failed with Sheep MCP session closed: RPC INTERNAL. Deployment must use the main-branch guarded workflow and retain environment reviewer protection. Source commits/tests do not establish deployment.
