import test from "node:test";
import assert from "node:assert/strict";
import { preservePartnerSnapshot } from "./src/create-session-canonical-link-runtime.js";
test("partner settlement evidence keeps source rate separate from actual payout",()=>{
 const body={job_details:{partner_relationship:{settlement_method:"included_in_rate",partner_source_rate_thb:8000,model_payout_thb:5500,included_partner_amount_thb:2500}},partner_attribution:{partner_name:"Kendo"},model_payout_thb:5500};
 const note=preservePartnerSnapshot("operator note",body);
 const data=JSON.parse(note.split("\n").at(-1));
 assert.equal(data.model_payout_thb,5500);
 assert.equal(data.partner_relationship.model_payout_thb,5500);
 assert.equal(data.partner_relationship.included_partner_amount_thb,2500);
 assert.equal(data.partner_relationship.partner_source_rate_thb,8000);
 assert.ok(note.startsWith("operator note\n"));
 assert.equal(preservePartnerSnapshot(note,{partner_attribution:{partner_name:"Changed"}}),note);
});
test("jobs without partner data preserve existing notes",()=>assert.equal(preservePartnerSnapshot("original",{}),"original"));
