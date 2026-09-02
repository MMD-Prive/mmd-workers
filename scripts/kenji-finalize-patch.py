from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing patch anchor: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"ambiguous patch anchor: {label} count={text.count(old)}")
    return text.replace(old, new, 1)


js_path = Path("webflow/internal/admin/kenji/kenji-admin-v1.js")
js = js_path.read_text()
js = replace_once(
    js,
    '    modelBusy: false,\n  };',
    '    modelBusy: false,\n    modelSearchTimer: null,\n    modelSearchSeq: 0,\n    modelDraftKey: "",\n    modelDraftFingerprint: "",\n  };',
    "model state",
)
js = replace_once(
    js,
    '    var modelSearch = root.querySelector("#kaModelSearch");\n    if (modelSearch) modelSearch.addEventListener("input", renderModelList);',
    '    var modelSearch = root.querySelector("#kaModelSearch");\n    if (modelSearch) modelSearch.addEventListener("input", function () {\n      clearTimeout(state.modelSearchTimer);\n      state.modelSearchTimer = setTimeout(function () { loadModels(modelSearch.value.trim(), true); }, 250);\n    });',
    "model server search binding",
)
start = js.index('  function loadModels() {')
end = js.index('\n  function setModelFilter', start)
js = js[:start] + '''  function loadModels(query, fromSearch) {
    var search=document.getElementById("kaModelSearch");
    var q=String(query==null?((search&&search.value)||""):query).trim();
    var seq=++state.modelSearchSeq;
    state.modelsLoading=true;
    var list=document.getElementById("kaModelList");
    if(list&&!fromSearch)list.innerHTML='<p>กำลังโหลด Models + Keyword Profiles…</p>';
    var url=MODEL_API+"?limit=120"+(q?"&q="+encodeURIComponent(q):"");
    return request(url).then(function(data){
      if(seq!==state.modelSearchSeq)return;
      state.models=data.items||[];
      state.modelsLoaded=true;
      renderModelList();
      var sync=document.getElementById("kaSync");
      if(sync)sync.textContent="เชื่อม Worker แล้ว · Knowledge "+state.cards.length+" · Models "+state.models.length+(q?" matching":"");
    }).catch(function(error){
      if(seq!==state.modelSearchSeq)return;
      if(list)list.innerHTML='<div class="ka__empty">Models ยังโหลดไม่ได้ · '+esc(error.message||"model_source_unavailable")+'<br><button data-model-action="reload">ลองใหม่</button></div>';
    }).finally(function(){if(seq===state.modelSearchSeq)state.modelsLoading=false;});
  }
''' + js[end:]

save_start = js.index('  function saveModelDraft() {')
save_end = js.index('\n  function setModelActionsDisabled', save_start)
js = js[:save_start] + '''  function saveModelDraft() {
    if(state.modelBusy||!state.selectedModel)return;
    var payload=modelDraftPayload();
    var fingerprint=JSON.stringify(payload);
    if(!state.modelDraftKey||state.modelDraftFingerprint!==fingerprint){
      state.modelDraftKey=crypto.randomUUID();
      state.modelDraftFingerprint=fingerprint;
    }
    var idempotencyKey=state.modelDraftKey;
    state.modelBusy=true;
    setModelActionsDisabled(true);
    toast("กำลังส่ง Model Keyword Draft เข้า Review…");
    return request(MODEL_API+"/draft",{
      method:"POST",
      headers:{"Content-Type":"application/json","Idempotency-Key":idempotencyKey},
      body:JSON.stringify(payload),
    }).then(function(data){
      state.modelDraftKey="";
      state.modelDraftFingerprint="";
      toast("Model Keyword Draft เข้า Review แล้ว · "+(data.request_id||"pending_review"));
      var node=document.getElementById("kaModelPreview");
      if(node)node.innerHTML='<span>REVIEW QUEUE</span><h4>Pending Review</h4><p>'+esc(data.request_id||"")+'</p><small>Model และ Model Keyword Profile ใน Production ยังไม่ถูกแก้ไข</small>';
    }).catch(handleError).finally(function(){state.modelBusy=false;setModelActionsDisabled(false);});
  }
''' + js[save_end:]
js_path.write_text(js)


test_path = Path("webflow/internal/admin/kenji/kenji-admin-v1.test.mjs")
tests = test_path.read_text()
if 'Models search delegates query to the Worker' not in tests:
    tests += '''\n
test("Models search delegates query to the Worker and ignores stale responses", () => {
  assert.match(js, /modelSearchTimer/);
  assert.match(js, /modelSearchSeq/);
  assert.match(js, /encodeURIComponent\\(q\\)/);
  assert.match(js, /MODEL_API\\+"\\?limit=120"/);
  assert.doesNotMatch(js, /addEventListener\\("input", renderModelList\\)/);
});

test("Model draft retries reuse one idempotency key until edit or success", () => {
  assert.match(js, /modelDraftFingerprint/);
  assert.match(js, /modelDraftKey/);
  assert.match(js, /"Idempotency-Key":idempotencyKey/);
  assert.match(js, /state\\.modelDraftKey=""/);
  assert.match(js, /state\\.modelDraftFingerprint=""/);
});
'''
test_path.write_text(tests)


wrangler_path = Path("admin-worker/wrangler.toml")
wrangler = wrangler_path.read_text()
wrangler = wrangler.replace(
    '# Kenji CEO Control read APIs. Exact routes only; no broad /v1/admin/kenji/control/* ownership.',
    '# Kenji CEO Control read APIs. Keep exact routes plus narrow query-safe companions; no broad /v1/admin/kenji/control/* ownership.',
)
wildcard_marker = 'pattern = "mmdbkk.com/v1/admin/kenji/control/memory*"'
if wildcard_marker not in wrangler:
    anchor = '# Create Job Link Issuer API. Exact route only so Webflow-owned admin pages stay\n'
    if anchor not in wrangler:
        raise SystemExit("missing wrangler CEO insertion anchor")
    wildcard_block = '''# Query-safe companions are required because Cloudflare route matching includes the query string.
# Runtime pathname matching remains exact inside admin-worker.
[[routes]]
pattern = "mmdbkk.com/v1/admin/kenji/control/memory*"
zone_name = "mmdbkk.com"

[[routes]]
pattern = "www.mmdbkk.com/v1/admin/kenji/control/memory*"
zone_name = "mmdbkk.com"

[[routes]]
pattern = "mmdbkk.com/v1/admin/kenji/control/conversations*"
zone_name = "mmdbkk.com"

[[routes]]
pattern = "www.mmdbkk.com/v1/admin/kenji/control/conversations*"
zone_name = "mmdbkk.com"

[[routes]]
pattern = "mmdbkk.com/v1/admin/kenji/control/approvals*"
zone_name = "mmdbkk.com"

[[routes]]
pattern = "www.mmdbkk.com/v1/admin/kenji/control/approvals*"
zone_name = "mmdbkk.com"

'''
    wrangler = wrangler.replace(anchor, wildcard_block + anchor, 1)
wrangler_path.write_text(wrangler)


deploy_path = Path(".github/workflows/deploy-admin-worker.yml")
deploy = deploy_path.read_text()
deploy = replace_once(
    deploy,
    '          node --check src/kenji-model-access-rpc.js\n',
    '          node --check src/kenji-model-access-rpc.js\n          node --check src/kenji-control-endpoints.js\n          node --check ../webflow/internal/admin/kenji/kenji-admin-v1.js\n          node --test ../webflow/internal/admin/kenji/kenji-admin-v1.test.mjs\n',
    "deploy source validation",
)
deploy = replace_once(
    deploy,
    '            "/v1/admin/job/create",\n',
    '            "/v1/admin/job/create",\n            "/v1/admin/kenji/control/memory*",\n            "/v1/admin/kenji/control/conversations*",\n            "/v1/admin/kenji/control/approvals*",\n',
    "deploy CEO route sync",
)
smoke_anchor = '''            grep -q '\"error\":\"signed_t_required\"' "$body_file"
          done
'''
if smoke_anchor not in deploy:
    raise SystemExit("missing deploy smoke anchor")
smoke_block = '''            grep -q '\"error\":\"signed_t_required\"' "$body_file"

            for endpoint in \\
              "/v1/admin/kenji/control/memory?client_id=smoke" \\
              "/v1/admin/kenji/control/conversations?client_id=smoke" \\
              "/v1/admin/kenji/control/approvals?status=pending"
            do
              body_file="$(mktemp)"
              http_code="$(curl --retry 6 --retry-delay 2 --retry-all-errors -sS -o "$body_file" -w "%{http_code}" \\
                "$origin$endpoint")"
              cat "$body_file"
              test "$http_code" = "401"
              grep -q '\"error\":\"unauthorized\"' "$body_file"
            done
          done
'''
deploy = deploy.replace(smoke_anchor, smoke_block, 1)
deploy = deploy.replace('18 exact admin-worker routes verified via Zone Workers Routes API', '24 required admin-worker routes verified via Zone Workers Routes API')
deploy = deploy.replace('dashboard + apex/www Model Console auth guards passed', 'dashboard + apex/www Model Console + Kenji CEO Control auth guards passed')
deploy_path.write_text(deploy)


smoke_path = Path(".github/workflows/kenji-ceo-control-production-smoke.yml")
smoke = smoke_path.read_text()
smoke = replace_once(
    smoke,
    '    paths:\n      - ".github/workflows/kenji-ceo-control-production-smoke.yml"\n',
    '    paths:\n      - "admin-worker/**"\n      - ".github/workflows/deploy-admin-worker.yml"\n      - ".github/workflows/kenji-ceo-control-production-smoke.yml"\n',
    "CEO smoke trigger",
)
smoke_path.write_text(smoke)


package_path = Path("package.json")
package = package_path.read_text()
package = replace_once(
    package,
    'npm run test:admin-login && npm run test:studio-real-worker',
    'npm run test:admin-login && npm run test:kenji-admin-ui && npm run test:studio-real-worker',
    "root test chain",
)
package = replace_once(
    package,
    '    "test:admin-login": "node --experimental-global-webcrypto --test admin-worker/admin-login-hero.test.mjs admin-worker/admin-login-session.test.mjs admin-worker/admin-login-regression-guard.test.mjs",\n',
    '    "test:admin-login": "node --experimental-global-webcrypto --test admin-worker/admin-login-hero.test.mjs admin-worker/admin-login-session.test.mjs admin-worker/admin-login-regression-guard.test.mjs",\n    "test:kenji-admin-ui": "node --test webflow/internal/admin/kenji/kenji-admin-v1.test.mjs",\n',
    "Kenji UI test script",
)
package_path.write_text(package)
