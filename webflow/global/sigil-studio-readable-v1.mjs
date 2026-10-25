// Presentation only. Keep the launchpad readable after pinned Webflow themes reload.
// The three linked workflow steps and their existing handoff handlers are unchanged.
export const STUDIO_READABLE_CSS = String.raw`
html[data-sigil-internal-theme]:root body:has(#mmdStudioR5,#studioFlow[data-studio-flow]){background:#fff!important;color:#272b30!important;padding-bottom:calc(88px + env(safe-area-inset-bottom,0px))!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5{background:#fff!important;color:#272b30!important;padding:clamp(16px,3vw,32px)!important;box-sizing:border-box;max-width:100%;font-family:inherit!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 *{box-sizing:border-box;text-shadow:none!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-shell{width:100%;max-width:1120px;margin:0 auto;min-width:0}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding:0 0 16px;margin:0 0 20px;border-bottom:1px solid #c7ccd2}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-brand small{display:block;font-size:13px;letter-spacing:.12em}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-brand strong{display:block;font-size:32px;line-height:1.2}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-top-actions{display:flex;flex-wrap:wrap;gap:8px;max-width:100%}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-main{display:grid;gap:16px;min-width:0}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(.se-card,.se-step){background:#fff!important;background-image:none!important;color:#272b30!important;border:1px solid #c7ccd2!important;border-radius:16px;box-shadow:0 3px 14px rgb(39 43 48 / .04)!important;min-width:0}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(h1,h2,h3,strong,b,a){color:#272b30!important;-webkit-text-fill-color:#272b30!important;opacity:1!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(p,small,em,.se-kicker,.se-footer,.se-boundary span){color:#545c66!important;-webkit-text-fill-color:#545c66!important;opacity:1!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-start{padding:clamp(20px,3vw,28px)}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-kicker{font-size:13px;letter-spacing:.1em}
html[data-sigil-internal-theme]:root body #mmdStudioR5 h1{font-size:clamp(28px,3.4vw,44px);line-height:1.2;letter-spacing:-.025em;margin:8px 0 12px;overflow-wrap:anywhere}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-start p{font-size:16px;line-height:1.65;max-width:72ch;margin:0}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-start-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(.se-primary,.se-chip,.se-go){display:inline-flex;align-items:center;justify-content:center;gap:8px;width:fit-content;max-width:100%;min-height:44px;padding:10px 16px;border:1px solid #c47a38!important;border-radius:10px;color:#272b30!important;-webkit-text-fill-color:#272b30!important;font-size:15px!important;font-weight:700;line-height:1.5!important;text-decoration:none!important;white-space:normal;overflow-wrap:anywhere;opacity:1!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(.se-primary,.se-go){background:#fed7aa!important;background-image:none!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-primary{min-height:48px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-chip{background:#fff!important;background-image:none!important;border-color:#929ba6!important}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-flow{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin:0}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step{display:flex;flex-direction:column;align-items:flex-start;position:relative;height:auto;min-height:0;padding:20px;text-decoration:none!important;transform:none!important;transition:background-color .16s,border-color .16s;scroll-margin-block:88px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step b{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;background:#fff7ed!important;border:1px solid #c47a38!important;border-radius:10px;font-size:14px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step em{position:absolute;top:27px;right:20px;font-size:12px;line-height:1.5;font-style:normal;letter-spacing:.06em}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step h3{font-size:24px;line-height:1.3;margin:12px 0 6px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step p{font-size:15px;line-height:1.65;margin:0 0 16px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-go{position:static;inset:auto;margin-top:auto}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-boundary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px 20px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-boundary div{min-width:0;flex:1 1 260px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-boundary strong{display:block;font-size:14px;margin-bottom:4px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-boundary span{font-size:13px;line-height:1.65}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-status{background:#f3f4f6!important;border:1px solid #929ba6!important;border-radius:999px;padding:8px 12px;white-space:normal}
html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:12px}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(a,button):focus-visible{outline:3px solid #9a4a0b!important;outline-offset:3px}
@media(hover:hover){
  html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(.se-primary,.se-step):hover{background:#fff7ed!important;border-color:#9a4a0b!important}
  html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-primary:hover,
  html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step:hover .se-go{background:#fdba74!important}
  html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-chip:hover{background:#fff7ed!important;border-color:#9a4a0b!important}
}
html[data-sigil-internal-theme]:root body #mmdStudioR5 :is(.se-primary,.se-chip,.se-step):active{background:#ffedd5!important;border-color:#9a4a0b!important}
@media(min-width:1100px){html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-flow{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){html[data-sigil-internal-theme]:root body #mmdStudioR5 .se-step{transition:none!important}}

/* Pair the sidebar background and glyph fill even when an older loader runs last. */
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #sigil-workspace-directory,
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #sigil-workspace-directory :is(nav,section,summary){background:#fff!important;color:#272b30!important;border-color:#c7ccd2!important;box-shadow:none!important}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #sigil-workspace-directory :is(summary,h3,a,input,span,strong){color:#272b30!important;-webkit-text-fill-color:#272b30!important;opacity:1!important}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #sigil-workspace-directory a{background:transparent!important;min-height:44px}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #sigil-workspace-directory a:is(:hover,[aria-current="page"]){background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #sigil-workspace-directory :is(a,summary,input):focus-visible{outline:3px solid #9a4a0b!important;outline-offset:2px}
/* Keep all Kenji shortcuts in document flow; leave room for the AI Ops launcher. */
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #mmdK{position:static!important;inset:auto!important;width:auto!important;max-width:calc(100% - 32px)!important;margin:16px!important;padding:12px!important;box-sizing:border-box;display:flex!important;flex-wrap:wrap!important;gap:8px!important;background:#fff!important;color:#272b30!important;border:1px solid #c7ccd2!important;border-radius:14px;box-shadow:none!important}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #mmdK :is(a,b,span,strong){color:#272b30!important;-webkit-text-fill-color:#272b30!important;opacity:1!important}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) #mmdK a{display:inline-flex!important;align-items:center;min-height:44px;background:#fff7ed!important;border:1px solid #c47a38!important;white-space:normal;overflow-wrap:anywhere}
html[data-sigil-internal-theme] body:has(#mmdStudioR5,#studioFlow[data-studio-flow]) .mmd-aiops-btn{bottom:calc(16px + env(safe-area-inset-bottom,0px))!important;right:16px!important;max-width:calc(100vw - 32px)!important;min-height:44px}
`;
