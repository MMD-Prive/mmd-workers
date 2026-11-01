import test from 'node:test';
import assert from 'node:assert/strict';
import {at} from './src/owner-job-edit.js';
function env(handler){return {AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_HTTP:{fetch:handler}};}
test('job discovery includes jobs beyond first page and preserves filters',async()=>{
 let calls=0;
 const result=await at(env(async req=>{const u=new URL(req.url);assert.equal(u.searchParams.has('maxRecords'),false);assert.equal(u.searchParams.get('filterByFormula'),'fixture');assert.deepEqual(u.searchParams.getAll('fields[]'),['name']);calls++;return Response.json(calls===1?{records:Array.from({length:100},(_,i)=>({id:String(i)})),offset:'next'}:{records:[{id:'last'}]});}),'sessions',{formula:'fixture',fields:['name'],complete:true});
 assert.equal(calls,2);assert.equal(result.records.length,101);assert.equal(result.records.at(-1).id,'last');
});
test('failed second page never returns a misleading partial list',async()=>{let n=0;await assert.rejects(at(env(async()=>++n===1?Response.json({records:[{id:'one'}],offset:'next'}):new Response('',{status:503})),'sessions',{complete:true}),/edit_storage_unavailable/);});
test('repeated cursor stops instead of looping',async()=>{await assert.rejects(at(env(async()=>Response.json({records:[],offset:'same'})),'sessions',{complete:true}),/edit_list_incomplete/);});
