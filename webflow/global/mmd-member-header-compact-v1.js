/* Header-only release for PR #3124. Existing DOM and authentication remain authoritative. */
(()=>{const id='mmd-member-header-compact-v1';if(document.getElementById(id))return;const s=document.createElement('style');s.id=id;s.textContent=`
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-inner,.mmdh-header-inner){min-height:54px!important;height:auto!important;padding-block:4px!important;gap:10px!important}
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-inner,.mmdh-header-inner) :is(.mmdg-nav,.mmdh-primary-nav){display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;min-width:0;gap:8px!important;align-items:center!important}
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-nav,.mmdh-primary-nav)>a{min-height:44px!important;white-space:nowrap!important;line-height:1.4!important;padding:8px 10px!important}
#mmd-global-member-control-v1 .mmd-gm-copy{display:flex!important;align-items:center;gap:6px;min-width:0}
#mmd-global-member-control-v1 .mmd-gm-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1000px){
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-nav,.mmdh-primary-nav){grid-template-columns:repeat(3,minmax(0,1fr))!important}
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-inner,.mmdh-header-inner) :is(.mmdg-nav,.mmdh-primary-nav)>a:nth-child(3){display:none!important}
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-menu-button,.mmdh-menu-button){display:grid!important;place-content:center;flex:0 0 44px;min-height:44px}
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-mobile-menu,.mmdh-mobile-menu) nav{grid-template-columns:minmax(0,1fr)!important}
:is(#mmd-global-public-header,[data-mmdh-header]) :is(.mmdg-nav,.mmdh-primary-nav)>a{font-size:13px!important;padding:8px!important}
#mmd-global-member-control-v1 .mmd-gm-copy span{display:none}
}
`;document.head.appendChild(s)})();
