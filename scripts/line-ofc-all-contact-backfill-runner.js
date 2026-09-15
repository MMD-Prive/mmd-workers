#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process");
const source=path.join(__dirname,"line-ofc-all-contact-backfill.js");
let code=fs.readFileSync(source,"utf8");
const target=/if\s*\(\/\^@\?\[A-Za-z0-9_\]\{5,32\}\$\/\.test\((t|trimmed)\)\)/;
const match=code.match(target);
if(!match)throw new Error("strict_telegram_patch_target_missing");
code=code.replace(target,`if(/^@[A-Za-z0-9_]{5,32}$/.test(${match[1]}))`);
if(target.test(code))throw new Error("strict_telegram_patch_failed");
const output=path.join(os.tmpdir(),"line-ofc-all-contact-backfill-strict.js");
fs.writeFileSync(output,code,"utf8");
const run=cp.spawnSync(process.execPath,[output,...process.argv.slice(2)],{stdio:"inherit",env:process.env});
if(run.error)throw run.error;
process.exitCode=run.status??1;
