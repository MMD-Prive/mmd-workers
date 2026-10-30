// Entry presentation only. Portraits are the approved Public artwork, never a saved selection.
import { ENTRY_SIGIL_PORTRAITS } from './liff-entry-sigil-portraits.js';
import { PUBLIC_PERSONAL_MAIN_IMAGES } from './liff-personal-main-public-images.js';
import { V6_BRAND_ASSETS } from './liff-customer-brand-v6.js';
import { ENTRY_TYPE_CSS, ENTRY_SIGIL_WALL } from './liff-entry-editorial-assets.js';
import { ENTRY_PUBLIC_WORDMARK, ENTRY_PRIVATE_WORDMARK } from './liff-entry-wordmarks.js';

// Decorative Bangkok dusk linework. No network request or member/account information.
const BANGKOK_DUSK = `<svg class="entry-ed-atmosphere" viewBox="0 0 600 300" aria-hidden="true" focusable="false"><defs><radialGradient id="entry-dusk-sky"><stop stop-color="#df794f" stop-opacity=".16"/><stop offset=".6" stop-color="#c91e35" stop-opacity=".06"/><stop offset="1" stop-color="#df794f" stop-opacity="0"/></radialGradient><linearGradient id="entry-dusk-line"><stop stop-color="#8e1020" stop-opacity=".05"/><stop offset=".4" stop-color="#df794f" stop-opacity=".22"/><stop offset=".75" stop-color="#c91e35" stop-opacity=".22"/><stop offset="1" stop-color="#c91e35" stop-opacity=".06"/></linearGradient></defs><ellipse cx="442" cy="123" rx="230" ry="150" fill="url(#entry-dusk-sky)"/><g fill="none" stroke="url(#entry-dusk-line)" stroke-width="1"><path d="M0 242H600M210 232H600M250 220H600"/><path d="M80 242v-23h28v-29h20v52m8 0v-44h30v44m9 0v-73h19v-18h8v-10h3v10h8v18h16v73m14 0v-55h30v55m10 0v-96h30v-24h9v-29h3v29h9v24h22v96m16 0v-75h12v-18h16v-15h21v15h-9v23h-10v16h22v54m16 0v-100h14v-16h11v-17h14v133m15 0v-53h26v53m13 0v-80h34v80m12 0v-27h28v27"/><path d="M304 201c44-24 88-25 133-3M359 82a47 47 0 0 1 93 0M350 82h112"/></g></svg>`;

const PORTRAITS = [['hima','HIMA'],['hiro','HIRO'],['hiei','HIEI'],['hito','HITO']];
const ENTRY_COPY = {
  th:{group:'รู้จัก Companion ทั้ง 4 คน',section:'ผู้ช่วยส่วนตัวของคุณ',note:'เลือกผู้ช่วยที่เข้ากับคุณ หลังเข้าใช้งาน',headline:'ทุกนัดหมาย',second:'ในจังหวะของคุณ',body:'นัดหมาย สมาชิก และผู้ช่วยส่วนตัว',continuity:'ดูแลต่อเนื่องใน',login:'ยืนยันผ่าน LINE',loginLabel:'ยืนยันตัวตนผ่าน LINE',remember:'ระบบจำการเข้าสู่ระบบในอุปกรณ์นี้ 30 วัน',logout:'ออกจากระบบได้ทุกเมื่อ',language:'ภาษา'},
  en:{group:'Meet your four Companions',section:'YOUR PERSONAL COMPANION',note:'Choose your Companion after signing in.',headline:'Every appointment.',second:'At your own pace.',body:'Appointments, membership and your Companion.',continuity:'Together in',login:'Continue with LINE',loginLabel:'Verify your identity with LINE',remember:'Stay signed in on this device for 30 days.',logout:'Sign out whenever you like.',language:'Language'},
  zh:{group:'认识四位专属助手',section:'您的专属助手',note:'登录后，选择适合您的助手。',headline:'每次预约',second:'尽随您的节奏',body:'预约、会员信息与专属助手',continuity:'尽在',login:'通过 LINE 登录',loginLabel:'通过 LINE 验证身份',remember:'此设备可保持登录状态 30 天',logout:'您可以随时退出登录',language:'语言'},
};
export function renderEditorialEntry(language='th') {
  const lang=Object.hasOwn(ENTRY_COPY,language)?language:'th';
  const c=ENTRY_COPY[lang];
  return `<section id="intro-screen" class="intro-screen my-mmd-welcome" data-entry-editorial aria-labelledby="intro-title">
    <header class="entry-ed-header"><div class="entry-ed-house"><img class="entry-ed-public-name" src="${V6_BRAND_ASSETS.public}" width="30" height="30" alt="MMD Privé"><img class="entry-ed-private-name" src="${V6_BRAND_ASSETS.private}" width="30" height="30" alt="SĪGIL"><span class="entry-ed-public-name">MMD PRIVÉ</span><span class="entry-ed-private-name">SĪGIL system</span></div><span class="entry-ed-city">BANGKOK / TH</span></header>
    ${BANGKOK_DUSK}
    <div class="entry-ed-content">
      <p class="entry-ed-eyebrow"><span aria-hidden="true"></span> CURATED MALE MODELS</p>
      <h1 id="intro-title" class="entry-ed-title"><span class="entry-ed-public-name"><span class="entry-ed-sr">MY MMD</span>${ENTRY_PUBLIC_WORDMARK}</span><span class="entry-ed-private-name"><span class="entry-ed-sr">MY SĪGIL</span>${ENTRY_PRIVATE_WORDMARK}</span></h1>
      <p class="entry-ed-tagline">Discreet by desire,<br>Elegance by choice.</p>
      <section class="entry-ed-companions" aria-label="${c.group}">
        <div class="entry-ed-section-label"><span>${c.section}</span></div>
        <div class="entry-ed-portraits">${PORTRAITS.map(([id,name])=>`<figure class="entry-ed-portrait"><div class="entry-ed-photo" style="--entry-private-portrait:url('${ENTRY_SIGIL_PORTRAITS[id]}')"><img src="${PUBLIC_PERSONAL_MAIN_IMAGES[id]}" alt="${name} · Companion" width="360" height="450" decoding="async"></div><figcaption>${name}</figcaption></figure>`).join('')}</div>
        <p class="entry-ed-companion-note">${c.note}</p>
      </section>
      <div class="entry-ed-welcome"><h2>${c.headline}<br><span>${c.second}</span></h2><p>${c.body}<br>${c.continuity} <span class="entry-ed-public-name">MY MMD</span><span class="entry-ed-private-name">MY SĪGIL</span></p></div>
      <div class="entry-ed-action"><button id="intro-continue" class="intro-continue" type="button" aria-label="${c.loginLabel}" data-entry-continue="${c.login}" aria-expanded="false" disabled><span>${c.login}</span><span aria-hidden="true">→</span></button><p class="remember-login-note">${c.remember}<br>${c.logout}</p></div>
    </div>
    <footer class="entry-ed-footer"><span class="entry-ed-public-name">MMD PRIVÉ</span><span class="entry-ed-private-name">SĪGIL system</span><nav class="entry-ed-languages" aria-label="${c.language}">${[['th','ไทย'],['en','EN'],['zh','中文']].map(([code,label])=>`<button type="button" data-entry-language="${code}" aria-pressed="${code===lang}">${label}</button>`).join('')}</nav></footer>
  </section>`;
}

export const ENTRY_EDITORIAL_CSS = `
${ENTRY_TYPE_CSS}
/* Entry presentation only. Account, signup, loader and member Home retain their owners. */
body:not(.signup-mode):not(.app-entered){--ed-bg:#f9f9f9;--ed-ink:#202320;--ed-muted:#666861;--ed-line:#d8d5cc;--ed-accent:#c91e35;background:var(--ed-bg)!important}
body:not(.signup-mode):not(.app-entered) main{width:100%!important;max-width:460px!important;margin:0 auto!important;padding:0!important;border:0!important;border-radius:0!important;background:var(--ed-bg)!important;box-shadow:none!important;overflow:visible}
body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial]{box-sizing:border-box;display:flex;flex-direction:column;min-height:100svh;background:var(--ed-bg);color:var(--ed-ink);padding:max(22px,env(safe-area-inset-top)) 24px max(16px,env(safe-area-inset-bottom));font-family:EntryUI,EntryThai,system-ui,sans-serif;position:relative;isolation:isolate;overflow:hidden}
#intro-screen[data-entry-editorial] *,#intro-screen[data-entry-editorial] *::before,#intro-screen[data-entry-editorial] *::after{box-sizing:border-box}
#intro-screen[data-entry-editorial]::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0}
#intro-screen .entry-ed-header,#intro-screen .entry-ed-content,#intro-screen .entry-ed-footer{position:relative;z-index:1}
#intro-screen .entry-ed-atmosphere{position:absolute;pointer-events:none;top:52px;right:-60px;width:540px;max-width:none;height:270px;z-index:0}
#intro-screen[data-entry-editorial] .entry-ed-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:1px solid var(--ed-line)}
#intro-screen .entry-ed-house{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:500;letter-spacing:.16em}
#intro-screen .entry-ed-house img{width:30px;height:30px;object-fit:contain}
#intro-screen .entry-ed-city{color:var(--ed-muted);font-size:9px;letter-spacing:.12em}
#intro-screen .entry-ed-content{flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:21px}
#intro-screen .entry-ed-eyebrow{display:flex;align-items:center;gap:7px;margin:0 0 2px;font-size:8px;letter-spacing:.18em;font-weight:500;color:var(--ed-muted)}
#intro-screen .entry-ed-eyebrow>span{width:16px;height:1px;background:var(--ed-accent)}
#intro-screen .entry-ed-title{display:block;position:relative;margin:0;color:var(--ed-ink);line-height:1}
#intro-screen .entry-ed-title>span{display:block;width:100%;max-width:340px}
#intro-screen .entry-ed-wordmark{display:block;width:100%;height:auto;overflow:visible}
#intro-screen .entry-ed-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
#intro-screen .entry-ed-tagline{margin:0 0 23px;font-family:EntryDisplay,serif;font-style:italic;font-size:16px;line-height:1.35;letter-spacing:.005em;color:var(--ed-muted)}
#intro-screen .entry-ed-companions{margin:0}
#intro-screen .entry-ed-section-label{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;color:var(--ed-muted);font-size:9px;font-weight:500;letter-spacing:.08em}
#intro-screen .entry-ed-portraits{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;align-items:start}
#intro-screen .entry-ed-portrait{min-width:0;margin:0}
#intro-screen .entry-ed-portrait:nth-child(even){padding-top:12px}
#intro-screen .entry-ed-photo{position:relative;aspect-ratio:.6;overflow:hidden;background:#e5ded1;border-radius:38px 38px 3px 3px}
#intro-screen .entry-ed-photo img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 12%;filter:saturate(.85)}
#intro-screen .entry-ed-portrait figcaption{margin-top:8px;font-size:9px;font-weight:500;letter-spacing:.15em;text-align:center}
#intro-screen .entry-ed-companion-note{margin:10px 0 0;font-size:10px;color:var(--ed-muted);line-height:1.6}
#intro-screen .entry-ed-welcome{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:22px 0 21px;padding-top:18px;border-top:1px solid var(--ed-line)}
body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial] .entry-ed-welcome h2{flex:1;min-width:0;margin:0;font-family:EntryUI,EntryThai,system-ui,sans-serif!important;font-size:20px;line-height:1.5;font-weight:500;letter-spacing:-.03em}
#intro-screen .entry-ed-welcome h2 span{color:var(--ed-muted);font-weight:400}
#intro-screen .entry-ed-welcome p{max-width:46%;overflow-wrap:anywhere;margin:0;font-size:10px;line-height:1.7;color:var(--ed-muted);text-align:right}
body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial] .intro-continue{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;max-width:none;width:100%;padding:10px 12px 10px 18px;margin:0;border:0;border-radius:4px;background:linear-gradient(135deg,#c91e35,#8e1020)!important;color:#fffaf3!important;box-shadow:none;font:500 14px/1.5 EntryUI,EntryThai,system-ui,sans-serif;letter-spacing:0;cursor:pointer;transition:filter .15s ease}
body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial] :is(button,.intro-continue){font-family:EntryUI,EntryThai,system-ui,sans-serif!important}
#intro-screen[data-entry-editorial] .intro-continue:hover:not(:disabled){filter:brightness(1.1)}
#intro-screen[data-entry-editorial] .intro-continue:disabled{opacity:.5;cursor:wait}
#intro-screen[data-entry-editorial] .intro-continue>span:last-child{display:grid;place-items:center;width:34px;height:34px;border:1px solid #ffffff55;border-radius:50%;font-size:22px;line-height:1}
#intro-screen[data-entry-editorial] .remember-login-note{max-width:none;text-align:center;margin:11px 0 0;font-size:9px;line-height:1.6;color:var(--ed-muted);opacity:1}
#intro-screen .entry-ed-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:24px;padding-top:12px;border-top:1px solid var(--ed-line);font-size:8px;letter-spacing:.12em;color:var(--ed-muted)}
#intro-screen .entry-ed-private-name,#intro-screen .entry-ed-title>.entry-ed-private-name{display:none}
body[data-brand-audience="private"]:not(.signup-mode):not(.app-entered){--ed-bg:#0b0e10;--ed-ink:#f3f0e8;--ed-muted:#c6bcaa;--ed-line:#c9b38a40;--ed-accent:#c9b38a}
body[data-brand-audience="private"] #intro-screen[data-entry-editorial]::before{background:linear-gradient(180deg,#0b0e1026 0%,#0b0e1077 38%,#0b0e10e8 70%,#0b0e10 100%),url('${ENTRY_SIGIL_WALL}') 52% 0 / cover no-repeat;opacity:.75}
body[data-brand-audience="private"] #intro-screen .entry-ed-atmosphere{display:none}
body[data-brand-audience="private"] #intro-screen .entry-ed-photo::before{content:"";position:absolute;inset:0;background:var(--entry-private-portrait) 50% 12% / cover no-repeat}
body[data-brand-audience="private"] #intro-screen .entry-ed-photo img{visibility:hidden}
body[data-brand-audience="private"] #intro-screen .entry-ed-photo{outline:1px solid #c9b38a30;outline-offset:-1px}
body[data-brand-audience="private"] #intro-screen[data-entry-editorial] .intro-continue{color:#191714!important;background:linear-gradient(105deg,#c9b38a,#e7d7ad 48%,#c9b38a)!important}
body[data-brand-audience="private"] #intro-screen .entry-ed-private-name{display:inline}
body[data-brand-audience="private"] #intro-screen .entry-ed-title>.entry-ed-private-name{display:block;color:#dfca98}
body[data-brand-audience="private"] #intro-screen .entry-ed-public-name{display:none}
#intro-screen .entry-ed-languages{display:flex;gap:4px;align-items:center}
#intro-screen .entry-ed-languages button{display:grid;place-items:center;min-width:44px;min-height:44px;padding:0 5px;background:transparent;border:0;border-radius:4px;font:500 10px/1.4 EntryUI,EntryThai,system-ui,sans-serif;color:var(--ed-muted);cursor:pointer}
#intro-screen .entry-ed-languages button[aria-pressed="true"]{color:var(--ed-ink);box-shadow:inset 0 -1px var(--ed-accent)}
body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial] :focus-visible{outline:3px solid var(--ed-accent);outline-offset:4px}
@media(min-width:700px){body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial]{min-height:min(850px,100svh);padding-left:30px;padding-right:30px}}
@media(max-width:360px){body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial]{padding-left:18px;padding-right:18px;padding-top:18px}#intro-screen .entry-ed-content{padding-top:18px}#intro-screen .entry-ed-tagline{margin-bottom:18px}#intro-screen .entry-ed-welcome{margin-top:18px;margin-bottom:18px}body:not(.signup-mode):not(.app-entered) #intro-screen[data-entry-editorial] .entry-ed-welcome h2{font-size:18px}#intro-screen .entry-ed-footer{margin-top:18px}}
@media(max-height:720px){#intro-screen .entry-ed-photo{aspect-ratio:.72}#intro-screen .entry-ed-content{padding-top:16px}#intro-screen .entry-ed-tagline{margin-bottom:16px}#intro-screen .entry-ed-welcome{margin-top:16px;margin-bottom:16px}#intro-screen .entry-ed-footer{margin-top:16px}}
@media(prefers-reduced-motion:reduce){#intro-screen[data-entry-editorial] .intro-continue{transition:none}}
`;
