import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Public Model mobile media add-on enforces the MMD upload contract', async () => {
  const source=await readFile(new URL('./media-upload-v1.html',import.meta.url),'utf8');
  const script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  new vm.Script(script);
  assert.match(script,/MAX_BYTES=25\*1024\*1024,MAX_PHOTOS=8,MAX_CLIPS=1/);
  assert.match(script,/\/v1\/public-model\/upload-url/);
  assert.match(script,/upload_session_id/);
  assert.match(source,/รูปและข้อมูลเพิ่มเติมให้พี่เปอร์ดู/);
  assert.match(source,/LINE หรือเบอร์โทรไว้ก่อนได้/);
  assert.match(source,/t\.me\/per_mmd/);
  assert.match(script,/ลองอีกครั้ง/);
  assert.match(script,/localStorage/);
  assert.match(script,/job_id/);
  assert.match(script,/application_source/);
  assert.doesNotMatch(script,/video_call_preference|preferred_at_bangkok|data-video-time/);
  assert.doesNotMatch(script,/public_file_url|object_key/);
});
