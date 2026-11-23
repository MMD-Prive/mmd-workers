const logoBase = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/";
const logos = {
  dark: logoBase + "6a8605ce469f1080c3c57ebe_mms-logo-horizontal-light.svg",
  light: logoBase + "6a8d54313e98a92e8d74d11f_mms-logo-horizontal-dark.svg",
};

const hubPath = "/therapists";
const applyPath = "/apply/mms-therapist";
const links = [
  [hubPath, "หน้า Therapist"],
  ["/apply/mms-therapist-benefits", "ข้อดี"],
  ["/apply/mms-therapist-rules", "กติกา"],
  ["/male-massage/apply/mms-fast-track", "Fast Track"],
  [applyPath, "สมัคร"],
  ["/male-massage/therapists/login", "เข้า MY THERAPIST"],
];

export const mmsTherapistNavigationCss = `
[data-mms-therapist-nav].mms-therapist-header{
  --mms-nav-bg:#0b2118;
  --mms-nav-fg:#fffdf8;
  --mms-nav-hover:#204330;
  --mms-nav-accent:#d5ee91;
  --mms-nav-line:#395342;
  position:relative;z-index:70;display:block;
  box-sizing:border-box;min-height:60px;padding:0;
  background:var(--mms-nav-bg);color:var(--mms-nav-fg);
  border:0;border-bottom:1px solid var(--mms-nav-line);
}
[data-mms-therapist-nav][data-tone="light"]{
  --mms-nav-bg:#f8faf6;--mms-nav-fg:#173126;
  --mms-nav-hover:#e7efe3;--mms-nav-accent:#245139;--mms-nav-line:#d4e0d5;
}
[data-mms-therapist-nav] .mms-therapist-header-inner{
  box-sizing:border-box;width:min(100%,1120px);min-height:60px;margin-inline:auto;
  padding-inline:max(12px,env(safe-area-inset-left)) max(12px,env(safe-area-inset-right));
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
[data-mms-therapist-nav] .mms-therapist-logo{
  display:inline-flex;align-items:center;min-height:44px;text-decoration:none;
}
[data-mms-therapist-nav] .mms-therapist-logo img{
  display:block;width:clamp(118px,35vw,148px);height:auto;max-height:none;object-fit:contain;
}
[data-mms-therapist-nav] details.mms-therapist-disclosure{
  position:relative;flex:none;margin:0;padding:0;border:0;background:transparent;
}
[data-mms-therapist-nav] .mms-therapist-disclosure>summary{
  display:flex;align-items:center;justify-content:center;gap:8px;
  min-height:44px;margin:0;padding:0 13px;border:1px solid var(--mms-nav-line);
  border-radius:10px;list-style:none;color:var(--mms-nav-fg);background:var(--mms-nav-bg);
  font-weight:700;font-size:14px;line-height:1.2;cursor:pointer;white-space:nowrap;
}
[data-mms-therapist-nav] .mms-therapist-disclosure>summary::-webkit-details-marker{display:none}
[data-mms-therapist-nav] .mms-therapist-disclosure>summary::after{
  content:"";width:7px;height:7px;border:solid currentColor;border-width:0 2px 2px 0;
  transform:translateY(-2px) rotate(45deg);
}
[data-mms-therapist-nav] .mms-therapist-disclosure[open]>summary::after{transform:translateY(2px) rotate(225deg)}
[data-mms-therapist-nav] nav.mms-therapist-destinations{
  position:absolute;inset-inline-end:0;top:calc(100% + 6px);box-sizing:border-box;
  width:min(280px,calc(100vw - 32px));max-height:calc(100dvh - 80px);overflow:auto;
  display:grid;gap:2px;margin:0;padding:7px;border:1px solid var(--mms-nav-line);
  border-radius:14px;background:var(--mms-nav-bg);box-shadow:0 12px 30px #0004;
}
[data-mms-therapist-nav] .mms-therapist-destinations a{
  display:flex;align-items:center;min-height:44px;padding:6px 11px;
  border-radius:8px;color:var(--mms-nav-fg);font-size:15px;line-height:1.35;
  text-decoration:none;white-space:normal;
}
[data-mms-therapist-nav] .mms-therapist-destinations a[aria-current="page"],
[data-mms-therapist-nav] .mms-therapist-destinations a:hover{
  background:var(--mms-nav-hover);color:var(--mms-nav-accent);
}
[data-mms-therapist-nav] .mms-therapist-destinations a:last-child{font-weight:750}
[data-mms-therapist-nav] :is(a,summary):focus-visible{
  outline:2px solid var(--mms-nav-accent);outline-offset:-2px;
}
`;

const menuBehavior = `<script>
(() => {
  const header = document.currentScript.closest("[data-mms-therapist-nav]");
  const menu = header.querySelector(".mms-therapist-disclosure");
  const toggle = menu.querySelector("summary");
  document.addEventListener("click", (event) => {
    if (menu.open && (!menu.contains(event.target) || event.target.closest("a"))) menu.open = false;
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      toggle.focus();
    }
  });
})();
</script>`;

export function renderMmsTherapistNavigation(path, { tone = "dark", anchorApplication = false } = {}) {
  const destinations = links.map(([href, label]) => {
    const current = href === path ? ' aria-current="page"' : "";
    const openForm = href === applyPath && anchorApplication
      ? ' data-open-application aria-controls="mta3-apply" aria-expanded="false"'
      : "";
    const target = openForm ? applyPath + "#mta3-apply" : href;
    return `<a href="${target}"${current}${openForm}>${label}</a>`;
  }).join("\n");
  return `<div class="mms-therapist-header-inner">
  <a class="mms-therapist-logo" href="${hubPath}" aria-label="MMS Male Massage หน้า Therapist">
    <img src="${logos[tone]}" alt="MMS Male Massage" width="300" height="70">
  </a>
  <details class="mms-therapist-disclosure">
    <summary>เมนู</summary>
    <nav class="mms-therapist-destinations" aria-label="เมนู MMS Therapist">
      ${destinations}
    </nav>
  </details>
</div>${menuBehavior}`;
}
