(function () {
  "use strict";

  var root = document.getElementById("mmdProfilesV8");
  if (!root || root.dataset.roleCatalogReady === "true") return;
  root.dataset.roleCatalogReady = "true";

  var endpoint = "https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog";
  var femaleGate = "/believe/inme";
  var track = root.querySelector(".mp8-track--profiles");
  var stage2 = root.querySelector("[data-role-stage2]");

  if (stage2 && !root.querySelector("[data-dayoff-packages]")) {
    stage2.insertAdjacentHTML("beforebegin", `
      <section class="mp8-driver-packages" data-dayoff-packages hidden aria-labelledby="mp8-dayoff-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD COMPANION · DAY OFF</p>
          <h3 id="mp8-dayoff-packages-title">วันหยุดนี้ ไม่ต้องไปคนเดียว</h3>
          <p>ไม่ใช่แพ็กเกจกาแฟ แต่เป็นช่วงเวลาที่มีแผนจริง เลือกคนที่เหมาะกับกิจกรรม แล้วให้ MMD ช่วยดูความลงตัวของวันนั้น</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">DAY OFF — SHORT</h4><strong class="mp8-driver-package__price">฿3,500</strong></div><p class="mp8-driver-package__line">หนึ่งกิจกรรมหลัก + อีกหนึ่งจุด เช่น Exhibition + Dinner, Movie + Supper หรือ Shopping + Dessert</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>สูงสุด 2 stops</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=everyday_companion&package=day_off_short">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">DAY OFF — HALF DAY</h4><strong class="mp8-driver-package__price">฿5,500</strong></div><p class="mp8-driver-package__line">หลายกิจกรรมในครึ่งวัน เช่น Lunch → Gallery → Shopping → Dessert พร้อม Mini Plan จาก MMD ได้</p><div class="mp8-driver-package__meta"><span>5 ชั่วโมง</span><span>2–3 activities</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=everyday_companion&package=day_off_half_day">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">DAY OFF — FULL DAY</h4><strong class="mp8-driver-package__price">฿8,500</strong></div><p class="mp8-driver-package__line">ให้ MMD ช่วยวางวันทั้งวันจาก mood และสิ่งที่คุณชอบ สำหรับวันหยุดที่อยากเปลี่ยน routine จริง ๆ</p><div class="mp8-driver-package__meta"><span>8 ชั่วโมง</span><span>Full day plan</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=everyday_companion&package=day_off_full_day">จองแพ็กเกจนี้ ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">DAY OFF แนะนำ 10:00–20:00 · OT ก่อน 00:00 ฿990/ชม. · เวลาที่จองไว้ล่วงหน้าหลัง 00:00 +฿500/ชม. · OT หลัง 00:00 ฿1,490/ชม. · หลัง 03:00 ฿1,790/ชม. · หลัง 06:00 ต้องให้ MMD review ใหม่ · Premium กับ OT ไม่คิดซ้อนในนาทีเดียวกัน · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน · ค่าอาหาร/เครื่องดื่ม/Ticket/Activity/เดินทาง/Parking คิดตามจริง</p>
      </section>
      <section class="mp8-driver-packages" data-nightlife-packages hidden aria-labelledby="mp8-nightlife-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD COMPANION · NIGHT LIFE</p>
          <h3 id="mp8-nightlife-packages-title">คืนนี้ จะให้จบแค่ Dinner หรือไปต่อ?</h3>
          <p>สำหรับ Dinner, Bar, Concert, Club, Celebration และคืนที่ต้องการคนเดิมอยู่ด้วยตามช่วงเวลาที่จอง</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">NIGHT OUT</h4><strong class="mp8-driver-package__price">฿4,500</strong></div><p class="mp8-driver-package__line">Dinner + Drink, Concert + Late Supper หรือ Event + After spot แบบไม่ต้องยาวทั้งคืน</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>Night Life</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=nightlife_companion&package=night_out">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">DINNER TO MIDNIGHT</h4><strong class="mp8-driver-package__price">฿6,500</strong></div><p class="mp8-driver-package__line">Dinner → Cocktail Bar → Night Spot สำหรับคืนที่อยากให้จังหวะต่อเนื่องและไม่ต้องเปลี่ยนคนกลางทาง</p><div class="mp8-driver-package__meta"><span>5 ชั่วโมง</span><span>Dinner → Night</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=nightlife_companion&package=dinner_to_midnight">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">OWN THE NIGHT</h4><strong class="mp8-driver-package__price">฿8,900</strong></div><p class="mp8-driver-package__line">Dinner → Bar → Club / Concert → Late Supper สำหรับคืนที่ตั้งใจออกไปใช้จริง ๆ</p><div class="mp8-driver-package__meta"><span>7 ชั่วโมง</span><span>Full Night</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=nightlife_companion&package=own_the_night">จองแพ็กเกจนี้ ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">NIGHT LIFE เริ่มได้ตั้งแต่ช่วงเย็น · OT ก่อน 00:00 ฿990/ชม. · เวลาที่จองไว้ล่วงหน้าหลัง 00:00 +฿500/ชม. · OT หลัง 00:00 ฿1,490/ชม. · OT หลัง 03:00 ฿1,790/ชม. · หลัง 06:00 ต้องให้ MMD review ใหม่ · Premium กับ OT ไม่คิดซ้อนในนาทีเดียวกัน · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน · ค่าอาหาร/เครื่องดื่ม/Table minimum/Ticket/Club/Concert/Taxi/Parking คิดตามจริง</p>
      </section>
    `);
  }

  if (stage2 && !root.querySelector("[data-social-packages]")) {
    stage2.insertAdjacentHTML("beforebegin", `
      <section class="mp8-driver-packages" data-social-packages hidden aria-labelledby="mp8-social-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD SOCIAL · APPEARANCE</p>
          <h3 id="mp8-social-packages-title">บางงาน แค่มีคนไปด้วยก็เปลี่ยนทั้งบรรยากาศ</h3>
          <p>สำหรับ Dinner, Wedding, Gala, Corporate Event และ Social occasion ที่ต้องการคนที่แต่งตัวเหมาะ เข้าสังคมเป็น และเข้าใจบริบทของงาน</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">DINNER GUEST</h4><strong class="mp8-driver-package__price">฿5,500</strong></div><p class="mp8-driver-package__line">Dinner, Reception หรือ Invitation ที่อยากมีคู่ไปด้วยแบบสุภาพ ดูดี และคุยกับคนในงานได้</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>1 venue</span><span>Smart / Formal</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=social_appearance&package=dinner_guest">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">EVENT PARTNER</h4><strong class="mp8-driver-package__price">฿6,900</strong></div><p class="mp8-driver-package__line">Wedding, Launch, Corporate Event หรือ Celebration ที่ต้องอยู่ด้วยกันตลอดช่วงหลักของงาน</p><div class="mp8-driver-package__meta"><span>4 ชั่วโมง</span><span>Event ready</span><span>Dress code brief</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=social_appearance&package=event_partner">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">FORMAL EVENING</h4><strong class="mp8-driver-package__price">฿9,500</strong></div><p class="mp8-driver-package__line">ค่ำคืนที่ยาวขึ้น ตั้งแต่ Dinner / Reception ไปจนถึงช่วงหลักของงาน พร้อม briefing เรื่อง dress code และ social context</p><div class="mp8-driver-package__meta"><span>6 ชั่วโมง</span><span>Formal evening</span><span>Curated</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=social_appearance&package=formal_evening">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">BRAND / CORPORATE</h4><strong class="mp8-driver-package__price">QUOTE</strong></div><p class="mp8-driver-package__line">Brand guest, commercial event, media appearance หรือการใช้ภาพ/วิดีโอเชิงพาณิชย์ ต้อง brief และ quote แยกตามหน้าที่และ usage rights</p><div class="mp8-driver-package__meta"><span>Commercial brief</span><span>Usage rights separate</span></div><a class="mp8-driver-package__cta" href="/public/access?from=profiles&role=social_appearance&brief=brand_corporate">ส่งบรีฟให้ MMD ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">OT ก่อน 00:00 ฿1,290/ชม. · เวลาที่จองไว้ล่วงหน้าหลัง 00:00 +฿500/ชม. · OT หลัง 00:00 ฿1,790/ชม. · OT หลัง 03:00 ฿2,090/ชม. · หลัง 06:00 ต้อง MMD review · หากลักษณะงานเปลี่ยนเป็น Night Life / Commercial ต้อง Change Plan และ re-quote · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน · ค่าอาหาร/เครื่องดื่ม/Ticket/เดินทาง/Parking/wardrobe พิเศษคิดตามจริง</p>
      </section>
    `);
  }

  if (stage2 && !root.querySelector("[data-bangkok-packages]")) {
    stage2.insertAdjacentHTML("beforebegin", `
      <section class="mp8-driver-packages" data-bangkok-packages hidden aria-labelledby="mp8-bangkok-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD LOCAL · BANGKOK COMPANION</p>
          <h3 id="mp8-bangkok-packages-title">Bangkok is the destination. เขาคือคนที่ไปด้วย</h3>
          <p>Local Companion สำหรับคนที่อยากใช้กรุงเทพแบบมีคนรู้จังหวะเมืองไปด้วย — MMD ช่วยวาง route, match personality และดู continuity หลายจุด โดยไม่ขายเป็นบริการมัคคุเทศก์ เว้นแต่ MMD ยืนยันผู้มีใบอนุญาตโดยเฉพาะ</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">BANGKOK WITH ME</h4><strong class="mp8-driver-package__price">฿5,900</strong></div><p class="mp8-driver-package__line">เลือก 2–3 จุดในโซนเดียวกัน เช่น Old Town, Riverside, Siam หรือ Ari แล้วใช้เมืองไปด้วยกันแบบไม่รีบ</p><div class="mp8-driver-package__meta"><span>4 ชั่วโมง</span><span>2–3 stops</span><span>Bangkok city</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=bangkok_companion&package=bangkok_with_me">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">LOCAL BANGKOK</h4><strong class="mp8-driver-package__price">฿7,900</strong></div><p class="mp8-driver-package__line">ครึ่งวันที่มีหลาย mood เช่น Neighborhood → Food → River → Sunset โดย MMD ช่วยจัด route ให้เข้ากับสิ่งที่คุณชอบ</p><div class="mp8-driver-package__meta"><span>6 ชั่วโมง</span><span>3–4 stops</span><span>Local plan</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=bangkok_companion&package=local_bangkok">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">YOUR BANGKOK DAY</h4><strong class="mp8-driver-package__price">฿10,500</strong></div><p class="mp8-driver-package__line">หนึ่งวันเต็มในกรุงเทพจาก mood ของคุณ — MMD ช่วยเรียง route, timing และคนที่เหมาะกับ day plan นั้น</p><div class="mp8-driver-package__meta"><span>8 ชั่วโมง</span><span>Full Bangkok day</span><span>Curated route</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=bangkok_companion&package=your_bangkok_day">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">LICENSED GUIDE</h4><strong class="mp8-driver-package__price">QUOTE</strong></div><p class="mp8-driver-package__line">หากต้องการบริการมัคคุเทศก์เชิงประวัติศาสตร์ วัฒนธรรม หรือการนำเที่ยวอย่างเป็นทางการ MMD จะจัดเฉพาะผู้ที่ตรวจใบอนุญาตแล้วและ quote แยก</p><div class="mp8-driver-package__meta"><span>License verified</span><span>Guide scope</span><span>Request only</span></div><a class="mp8-driver-package__cta" href="/public/access?from=profiles&role=bangkok_companion&brief=licensed_guide">ขอ Licensed Guide ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">Bangkok city only · OT ก่อน 00:00 ฿1,190/ชม. · เวลาที่จองไว้ล่วงหน้าหลัง 00:00 +฿500/ชม. · OT หลัง 00:00 ฿1,690/ชม. · OT หลัง 03:00 ฿1,990/ชม. · หลัง 06:00 ต้อง MMD review · ถ้า activity เปลี่ยนเป็น Night Life ให้ Change Plan / re-quote · ออกนอกกรุงเทพต้อง re-quote · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน · ค่าอาหาร/เครื่องดื่ม/ตั๋ว/กิจกรรม/BTS-MRT/Taxi/Boat/Parking คิดตามจริง · Companion ทั่วไปไม่ใช่ Licensed Tour Guide</p>
      </section>
    `);
  }

  if (stage2 && !root.querySelector("[data-sport-packages]")) {
    stage2.insertAdjacentHTML("beforebegin", `
      <section class="mp8-driver-packages" data-sport-packages hidden aria-labelledby="mp8-sport-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD COMPANION · SPORT ACTIVITY</p>
          <h3 id="mp8-sport-packages-title">กิจกรรมที่อยากทำ สนุกขึ้นเมื่อมีคนไปด้วย</h3>
          <p>Running, Tennis, Badminton, Gym buddy หรือ Outdoor activity ที่อยากมี Companion ที่เข้ากับจังหวะของคุณ — MMD จะยืนยัน activity fit และ availability ก่อนทุกงาน</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">MOVE WITH ME</h4><strong class="mp8-driver-package__price">฿3,500</strong></div><p class="mp8-driver-package__line">หนึ่งกิจกรรมหลัก เช่น Tennis, Badminton, Gym buddy หรือ Run + Coffee หลังจบกิจกรรม</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>One activity</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=sport_activity&package=move_with_me">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">GAME DAY</h4><strong class="mp8-driver-package__price">฿5,500</strong></div><p class="mp8-driver-package__line">วันกิจกรรมที่มีเวลาเต็มขึ้น เช่น Court time → Lunch หรือสอง activity blocks ในโซนเดียวกัน</p><div class="mp8-driver-package__meta"><span>5 ชั่วโมง</span><span>1–2 activity blocks</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=sport_activity&package=game_day">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">ACTIVE DAY</h4><strong class="mp8-driver-package__price">฿8,500</strong></div><p class="mp8-driver-package__line">ใช้วันหยุดแบบ active ตั้งแต่กิจกรรมเช้า ไปจนถึงจุดพักหรือมื้ออาหารที่วางไว้ด้วยกัน</p><div class="mp8-driver-package__meta"><span>8 ชั่วโมง</span><span>Full day plan</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=sport_activity&package=active_day">จองแพ็กเกจนี้ ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">Sport Activity คือ Companion สำหรับทำกิจกรรมร่วมกัน ไม่ใช่ Personal Trainer, Therapist หรือผู้ให้คำแนะนำทางการแพทย์ · MMD จะยืนยันความเหมาะสมของ Model กับกิจกรรมก่อนทุกครั้ง · ค่า venue/court/class/equipment/ticket/เดินทาง/Parking/อาหารและเครื่องดื่มคิดตามจริง · OT ก่อน 00:00 ฿990/ชม. · OT หลัง 00:00 ฿1,490/ชม. · หลัง 03:00 ฿1,790/ชม. · หลัง 06:00 ต้อง MMD review · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน</p>
      </section>
      <section class="mp8-driver-packages" data-wellness-packages hidden aria-labelledby="mp8-wellness-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD COMPANION · WELLNESS</p>
          <h3 id="mp8-wellness-packages-title">ให้วันของคุณค่อย ๆ กลับมาอยู่ในจังหวะที่ดี</h3>
          <p>Wellness day, healthy lifestyle หรือวันพักที่อยากมีคนไปด้วย — MMD จะดู lifestyle fit และ availability ก่อนทุกงาน เพื่อให้แผนวันนั้นสบายและเป็นของคุณจริง ๆ</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">RESET WITH ME</h4><strong class="mp8-driver-package__price">฿5,000</strong></div><p class="mp8-driver-package__line">ช่วงเวลาสบาย ๆ สำหรับ healthy brunch, เดินเล่น, wellness venue หรือกิจกรรมเบา ๆ ในโซนเดียวกัน</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>One gentle plan</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=wellness_companion&package=reset_with_me">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">WELLNESS DAY</h4><strong class="mp8-driver-package__price">฿8,500</strong></div><p class="mp8-driver-package__line">ครึ่งวันที่มี healthy meal, easy activity และจุดพักที่เลือกตาม mood ของคุณโดยไม่รีบ</p><div class="mp8-driver-package__meta"><span>5 ชั่วโมง</span><span>2–3 gentle moments</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=wellness_companion&package=wellness_day">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">SLOW RESET</h4><strong class="mp8-driver-package__price">฿13,500</strong></div><p class="mp8-driver-package__line">หนึ่งวันเต็มที่เว้นจังหวะให้คุณได้พัก กินดี เดินทางสบาย และใช้เวลากับสิ่งที่ทำให้รู้สึกดีขึ้น</p><div class="mp8-driver-package__meta"><span>8 ชั่วโมง</span><span>Full-day wellness plan</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=wellness_companion&package=slow_reset">จองแพ็กเกจนี้ ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">Wellness Companion คือเพื่อนร่วมวันสำหรับ lifestyle และกิจกรรมที่ตกลงกัน ไม่ใช่ Personal Trainer, Therapist, massage, recovery treatment หรือผู้ให้คำแนะนำทางการแพทย์ · หากต้องการ massage หรือ recovery service ให้ใช้ MMS Wellness route แยก · MMD จะยืนยันความเหมาะสมของ Model กับแผนและ availability ก่อนทุกครั้ง · ค่า venue/class/ticket/เดินทาง/Parking/อาหารและเครื่องดื่มคิดตามจริง · OT ก่อน 00:00 ฿1,690/ชม. · OT หลัง 00:00 ฿2,190/ชม. · หลัง 03:00 ฿2,690/ชม. · หลัง 06:00 ต้อง MMD review · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน</p>
      </section>
      <section class="mp8-driver-packages" data-business-packages hidden aria-labelledby="mp8-business-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD COMPANION · BUSINESS</p>
          <h3 id="mp8-business-packages-title">บางบริบท แค่มีคนที่วางตัวดีไปด้วยก็พอ</h3>
          <p>Business lunch, networking event, meeting context และ smart-casual presence สำหรับวันที่อยากมี Companion ที่เข้าใจ dress code และ social context ของคุณ</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">BUSINESS LUNCH</h4><strong class="mp8-driver-package__price">฿6,500</strong></div><p class="mp8-driver-package__line">Lunch, coffee meeting หรือช่วงพบปะสำคัญที่ต้องการคนไปด้วยอย่างสุภาพและเหมาะกับบริบท</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>1 business context</span><span>Smart-casual</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=business_companion&package=business_lunch">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">SMART PRESENCE</h4><strong class="mp8-driver-package__price">฿10,500</strong></div><p class="mp8-driver-package__line">Networking event, client-facing lunch หรือ agenda ที่มีหลายช่วงในวันเดียวกัน โดย MMD ช่วยเช็ก fit และ dress context ล่วงหน้า</p><div class="mp8-driver-package__meta"><span>5 ชั่วโมง</span><span>Networking / meeting day</span><span>Context brief</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=business_companion&package=smart_presence">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">CONTEXT DAY</h4><strong class="mp8-driver-package__price">฿16,500</strong></div><p class="mp8-driver-package__line">หนึ่งวันสำหรับ lunch, networking และ social business context ที่ต้องการ continuity โดยยังคงเป็น Companion คนเดิมตามเวลาที่จอง</p><div class="mp8-driver-package__meta"><span>8 ชั่วโมง</span><span>Full business context</span><span>Curated</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=business_companion&package=context_day">จองแพ็กเกจนี้ ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">Business Companion คือ social presence companion ไม่ใช่พนักงานบริษัท เลขานุการ ตัวแทนเจรจา ผู้รับมอบอำนาจ หรือผู้มีสิทธิ์เซ็นเอกสาร/ตกลงแทนลูกค้า · MMD จะยืนยัน context, dress code และ availability ก่อนทุกครั้ง · ค่าอาหาร/เครื่องดื่ม/venue/ticket/transport/Parking/wardrobe พิเศษคิดตามจริง · OT ก่อน 00:00 ฿1,990/ชม. · OT หลัง 00:00 ฿2,490/ชม. · หลัง 03:00 ฿2,990/ชม. · หลัง 06:00 ต้อง MMD review · หากขอบเขตเปลี่ยนเป็นงาน commercial, spokesperson หรือ professional service ต้อง Change Plan และ re-quote · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน</p>
      </section>
      <section class="mp8-driver-packages" data-creative-packages hidden aria-labelledby="mp8-creative-packages-title">
        <div class="mp8-driver-packages__head">
          <p class="mp8-driver-packages__kicker">MMD COMPANION · CREATIVE</p>
          <h3 id="mp8-creative-packages-title">วันที่อยากดูอะไรใหม่ ๆ ไม่ต้องไปคนเดียว</h3>
          <p>Gallery, exhibition, photo walk, music, design หรือ creative day ที่อยากมีคนที่ share interest เดียวกันไปใช้เวลาและคุยกันใน context นั้น</p>
        </div>
        <div class="mp8-driver-package-grid">
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">GALLERY WITH ME</h4><strong class="mp8-driver-package__price">฿5,000</strong></div><p class="mp8-driver-package__line">Gallery, exhibition, bookstore หรือ creative coffee ที่อยากมีคนไปเดินดู พูดคุย และใช้ mood เดียวกัน</p><div class="mp8-driver-package__meta"><span>3 ชั่วโมง</span><span>One creative context</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=creative_companion&package=gallery_with_me">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">CREATIVE CITY</h4><strong class="mp8-driver-package__price">฿8,500</strong></div><p class="mp8-driver-package__line">Photo walk, gallery route, music หรือ design context ที่มี 2–3 moments ในโซนเดียวกัน โดย MMD เช็ก shared interest และ availability ก่อน</p><div class="mp8-driver-package__meta"><span>5 ชั่วโมง</span><span>2–3 creative moments</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=creative_companion&package=creative_city">จองแพ็กเกจนี้ ↗</a></article>
          <article class="mp8-driver-package"><div class="mp8-driver-package__top"><h4 class="mp8-driver-package__name">CREATIVE DAY</h4><strong class="mp8-driver-package__price">฿13,500</strong></div><p class="mp8-driver-package__line">หนึ่งวันเต็มสำหรับ gallery, city walk, music หรือ creative plan ที่อยากค่อย ๆ ใช้เวลา โดยมี Companion คนเดิมอยู่ใน context ที่ตกลงกัน</p><div class="mp8-driver-package__meta"><span>8 ชั่วโมง</span><span>Full creative day</span></div><a class="mp8-driver-package__cta" href="/booking?from=profiles&role=creative_companion&package=creative_day">จองแพ็กเกจนี้ ↗</a></article>
        </div>
        <p class="mp8-driver-packages__rules">Creative Companion คือ shared-interest companion ไม่ใช่ช่างภาพ นักออกแบบ ศิลปินรับจ้าง ผู้ผลิตงาน หรือผู้ให้บริการวิชาชีพ · Photo walk คือการทำกิจกรรมร่วมกันเท่านั้น ไม่มีภาพส่งมอบหรือ usage rights · งานถ่ายภาพ/วิดีโอเชิงพาณิชย์, creative production หรือการใช้ภาพต้องส่ง brief และ quote แยก · MMD จะยืนยัน shared interest, context และ availability ก่อนทุกครั้ง · ค่า ticket/exhibition/venue/transport/Parking/อาหารและเครื่องดื่มคิดตามจริง · OT ก่อน 00:00 ฿1,690/ชม. · OT หลัง 00:00 ฿2,190/ชม. · หลัง 03:00 ฿2,690/ชม. · หลัง 06:00 ต้อง MMD review · ต่อเวลาต้อง Request ใน MY MMD → Model Approve ใน MMD MODEL → MMD ยืนยัน</p>
      </section>
    `);
  }

  var driverPackages = root.querySelector("[data-driver-packages]");
  var culinaryPackages = root.querySelector("[data-culinary-packages]");
  var dayOffPackages = root.querySelector("[data-dayoff-packages]");
  var nightLifePackages = root.querySelector("[data-nightlife-packages]");
  var socialPackages = root.querySelector("[data-social-packages]");
  var bangkokPackages = root.querySelector("[data-bangkok-packages]");
  var sportPackages = root.querySelector("[data-sport-packages]");
  var wellnessPackages = root.querySelector("[data-wellness-packages]");
  var businessPackages = root.querySelector("[data-business-packages]");
  var creativePackages = root.querySelector("[data-creative-packages]");
  var resultCount = root.querySelector("[data-result-count]");
  var empty = root.querySelector("[data-empty]");
  if (!track) return;

  var catalog = [];
  var activeRole = "";
  var activeGender = "all";

  var ROLE_LABELS = {
    everyday_companion: "เพื่อนคู่ใจ",
    driver_companion: "คนขับรถหล่อ",
    culinary_companion: "เชฟหล่อ",
    social_appearance: "คู่หูออกงาน",
    bangkok_companion: "เพื่อนเที่ยวกรุงเทพ",
    sport_activity: "หนุ่มสายกีฬา",
    wellness_companion: "หนุ่มสายสุขภาพ",
    business_companion: "หนุ่มออฟฟิศ",
    nightlife_companion: "เพื่อนสายปาร์ตี้",
    creative_companion: "เพื่อนสายศิลป์",
    medical_professional: "บุรุษทางการแพทย์"
  };

  function text(tag, value, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }

  function language() {
    var value = "th";
    try { value = new URLSearchParams(location.search).get("lang") || localStorage.getItem("mmd_lang") || "th"; } catch (_) {}
    return ["th", "en", "zh"].indexOf(value) > -1 ? value : "th";
  }

  function copy() {
    var sets = {
      th: {
        badge: "CURATED",
        line: "โปรไฟล์ที่ MMD อนุมัติสำหรับบทบาทนี้แล้ว",
        fit: "ก่อนยืนยันงาน",
        detail: "MMD จะตรวจคิว ขอบเขต และความเหมาะสมของทั้งสองฝ่ายก่อนยืนยันทุกครั้ง",
        cta: "ให้ MMD เช็กคิวและความเหมาะ",
        ctaFemale: "ไปที่ BELIEVE ก่อน",
        chooseRole: "เลือกบทบาทด้านบนก่อน แล้วรายชื่อที่เหมาะจะปรากฏตรงนี้",
        none: "ตอนนี้ยังไม่มีคนที่ MMD เปิดสำหรับบทบาทนี้"
      },
      en: {
        badge: "CURATED",
        line: "A profile MMD has approved for this role.",
        fit: "Before confirmation",
        detail: "MMD checks availability, boundaries, and mutual fit before every confirmation.",
        cta: "Ask MMD to check availability",
        ctaFemale: "Continue through BELIEVE",
        chooseRole: "Choose a role above first. Only eligible profiles will appear here.",
        none: "No MMD-approved profile is currently open for this role."
      },
      zh: {
        badge: "精选",
        line: "经 MMD 审核并批准用于此角色的公开资料。",
        fit: "确认之前",
        detail: "每次确认前，MMD 都会检查时间、边界与双方是否合适。",
        cta: "请 MMD 检查时间与匹配度",
        ctaFemale: "先进入 BELIEVE",
        chooseRole: "请先选择上方角色，仅显示符合资格的资料。",
        none: "目前此角色暂无经 MMD 批准公开的资料。"
      }
    };
    return sets[language()];
  }

  function validItem(item) {
    if (!item || item.visibility !== "public" || item.source !== "r2_public_model" || !item.display_name) return false;
    var roles = Array.isArray(item.approved_roles) ? item.approved_roles.filter(function (role) { return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role); }) : [];
    var genders = Array.isArray(item.accepted_customer_genders) ? item.accepted_customer_genders.filter(function (value) { return value === "male" || value === "female"; }) : [];
    if (!roles.length || !genders.length) return false;
    try {
      var url = new URL(item.image_url);
      return url.protocol === "https:" && url.hostname === "models.mmdbkk.com" && url.pathname.indexOf("/MMD%20Public%20Models/") === 0;
    } catch (_) { return false; }
  }

  function eligible(item) {
    if (!activeRole || item.approved_roles.indexOf(activeRole) === -1) return false;
    if (activeGender === "all") return true;
    return item.accepted_customer_genders.indexOf(activeGender) > -1;
  }

  function card(item, index) {
    var words = copy();
    var article = document.createElement("article");
    article.className = "mp8-profile is-visible";
    article.dataset.profile = "";
    article.dataset.name = item.display_name;
    article.dataset.roles = item.approved_roles.join(",");
    article.dataset.customerScope = item.customer_scope || "all_genders";
    article.dataset.r2Public = "true";
    if (item.private_teaser_available === true && item.slug) article.dataset.privateTeaserAvailable = "true";

    var figure = document.createElement("figure");
    figure.className = "mp8-card__media";
    var image = document.createElement("img");
    image.src = item.image_url;
    image.alt = item.display_name + " — MMD Privé public profile";
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    figure.append(image, text("span", "PUBLIC FILE " + String(index + 1).padStart(2, "0")));

    var body = document.createElement("div");
    body.className = "mp8-card__body";
    var title = document.createElement("div");
    title.className = "mp8-card__title";
    var titleText = document.createElement("div");
    titleText.append(text("p", (ROLE_LABELS[activeRole] || "PUBLIC MODEL").toUpperCase()), text("h3", item.display_name));
    title.append(titleText, text("em", words.badge));
    body.append(title, text("p", words.line, "mp8-card__line"));

    var tags = document.createElement("div");
    tags.className = "mp8-tags";
    tags.append(text("span", ROLE_LABELS[activeRole] || activeRole));
    if (item.booking_mode === "brief_only") tags.append(text("span", "Brief only"));
    body.append(tags);

    var details = document.createElement("details");
    details.className = "mp8-details";
    var summary = document.createElement("summary");
    summary.append(text("span", words.fit), document.createElement("i"));
    var detailBody = document.createElement("div");
    detailBody.append(text("p", words.detail));
    details.append(summary, detailBody);
    body.append(details);

    var link = document.createElement("a");
    link.className = "mp8-card__cta";
    var bookingHref = "/booking?from=profiles&role=" + encodeURIComponent(activeRole) + "&model=" + encodeURIComponent(item.display_name);
    var femaleHref = femaleGate + "?from=profiles&role=" + encodeURIComponent(activeRole) + "&model=" + encodeURIComponent(item.display_name);
    var femaleFlow = activeGender === "female" || (activeGender === "all" && item.customer_scope === "female_only");
    link.href = femaleFlow ? femaleHref : bookingHref;
    link.append(text("span", femaleFlow ? words.ctaFemale : words.cta), text("b", "↗"));
    body.append(link);

    // The public page receives only the boolean discovery marker. The link is
    // an identity-verification handoff, not a viewer or a grant; MY MMD and
    // the backend decide eligibility and deliver any protected media.
    if (item.private_teaser_available === true && item.slug) {
      var teaser = document.createElement("a");
      teaser.className = "mp8-card__cta mp8-card__cta--teaser";
      teaser.href = "/member/dashboard?from=profiles&intent=private_teaser&model=" + encodeURIComponent(item.slug);
      teaser.append(text("span", "PRIVATE PREVIEW · ยืนยันตัวตนเพื่อดูสิทธิ์"), text("b", "↗"));
      body.append(teaser);
    }

    article.append(figure, body);
    return article;
  }

  function updateStats(count) {
    var stats = root.querySelectorAll(".mp8-hero__stats span b");
    if (stats[0]) stats[0].textContent = activeRole ? String(count).padStart(2, "0") : "—";
    if (stats[1]) stats[1].textContent = activeRole ? String(count).padStart(2, "0") : "—";
  }

  function render() {
    var words = copy();
    if (!activeRole) {
      track.replaceChildren();
      if (resultCount) resultCount.textContent = words.chooseRole;
      if (empty) empty.hidden = true;
      updateStats(0);
      return;
    }

    var items = catalog.filter(eligible);
    var fragment = document.createDocumentFragment();
    items.forEach(function (item, index) { fragment.appendChild(card(item, index)); });
    track.replaceChildren(fragment);

    if (resultCount) resultCount.textContent = items.length
      ? "แสดง " + items.length + " โปรไฟล์ · " + (ROLE_LABELS[activeRole] || activeRole)
      : words.none;
    if (empty) empty.hidden = items.length > 0;
    updateStats(items.length);
  }

  root.querySelectorAll("[data-role-value]").forEach(function (button) {
    button.addEventListener("click", function () {
      activeRole = button.dataset.roleValue || "";
      root.querySelectorAll("[data-role-value]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
      if (driverPackages) driverPackages.hidden = activeRole !== "driver_companion";
      if (culinaryPackages) culinaryPackages.hidden = activeRole !== "culinary_companion";
      if (dayOffPackages) dayOffPackages.hidden = activeRole !== "everyday_companion";
      if (nightLifePackages) nightLifePackages.hidden = activeRole !== "nightlife_companion";
      if (socialPackages) socialPackages.hidden = activeRole !== "social_appearance";
      if (bangkokPackages) bangkokPackages.hidden = activeRole !== "bangkok_companion";
      if (sportPackages) sportPackages.hidden = activeRole !== "sport_activity";
      if (wellnessPackages) wellnessPackages.hidden = activeRole !== "wellness_companion";
      if (businessPackages) businessPackages.hidden = activeRole !== "business_companion";
      if (creativePackages) creativePackages.hidden = activeRole !== "creative_companion";
      if (stage2) stage2.hidden = false;
      render();
      var focusTarget = activeRole === "driver_companion" && driverPackages
        ? driverPackages
        : activeRole === "culinary_companion" && culinaryPackages
          ? culinaryPackages
          : activeRole === "everyday_companion" && dayOffPackages
            ? dayOffPackages
            : activeRole === "nightlife_companion" && nightLifePackages
              ? nightLifePackages
              : activeRole === "social_appearance" && socialPackages
                ? socialPackages
                : activeRole === "bangkok_companion" && bangkokPackages
                  ? bangkokPackages
                  : activeRole === "sport_activity" && sportPackages
                    ? sportPackages
                  : activeRole === "wellness_companion" && wellnessPackages
                    ? wellnessPackages
                    : activeRole === "business_companion" && businessPackages
                      ? businessPackages
                      : activeRole === "creative_companion" && creativePackages
                        ? creativePackages
                  : stage2;
      if (focusTarget && typeof focusTarget.scrollIntoView === "function") {
        focusTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });

  root.querySelectorAll("[data-gender-value]").forEach(function (button) {
    button.addEventListener("click", function () {
      activeGender = button.dataset.genderValue || "all";
      root.querySelectorAll("[data-gender-value]").forEach(function (candidate) {
        candidate.setAttribute("aria-pressed", candidate === button ? "true" : "false");
      });
      render();
    });
  });

  track.replaceChildren();
  if (driverPackages) driverPackages.hidden = true;
  if (culinaryPackages) culinaryPackages.hidden = true;
  if (dayOffPackages) dayOffPackages.hidden = true;
  if (nightLifePackages) nightLifePackages.hidden = true;
  if (socialPackages) socialPackages.hidden = true;
  if (bangkokPackages) bangkokPackages.hidden = true;
  if (sportPackages) sportPackages.hidden = true;
  if (wellnessPackages) wellnessPackages.hidden = true;
  if (businessPackages) businessPackages.hidden = true;
  if (creativePackages) creativePackages.hidden = true;
  if (resultCount) resultCount.textContent = copy().chooseRole;
  updateStats(0);

  fetch(endpoint, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) throw new Error("catalog_http_" + response.status);
      return response.json();
    })
    .then(function (payload) {
      catalog = Array.isArray(payload && payload.items) ? payload.items.filter(validItem) : [];
      root.dataset.roleCatalogLoaded = "true";
      render();
    })
    .catch(function () {
      catalog = [];
      root.dataset.roleCatalogLoaded = "error";
      render();
    });
})();
