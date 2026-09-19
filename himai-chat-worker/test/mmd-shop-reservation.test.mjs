import test from "node:test";
import assert from "node:assert/strict";

import {
  abortMmdShopPaymentClaim,
  claimMmdShopReservationForPayment,
  commitMmdShopReservation,
  publicMmdShopReservation,
  readMmdShopReservation,
  releaseMmdShopReservation,
  reserveMmdShopStock,
  writeMmdShopReservation,
} from "../../shared/mmd-shop-stock-reservation.mjs";

const F = {
  product:"fldVc73xUxjrfSjHY",
  supplier:"fldrrEXHJeTPKXs0l",
  received:"fldR9ELxn6t06P7Lb",
  remaining:"fldvjoRuM1mrR6ItQ",
  unitCost:"fldP5LaRWkq0qBJVQ",
  remainingValue:"fldmFhct2jQmIT3gL",
  low:"fldYtzXtBvK3HuqQa",
  status:"fldZW2m1Xq8q0ZH9Z",
  moveType:"fld95ubumrh0GQCgj",
  moveRef:"flddxY12JXrNsAUpE",
  orderId:"flde515MCoEq08YzU",
  orderStatus:"fldnCO3H5CpJoYmWD",
  paymentStatus:"fldUpDeLdO6D9OUcd",
  orderNotes:"fldWG0u77XQ5W0wpT",
};

function makeEnv(){return{AIRTABLE_BASE_ID:"appTest",AIRTABLE_TOKEN:"token",MMD_SHOP_RESERVATION_TTL_MINUTES:"45"}}

function mockAirtable(){
  const productId="recProduct1234567";
  const batchId="recBatch123456789";
  const movements=[];
  const order1={id:"recOrder123456789",fields:{[F.orderId]:"MMD-ORDER-1",[F.orderStatus]:"draft",[F.paymentStatus]:"pending",[F.orderNotes]:"schema=mmd_shop_order_v1"}};
  const order2={id:"recOrder223456789",fields:{[F.orderId]:"MMD-ORDER-2",[F.orderStatus]:"draft",[F.paymentStatus]:"pending",[F.orderNotes]:"schema=mmd_shop_order_v1"}};
  const orders=[order1,order2];
  const batch={id:batchId,fields:{
    [F.product]:[productId],
    [F.supplier]:[],
    [F.received]:"2026-09-01",
    [F.remaining]:5,
    [F.unitCost]:100,
    [F.remainingValue]:500,
    [F.low]:"OK",
    [F.status]:"active",
  }};
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(String(input));
    const parts=url.pathname.split("/").filter(Boolean);
    const table=parts[2];
    const recordId=parts[3];
    const method=String(init.method||"GET").toUpperCase();

    if(table==="tblr8lbi2wMuRM1N4"){
      if(method==="GET"&&!recordId)return Response.json({records:orders.map(x=>structuredClone(x))});
      if(method==="GET"&&recordId){
        const order=orders.find(x=>x.id===recordId);
        return order?Response.json(structuredClone(order)):new Response("not found",{status:404});
      }
      if(method==="PATCH"&&recordId){
        const order=orders.find(x=>x.id===recordId);
        if(!order)return new Response("not found",{status:404});
        const body=JSON.parse(init.body);
        Object.assign(order.fields,body.fields||{});
        return Response.json(structuredClone(order));
      }
    }
    if(table==="tblwFgl4et1TOgtNn"){
      if(method==="GET"&&!recordId)return Response.json({records:[structuredClone(batch)]});
      if(method==="GET"&&recordId===batchId)return Response.json(structuredClone(batch));
      if(method==="PATCH"&&recordId===batchId){
        const body=JSON.parse(init.body);
        Object.assign(batch.fields,body.fields||{});
        return Response.json(structuredClone(batch));
      }
    }
    if(table==="tblASifwHdArNKQP2"){
      if(method==="GET")return Response.json({records:movements.map(x=>structuredClone(x))});
      if(method==="POST"){
        const body=JSON.parse(init.body);
        const rec={id:"recMove"+String(movements.length+1).padStart(10,"0"),fields:body.records[0].fields};
        movements.push(rec);
        return Response.json({records:[structuredClone(rec)]});
      }
    }
    return new Response("not found",{status:404});
  };
  return{productId,batchId,batch,movements,orders,restore(){globalThis.fetch=original}};
}

test("reservation metadata round-trips and exposes expiry",()=>{
  const reservation={schema:"mmd_shop_reservation_v1",order_id:"MMD-1",state:"reserved",created_at:new Date().toISOString(),expires_at:new Date(Date.now()+1000).toISOString(),allocations:[]};
  const notes=writeMmdShopReservation("schema=mmd_shop_order_v1",reservation);
  assert.match(notes,/schema=mmd_shop_order_v1/);
  const decoded=readMmdShopReservation(notes);
  assert.equal(decoded.order_id,"MMD-1");
  assert.equal(publicMmdShopReservation(decoded).state,"reserved");
  assert.ok(publicMmdShopReservation(decoded).expires_at);
});

test("tracked stock reserves FIFO, commits inventory out without double deduction, and releases another reservation",async()=>{
  const mock=mockAirtable();
  try{
    const env=makeEnv();
    const first=await reserveMmdShopStock(env,{order_id:"MMD-ORDER-1",order_record_id:mock.orders[0].id,order_notes:mock.orders[0].fields[F.orderNotes],items:[{product_id:mock.productId,quantity:2,stock_status:"tracked"}]});
    assert.equal(first.state,"reserved");
    assert.equal(first.allocations.length,1);
    assert.equal(mock.batch.fields[F.remaining],3);
    assert.equal(mock.movements.filter(x=>x.fields[F.moveType]==="reserve").length,1);

    const claimed=await claimMmdShopReservationForPayment(env,first,"PAY-ORDER-1");
    assert.equal(claimed.reservation.state,"payment_review");
    assert.equal(readMmdShopReservation(mock.orders[0].fields[F.orderNotes]).state,"payment_review");

    const committed=await commitMmdShopReservation(env,claimed.reservation);
    assert.equal(committed.reservation.state,"committed");
    assert.equal(mock.batch.fields[F.remaining],3);
    assert.equal(mock.movements.filter(x=>x.fields[F.moveType]==="out").length,1);

    const second=await reserveMmdShopStock(env,{order_id:"MMD-ORDER-2",order_record_id:mock.orders[1].id,order_notes:mock.orders[1].fields[F.orderNotes],items:[{product_id:mock.productId,quantity:1,stock_status:"tracked"}]});
    assert.equal(mock.batch.fields[F.remaining],2);
    const released=await releaseMmdShopReservation(env,second,"expired");
    assert.equal(released.reservation.state,"expired");
    assert.equal(mock.batch.fields[F.remaining],3);
    assert.equal(mock.movements.filter(x=>x.fields[F.moveType]==="release").length,1);
  }finally{mock.restore()}
});


test("payment review claim can abort back to reserved without releasing stock before expiry",async()=>{
  const mock=mockAirtable();
  try{
    const env=makeEnv();
    const reservation=await reserveMmdShopStock(env,{order_id:"MMD-ORDER-1",order_record_id:mock.orders[0].id,order_notes:mock.orders[0].fields[F.orderNotes],items:[{product_id:mock.productId,quantity:1,stock_status:"tracked"}]});
    const claimed=await claimMmdShopReservationForPayment(env,reservation,"PAY-CLAIM");
    assert.equal(claimed.reservation.state,"payment_review");
    assert.equal(mock.batch.fields[F.remaining],4);
    const aborted=await abortMmdShopPaymentClaim(env,claimed.reservation,"PAY-CLAIM","review_rejected");
    assert.equal(aborted.reservation.state,"reserved");
    assert.equal(mock.batch.fields[F.remaining],4);
    assert.equal(readMmdShopReservation(mock.orders[0].fields[F.orderNotes]).state,"reserved");
  }finally{mock.restore()}
});


test("payment review claim blocks expiry release and commits inventory out once", async () => {
  const mock=mockAirtable();
  try{
    const env=makeEnv();
    const reservation=await reserveMmdShopStock(env,{
      order_id:"MMD-ORDER-1",
      order_record_id:mock.orders[0].id,
      order_notes:mock.orders[0].fields[F.orderNotes],
      items:[{product_id:mock.productId,quantity:2,stock_status:"tracked"}],
    });
    assert.equal(mock.batch.fields[F.remaining],3);

    const claimed=await claimMmdShopReservationForPayment(env,reservation,"proof-claim-1");
    assert.equal(claimed.reservation.state,"payment_review");
    await assert.rejects(
      () => releaseMmdShopReservation(env,claimed.reservation,"expired"),
      /reservation_not_releasable:payment_review/,
    );

    const committed=await commitMmdShopReservation(env,claimed.reservation);
    assert.equal(committed.reservation.state,"committed");
    assert.equal(mock.batch.fields[F.remaining],3);
    assert.equal(mock.movements.filter(x=>x.fields[F.moveType]==="out").length,1);

    const committedAgain=await commitMmdShopReservation(env,committed.reservation);
    assert.equal(committedAgain.idempotent,true);
    assert.equal(mock.movements.filter(x=>x.fields[F.moveType]==="out").length,1);
  }finally{mock.restore()}
});

test("failed payment review returns claim to reserved before expiry", async () => {
  const mock=mockAirtable();
  try{
    const env=makeEnv();
    const reservation=await reserveMmdShopStock(env,{
      order_id:"MMD-ORDER-1",
      order_record_id:mock.orders[0].id,
      order_notes:mock.orders[0].fields[F.orderNotes],
      items:[{product_id:mock.productId,quantity:1,stock_status:"tracked"}],
    });
    const claimed=await claimMmdShopReservationForPayment(env,reservation,"proof-abort-1");
    const aborted=await abortMmdShopPaymentClaim(env,claimed.reservation,"proof-abort-1","review_failed");
    assert.equal(aborted.reservation.state,"reserved");
    assert.equal(mock.batch.fields[F.remaining],4);
    assert.equal(mock.movements.filter(x=>x.fields[F.moveType]==="release").length,0);
  }finally{mock.restore()}
});
