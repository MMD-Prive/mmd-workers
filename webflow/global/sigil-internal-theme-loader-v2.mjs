// Pin this entry module to the reviewed release commit in Webflow custom code.
// Relative imports keep the entry and its shared theme at the same revision.
import { installInternalSilverTheme } from './sigil-internal-theme-v1.mjs';
installInternalSilverTheme();
