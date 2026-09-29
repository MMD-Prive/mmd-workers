import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const confirm = readFileSync(new URL("./model-direct-first-job-gate-v1.js", import.meta.url), "utf8");
const jobDay = readFileSync(new URL("../model/job-day-direct-first-gate-v1.js", import.meta.url), "utf8");
const consoleLinks = readFileSync(new URL("../model/model-console-rules-links-v1.js", import.meta.url), "utf8");

test("confirmation details are intercepted behind canonical direct-job gate",()=>{
  assert.match(confirm,/\/v1\/model\/direct-job-gate\/status/);
  assert.match(confirm,/url\.pathname !== DETAILS/);
  assert.match(confirm,/return new Promise\(\(\) => \{\}\)/);
  assert.match(confirm,/อ่านกติกาวันทำงาน/);
  assert.match(confirm,/ก่อนดูรายละเอียดงานแรก/);
});

test("Job Day acknowledgement returns only to exact signed model confirmation path",()=>{
  assert.match(jobDay,/\/v1\/model\/direct-job-gate\/ack/);
  assert.match(jobDay,/params\.get\("source"\) !== "direct_first_job"/);
  assert.match(jobDay,/u\.pathname !== "\/sigil\/confirm\/job-model"/);
  assert.match(jobDay,/ฉันอ่านและเข้าใจแล้ว/);
  assert.match(jobDay,/เปิดรายละเอียดงาน/);
});

test("Model Console exposes only the two world-level rules links",()=>{
  assert.match(consoleLinks,/href="\/rules\/model"/);
  assert.match(consoleLinks,/href="\/rules\/public-model-work"/);
  assert.doesNotMatch(consoleLinks,/rules\/model\/private\/job-day/);
  assert.equal((consoleLinks.match(/<a class=/g)||[]).length,2);
});
