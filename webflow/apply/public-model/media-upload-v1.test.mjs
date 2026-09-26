import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Public Model mobile media add-on enforces the MMD upload contract', async () => {
  const source=await readFile(new URL('./media-upload-v1.html',import.meta.url),'utf8');
  const script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  new vm.Script(script);
  assert.match(script,/MAX_BYTES=25\*1024\*1024,MAX_PHOTOS=8,MAX_CLIPS=3/);
  assert.match(script,/\/v1\/public-model\/upload-url/);
  assert.match(script,/upload_session_id/);
  assert.match(source,/pending review/);
  assert.match(script,/ลองอีกครั้ง/);
  assert.match(script,/localStorage/);
  assert.match(script,/video_call_preference='line_video_call'/);
  assert.match(script,/preferred_at_bangkok/);
  assert.doesNotMatch(script,/public_file_url|object_key/);
});
