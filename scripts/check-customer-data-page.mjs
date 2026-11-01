import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// This checks HTML delivery only. Authentication and queue checks stay in their
// workflows; passing this contract does not prove an authenticated customer flow.
export function checkCustomerDataPage({ status, headers, body, mode = 'deployment' }) {
  const require = (condition, rule) => {
    if (!condition) throw new Error(rule);
  };
  require(['deployment', 'authenticated'].includes(mode), 'unknown_check_mode');
  require(Number(status) === 200, 'http_200_required');
  // curl -D may contain redirect/proxy headers. Trust only the final response.
  const blocks = String(headers).trim().split(/\r?\n\r?\n/);
  const finalHeaders = blocks.at(-1).split(/\r?\n/);
  const values = new Map(finalHeaders.filter(line => line.includes(':')).map(line => {
    const separator = line.indexOf(':');
    return [line.slice(0, separator).toLowerCase().trim(), line.slice(separator + 1).trim()];
  }));
  const header = name => values.get(name) || '';
  const includes = text => body.includes(text);
  const copy = (text, rule) => require(includes(text), rule);
  require(/^text\/html(?:\s*;|\s*$)/i.test(header('content-type')), 'html_content_type_required');
  require(!includes('customer_scope_contract_unavailable'), 'customer_scope_contract_unavailable');

  const directory = header('x-mmd-customer-directory');
  if (directory) {
    require(directory === 'canonical-search-v1', 'unknown_customer_directory');
    require(header('x-mmd-customer-data-ui') === 'readable-v3', 'readable_ui_header_required');
    require(header('x-mmd-customer-data-authority') === 'identity-context-staging-only', 'authority_header_required');
    require(header('x-mmd-customer-ux') === 'owner-readable-v7', 'owner_ux_header_required');
    copy('Customer 360', 'directory_title_missing');
    copy('<form id="search">', 'directory_search_form_missing');
    copy('id="query" type="search"', 'directory_search_input_missing');
    copy('id="results"', 'directory_results_missing');
    copy('พิมพ์ชื่อเพื่อเริ่มค้นหา', 'directory_empty_state_missing');
    copy('เลือกลูกค้าก่อนเปิดประวัติหรือสร้างงาน', 'directory_selection_guidance_missing');
    copy("form.addEventListener('submit'", 'directory_submit_handler_missing');
    copy("fetch('/v1/admin/clients/lineage-lookup'", 'directory_lookup_missing');
    copy('canonical_only:true', 'directory_canonical_filter_missing');
    copy('/internal/admin/customer-data?client_id=', 'directory_scoped_link_missing');
    return 'canonical-search-v1';
  }

  if (mode === 'deployment' && header('x-mmd-presentation-source') === 'lovable') {
    require(header('x-mmd-presentation-version') === 'internal-lovable-v1', 'lovable_version_required');
    copy('ลูกค้าล่าสุดจากระบบหลังบ้าน', 'lovable_list_missing');
    copy('เลือกรายชื่อก่อนเปิดข้อมูล', 'lovable_selection_missing');
    copy('อ่านข้อมูลอีกครั้ง', 'lovable_refresh_missing');
    return 'internal-lovable-v1';
  }

  require(header('x-mmd-customer-data-ui') === 'readable-v3', 'readable_ui_header_required');
  if (mode === 'authenticated') {
    require(header('x-mmd-customer-ux') === 'owner-readable-v7', 'owner_ux_header_required');
    copy('Customer 360', 'legacy_title_missing');
    copy('ลูกค้า → ตัวตน → ตรวจ → ทำต่อ', 'legacy_flow_missing');
    copy('ค้นลูกค้า ตรวจว่าตัวตนตรงกัน', 'legacy_guidance_missing');
    copy('ตัดสินใจเรื่องตัวตน', 'legacy_review_missing');
    copy('href="/internal/admin/jobs/create-job"', 'legacy_create_job_link_missing');
    copy('>สร้างงาน ↗</a>', 'legacy_create_job_cta_missing');
  } else {
    require(header('x-mmd-customer-data-authority') === 'identity-context-staging-only', 'authority_header_required');
    copy('นำเข้าจาก Console Inbox', 'legacy_inbox_missing');
    copy('จับคู่แล้ว', 'legacy_matched_missing');
    require(!includes('Run Console Inbox Backfill'), 'legacy_raw_backfill_copy');
    require(!includes('Review Queue'), 'legacy_raw_queue_copy');
  }
  copy('คิวที่ต้องดู', 'legacy_queue_missing');
  return 'readable-v3';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [status, headersPath, bodyPath, mode = 'deployment'] = process.argv.slice(2);
  try {
    const contract = checkCustomerDataPage({
      status, mode,
      headers: readFileSync(headersPath, 'utf8'),
      body: readFileSync(bodyPath, 'utf8'),
    });
    console.log(`Customer Data HTML contract verified: ${contract}; authenticated behavior remains separate`);
  } catch (error) {
    // Do not log page HTML, cookies, credentials or customer records.
    console.error(`Customer Data HTML check failed: ${error.code || error.message}`);
    process.exitCode = 1;
  }
}
