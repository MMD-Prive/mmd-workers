import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

import { renderMmsAdminPage } from './src/mms-admin-page.js';
import { wireMmsApproveUi } from './src/mms-admin-approve-ui.js';
import { wireMmsAdminMobileBundle } from './src/mms-admin-mobile-bundle.js';
import { wireMmsJobsUi } from './src/mms-admin-jobs-ui.js';

function productionAssembly() {
  return wireMmsJobsUi(
    wireMmsAdminMobileBundle(
      wireMmsApproveUi(renderMmsAdminPage()),
    ),
  );
}

test('MMS admin production assembly emits syntax-valid inline scripts', () => {
  const html = productionAssembly();
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1] || ''))
    .map((match) => match[2] || '');

  assert.ok(scripts.length >= 3, 'expected MMS admin inline scripts');
  scripts.forEach((source, index) => {
    assert.doesNotThrow(
      () => new Script(source, { filename: `mms-admin-inline-${index}.js` }),
      `inline script ${index} must parse`,
    );
  });

  assert.match(html, /uploadMarker='\/mms\/api\/uploads\/'/);
  assert.doesNotMatch(html, /pathname\.match\(\/\/mms\/api\/uploads/);
});
