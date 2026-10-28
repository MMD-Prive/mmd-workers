// Pin this entry module to the reviewed release commit in Webflow custom code.
// Relative imports keep the entry and its shared theme at the same revision.
import { installInternalWorkspace } from './sigil-internal-workspace-v3.mjs';
import { usesSilverWorkspace, installInternalSilverTheme } from './sigil-internal-theme-v1.mjs';
installInternalSilverTheme();

// The directory is presentation only and uses the page's existing links/session.
if (usesSilverWorkspace(location.pathname)) {
  const install = () => installInternalWorkspace();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
