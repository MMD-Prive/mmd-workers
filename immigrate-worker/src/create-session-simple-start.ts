import {
  applyCreateSessionSimpleStart as applyBaseCreateSessionSimpleStart,
  CREATE_SESSION_SIMPLE_START_MODE as BASE_CREATE_SESSION_SIMPLE_START_MODE,
} from "./create-session-simple-start-base";

export const CREATE_SESSION_SIMPLE_START_MODE = BASE_CREATE_SESSION_SIMPLE_START_MODE;

const LIVE_MANUAL_CARD_FIX_MARKER = 'data-live-manual-card-fix="v1"';
const LIVE_MANUAL_CARD_FIX_CSS = `
.mmd-cs-v14__pickedCard {
  position: relative;
}

.mmd-cs-v14__pickedCard > [data-op-lineage-badge] {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  max-width: calc(100% - 28px);
}

.mmd-cs-v14__pickedCard .mmd-cs-v14__pickedBody {
  min-width: 0;
}

@media (max-width: 719px) {
  .mmd-cs-v14__pickedCard > [data-op-lineage-badge] {
    top: 12px;
    right: 12px;
  }
}
`;

export function applyCreateSessionSimpleStart(html: string): string {
  let output = applyBaseCreateSessionSimpleStart(html);

  // Presence of an explicit admin-base means the owner page wants the same-origin
  // Worker bridge. A bare empty string is falsy in the runtime config and would
  // otherwise fall through to the direct admin-worker hostname, bypassing the
  // manual-name public fallback in immigrate-worker.
  output = output.replace('data-admin-base=""', 'data-admin-base="/"');

  if (!output.includes(LIVE_MANUAL_CARD_FIX_MARKER)) {
    output = output.replace(
      "</head>",
      `<style ${LIVE_MANUAL_CARD_FIX_MARKER}>${LIVE_MANUAL_CARD_FIX_CSS}</style></head>`,
    );
  }

  return output;
}
