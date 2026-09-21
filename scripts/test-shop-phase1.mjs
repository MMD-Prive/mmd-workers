import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
const files = [
 'shared/shop-phase1-safety.test.mjs',
 ...readdirSync('himai-chat-worker/test').filter(name => name.endsWith('.test.mjs')).map(name => 'himai-chat-worker/test/' + name),
 'payments-worker/shop-phase1-brand.test.mjs',
 'payments-worker/unified-payment-proof.test.mjs',
 'payments-worker/shop-refund-v1.test.mjs',
 'payments-worker/payment-instructions-v1.test.mjs',
 'telegram-worker/test/shop-phase1-proof-routing.test.mjs',
];
const head = readFileSync('webflow/shared/shop-checkout-safety.head.html', 'utf8');
const helper = readFileSync('webflow/shared/shop-checkout-safety.js', 'utf8');
if (head !== '<script id="shop-phase1-safety">\n' + helper + '\n</script>\n') throw new Error('shared_head_source_drift');
for (const file of ['webflow/himai-shop/shop-v3.html', 'webflow/mmd-shop/mmd-shop-commerce-footer.html', 'webflow/pay/checkout/footer.html', 'webflow/shared/shop-checkout-safety.head.html']) {
 const source=readFileSync(file,'utf8');
 if (source.length > 50000) throw new Error('webflow_block_limit:' + file);
 for (const [, script] of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script,{filename:file});
}
const result=spawnSync(process.execPath,['--experimental-default-type=module','--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
