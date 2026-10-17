// Presentation only. Authentication fields, submit handlers and routing stay in admin-login-page.js.
export const ADMIN_LOGIN_CALM_CSS = String.raw`
html:has([data-mmd-login]),html body:has([data-mmd-login]){background:#f3f2ee!important;color-scheme:light}
html body [data-mmd-login]{--text:#303b38;--muted:#606c66;--soft:#606c66;--gold:#52695d;--gold-hi:#52695d;--danger:#a42b38;--ok:#316543;height:auto!important;min-height:100svh!important;overflow:visible!important;background:#f3f2ee!important;color:#303b38!important;font-family:-apple-system,BlinkMacSystemFont,"LINE Seed Sans TH","Noto Sans Thai",sans-serif!important}
html body [data-mmd-login]:before,html body [data-mmd-login]:after{display:none!important}
html body [data-mmd-login] .stage{width:100%!important;height:auto!important;min-height:100svh!important;align-items:center!important;padding:48px 54% 48px 7%!important;margin:0!important}
html body [data-mmd-login] .access-card{width:100%!important;min-width:0!important;max-width:560px!important;max-height:none!important;overflow:visible!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;padding:0!important}
html body [data-mmd-login] .access-card:before{display:none!important}
html body [data-mmd-login] .kicker{display:block!important;color:#52695d!important;font-size:11px!important;letter-spacing:.16em!important;margin:0 0 18px!important}
html body [data-mmd-login] .title{color:#303b38!important;-webkit-text-fill-color:#303b38!important;font:600 clamp(30px,3vw,46px)/1.12 -apple-system,BlinkMacSystemFont,"LINE Seed Sans TH",sans-serif!important;letter-spacing:-.045em!important;white-space:normal!important;margin:0 0 14px!important}
html body [data-mmd-login] .lead{color:#606c66!important;font-size:15px!important;line-height:1.65!important;margin:0 0 28px!important}
html body [data-mmd-login] .rule{display:none!important}
html body [data-mmd-login] .managed-label{color:#69756e!important;font-size:10px!important;letter-spacing:.13em!important;margin:0 0 10px!important}
html body [data-mmd-login] .lanes{gap:12px!important;margin:0 0 12px!important}
html body [data-mmd-login] .lane{min-height:116px!important;padding:16px!important;border:1px solid #d4dad3!important;border-radius:14px!important;background:#fafbf8!important;box-shadow:none!important;color:#303b38!important;transform:none!important}
html body [data-mmd-login] .lane:hover{border-color:#8d9f91!important;background:#f0f4ed!important}
html body [data-mmd-login] .lane.is-active{background:#e6ede3!important;border:2px solid #718b74!important;padding:15px!important}
html body [data-mmd-login] .lane b{color:#303b38!important;font-size:15px!important;margin-top:7px!important}
html body [data-mmd-login] .lane small{color:#606c66!important;font-size:12px!important}
html body [data-mmd-login] .lane-status{width:15px!important;height:15px!important;top:16px!important;right:16px!important;border-color:#8a9c8c!important}
html body [data-mmd-login] .lane.is-active .lane-status:after{background:#52695d!important}
html body [data-mmd-login] .lane-brand{height:30px!important}
html body [data-mmd-login] .lane-brand .mmd-brand{width:80px!important;max-height:30px!important}
html body [data-mmd-login] .lane-brand .mms-brand{width:34px!important;height:30px!important}
html body [data-mmd-login] .account-note{font-size:12px!important;line-height:1.6!important;color:#606c66!important;margin:0 0 24px!important}
html body [data-mmd-login] .panel{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;color:#303b38!important}
html body [data-mmd-login] .panel-head{margin:0 0 18px!important}
html body [data-mmd-login] .panel-head strong{font-size:15px!important;color:#303b38!important}
html body [data-mmd-login] .panel-head span{font-size:12px!important;line-height:1.6!important;color:#606c66!important}
html body [data-mmd-login] form{gap:12px!important}
html body [data-mmd-login] label{color:#46534b!important;font-size:12px!important;letter-spacing:.04em!important;line-height:1.5!important;gap:8px!important}
html body [data-mmd-login] .field{background:#fff!important;border:1px solid #bdc9be!important;border-radius:10px!important;overflow:hidden!important;box-shadow:none!important}
html body [data-mmd-login] .field:focus-within{border-color:#52695d!important;outline:3px solid #52695d26!important;outline-offset:2px!important}
html body [data-mmd-login] input:not([type=hidden]){background:#fff!important;color:#303b38!important;-webkit-text-fill-color:#303b38!important;min-height:52px!important;border:0!important;padding:12px 14px!important;font-size:16px!important;box-shadow:none!important}
html body [data-mmd-login] .toggle{background:#eef2eb!important;color:#465a4c!important;-webkit-text-fill-color:#465a4c!important;border:0!important;min-width:66px!important;font-size:11px!important;letter-spacing:.06em!important}
html body [data-mmd-login] .go{background:#52695d!important;background-image:none!important;border:1px solid #52695d!important;border-radius:10px!important;color:#fff!important;-webkit-text-fill-color:#fff!important;min-height:52px!important;font-size:13px!important;letter-spacing:.08em!important;box-shadow:none!important}
html body [data-mmd-login] .go:hover{background:#405649!important}
html body [data-mmd-login] .go:disabled{background:#dce3d9!important;border-color:#dce3d9!important;color:#526157!important;-webkit-text-fill-color:#526157!important;opacity:1!important}
html body [data-mmd-login] :is(.message,.privacy,.linkbtn,.credit){color:#606c66!important;-webkit-text-fill-color:#606c66!important;font-size:12px!important;line-height:1.6!important}
html body [data-mmd-login] .message.is-error{color:#a42b38!important;-webkit-text-fill-color:#a42b38!important}
html body [data-mmd-login] .credit{border-top:1px solid #d9dfd6!important;margin-top:26px!important;padding-top:16px!important}
html body [data-mmd-login] .credit strong{color:#46534b!important}
html body [data-mmd-login] .duo-wrap{position:fixed!important;inset:24px 24px 24px auto!important;width:46%!important;height:calc(100svh - 48px)!important;min-height:0!important;z-index:0!important;background:#202722!important;border-radius:26px!important;overflow:hidden!important;opacity:1!important}
html body [data-mmd-login] .duo{width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;filter:saturate(.7) brightness(.92)!important;mask-image:none!important}
html body [data-mmd-login] .duo-vignette{background:linear-gradient(180deg,transparent 65%,#18231c66)!important}
html body [data-mmd-login] :is(.sigil-corner,.side-mantra,.secure){display:none!important}
html body [data-mmd-login] .subpanel{border-top:1px solid #d4dad3!important;padding-top:18px!important}
html body [data-mmd-login] .recovery{background:#e6ede3!important;color:#303b38!important;border-color:#bdc9be!important}
html body [data-mmd-login] :is(button,a):focus-visible{outline:3px solid #718b74!important;outline-offset:3px!important}
html body [data-mmd-login] :is(label,p,small,strong,b,span){-webkit-text-fill-color:currentColor}
@media(max-width:900px){
 html body [data-mmd-login] .stage{padding:38px 24px!important;min-height:100svh!important;justify-content:center!important}
 html body [data-mmd-login] .duo-wrap{display:none!important}
 html body [data-mmd-login] .access-card{max-width:480px!important}
 html body [data-mmd-login] .title{font-size:36px!important}
 html body [data-mmd-login] .credit{display:block!important}
}
@media(max-width:460px){html body [data-mmd-login] .stage{padding:28px 20px!important}html body [data-mmd-login] .title{font-size:32px!important}html body [data-mmd-login] .lane{min-height:108px!important;padding:14px!important}html body [data-mmd-login] .lane.is-active{padding:13px!important}}
`;
