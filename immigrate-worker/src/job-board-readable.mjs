// Presentation only, scoped to the existing authenticated Job Board.
export const JOB_BOARD_READABLE_CSS = `
html body #mmd-job-board-workspace#mmd-job-board-workspace{--jb-ink:#252d36;--jb-muted:#536171;--jb-accent:#a34320;color:var(--jb-ink)!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .mmdop__shell{max-width:1040px}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(.hero,.card,#jb-review){background:#fff!important;color:var(--jb-ink)!important;border:1px solid #cbd2da!important;border-radius:18px!important;box-shadow:0 4px 18px #25344708!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .hero{padding:24px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .hero h1{font-size:clamp(32px,5vw,46px)!important;line-height:1.2!important;letter-spacing:-.025em!important;margin:8px 0!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(.kicker,.label,.field span,.step){color:#465467!important;-webkit-text-fill-color:#465467!important;font-size:13px!important;font-weight:600!important;letter-spacing:.02em!important;line-height:1.5!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(p,.hint){color:var(--jb-muted)!important;-webkit-text-fill-color:var(--jb-muted)!important;font-size:15px!important;line-height:1.7!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .steps{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;margin-top:16px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .step{background:#f0f3f6!important;border:1px solid #d6dde4!important;padding:8px 4px!important;border-radius:8px!important;text-transform:none!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(.card,#jb-review){padding:24px!important;margin-top:16px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(.card h2,#jb-review h2){font-size:24px!important;line-height:1.5!important;margin:4px 0 16px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .form{gap:16px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :where(.input,.textarea,select,#jb-review input){background:#fff!important;color:var(--jb-ink)!important;-webkit-text-fill-color:var(--jb-ink)!important;border:1px solid #8d9baa!important;border-radius:10px!important;font-size:16px!important;line-height:1.6!important;min-height:48px!important;padding:10px 12px!important;width:100%!important;min-width:0!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace textarea[name="board_text"]{min-height:180px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(input,textarea)::placeholder{color:#657383!important;-webkit-text-fill-color:#657383!important;opacity:1!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :where(.btn,.mmdop__ghost,#jb-review button,#jb-review figure a){display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:46px!important;padding:10px 16px!important;border:1px solid #8997a5!important;border-radius:10px!important;background:#f0f3f6!important;color:#293749!important;-webkit-text-fill-color:#293749!important;font-size:15px!important;font-weight:600!important;line-height:1.5!important;letter-spacing:0!important;cursor:pointer;text-align:center!important;white-space:normal!important;text-decoration:none!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(#job-board-publish,#jb-search button){background:#a34320!important;color:#fff!important;-webkit-text-fill-color:#fff!important;border-color:#a34320!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(.btn,#jb-review button,#jb-review figure a):hover{filter:brightness(.94)}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(button,a,input,textarea,select):focus-visible{outline:3px solid #245fb4!important;outline-offset:3px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace :is(button,.btn):disabled{background:#e8edf1!important;color:#66717c!important;-webkit-text-fill-color:#66717c!important;border-color:#c8d0d8!important;cursor:not-allowed;filter:none}
html body #mmd-job-board-workspace#mmd-job-board-workspace input[type="checkbox"]{accent-color:#a34320;width:20px!important;height:20px;flex-shrink:0}
html body #mmd-job-board-workspace#mmd-job-board-workspace .status{background:#f1f4f7!important;color:#445367!important;-webkit-text-fill-color:#445367!important;border-color:#cbd2da!important;font-size:15px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .status.good{background:#eaf5ef!important;color:#235d40!important;-webkit-text-fill-color:#235d40!important;border-color:#96bba5!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace .status.bad{background:#fff0ed!important;color:#983327!important;-webkit-text-fill-color:#983327!important;border-color:#d3a29a!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review article{border:1px solid #cbd2da!important;border-radius:12px;padding:18px!important;margin-top:16px;background:#f8fafb!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review h3{font-size:21px;line-height:1.5;overflow-wrap:anywhere}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review .jb-media{grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:16px}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review figure{background:#fff;border:1px solid #d1d9e1;border-radius:12px;padding:10px;overflow:hidden}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review :is(img,video){border-radius:6px;background:#e9edf1!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review figcaption{padding:8px 0;color:#334155!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review figure a{width:100%;font-size:14px!important}
html body #mmd-job-board-workspace#mmd-job-board-workspace [hidden]{display:none!important}
@media(max-width:600px){html body #mmd-job-board-workspace#mmd-job-board-workspace :is(.hero,.card,#jb-review){padding:16px!important}html body #mmd-job-board-workspace#mmd-job-board-workspace .steps{grid-template-columns:repeat(2,minmax(0,1fr))!important}html body #mmd-job-board-workspace#mmd-job-board-workspace .hero .btn{width:auto!important;flex:1}html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review{margin-bottom:16px!important}html body #mmd-job-board-workspace#mmd-job-board-workspace #jb-review article{padding:12px!important}}
`;
