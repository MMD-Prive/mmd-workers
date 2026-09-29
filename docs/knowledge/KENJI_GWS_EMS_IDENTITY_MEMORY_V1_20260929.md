# Kenji GWs / EMs Identity Memory + LINE History Boundary — 2026-09-29

Status: owner-authorized internal identity-resolution policy  
Owner: Boss Per

## GWs / EMs identity memory

Kenji must recognize a GWs / EMs model when the customer or owner uses any exact canonical identity alias already held by MMD.

Supported internal identity inputs:
- canonical campaign code, e.g. `GWs19`, `EMs19`
- hyphenated code variant, e.g. `EMs-19`
- approved/current `working_name`
- `nickname`
- `username`
- exact `folder_name`
- exact Active `MMD — Model Keyword Profiles.search_aliases`
- a name stripped from a code-prefixed display/folder label, e.g. `EMs20 - Rossi` -> `Rossi`

The resolver reads the canonical `Models` record at runtime. Do not maintain a second prompt-only list as identity authority.

### GWs / EMs category detection

GWs / EMs classification may come from:
- an explicit GWs/EMs code contained in canonical identity fields;
- `recognition_class`;
- `exclusive_group`.

This matters because older canonical records may carry a real/working name (for example a named GWs record) without a `GWsNN` code in `working_name`.

### Privacy and access

Internal identity recognition is **not** permission to reveal that identity.

Rules:
- denied GWs/EMs lookup returns only the broad restricted category;
- do not echo a hidden real name, alias, folder label, Drive key, contact detail, private note or internal identifier;
- an allowed result may expose only the existing customer-safe projection;
- duplicate exact aliases fail closed with clarification;
- availability, rates and booking remain separate protected truth;
- exact current Per approval remains required for GWs/EMs profile reveal under the current model-access policy.

If a legal/real name is not present in a canonical reviewed field, Kenji must not invent it from notes, social media, folder inference or chat gossip.

## LINE conversation history: current production boundary

`KENJI_LINE_CONVERSATION_SHADOW_ENABLED=true`.

Current reader:
- reads up to 50 stored inbound LINE Console Inbox records for the exact LINE user ID;
- reads up to 50 proven-delivered outbound AI/LINE events;
- combines and deduplicates them;
- supplies only the latest **24 turns** to conversation memory/context;
- each turn is bounded to 900 characters.

This is a turn-count boundary, not a date boundary. A sparse conversation can therefore include older dates, but a busy conversation may cover only the recent portion.

Only outbound replies proven sent/delivered are treated as assistant history.

### What it does not read yet

The live conversation-history runtime does **not** replay the entire historic LINE OA archive.

The LINE OFC historical contact/backfill pipeline deliberately stores identity/contact evidence without copying the raw historical conversation transcript. Therefore old archive evidence can help identity reconstruction but is not currently a full chat transcript Kenji can reread.

## Owner intent

Future expansion may increase safe history depth, but identity-scoped lookup, bounded context, delivery evidence and protected-truth rules must remain in place.
