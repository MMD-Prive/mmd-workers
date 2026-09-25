import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileModelDriveFolder } from './src/model-drive-metadata-preflight.js';

const folder = { drive_folder_id: '1pr8X4sk7A_5vPZxG5syp5fmgEs9fZF77', approved_root_id: '1pr8X4sk7A_5vPZxG5syp5fmgEs9fZF77', folder_scope_key: 'public:drive:1pr8X4sk7A_5vPZxG5syp5fmgEs9fZF77', lane: 'public' };
const record = { id: 'recModel12345', fields: { drive_folder_id: folder.drive_folder_id, folder_scope_key: folder.folder_scope_key, can_work_public: true } };

test('only a unique exact canonical binding can produce metadata-ready source', () => {
  assert.deepEqual(reconcileModelDriveFolder(folder, [record]), { status: 'ready', source: { model_record_id: record.id, drive_folder_id: folder.drive_folder_id, approved_root_id: folder.approved_root_id, folder_scope_key: folder.folder_scope_key, lane: 'public' } });
  assert.equal(reconcileModelDriveFolder(folder, []).reason, 'canonical_binding_missing');
  assert.equal(reconcileModelDriveFolder(folder, [record, { ...record, id: 'recOther12345' }]).reason, 'canonical_binding_conflict');
});

test('a conflicting scope or mismatched canonical folder fails closed', () => {
  assert.equal(reconcileModelDriveFolder({ ...folder, folder_scope_key: `private:drive:${folder.drive_folder_id}` }, [record]).reason, 'source_scope_invalid');
  assert.equal(reconcileModelDriveFolder(folder, [{ ...record, fields: { ...record.fields, drive_folder_id: 'anotherFolder1234' } }]).reason, 'canonical_binding_mismatch');
  assert.equal(reconcileModelDriveFolder(folder, [{ ...record, fields: { ...record.fields, can_work_public: false } }]).reason, 'canonical_lane_mismatch');
  assert.equal(reconcileModelDriveFolder({ ...folder, lane: 'private', folder_scope_key: `private:drive:${folder.drive_folder_id}` }, [record]).reason, 'canonical_binding_mismatch');
});

test('missing lookup and malformed approved root never become ready', () => {
  assert.equal(reconcileModelDriveFolder(folder, null).reason, 'canonical_lookup_unavailable');
  assert.equal(reconcileModelDriveFolder({ ...folder, approved_root_id: '' }, [record]).reason, 'source_scope_invalid');
});
