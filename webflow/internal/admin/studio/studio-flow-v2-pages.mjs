// Markup only. The controller supplies authenticated state and saved-work links.
const paths = {
  home: '/internal/admin/studio',
  upload: '/internal/admin/studio/upload',
  review: '/internal/admin/studio/review',
  preview: '/internal/admin/studio/model-preview',
};
const copy = {
  home: ['Studio', 'เลือกภาพ จัดรายละเอียด แล้วตรวจตัวอย่างก่อนนำไปใช้'],
  upload: ['เตรียมรูปและข้อมูล', 'เลือกนายแบบ ใส่รายละเอียด แล้วดูตัวอย่างการ์ดได้ในหน้าเดียว'],
  review: ['ตรวจงาน', 'เช็กชื่อ รูป และรายละเอียดให้เรียบร้อยก่อนยืนยัน'],
  preview: ['ตัวอย่างการ์ด', 'ดูตัวอย่างและรายละเอียดก่อนดาวน์โหลดการ์ด'],
};

function steps(stage) {
  const items = [['upload', 'เตรียมรูป'], ['review', 'ตรวจงาน'], ['preview', 'ตัวอย่าง']];
  const current = items.findIndex(([key]) => key === stage);
  return `<nav class="sf-steps" aria-label="ขั้นตอนทำการ์ด">${items.map(([key, label], i) => {
    const available = key === 'upload' || (current >= 0 && i <= current);
    return `<a class="sf-step" data-sf-step="${key}"${available ? ` href="${paths[key]}"` : ' role="link" aria-disabled="true" tabindex="-1"'}${key === stage ? ' aria-current="step"' : ''}><span class="sf-step-num" aria-hidden="true">0${i + 1}</span><span>${label}</span></a>`;
  }).join('')}</nav>`;
}

function preview(help = 'เลือกภาพและใส่ข้อมูลเพื่อดูตัวอย่างการ์ด') {
  return `<div class="sf-preview"><canvas id="sfCanvas" width="1322" height="1200" hidden role="img" aria-label="ตัวอย่างการ์ดนายแบบ"></canvas><p id="sfPreviewHelp" class="sf-empty">${help}</p></div>`;
}

function home() {
  return `<section class="sf-panel">
    <h2>เริ่มทำการ์ด</h2>
    <p class="sf-lead">ใช้รูปจากนายแบบที่มีอยู่ เพิ่มข้อมูลใหม่ หรือเลือกคำขอทำการ์ดที่ส่งเข้ามา</p>
    <div class="sf-actions">
      <a class="sf-button sf-button-primary" href="${paths.upload}?new=1">เริ่มอัปโหลดรูป</a>
      <button id="sfResume" class="sf-button sf-button-secondary" type="button" hidden>ทำงานเดิมต่อ</button>
    </div>
  </section>`;
}

function upload() {
  return `<form id="sfUploadForm" method="post">
    <div class="sf-grid">
      <section class="sf-panel">
        <h2>นายแบบและรายละเอียด</h2>
        <label class="sf-field">เริ่มจาก<select name="source_mode"><option value="existing">นายแบบที่มีข้อมูลแล้ว</option><option value="new">นายแบบที่ยังไม่มีในระบบ</option><option value="mycard">คำขอทำการ์ด</option></select></label>
        <div id="sfExisting">
          <div class="sf-actions">
            <label class="sf-field" for="sfSearch">ค้นหานายแบบ<input id="sfSearch" type="search" autocomplete="off" placeholder="พิมพ์ชื่อนายแบบ"></label>
            <button id="sfSearchButton" class="sf-button sf-button-secondary" type="button">ค้นหา</button>
          </div>
          <div id="sfModelResults" role="list" aria-label="ผลการค้นหานายแบบ"></div>
        </div>
        <div id="sfMyCard" hidden>
          <div class="sf-actions"><button id="sfRequestsRefresh" class="sf-button sf-button-secondary" type="button">โหลดคำขอทำการ์ด</button></div>
          <div id="sfRequests" role="list" aria-label="คำขอทำการ์ด"></div>
        </div>
        <p id="sfModelStatus" class="sf-status" role="status">เลือกนายแบบจากผลค้นหา หรือเปลี่ยนเป็นนายแบบที่ยังไม่มีในระบบ</p><a class="sf-button sf-button-secondary" href="/internal/ceo/models">จัดการข้อมูลนายแบบ</a>
        <div class="sf-form-grid">
          <label class="sf-field sf-field-full">ชื่อบนการ์ด<input name="model_name" type="text" maxlength="40" autocomplete="off" required></label>
          <label class="sf-field">ส่วนสูง (ซม.)<input name="height_cm" type="number" inputmode="numeric" min="130" max="230" step="1" required></label>
          <label class="sf-field">น้ำหนัก (กก.)<input name="weight_kg" type="number" inputmode="decimal" min="35" max="200" step="0.1" required></label>
          <label class="sf-field">กลุ่มนายแบบ<select name="field" required><option value="">เลือกกลุ่ม</option><option value="ST">ST</option><option value="GY">GY</option><option value="FR">FR</option><option value="EN">EN</option><option value="EX">EX</option><option value="GWs">GWs</option><option value="EMs">EMs</option></select></label>
          <label class="sf-field">รูปแบบการใช้งาน<select name="layer" required><option value="">เลือกฝั่งการ์ด</option><option value="Public / MMD Privé">Public · MMD Privé</option><option value="Private / SIGIL">Private · SĪGIL</option><option value="Exclusive / Black Card Review">Black Card · รอตรวจ</option></select></label>
          <label class="sf-field sf-field-full">สีและแบบการ์ด<select name="visual_variant_number"><option value="1">1 · เทา</option><option value="2">2 · เขียว</option><option value="3">3 · ฟ้า</option><option value="4">4 · แดง</option><option value="5">5 · ส้ม</option><option value="6">6 · EMs</option><option value="7">7 · GWs</option></select></label>
        </div>
        <div id="sfExclusive" hidden><label class="sf-field">ข้อความบนการ์ด<textarea name="title" maxlength="120" rows="2"></textarea><small>ใช้กับการ์ด GWs และ EMs</small></label></div>
        <fieldset>
          <legend>ฝั่งที่เก็บงาน</legend>
          <label class="sf-check"><input type="checkbox" name="audience" value="public"><span>Public</span></label>
          <label class="sf-check"><input type="checkbox" name="audience" value="private"><span>Private</span></label>
        </fieldset>
        <details class="sf-details">
          <summary>รายละเอียดเพิ่มเติม</summary>
          <div class="sf-details-body sf-form-grid">
            <label class="sf-field">หมวดการ์ด<select name="category"><option value="">ยังไม่ระบุ</option><option value="Standard">Standard</option><option value="Premium">Premium</option><option value="Exclusive">Exclusive</option><option value="Travel">Travel</option><option value="Extreme">Extreme</option></select></label>
            <label class="sf-field">เพศ<select name="gender"><option value="">ยังไม่ระบุ</option><option value="male">ชาย</option><option value="gay">เกย์</option></select></label>
            <label class="sf-field">กลุ่มลูกค้า<select name="client_types"><option value="">ยังไม่ระบุ</option><option value="both">ทั้งสองกลุ่ม</option><option value="gay">ลูกค้าเกย์</option><option value="women">ลูกค้าผู้หญิง</option></select></label>
            <label class="sf-field">ลิงก์โฟลเดอร์รูป<input name="drive_folder" type="text" inputmode="url" autocomplete="off"></label>
            <label class="sf-field sf-field-full">หมายเหตุ<textarea name="note" rows="2"></textarea></label>
            <fieldset class="sf-field-full">
              <legend>อัลบั้มที่เสนอ</legend>
              <p class="sf-hint">บันทึกไว้ประกอบการตรวจงาน</p>
              <label class="sf-check"><input type="checkbox" name="promotion_album" value="new-coming"><span>New Coming</span></label>
              <label class="sf-check"><input type="checkbox" name="promotion_album" value="hot-sha"><span>Hot SHA</span></label>
              <label class="sf-check"><input type="checkbox" name="promotion_album" value="mmd-recommend"><span>MMD Recommend</span></label>
            </fieldset>
          </div>
        </details>
      </section>
      <section class="sf-panel">
        <h2>รูปและตัวอย่างการ์ด</h2>
        <label class="sf-field" for="sfFiles">เลือกรูป<input id="sfFiles" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"><small>เลือก 1–10 รูป · JPG, PNG หรือ WebP · ไม่เกิน 12 MB ต่อรูป</small></label>
        <div id="sfThumbs" class="sf-thumbs" role="list" aria-label="รูปที่เลือก"></div>
        ${preview()}
        <label class="sf-check"><input type="checkbox" name="consent" required><span>ยืนยันว่าได้รับอนุญาตให้ใช้รูปและข้อมูลสำหรับงานนี้</span></label>
        <progress id="sfProgress" class="sf-progress" value="0" max="100" hidden aria-label="ความคืบหน้าการอัปโหลด"></progress>
        <p id="sfProgressText" class="sf-hint" aria-live="polite"></p>
        <div class="sf-actions"><button id="sfSave" class="sf-button sf-button-primary" type="submit">บันทึกและตรวจงาน</button></div>
      </section>
    </div>
  </form>
  <details id="sfAutoTools" class="sf-details"><summary>การ์ดจากรูปโปรไฟล์</summary><div id="sfAutoInboxSlot" class="sf-details-body"></div></details>`;
}

function review() {
  return `<div class="sf-grid">
    <section class="sf-panel"><h2>การ์ดที่ต้องตรวจ</h2>${preview('กำลังโหลดการ์ดที่ต้องตรวจ…')}<dl id="sfSummary" class="sf-summary"></dl><div class="sf-actions"><a id="sfEdit" class="sf-button sf-button-secondary" href="${paths.upload}">กลับไปแก้ไข</a></div></section>
    <section class="sf-panel">
      <h2>ตรวจให้ครบก่อนยืนยัน</h2>
      <form id="sfReviewForm" method="post">
        <fieldset id="sfReviewControls" disabled>
          <legend>รายการตรวจ</legend>
          <label class="sf-check"><input type="checkbox" name="identity"><span>ชื่อ ส่วนสูง และน้ำหนักถูกต้อง</span></label>
          <label class="sf-check"><input type="checkbox" name="photo"><span>รูปและการจัดวางเรียบร้อย</span></label>
          <label class="sf-check"><input type="checkbox" name="safe"><span>ได้รับอนุญาตให้ใช้รูป และไม่มีข้อมูลส่วนตัวที่ไม่ควรเผย</span></label>
          <label class="sf-field">ผลการตรวจ<select name="decision"><option value="Approved Direction">ผ่านการตรวจ</option><option value="Needs Review" selected>รอตรวจ</option><option value="Revise Source">ขอแก้ไข</option><option value="Reject">ไม่ใช้ภาพนี้</option></select></label>
          <label class="sf-field">หมายเหตุการตรวจ<textarea name="final_note" rows="3"></textarea></label>
          <div class="sf-actions"><button id="sfReviewSave" class="sf-button sf-button-primary" type="submit">ยืนยันและดูตัวอย่าง</button></div>
        </fieldset>
      </form>
    </section>
  </div>`;
}

function finalPreview() {
  return `<div class="sf-grid">
    <section class="sf-panel"><h2>ตัวอย่างการ์ด</h2>${preview('กำลังโหลดตัวอย่างการ์ด…')}</section>
    <section class="sf-panel">
      <h2>รายละเอียดการ์ด</h2>
      <p id="sfFinalStatus" class="sf-status" role="status">กำลังโหลดผลการตรวจ…</p>
      <dl id="sfSummary" class="sf-summary"></dl>
      <div class="sf-actions"><button id="sfDownload" class="sf-button sf-button-primary" type="button" disabled>ดาวน์โหลดการ์ด PNG</button></div>
      <div class="sf-actions">
        <a id="sfEdit" class="sf-button sf-button-secondary" href="${paths.upload}">กลับไปแก้ไข</a>
        <a id="sfBackReview" class="sf-button sf-button-secondary" href="${paths.review}">กลับไปตรวจงาน</a>
        <a class="sf-button sf-button-secondary" href="${paths.upload}?new=1">เริ่มงานใหม่</a>
      </div>
    </section>
  </div>`;
}

export function renderStudioPage(stage = 'home') {
  if (!Object.hasOwn(copy, stage)) throw new Error('Unknown Studio stage');
  const [title, lead] = copy[stage];
  const content = { home, upload, review, preview: finalPreview }[stage]();
  return `<main id="studioFlow" data-studio-flow data-stage="${stage}">
    <div class="sf-shell">
      <header class="sf-header">
        <div><span class="sf-kicker">SĪGIL · STUDIO</span><h1 class="sf-title">${title}</h1><p class="sf-lead">${lead}</p></div>
        <div class="sf-actions">${stage === 'home' ? '<a class="sf-button sf-button-secondary" href="/internal/admin/control-room">ภาพรวมงาน</a><a class="sf-button sf-button-secondary" href="/internal/ceo/models">จัดการนายแบบ</a>' : `<a class="sf-button sf-button-secondary" href="${paths.home}">หน้า Studio</a>`}</div>
      </header>
      ${steps(stage)}
      <p id="sfStatus" class="sf-status" role="status" tabindex="-1">กำลังตรวจสิทธิ์…</p>
      <a id="sfLogin" class="sf-button sf-button-primary" href="/internal/admin/login" hidden>เข้าสู่ระบบ</a>
      <noscript><p class="sf-status">หน้านี้ต้องเปิด JavaScript กรุณาเปิดการทำงานในเบราว์เซอร์ แล้วโหลดหน้าอีกครั้งเพื่อใช้งาน Studio</p></noscript>
      ${content}
    </div>
  </main>`;
}
