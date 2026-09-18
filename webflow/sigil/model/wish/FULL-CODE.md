# /sigil/model/wish — Full code redesign

HTML — Webflow Embed

```html
<main id="mmd-model-wish-v1" data-model-wish
  data-profile-endpoint="/v1/model/profile"
  data-submit-endpoint="/v1/model/session/current?mode=year6_direct_wish"
  data-media-upload-endpoint="/v1/model/media/upload"
  data-liff-id="2010864854-N34SgCqq" lang="th">
  <div class="mmw-shell">
    <header class="mmw-topbar">
      <a class="mmw-brand" href="/sigil/model/dashboard" aria-label="กลับ MMD MODEL">
        <img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa586601bf3d46fb15c5699_05-tiny-mark-512px.webp" width="48" height="48" alt="MMD Privé">
        <span>MMD PRIVÉ<small>THE MODEL CIRCLE</small></span>
      </a>
      <span class="mmw-session" data-session-chip role="status">กำลังเช็ก LINE</span>
    </header>

    <section class="mmw-hero" aria-labelledby="mmw-title">
      <div class="mmw-hero-heading">
        <div>
          <p class="mmw-eyebrow">A NOTE FOR OUR SIXTH YEAR</p>
          <h1 id="mmw-title">Six years.<br><em>A story we share.</em></h1>
        </div>
        <p class="mmw-hero-note">หกปีที่มีคุณเป็นส่วนหนึ่ง<br>ขอบคุณที่เติบโตไปด้วยกัน</p>
      </div>
      <figure class="mmw-portrait">
        <img class="mmw-hero-img" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aacf3d5af4b67d29457bae2_Boss%20Wish.webp" alt="พี่เปอร์ — ขอบคุณที่เป็นพลังงานที่ดีของ MMD เสมอมา" width="1600" height="900" fetchpriority="high">
        <figcaption><span>SAME PEOPLE. BRIGHTER TOMORROWS.</span><a href="#mmw-letter">เขียนข้อความถึงเรา <span aria-hidden="true">↓</span></a></figcaption>
      </figure>
    </section>

    <section class="mmw-form-wrap" id="mmw-letter" aria-labelledby="mmw-letter-title">
      <aside class="mmw-letter-intro">
        <span class="mmw-anniversary" aria-hidden="true">06<span>YEARS TOGETHER</span></span>
        <p class="mmw-eyebrow">FROM YOU, WITH MEANING</p>
        <h2 id="mmw-letter-title">ทุกข้อความ<br>มีความหมายกับเรา</h2>
        <p>คำอวยพร ความทรงจำ หรือสิ่งที่อยากบอก<br class="mmw-desktop-break">เขียนในแบบของคุณได้เลยครับ</p>
        <div class="mmw-intro-foot"><span class="mmw-small-line"></span><span>3 คำถาม · เลือกเขียนได้ตามใจ<br>เพียง 1 ข้อความก็ส่งได้</span></div>
      </aside>

      <form class="mmw-form" data-wish-form novalidate>
        <div class="mmw-form-caption"><span>YOUR WORDS, OUR NEXT CHAPTER</span><span data-written-count>0 / 3 ข้อความ</span></div>
        <div class="mmw-questions">
          <details class="mmw-question" data-question open>
            <summary>
              <span class="mmw-question-number" aria-hidden="true">01</span>
              <span class="mmw-question-title"><span class="mmw-eyebrow">01 · อวยพร 6 ปี MMD</span><span>อวยพร MMD ครบ 6 ปี</span></span>
              <span class="mmw-question-state" data-question-state aria-label="ยังไม่ได้เขียน"></span>
              <span class="mmw-toggle" aria-hidden="true"></span>
            </summary>
            <div class="mmw-question-body">
              <p id="mmw-birthday-help">ครบรอบ 6 ปีแล้ว อยากอวยพรอะไรให้ MMD เขียนมาได้เลยครับ</p>
              <label class="mmw-sr-only" for="mmw-birthday-wish">อวยพร MMD ครบ 6 ปี</label>
              <textarea id="mmw-birthday-wish" data-birthday-wish maxlength="700" rows="5" placeholder="ถึง MMD ในวันครบรอบ 6 ปี…" aria-describedby="mmw-birthday-help mmw-birthday-count"></textarea>
              <div class="mmw-field-foot"><span>คำอวยพรจากคุณ</span><span id="mmw-birthday-count" data-count="birthday">0 / 700</span></div>
              <button class="mmw-next" type="button" data-next-question="1">ข้อความถึง MMD <span aria-hidden="true">↗</span></button>
            </div>
          </details>

          <details class="mmw-question" data-question>
            <summary>
              <span class="mmw-question-number" aria-hidden="true">02</span>
              <span class="mmw-question-title"><span class="mmw-eyebrow">TO THE TEAM</span><span>อยากบอกอะไรกับ MMD</span></span>
              <span class="mmw-question-state" data-question-state aria-label="ยังไม่ได้เขียน"></span>
              <span class="mmw-toggle" aria-hidden="true"></span>
            </summary>
            <div class="mmw-question-body">
              <p id="mmw-mmd-help">เรื่องที่ประทับใจ สิ่งที่อยากให้ดีขึ้น หรือความรู้สึกที่ผ่านมา เราอยากรับฟังครับ</p>
              <label class="mmw-sr-only" for="mmw-mmd-message">ข้อความถึงทีม MMD</label>
              <textarea id="mmw-mmd-message" data-mmd-message maxlength="1000" rows="5" placeholder="ตลอดเวลาที่ได้ร่วมงานกัน…" aria-describedby="mmw-mmd-help mmw-mmd-count"></textarea>
              <div class="mmw-field-foot"><span>ส่งถึงทีม MMD</span><span id="mmw-mmd-count" data-count="mmd">0 / 1000</span></div>
              <button class="mmw-next" type="button" data-next-question="2">ข้อความส่วนตัวถึงพี่เปอร์ <span aria-hidden="true">↗</span></button>
            </div>
          </details>

          <details class="mmw-question mmw-question-private" data-question>
            <summary>
              <span class="mmw-question-number" aria-hidden="true">03</span>
              <span class="mmw-question-title"><span class="mmw-eyebrow">A PRIVATE NOTE</span><span>ถึงพี่เปอร์ เป็นการส่วนตัว</span></span>
              <span class="mmw-question-state" data-question-state aria-label="ยังไม่ได้เขียน"></span>
              <span class="mmw-toggle" aria-hidden="true"></span>
            </summary>
            <div class="mmw-question-body">
              <p id="mmw-private-help">มีอะไรอยากบอกพี่เปอร์ เขียนได้ตรงนี้ครับ ข้อความส่วนนี้ให้พี่เปอร์อ่านเท่านั้น</p>
              <label class="mmw-sr-only" for="mmw-private-per">ข้อความส่วนตัวถึงพี่เปอร์</label>
              <textarea id="mmw-private-per" data-private-per maxlength="1000" rows="5" placeholder="พี่เปอร์ครับ…" aria-describedby="mmw-private-help mmw-private-count"></textarea>
              <div class="mmw-field-foot"><span><svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true"><rect x="1" y="6" width="10" height="7" rx="2" stroke="currentColor"/><path d="M3 6V4a3 3 0 0 1 6 0v2" stroke="currentColor"/></svg> พี่เปอร์อ่านเท่านั้น</span><span id="mmw-private-count" data-count="private">0 / 1000</span></div>
            </div>
          </details>
        </div>

        <details class="mmw-media-update">
          <summary><span class="mmw-media-icon" aria-hidden="true">＋</span><span><strong>อัปเดตรูปและคลิปของคุณ</strong><small>ไม่บังคับ · เพิ่มใน MMD MODEL Gallery</small></span><span class="mmw-media-total" data-media-count>0 / 5</span><span class="mmw-toggle" aria-hidden="true"></span></summary>
          <div class="mmw-media-body">
            <label class="mmw-media-picker">
              <input type="file" data-media-input multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" aria-label="เลือกรูปหรือคลิป สูงสุด 5 ไฟล์" aria-describedby="mmw-media-limits">
              <span aria-hidden="true">↑</span><span><strong>เลือกรูปหรือคลิป</strong><small id="mmw-media-limits">สูงสุด 5 ไฟล์รวมกัน · รูป 10 MB / คลิป 50 MB ต่อไฟล์</small></span>
            </label>
            <div class="mmw-media-grid" data-media-grid aria-label="ไฟล์ที่เลือก">
              <div class="mmw-media-slot" data-media-slot="0"><span>01</span><em>MEDIA</em></div>
              <div class="mmw-media-slot" data-media-slot="1"><span>02</span><em>MEDIA</em></div>
              <div class="mmw-media-slot" data-media-slot="2"><span>03</span><em>MEDIA</em></div>
              <div class="mmw-media-slot" data-media-slot="3"><span>04</span><em>MEDIA</em></div>
              <div class="mmw-media-slot" data-media-slot="4"><span>05</span><em>MEDIA</em></div>
            </div>
            <p class="mmw-media-note" data-media-note>ไฟล์จะเข้า Gallery / Intro Video และไม่ถูกแนบไปกับคำอวยพรโดยอัตโนมัติ</p>
          </div>
        </details>

        <fieldset class="mmw-consents">
          <legend>ให้คำอวยพรนี้เดินทางถึงใครบ้าง</legend>
          <p class="mmw-consent-help">เลือกได้มากกว่าหนึ่งช่อง หรือไม่เลือกก็ได้<br>พี่เปอร์จะตรวจอนุมัติก่อนเผยแพร่ตามช่องทางที่คุณเลือก</p>
          <label class="mmw-option"><input type="checkbox" data-telegram-consent><span class="mmw-option-box" aria-hidden="true"></span><span class="mmw-option-copy"><strong>Telegram MMD</strong><small>อนุญาตให้เผยแพร่คำอวยพรในกลุ่มลูกค้า MMD</small></span><span class="mmw-option-arrow" aria-hidden="true">↗</span></label>
          <label class="mmw-option"><input type="checkbox" data-past-clients-consent><span class="mmw-option-box" aria-hidden="true"></span><span class="mmw-option-copy"><strong>Past Clients · MY MMD</strong><small>ส่งคำอวยพรถึงลูกค้าที่เคยใช้บริการกับคุณ ผ่าน MY MMD</small></span><span class="mmw-option-arrow" aria-hidden="true">↗</span></label>
          <p class="mmw-privacy-note">ข้อความส่วนตัวถึงพี่เปอร์จะไม่ถูกเผยแพร่ในช่องทางเหล่านี้</p>
        </fieldset>

        <div class="mmw-submit-area">
          <div class="mmw-auth-note" data-auth-note><span aria-hidden="true"></span><p>ยืนยัน LINE ตอนส่ง เพื่อให้ข้อความผูกกับบัญชี MMD MODEL ของคุณ</p></div>
          <p class="mmw-error" data-error role="status" aria-live="polite" tabindex="-1"></p>
          <button class="mmw-submit" type="submit" data-submit><span data-submit-label>ส่งให้เปอร์</span><span aria-hidden="true">↗</span></button>
          <p class="mmw-submit-note">ด้วยความขอบคุณ จาก MMD Privé</p>
        </div>
      </form>
    </section>

    <section class="mmw-success" data-success hidden aria-labelledby="mmw-success-title" tabindex="-1">
      <span class="mmw-success-seal" aria-hidden="true">✓</span>
      <p class="mmw-eyebrow">RECEIVED WITH GRATITUDE</p>
      <h2 id="mmw-success-title">ขอบคุณที่เป็นส่วนหนึ่ง<br>ของเรื่องราวนี้</h2>
      <p>ส่งข้อความถึงพี่เปอร์เรียบร้อยแล้วครับ<br>คำอวยพรจะได้รับการตรวจอนุมัติก่อนเผยแพร่</p>
      <p class="mmw-success-scope" data-success-scope></p>
      <a class="mmw-back" href="/sigil/model/dashboard">กลับ MMD MODEL <span aria-hidden="true">↗</span></a>
    </section>

    <figure class="mmw-closing">
      <img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aad6929f58f4dd5c050d251_Gtoip%20-%20xaj.webp" width="1672" height="941" loading="lazy" decoding="async" alt="ชายสี่คนในชุดสูทสีดำนั่งร่วมกัน ท่ามกลางวิวกรุงเทพฯ ยามเย็น">
      <figcaption>
        <p class="mmw-eyebrow">OUR STORY CONTINUES</p>
        <span class="mmw-closing-title">Still, <em>together.</em></span>
        <p class="mmw-closing-note">ขอบคุณที่เป็นส่วนหนึ่งของ MMD</p>
      </figcaption>
    </figure>

    <footer class="mmw-footer"><span>MMD PRIVÉ</span><span>SIX YEARS. AND STILL, TOGETHER.</span><a href="/sigil/model/dashboard">MMD MODEL <span aria-hidden="true">↗</span></a></footer>
  </div>
</main>
```

CSS — Page Settings → Inside <head>

```html
<meta name="robots" content="noindex,nofollow">
<style id="mmd-model-wish-atelier-v8">
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Noto+Sans+Thai:wght@400;500;600&display=swap');
/* MMD MODEL · Sixth Year — page-scoped, mobile-first. */
#mmd-model-wish-v1 {
  --mmw-bg: #0d0e0c;
  --mmw-panel: #151612;
  --mmw-cream: #f0eadf;
  --mmw-gold: #c7b28a;
  --mmw-muted: #a7a69b;
  --mmw-line: rgba(207, 194, 161, .19);
  --mmw-serif: "Cormorant Garamond", "Times New Roman", Georgia, serif;
  min-height: 100svh;
  width: 100%;
  overflow-x: clip;
  background: var(--mmw-bg);
  color: var(--mmw-cream);
  font-family: "LINE Seed Sans TH", "Noto Sans Thai", system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  color-scheme: dark;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
#mmd-model-wish-v1 *, #mmd-model-wish-v1 *::before, #mmd-model-wish-v1 *::after { box-sizing: border-box; }
#mmd-model-wish-v1 [hidden] { display: none !important; }
#mmd-model-wish-v1 :is(h1,h2,h3,p,figure) { margin: 0; }
#mmd-model-wish-v1 :is(button,input,textarea) { font: inherit; }
#mmd-model-wish-v1 :is(a,button,summary,input,textarea) { -webkit-tap-highlight-color: transparent; }
#mmd-model-wish-v1 :is(a,button,summary,input,textarea):focus-visible { outline: 2px solid var(--mmw-gold); outline-offset: 5px; }
#mmd-model-wish-v1 a { color: inherit; text-decoration: none; }
#mmd-model-wish-v1 button { cursor: pointer; }
#mmd-model-wish-v1 button:disabled { cursor: wait; opacity: .6; }
#mmd-model-wish-v1 .mmw-shell { width: min(1120px, calc(100% - 40px)); margin: 0 auto; }
#mmd-model-wish-v1 .mmw-topbar { min-height: 85px; display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 1px solid var(--mmw-line); }
#mmd-model-wish-v1 .mmw-brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
#mmd-model-wish-v1 .mmw-brand img { display: block; width: 42px; height: 42px; object-fit: contain; }
#mmd-model-wish-v1 .mmw-brand > span { font-size: 11px; font-weight: 500; letter-spacing: .16em; line-height: 1.5; }
#mmd-model-wish-v1 .mmw-brand small { display: block; margin-top: 4px; color: var(--mmw-muted); font-size: 8px; letter-spacing: .12em; }
#mmd-model-wish-v1 .mmw-session { max-width: 46%; color: var(--mmw-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#mmd-model-wish-v1 .mmw-session::before { content: ""; display: inline-block; width: 5px; height: 5px; margin: 0 7px 2px 0; border-radius: 50%; background: currentColor; }
#mmd-model-wish-v1 .mmw-session.is-ready { color: #adbea1; }
#mmd-model-wish-v1 .mmw-session.is-needed { color: var(--mmw-gold); }
#mmd-model-wish-v1 .mmw-hero { padding-top: 36px; }
#mmd-model-wish-v1 .mmw-eyebrow { color: var(--mmw-gold); font-size: 10px; line-height: 1.6; font-weight: 500; letter-spacing: .16em; }
#mmd-model-wish-v1 .mmw-hero h1 { margin-top: 17px; color: var(--mmw-cream); font-family: var(--mmw-serif); font-size: clamp(43px, 11vw, 74px); font-weight: 400; line-height: .99; letter-spacing: -.035em; }
#mmd-model-wish-v1 .mmw-hero h1 em { color: var(--mmw-gold); font-weight: 400; }
#mmd-model-wish-v1 .mmw-hero-note { margin-top: 22px; color: var(--mmw-muted); font-size: 13px; line-height: 1.9; }
#mmd-model-wish-v1 .mmw-portrait { margin-top: 28px; }
#mmd-model-wish-v1 .mmw-hero-img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: contain; border: 1px solid var(--mmw-line); border-radius: 4px; background: #17140f; }
#mmd-model-wish-v1 .mmw-portrait figcaption { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--mmw-line); }
#mmd-model-wish-v1 .mmw-portrait figcaption > span { max-width: 55%; color: var(--mmw-muted); font-size: 8px; line-height: 1.7; letter-spacing: .14em; }
#mmd-model-wish-v1 .mmw-portrait figcaption a { display: inline-flex; align-items: center; min-height: 44px; gap: 15px; font-size: 12px; }
#mmd-model-wish-v1 .mmw-portrait figcaption a span { color: var(--mmw-gold); font-size: 18px; }
#mmd-model-wish-v1 .mmw-form-wrap { padding: 43px 0 64px; scroll-margin-top: 20px; }
#mmd-model-wish-v1 .mmw-letter-intro { position: relative; padding: 0 0 28px; }
#mmd-model-wish-v1 .mmw-anniversary { display: none; }
#mmd-model-wish-v1 .mmw-letter-intro h2 { margin: 12px 0 13px; font-size: 28px; font-weight: 400; line-height: 1.5; letter-spacing: -.025em; }
#mmd-model-wish-v1 .mmw-letter-intro h2 br { display: none; }
#mmd-model-wish-v1 .mmw-letter-intro > p:not(.mmw-eyebrow) { max-width: 320px; color: var(--mmw-muted); font-size: 13px; line-height: 1.9; }
#mmd-model-wish-v1 .mmw-desktop-break { display: none; }
#mmd-model-wish-v1 .mmw-intro-foot { display: flex; align-items: center; gap: 12px; margin-top: 20px; color: var(--mmw-gold); font-size: 12px; line-height: 1.7; }
#mmd-model-wish-v1 .mmw-small-line { width: 26px; height: 1px; flex: 0 0 26px; background: var(--mmw-gold); }
#mmd-model-wish-v1 .mmw-form { min-width: 0; margin: 0; }
#mmd-model-wish-v1 .mmw-form-caption { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 14px 0; color: var(--mmw-muted); font-size: 10px; }
#mmd-model-wish-v1 .mmw-form-caption > span:first-child { font-size: 8px; letter-spacing: .1em; }
#mmd-model-wish-v1 .mmw-form-caption > span:last-child { flex-shrink: 0; font-variant-numeric: tabular-nums; }
#mmd-model-wish-v1 .mmw-questions { border-top: 1px solid var(--mmw-line); }
#mmd-model-wish-v1 .mmw-question { border-bottom: 1px solid var(--mmw-line); transition: background .2s; }
#mmd-model-wish-v1 summary { list-style: none; cursor: pointer; }
#mmd-model-wish-v1 summary::-webkit-details-marker { display: none; }
#mmd-model-wish-v1 .mmw-question > summary { display: flex; align-items: center; gap: 14px; padding: 22px 0; min-height: 94px; }
#mmd-model-wish-v1 .mmw-question-number { font-family: var(--mmw-serif); font-size: 28px; line-height: 1; color: #b7a486; width: 28px; flex: 0 0 28px; }
#mmd-model-wish-v1 .mmw-question-title { flex: 1; min-width: 0; font-size: 17px; font-weight: 400; line-height: 1.6; }
#mmd-model-wish-v1 .mmw-question-title .mmw-eyebrow { display: block; margin-bottom: 4px; font-size: 9px; letter-spacing: .12em; }
#mmd-model-wish-v1 .mmw-question-state { display: none; color: #b7c4a5; font-size: 12px; }
#mmd-model-wish-v1 .mmw-question.is-filled .mmw-question-state { display: block; }
#mmd-model-wish-v1 .mmw-toggle { position: relative; flex: 0 0 12px; width: 12px; height: 12px; color: var(--mmw-gold); }
#mmd-model-wish-v1 .mmw-toggle::before, #mmd-model-wish-v1 .mmw-toggle::after { content: ""; position: absolute; background: currentColor; }
#mmd-model-wish-v1 .mmw-toggle::before { width: 12px; height: 1px; top: 6px; }
#mmd-model-wish-v1 .mmw-toggle::after { width: 1px; height: 12px; left: 6px; transition: transform .2s; }
#mmd-model-wish-v1 details[open] > summary .mmw-toggle::after { transform: rotate(90deg); }
#mmd-model-wish-v1 .mmw-question-body { padding: 0 0 22px; }
#mmd-model-wish-v1 .mmw-question-body > p { margin: 0 0 17px; color: var(--mmw-muted); font-size: 13px; line-height: 1.9; }
#mmd-model-wish-v1 textarea { display: block; width: 100%; min-height: 196px; max-height: 500px; margin: 0; padding: 21px; resize: vertical; border: 1px solid transparent; border-radius: 3px; background: var(--mmw-cream); color: #302d25; caret-color: #7e6842; color-scheme: light; font-size: 16px; font-weight: 400; line-height: 1.9; box-shadow: inset 0 1px 1px #fff8; }
#mmd-model-wish-v1 textarea::placeholder { color: #777263; opacity: 1; }
#mmd-model-wish-v1 textarea:focus { border-color: var(--mmw-gold); outline-offset: 3px; }
#mmd-model-wish-v1 .mmw-field-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; color: var(--mmw-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
#mmd-model-wish-v1 .mmw-field-foot > span:first-child { display: flex; align-items: center; gap: 6px; }
#mmd-model-wish-v1 .mmw-next { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; margin-top: 12px; padding: 0; border: 0; border-top: 1px solid var(--mmw-line); background: transparent; color: var(--mmw-gold); font-size: 12px; }
#mmd-model-wish-v1 .mmw-next > span { font-size: 18px; }
#mmd-model-wish-v1 .mmw-media-update { margin-top: 28px; border: 1px solid var(--mmw-line); border-radius: 3px; background: var(--mmw-panel); }
#mmd-model-wish-v1 .mmw-media-update > summary { display: flex; align-items: center; gap: 12px; padding: 18px 15px; }
#mmd-model-wish-v1 .mmw-media-update > summary > span:nth-child(2) { flex: 1; min-width: 0; }
#mmd-model-wish-v1 .mmw-media-update strong { display: block; color: var(--mmw-cream); font-size: 13px; font-weight: 400; }
#mmd-model-wish-v1 .mmw-media-update small { display: block; margin-top: 4px; color: var(--mmw-muted); font-size: 11px; line-height: 1.7; }
#mmd-model-wish-v1 .mmw-media-icon { display: none; color: var(--mmw-gold); font-size: 23px; }
#mmd-model-wish-v1 .mmw-media-total { color: var(--mmw-gold); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
#mmd-model-wish-v1 .mmw-media-body { padding: 0 15px 18px; }
#mmd-model-wish-v1 .mmw-media-picker { position: relative; display: flex; align-items: center; gap: 14px; padding: 18px 12px; border: 1px dashed #746b55; border-radius: 3px; cursor: pointer; }
#mmd-model-wish-v1 .mmw-media-picker input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
#mmd-model-wish-v1 .mmw-media-picker:focus-within { outline: 2px solid var(--mmw-gold); outline-offset: 4px; }
#mmd-model-wish-v1 .mmw-media-picker > span:first-of-type { color: var(--mmw-gold); font-size: 23px; }
#mmd-model-wish-v1 .mmw-media-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 6px; margin-top: 12px; }
#mmd-model-wish-v1 .mmw-media-slot { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; aspect-ratio: 4 / 5; overflow: hidden; border: 1px solid var(--mmw-line); border-radius: 2px; color: var(--mmw-muted); }
#mmd-model-wish-v1 .mmw-media-slot > span:first-child { font-family: var(--mmw-serif); font-size: 19px; }
#mmd-model-wish-v1 .mmw-media-slot em { font-size: 8px; font-style: normal; letter-spacing: .08em; }
#mmd-model-wish-v1 .mmw-media-slot img, #mmd-model-wish-v1 .mmw-media-slot video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#mmd-model-wish-v1 .mmw-media-badge { position: absolute; bottom: 4px; right: 4px; padding: 2px 4px; background: #0d0e0ce6; color: var(--mmw-cream); font-size: 8px; }
#mmd-model-wish-v1 .mmw-media-slot.is-uploaded { border-color: #b7c4a5; }
#mmd-model-wish-v1 .mmw-media-note { margin-top: 13px; color: var(--mmw-muted); font-size: 11px; line-height: 1.8; }
#mmd-model-wish-v1 .mmw-consents { min-width: 0; margin: 34px 0 0; padding: 0; border: 0; }
#mmd-model-wish-v1 .mmw-consents legend { padding: 0; color: var(--mmw-cream); font-size: 17px; font-weight: 400; }
#mmd-model-wish-v1 .mmw-consent-help { margin: 9px 0 18px; color: var(--mmw-muted); font-size: 12px; line-height: 1.9; }
#mmd-model-wish-v1 .mmw-option { position: relative; display: flex; align-items: center; gap: 13px; margin-top: 9px; padding: 18px 15px; border: 1px solid var(--mmw-line); border-radius: 3px; cursor: pointer; transition: border-color .2s, background .2s; }
#mmd-model-wish-v1 .mmw-option input { position: absolute; width: 20px; height: 20px; opacity: 0; }
#mmd-model-wish-v1 .mmw-option-box { width: 19px; height: 19px; flex: 0 0 19px; border: 1px solid #8d8676; border-radius: 2px; display: grid; place-items: center; }
#mmd-model-wish-v1 .mmw-option input:checked + .mmw-option-box { background: var(--mmw-gold); border-color: var(--mmw-gold); }
#mmd-model-wish-v1 .mmw-option input:checked + .mmw-option-box::after { content: "✓"; color: var(--mmw-bg); font-size: 13px; font-weight: 700; }
#mmd-model-wish-v1 .mmw-option input:focus-visible + .mmw-option-box { outline: 2px solid var(--mmw-gold); outline-offset: 4px; }
#mmd-model-wish-v1 .mmw-option:has(input:checked) { border-color: #8d7a57; background: #c7b28a08; }
#mmd-model-wish-v1 .mmw-option-copy { min-width: 0; flex: 1; }
#mmd-model-wish-v1 .mmw-option-copy strong { display: block; font-size: 13px; font-weight: 500; letter-spacing: .01em; }
#mmd-model-wish-v1 .mmw-option-copy small { display: block; margin-top: 3px; color: var(--mmw-muted); font-size: 11px; line-height: 1.8; }
#mmd-model-wish-v1 .mmw-option-arrow { color: var(--mmw-gold); font-size: 18px; }
#mmd-model-wish-v1 .mmw-privacy-note { margin-top: 14px; color: var(--mmw-muted); font-size: 11px; line-height: 1.8; }
#mmd-model-wish-v1 .mmw-submit-area { margin-top: 28px; }
#mmd-model-wish-v1 .mmw-auth-note { display: flex; align-items: flex-start; gap: 9px; padding: 15px 0; border-top: 1px solid var(--mmw-line); color: var(--mmw-muted); font-size: 11px; line-height: 1.8; }
#mmd-model-wish-v1 .mmw-auth-note > span { width: 5px; height: 5px; flex: 0 0 5px; margin-top: 7px; border-radius: 50%; background: var(--mmw-gold); }
#mmd-model-wish-v1 .mmw-auth-note.is-ready > span { background: #b7c4a5; }
#mmd-model-wish-v1 .mmw-error { color: #efc0a4; font-size: 13px; line-height: 1.8; }
#mmd-model-wish-v1 .mmw-error:not(:empty) { padding: 13px 15px; margin-bottom: 16px; border: 1px solid #efc0a444; border-radius: 3px; background: #efc0a408; }
#mmd-model-wish-v1 .mmw-submit { display: flex; align-items: center; justify-content: space-between; gap: 15px; width: 100%; min-height: 58px; padding: 15px 22px; border: 1px solid var(--mmw-gold); border-radius: 3px; background: var(--mmw-gold); color: #201e17; font-size: 16px; font-weight: 500; transition: background .2s, transform .2s; }
#mmd-model-wish-v1 .mmw-submit > span:last-child { font-size: 24px; font-weight: 400; }
#mmd-model-wish-v1 .mmw-submit-note { margin-top: 13px; color: var(--mmw-muted); text-align: center; font-size: 11px; }
#mmd-model-wish-v1 .mmw-success { max-width: 650px; margin: 55px auto 75px; padding: 36px 20px; border: 1px solid var(--mmw-line); background: var(--mmw-panel); text-align: center; scroll-margin-top: 25px; }
#mmd-model-wish-v1 .mmw-success-seal { display: grid; place-items: center; width: 48px; height: 48px; margin: 0 auto 25px; border: 1px solid var(--mmw-gold); border-radius: 50%; color: var(--mmw-gold); font-size: 20px; }
#mmd-model-wish-v1 .mmw-success h2 { margin: 18px 0; color: var(--mmw-cream); font-size: clamp(27px,5vw,37px); line-height: 1.6; font-weight: 400; }
#mmd-model-wish-v1 .mmw-success > p:not(.mmw-eyebrow) { color: var(--mmw-muted); font-size: 13px; line-height: 1.9; }
#mmd-model-wish-v1 .mmw-success .mmw-success-scope { margin: 20px 0 28px; font-size: 11px; }
#mmd-model-wish-v1 .mmw-back { display: inline-flex; align-items: center; justify-content: space-between; gap: 30px; min-height: 48px; padding: 12px 22px; border: 1px solid var(--mmw-gold); color: var(--mmw-gold); font-size: 12px; }
#mmd-model-wish-v1 .mmw-closing { position: relative; margin: 0 0 40px; overflow: hidden; border: 1px solid var(--mmw-line); border-radius: 4px; background: var(--mmw-panel); }
#mmd-model-wish-v1 .mmw-closing > img { display: block; width: 100%; height: auto; aspect-ratio: 1672 / 941; object-fit: contain; }
#mmd-model-wish-v1 .mmw-closing figcaption { padding: 22px; }
#mmd-model-wish-v1 .mmw-closing-title { display: block; margin-top: 10px; color: var(--mmw-cream); font-family: var(--mmw-serif); font-size: 38px; font-weight: 400; line-height: 1.1; letter-spacing: -.025em; }
#mmd-model-wish-v1 .mmw-closing-title em { color: var(--mmw-gold); }
#mmd-model-wish-v1 .mmw-closing .mmw-closing-note { margin-top: 12px; color: var(--mmw-muted); font-size: 12px; line-height: 1.8; }
#mmd-model-wish-v1 .mmw-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 25px 0 32px; border-top: 1px solid var(--mmw-line); font-size: 10px; }
#mmd-model-wish-v1 .mmw-footer > span:first-child { letter-spacing: .18em; }
#mmd-model-wish-v1 .mmw-footer > span:nth-child(2) { order: 3; width: 100%; color: var(--mmw-muted); font-size: 8px; letter-spacing: .15em; }
#mmd-model-wish-v1 .mmw-footer a { display: inline-flex; min-height: 44px; align-items: center; gap: 12px; color: var(--mmw-gold); letter-spacing: .06em; }
#mmd-model-wish-v1 .mmw-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (hover: hover) {
  #mmd-model-wish-v1 .mmw-submit:not(:disabled):hover { background: #d6c5a5; transform: translateY(-1px); }
  #mmd-model-wish-v1 .mmw-option:hover { border-color: #8d7a57; }
  #mmd-model-wish-v1 .mmw-question > summary:hover .mmw-question-title > span:last-child { color: var(--mmw-gold); }
  #mmd-model-wish-v1 .mmw-next:hover, #mmd-model-wish-v1 .mmw-footer a:hover { color: var(--mmw-cream); }
}
@media (min-width: 600px) {
  #mmd-model-wish-v1 .mmw-shell { width: min(1120px, calc(100% - 80px)); }
  #mmd-model-wish-v1 .mmw-topbar { min-height: 100px; }
  #mmd-model-wish-v1 .mmw-brand { gap: 14px; }
  #mmd-model-wish-v1 .mmw-brand img { width: 50px; height: 50px; }
  #mmd-model-wish-v1 .mmw-brand > span { font-size: 12px; }
  #mmd-model-wish-v1 .mmw-session { font-size: 12px; }
  #mmd-model-wish-v1 .mmw-hero { padding-top: 48px; }
  #mmd-model-wish-v1 .mmw-hero-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; }
  #mmd-model-wish-v1 .mmw-hero-note { margin: 0 0 4px; font-size: 13px; }
  #mmd-model-wish-v1 .mmw-portrait { margin-top: 38px; }
  #mmd-model-wish-v1 .mmw-portrait figcaption > span { max-width: none; font-size: 10px; }
  #mmd-model-wish-v1 .mmw-portrait figcaption a { font-size: 13px; }
  #mmd-model-wish-v1 .mmw-form-wrap { padding-top: 58px; }
  #mmd-model-wish-v1 .mmw-question > summary { gap: 18px; padding: 24px 0; }
  #mmd-model-wish-v1 .mmw-question-title { font-size: 20px; }
  #mmd-model-wish-v1 .mmw-question-body { padding-left: 46px; padding-bottom: 26px; }
  #mmd-model-wish-v1 textarea { min-height: 210px; padding: 24px; }
  #mmd-model-wish-v1 .mmw-form-caption > span:first-child { font-size: 9px; }
  #mmd-model-wish-v1 .mmw-media-update > summary { padding: 21px; gap: 16px; }
  #mmd-model-wish-v1 .mmw-media-icon { display: block; }
  #mmd-model-wish-v1 .mmw-media-body { padding: 0 21px 21px; }
  #mmd-model-wish-v1 .mmw-option { padding: 20px; gap: 16px; }
  #mmd-model-wish-v1 .mmw-option-copy strong { font-size: 14px; }
  #mmd-model-wish-v1 .mmw-option-copy small { font-size: 12px; }
  #mmd-model-wish-v1 .mmw-footer > span:nth-child(2) { order: 0; width: auto; }
  #mmd-model-wish-v1 .mmw-closing { margin-bottom: 56px; }
  #mmd-model-wish-v1 .mmw-closing figcaption { position: absolute; left: 4%; top: 50%; width: 34%; padding: 0; transform: translateY(-50%); }
  #mmd-model-wish-v1 .mmw-closing-title { font-size: clamp(34px, 4.6vw, 60px); }
  #mmd-model-wish-v1 .mmw-closing-title em { display: block; }
  #mmd-model-wish-v1 .mmw-closing .mmw-closing-note { color: #d5cdbd; }
}
@media (min-width: 900px) {
  #mmd-model-wish-v1 .mmw-hero h1 { font-size: 82px; }
  #mmd-model-wish-v1 .mmw-hero-note { font-size: 15px; padding-right: 5px; }
  #mmd-model-wish-v1 .mmw-form-wrap { display: grid; grid-template-columns: minmax(0, .78fr) minmax(0, 1.5fr); gap: 70px; padding: 68px 0 96px; }
  #mmd-model-wish-v1 .mmw-letter-intro { padding-top: 10px; }
  #mmd-model-wish-v1 .mmw-anniversary { display: block; margin-bottom: 42px; font-family: var(--mmw-serif); font-size: 106px; line-height: .85; letter-spacing: -.065em; color: var(--mmw-gold); }
  #mmd-model-wish-v1 .mmw-anniversary span { display: block; margin-top: 20px; font-family: "Noto Sans Thai",sans-serif; font-size: 8px; line-height: 1.5; letter-spacing: .23em; color: var(--mmw-muted); }
  #mmd-model-wish-v1 .mmw-letter-intro h2 { margin-top: 20px; font-size: 30px; line-height: 1.5; }
  #mmd-model-wish-v1 .mmw-letter-intro h2 br, #mmd-model-wish-v1 .mmw-desktop-break { display: initial; }
  #mmd-model-wish-v1 .mmw-intro-foot { margin-top: 32px; }
}
@media (prefers-reduced-motion: reduce) {
  #mmd-model-wish-v1 *, #mmd-model-wish-v1 *::before, #mmd-model-wish-v1 *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}

</style>
```

JavaScript — Page Settings → Before </body>

```html
<script id="mmd-model-wish-v8-runtime">
(() => {
  'use strict';
  const R = document.querySelector('#mmd-model-wish-v1[data-model-wish]');
  if (!R || R.dataset.ready === '1') return;
  const $ = selector => R.querySelector(selector);
  const form = $('[data-wish-form]');
  const birthday = $('[data-birthday-wish]');
  const mmd = $('[data-mmd-message]');
  const privatePer = $('[data-private-per]');
  const telegram = $('[data-telegram-consent]');
  const past = $('[data-past-clients-consent]');
  const mediaInput = $('[data-media-input]');
  const mediaGrid = $('[data-media-grid]');
  const mediaCount = $('[data-media-count]');
  const mediaNote = $('[data-media-note]');
  const error = $('[data-error]');
  const submit = $('[data-submit]');
  const submitLabel = $('[data-submit-label]');
  const chip = $('[data-session-chip]');
  const authNote = $('[data-auth-note]');
  const success = $('[data-success]');
  const scope = $('[data-success-scope]');
  const questions = [...R.querySelectorAll('[data-question]')];
  if (![form, birthday, mmd, privatePer, telegram, past, mediaInput, mediaGrid,
    mediaCount, mediaNote, error, submit, submitLabel, chip, authNote, success, scope].every(Boolean)) return;
  R.dataset.ready = '1';

  const PROFILE = R.dataset.profileEndpoint || '/v1/model/profile';
  const SUBMIT = R.dataset.submitEndpoint || '/v1/model/session/current?mode=year6_direct_wish';
  const MEDIA_UPLOAD = R.dataset.mediaUploadEndpoint || '/v1/model/media/upload';
  const LIFF_ID = R.dataset.liffId || '2010864854-N34SgCqq';
  const DRAFT = 'mmd_model_wish_draft_v4';
  const MAX_FILES = 5, IMAGE_MAX = 10 * 1024 * 1024, VIDEO_MAX = 50 * 1024 * 1024;
  const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  const VIDEOS = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  let authed = false, busy = false, liffLoading = null;
  let selectedFiles = [], uploadedMediaIds = [], previewUrls = [];

  function setError(text) { error.textContent = text || ''; }
  function setChip(mode, text) { chip.className = 'mmw-session' + (mode ? ' ' + mode : ''); chip.textContent = text; }
  function lock(value, label) {
    busy = !!value;
    form.setAttribute('aria-busy', String(busy));
    [submit, birthday, mmd, privatePer, telegram, past, mediaInput].forEach(el => { el.disabled = busy; });
    submitLabel.textContent = label || (busy ? 'กำลังส่งให้เปอร์…' : 'ส่งให้เปอร์');
  }
  function updateCounts() {
    let written = 0;
    [['birthday', birthday, 700], ['mmd', mmd, 1000], ['private', privatePer, 1000]].forEach(([key, el, max]) => {
      const counter = $('[data-count="' + key + '"]');
      if (counter) counter.textContent = el.value.length + ' / ' + max;
      const filled = !!el.value.trim(), section = el.closest('[data-question]');
      if (filled) written++;
      if (section) {
        section.classList.toggle('is-filled', filled);
        const state = section.querySelector('[data-question-state]');
        if (state) { state.textContent = filled ? '✓' : ''; state.setAttribute('aria-label', filled ? 'เขียนแล้ว' : 'ยังไม่ได้เขียน'); }
      }
    });
    const total = $('[data-written-count]');
    if (total) total.textContent = written + ' / 3 ข้อความ';
  }
  function saveDraft() {
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ birthday: birthday.value, mmd: mmd.value,
      private_note: privatePer.value, telegram: telegram.checked, past: past.checked })); } catch {}
  }
  function restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
      if (!draft) return;
      birthday.value = String(draft.birthday || '').slice(0, 700);
      mmd.value = String(draft.mmd || '').slice(0, 1000);
      privatePer.value = String(draft.private_note || '').slice(0, 1000);
      telegram.checked = !!draft.telegram; past.checked = !!draft.past;
    } catch {}
  }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT); } catch {} }
  function profileName(p) {
    return p?.model?.per_name || p?.model?.display_name || p?.profile?.per_name || p?.profile?.display_name || p?.per_name || p?.display_name || '';
  }
  async function checkProfile() {
    setChip('', 'กำลังเช็ก LINE');
    try {
      const response = await fetch(PROFILE, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
      if (response.ok) {
        const profile = await response.json();
        if (!profile || typeof profile !== 'object') throw new Error('invalid_profile');
        const name = profileName(profile);
        authed = true; setChip('is-ready', name ? 'LINE พร้อม · ' + name : 'LINE พร้อม');
        authNote.classList.add('is-ready');
        authNote.querySelector('p').textContent = 'ยืนยัน LINE แล้ว · พร้อมส่งจากบัญชี MMD MODEL ของคุณ';
        return true;
      }
    } catch {}
    authed = false; setChip('is-needed', 'ยืนยัน LINE ตอนส่ง');
    authNote.classList.remove('is-ready');
    authNote.querySelector('p').textContent = 'ยืนยัน LINE ตอนส่ง เพื่อให้ข้อความผูกกับบัญชี MMD MODEL ของคุณ';
    return false;
  }
  function loadLiff() {
    if (window.liff) return Promise.resolve(window.liff);
    if (liffLoading) return liffLoading;
    liffLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload = () => window.liff ? resolve(window.liff) : reject(new Error('liff_unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('liff_load_failed')); };
      document.head.appendChild(script);
    }).catch(err => { liffLoading = null; throw err; });
    return liffLoading;
  }
  async function verifyLine() {
    saveDraft(); setError('กำลังยืนยัน LINE ครับ ข้อความที่เขียนไว้ยังอยู่');
    try {
      const liff = await loadLiff();
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return false; }
      const response = await fetch('/v1/model/liff/exchange', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ id_token: liff.getIDToken(), environment: 'published' }) });
      if (!response.ok) throw new Error('exchange');
      const ok = await checkProfile();
      setError(ok ? '' : 'ยังยืนยันบัญชี MMD MODEL ไม่สำเร็จครับ ข้อความที่เขียนไว้ยังอยู่');
      return ok;
    } catch {
      setError('ยืนยัน LINE ไม่สำเร็จครับ ลองเปิดหน้านี้จาก MMD MODEL อีกครั้ง ข้อความที่เขียนไว้ยังอยู่');
      return false;
    }
  }
  function clearPreviews() { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; }
  function fileKind(file) { const type = String(file?.type || '').toLowerCase(); return VIDEOS.has(type) ? 'video' : IMAGES.has(type) ? 'image' : ''; }
  function renderMedia() {
    clearPreviews();
    mediaCount.textContent = selectedFiles.length + ' / 5';
    [...mediaGrid.querySelectorAll('[data-media-slot]')].forEach((slot, i) => {
      slot.classList.toggle('is-uploaded', uploadedMediaIds.length === selectedFiles.length && uploadedMediaIds.length > i);
      slot.innerHTML = '<span>0' + (i + 1) + '</span><em>MEDIA</em>';
      const file = selectedFiles[i];
      if (!file) return;
      const kind = fileKind(file), url = URL.createObjectURL(file);
      previewUrls.push(url);
      const media = document.createElement(kind === 'video' ? 'video' : 'img');
      media.src = url;
      if (kind === 'video') { media.muted = true; media.playsInline = true; media.preload = 'metadata'; }
      else media.alt = 'รูปอัปเดตโปรไฟล์ ' + (i + 1);
      slot.appendChild(media);
      const badge = document.createElement('span');
      badge.className = 'mmw-media-badge'; badge.textContent = kind === 'video' ? 'CLIP' : 'PHOTO'; slot.appendChild(badge);
    });
    if (!selectedFiles.length) mediaNote.textContent = 'ไฟล์จะเข้า Gallery / Intro Video ของคุณ และไม่ถูกแนบไปกับ Telegram หรือข้อความถึงลูกค้าโดยอัตโนมัติ';
    else if (uploadedMediaIds.length === selectedFiles.length) mediaNote.textContent = 'อัปโหลด ' + uploadedMediaIds.length + ' ไฟล์เข้า MMD MODEL เรียบร้อยแล้ว';
    else mediaNote.textContent = 'เลือกแล้ว ' + selectedFiles.length + ' ไฟล์ · จะอัปโหลดเมื่อกด “ส่งให้เปอร์”';
  }
  function validateFiles(files) {
    if (files.length > MAX_FILES) return 'เลือกได้สูงสุด 5 ไฟล์รวมกันครับ';
    for (const file of files) {
      const kind = fileKind(file);
      if (!kind) return 'รองรับ JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV และ WEBM ครับ';
      if (kind === 'image' && file.size > IMAGE_MAX) return 'รูปแต่ละไฟล์รองรับสูงสุด 10 MB ครับ';
      if (kind === 'video' && file.size > VIDEO_MAX) return 'คลิปแต่ละไฟล์รองรับสูงสุด 50 MB ครับ';
      if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) return 'มีไฟล์ที่อ่านขนาดไม่ได้ครับ ลองเลือกใหม่อีกครั้ง';
    }
    return '';
  }
  async function cleanup(ids) {
    await Promise.allSettled(ids.map(id => fetch('/v1/model/media/' + encodeURIComponent(id), {
      method: 'DELETE', credentials: 'include', headers: { accept: 'application/json' }
    })));
  }
  async function uploadMedia() {
    if (!selectedFiles.length) return [];
    if (uploadedMediaIds.length === selectedFiles.length) return uploadedMediaIds;
    const ids = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i], kind = fileKind(file), data = new FormData();
        lock(true, 'กำลังอัปโหลด ' + (i + 1) + '/' + selectedFiles.length + '…');
        data.append('file', file, file.name); data.append('media_type', kind === 'video' ? 'intro_video' : 'public_gallery');
        const response = await fetch(MEDIA_UPLOAD, { method: 'POST', credentials: 'include', body: data, headers: { accept: 'application/json' } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { const err = new Error(result?.error || 'media_upload_failed'); err.status = response.status; err.code = result?.error || ''; throw err; }
        const id = result?.media?.media_id || result?.media_id || '';
        if (!id) throw new Error('media_id_missing');
        ids.push(id);
      }
      uploadedMediaIds = ids; renderMedia(); return ids;
    } catch (err) { if (ids.length) await cleanup(ids); uploadedMediaIds = []; renderMedia(); throw err; }
  }
  function selectedScope() {
    const selected = [];
    if (telegram.checked) selected.push('Telegram MMD');
    if (past.checked) selected.push('Past Clients · MY MMD');
    if (!selected.length) selected.push('ส่งให้ MMD ตรวจอ่านเท่านั้น');
    if (privatePer.value.trim()) selected.push('ข้อความส่วนตัวถึงพี่เปอร์');
    if (uploadedMediaIds.length) selected.push('อัปเดตโปรไฟล์ ' + uploadedMediaIds.length + ' ไฟล์');
    return selected;
  }
  function showSuccess() {
    form.closest('.mmw-form-wrap').hidden = true;
    scope.textContent = 'ที่คุณเลือก: ' + selectedScope().join(' · ');
    success.hidden = false; success.focus({ preventScroll: true });
    success.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  async function send() {
    if (busy) return;
    const wish = birthday.value.trim(), mmdText = mmd.value.trim(), privateText = privatePer.value.trim();
    setError('');
    if (!(wish || mmdText || privateText)) {
      setError('เลือกเขียนอย่างน้อย 1 ข้อความก่อนส่งครับ');
      const first = birthday.closest('[data-question]');
      if (first) first.open = true;
      birthday.focus(); return;
    }
    saveDraft(); lock(true, 'กำลังเตรียมส่ง…');
    let phase = 'auth';
    try {
      if (!authed && !(await verifyLine())) return;
      phase = 'upload';
      if (selectedFiles.length) await uploadMedia();
      phase = 'submit'; lock(true, 'กำลังส่งให้เปอร์…');
      const shareable = [wish ? 'อวยพร 6 ปี MMD: ' + wish : '', mmdText ? 'ข้อความถึง MMD: ' + mmdText : ''].filter(Boolean).join('\n\n');
      const response = await fetch(SUBMIT, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ message: shareable, birthday_wish: wish, mmd_message: mmdText,
          private_note_per: privateText, private_note_scope: 'per_only', telegram_consent: !!telegram.checked,
          past_clients_consent: !!past.checked, consent_version: 'model_wish_v5', source: '/sigil/model/wish' }) });
      const result = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        authed = false; setChip('is-needed', 'ยืนยัน LINE ตอนส่ง');
        if (await verifyLine()) setError('ยืนยัน LINE แล้วครับ กดส่งอีกครั้งได้เลย');
        return;
      }
      if (!response.ok || !result || typeof result !== 'object') {
        setError(result?.error === 'model_wish_storage_not_configured'
          ? 'ระบบรับคำอวยพรกำลังเปิดใช้งานครับ ลองส่งอีกครั้งในภายหลัง'
          : 'ยังยืนยันการรับข้อความไม่ได้ครับ ข้อความของคุณยังอยู่ ลองส่งอีกครั้งได้เลย');
        return;
      }
      clearDraft(); showSuccess();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        authed = false; setChip('is-needed', 'ยืนยัน LINE ตอนส่ง');
        if (await verifyLine()) setError('ยืนยัน LINE แล้วครับ กดส่งอีกครั้งได้เลย');
      } else if (err.status === 413) setError('ไฟล์ใหญ่เกินขนาดที่รองรับครับ · รูป 10 MB / คลิป 50 MB');
      else if (err.status === 415) setError('รองรับ JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV และ WEBM ครับ');
      else setError(phase === 'upload' ? 'อัปโหลดไฟล์ไม่สำเร็จครับ ไฟล์ที่เลือกไว้ยังอยู่ ลองส่งอีกครั้งได้เลย' : 'ส่งข้อความไม่สำเร็จครับ ข้อความที่เขียนไว้ยังอยู่ ลองส่งอีกครั้งได้เลย');
    } finally { lock(false); }
  }

  R.querySelectorAll('[data-next-question]').forEach(button => button.addEventListener('click', () => {
    const target = questions[Number(button.dataset.nextQuestion)];
    if (!target) return;
    questions.forEach(section => { section.open = section === target; });
    target.querySelector('textarea')?.focus();
  }));
  mediaInput.addEventListener('click', async event => {
    if (authed) return;
    event.preventDefault();
    if (busy) return;
    lock(true, 'กำลังยืนยัน LINE…');
    try { if (await verifyLine()) setError('ยืนยัน LINE แล้วครับ กด “เลือกรูปหรือคลิป” อีกครั้งได้เลย'); }
    finally { lock(false); }
  });
  mediaInput.addEventListener('change', () => {
    setError('');
    const files = [...(mediaInput.files || [])], message = validateFiles(files);
    if (message) { selectedFiles = []; uploadedMediaIds = []; mediaInput.value = ''; setError(message); }
    else { selectedFiles = files; uploadedMediaIds = []; }
    renderMedia();
  });
  [birthday, mmd, privatePer].forEach(el => el.addEventListener('input', () => { updateCounts(); saveDraft(); }));
  telegram.addEventListener('change', saveDraft); past.addEventListener('change', saveDraft);
  form.addEventListener('submit', event => { event.preventDefault(); if (!busy) send(); });
  restoreDraft(); updateCounts(); renderMedia(); checkProfile();
})();

</script>
```

Replace the existing page Embed, head and footer blocks; do not append this runtime to the old one. Backend endpoints, LINE LIFF ID and full return URL are preserved. Draft only; visual browser review and a real authenticated LINE submission remain unverified.
