// Blends the preserved Webflow TarT artwork with the current MY MODEL UI.
// Presentation only; all session, profile, job and media behavior stays in the existing runtime.
export const MODEL_DASHBOARD_MOBILE_CSS = `
:root{--mmd-content-max:560px;--mmd-bg:#0b0b0d;--mmd-surface:#151517;--mmd-surface-raised:#1d1d20;--mmd-fg:#f6f2eb;--mmd-muted-fg:#b2ada6;--mmd-muted:var(--mmd-muted-fg);--mmd-primary:#dbc18e;--mmd-border:rgba(225,204,165,.15);--mmd-radius-lg:20px;--mmd-radius-md:14px;--mmd-dock-height:76px}
.app{background:radial-gradient(ellipse at 100% 0,rgba(184,135,70,.07),transparent 480px),var(--mmd-bg)}
.shell{padding:calc(16px + env(safe-area-inset-top)) 18px calc(var(--mmd-dock-height) + env(safe-area-inset-bottom) + 32px)}
.top{margin:-16px -18px 0;padding:14px 18px;background:rgba(11,11,13,.95);backdrop-filter:blur(18px);border-color:var(--mmd-border)}
.brand{font-size:12px;letter-spacing:.14em;gap:10px;color:var(--mmd-fg)}
.brand small{font-size:10px;margin-top:5px;color:var(--mmd-muted-fg)}
.pill{max-width:44%;font-size:10px;line-height:1.4;text-align:center;padding:7px 10px;white-space:normal;background:transparent}
#screen-home .home-hero{position:relative;isolation:isolate;overflow:hidden;min-height:252px;margin-top:18px;border:1px solid rgba(225,204,165,.2);border-radius:22px;background:#14120f;padding:24px 20px;display:flex;flex-direction:column;justify-content:space-between;gap:22px}
.home-hero img{position:absolute;right:0;top:0;width:64%;height:100%;object-fit:cover;object-position:50% 20%;z-index:-2}
.home-hero:after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#13110f 2%,rgba(19,17,15,.92) 34%,rgba(19,17,15,.15) 75%),linear-gradient(0deg,rgba(19,17,15,.87),transparent 55%)}
#screen-home .home-hero .kicker{margin:0;color:#e5cfa8;font-size:10px;letter-spacing:.18em;font-weight:600}
.hero-caption{display:block;margin-top:12px;font-size:12px;line-height:1.8;color:#c7bba9;max-width:42%}
#screen-home .home-hero h1{font-size:clamp(24px,7vw,32px);line-height:1.35;letter-spacing:-.025em;color:#fff5e5;max-width:88%;overflow-wrap:anywhere;text-shadow:0 2px 18px #100c08}
#screen-home .home-hero .sub{margin:6px 0 0;font-size:12px;color:#dfd4c3;line-height:1.65;max-width:95%}
.snapshot{margin-top:12px;border:1px solid var(--mmd-border);border-radius:18px;padding:15px;background:linear-gradient(115deg,rgba(219,193,142,.06),transparent),var(--mmd-surface);gap:10px}
.snapshot strong{font-size:14px;line-height:1.5}.snapshot p{font-size:12px;line-height:1.65}.snapicon{width:32px;height:32px}.snapright b{font-size:17px}.snapright span{font-size:9px;letter-spacing:.08em}
.section{margin-top:24px}.sectionhead{align-items:center;margin-bottom:12px}.sectionhead h2{font-size:17px;line-height:1.4}.sectionhead h2 small{font-size:9px;letter-spacing:.13em;margin-bottom:5px;color:var(--mmd-primary)}
.card{border-radius:18px;background:var(--mmd-surface);box-shadow:none}.pad{padding:17px}.primary{min-height:50px;border:0;background:linear-gradient(115deg,#e2cda6,#c6a46e);color:#21180e;font-size:14px;border-radius:12px}.secondary{min-height:48px}
.quick{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.quick a{min-width:0;min-height:76px;border-radius:16px;padding:14px 12px;gap:10px;font-size:13px;line-height:1.4;background:linear-gradient(145deg,rgba(255,255,255,.025),transparent),var(--mmd-surface)}
.quick a:after{font-size:18px;flex:none}.quick svg{width:20px;height:20px}.quick i{flex:none;color:var(--mmd-primary)}
.guide-card{position:relative;overflow:hidden;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;align-items:center;padding:17px;border:1px solid var(--mmd-border);border-radius:18px;background:var(--mmd-surface);margin-top:22px;min-height:94px}
.guide-card img{width:42px;height:52px;object-fit:cover;object-position:center 22%;border-radius:10px}.guide-card strong{font-size:12px;letter-spacing:.05em;color:var(--mmd-primary)}.guide-card p{margin:5px 0 0;font-size:12px;line-height:1.6;color:var(--mmd-muted-fg)}.guide-card .arrow{color:var(--mmd-primary)}
.first-job{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;padding:14px 2px;margin-top:8px;border-bottom:1px solid var(--mmd-border);color:var(--mmd-muted-fg);font-size:12px;line-height:1.6}.first-job b{display:block;color:var(--mmd-fg);font-weight:600;font-size:13px}.first-job>span:last-child{color:var(--mmd-primary);font-size:20px}
.needs{gap:10px;margin:16px 0}.need{padding:15px;border-radius:16px;align-items:start}.need b{font-size:14px;line-height:1.5}.need span{font-size:12px;line-height:1.65}.need button,.need a{min-height:44px;white-space:normal;font-size:12px}
.dock{width:min(100%,var(--mmd-content-max));min-height:calc(76px + env(safe-area-inset-bottom));padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(15,15,17,.97);border-top:1px solid var(--mmd-border);box-shadow:0 -12px 35px rgba(0,0,0,.15);backdrop-filter:blur(20px)}
.dock a{min-height:54px;gap:5px;color:#a9a49c;font-size:10px}.dock a.active{background:rgba(219,193,142,.08);border-radius:12px;color:var(--mmd-primary)}.dock svg{width:21px;height:21px}
.toast{bottom:calc(90px + env(safe-area-inset-bottom));max-width:calc(100vw - 32px);line-height:1.6}
.view .hero:not(.home-hero){padding-bottom:18px}.view .hero:not(.home-hero) h1{font-size:27px}.field input,.field textarea{font-size:16px}.field label,.checks label{font-size:14px}.seg button{font-size:13px;min-height:48px}
/* Final scoped contrast layer: prevent inherited Webflow text fill/gradient. */
.app h1,.app h2,.app h3,.app .value,.app .snapshot strong{color:var(--mmd-fg);-webkit-text-fill-color:var(--mmd-fg);background-image:none}
.app .sub,.app .label,.app .statusline{color:var(--mmd-muted-fg);-webkit-text-fill-color:var(--mmd-muted-fg)}
.app .home-hero h1{color:#fff5e5;-webkit-text-fill-color:#fff5e5}.app .home-hero .sub{color:#dfd4c3;-webkit-text-fill-color:#dfd4c3}
.app .primary{color:#21180e;-webkit-text-fill-color:#21180e}.app .need b{color:#21180e;-webkit-text-fill-color:#21180e}
@media(max-width:359px){.shell{padding-inline:14px}.top{margin-inline:-14px;padding-inline:14px}.brand{font-size:11px;gap:7px}.snapshot{grid-template-columns:minmax(0,1fr) auto}.snapicon{display:none}.quick a{padding:12px 10px;gap:7px;font-size:12px}.need{grid-template-columns:1fr}.need button,.need a{width:100%}#screen-home .home-hero{padding:20px 17px;min-height:236px}}
@media(min-width:600px){.shell{padding-inline:24px}.top{margin-inline:-24px;padding-inline:24px}#screen-home .home-hero{min-height:278px;padding:27px}.home-hero img{width:58%}}
`;
