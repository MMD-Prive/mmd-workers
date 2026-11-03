// Offline proposal only. Deliberately not imported by a release executor.
import assert from 'node:assert/strict';
import {transformBookingArtifact,hash,verifyPreservation} from './member-booking-artifact.mjs';
export const AADC_HASH='e8924a29d90b47c254eba84ffae85256b574569443be9a37ad748deebb5d87f5';
export function buildAadcBookingProposal(baseline){
 assert.ok(Buffer.isBuffer(baseline));assert.equal(hash(baseline),AADC_HASH,'proposal baseline drift');
 const result=transformBookingArtifact(baseline);verifyPreservation(baseline,result.bytes,result.edits);
 return {...result,proposalOnly:true,baselineSha256:AADC_HASH,releaseAuthorized:false};
}
