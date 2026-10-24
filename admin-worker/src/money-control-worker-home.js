const PAGE = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Money Control · MMD</title>
  <style>
    :root{color-scheme:light;--ink:#26332c;--muted:#68756b;--line:#dce4da;--paper:#f7f9f5;--white:#fff;--green:#31563c;--gold:#b89550;--warn:#805c1f}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 "LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif}
    main{width:min(1040px,calc(100% - 32px));margin:0 auto;padding:22px 0 56px}.brand{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid var(--line);padding:6px 0 16px;color:var(--muted);font-size:13px}.brand strong{color:var(--green);letter-spacing:.08em}
    h1{margin:26px 0 6px;font-size:clamp(28px,5vw,42px);line-height:1.15;letter-spacing:-.03em}.lead{max-width:760px;margin:0;color:var(--muted)}
    .notice{margin-top:18px;padding:14px 16px;border:1px solid #e7d4a4;border-radius:12px;background:#fffaf0;color:#594619}.notice strong{display:block;margin-bottom:2px}
    .steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.step{padding:17px;border:1px solid var(--line);border-radius:14px;background:var(--white)}.step b{display:grid;place-items:center;width:28px;height:28px;margin-bottom:10px;border-radius:50%;background:#edf3e9;color:var(--green);font-size:14px}.step strong{display:block;font-size:16px}.step p{margin:5px 0 0;color:var(--muted);font-size:14px}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border:1px solid var(--green);border-radius:10px;background:var(--green);color:#fff;text-decoration:none;font-weight:700}.button.secondary{background:#fff;color:var(--green)}.scope{margin-top:18px;color:var(--muted);font-size:13px}.scope a{color:var(--green);font-weight:650}
    @media(max-width:680px){main{width:calc(100% - 24px);padding-top:12px}.steps{grid-template-columns:1fr;gap:8px}.step{display:grid;grid-template-columns:34px 1fr;column-gap:8px;padding:13px}.step b{grid-row:span 2;margin:0}.step p{margin-top:1px}.brand{align-items:flex-start;flex-direction:column;gap:3px}}
  </style>
</head>
<body><main>
  <header class="brand"><strong>MMD PRIVÉ · MONEY CONTROL</strong><span>งานตรวจหลักฐานการชำระเงิน</span></header>
  <h1>รับเงิน / ตรวจสลิป</h1>
  <p class="lead">เริ่มจากหลักฐานที่รอตรวจ แล้วทำตามข้อมูลจริงในสลิปและรายการงาน การรับสลิปเข้าคิวเป็นเพียงการรับหลักฐาน ไม่ได้ยืนยันว่าเงินเข้า</p>
  <aside class="notice"><strong>ขอบเขตการตัดสิน</strong>ยืนยันรับเงินได้เฉพาะเมื่อผู้มีสิทธิ์ตรวจหลักฐาน ยอด ลูกค้า และงานครบ แล้วส่งคำตัดสินผ่านระบบเดิมเท่านั้น · <b>payments-worker เป็น Money Truth</b></aside>
  <section class="steps" aria-label="ลำดับงานตรวจรับเงิน">
    <article class="step"><b>1</b><strong>เปิดหลักฐาน</strong><p>เลือกสลิปที่ต้องตรวจ หรือใช้ลิงก์ตรงเมื่อมี Proof ID</p></article>
    <article class="step"><b>2</b><strong>เทียบยอดและลูกค้า/งาน</strong><p>เทียบภาพสลิปกับยอดที่คาดและรายการงานที่ตรงกัน หากไม่ชัดให้บันทึกปัญหาแทน</p></article>
    <article class="step"><b>3</b><strong>บันทึกผลผ่าน flow เดิม</strong><p>ยืนยันเฉพาะเมื่อหลักฐานครบ หรือบันทึกปัญหา/ปฏิเสธพร้อมเหตุผล</p></article>
  </section>
  <nav class="actions" aria-label="การทำงาน">
    <a class="button" id="open-queue" href="/internal/admin/payments?mmd_worker_view=existing">เปิดคิวตรวจสลิป</a>
    <a class="button secondary" id="open-focus" hidden href="/internal/admin/payments?mmd_worker_view=existing">เปิดหลักฐานที่ระบุ</a>
  </nav>
  <p class="scope">สลิปที่ยังไม่เข้าคิว: ใช้ทางเลือกอัปโหลดในหน้าคิวเดิมเมื่อจำเป็น · ประวัติย้อนหลังแยกจากคิวรับเงินปัจจุบัน</p>
</main>
<script>
(()=>{const current=new URL(location.href),open=new URL('/internal/admin/payments',location.origin);for(const key of ['proof_id','session_id']){const value=current.searchParams.get(key);if(value)open.searchParams.set(key,value)}open.searchParams.set('mmd_worker_view','existing');document.getElementById('open-queue').href=open.pathname+'?'+open.searchParams.toString();if(current.searchParams.has('proof_id')){const focus=document.getElementById('open-focus');focus.hidden=false;focus.href=open.pathname+'?'+open.searchParams.toString();focus.textContent='เปิดหลักฐาน '+current.searchParams.get('proof_id')}})();
</script></body></html>`;

export function isMoneyControlWorkerHomeRequest(path, method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  return (verb === "GET" || verb === "HEAD") && String(path || "").replace(/\/+$/g, "") === "/internal/admin/payments";
}

export function handleMoneyControlWorkerHome(request) {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, private",
    "x-mmd-route-owner": "admin-worker-money-control-home",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-robots-tag": "noindex, nofollow",
  });
  return new Response(request.method === "HEAD" ? null : PAGE, { status: 200, headers });
}
