// Reuse the existing authenticated customer transport and its original handlers.
export function installConsoleCustomerUpdates(doc = document) {
  const root=doc.getElementById('sigil-model-console-v3');
  if(!root)return null;
  if(root._consoleCustomerUpdates)return root._consoleCustomerUpdates;
  function sync(){
    const panel=root.querySelector('[data-mmd-travel="model"]');
    if(!panel)return;
    const legacy=root.querySelector('[data-note]')?.closest('details.smcv3-card');
    if(legacy)legacy.replaceWith(panel);
    panel.dataset.consoleCustomerUpdates='1';
    const lang=doc.documentElement.lang,english=lang.startsWith('en'),chinese=lang.startsWith('zh');
    const title=english?'Customer conversation':chinese?'与客户沟通':'คุยกับลูกค้า';
    const heading=panel.querySelector('h3');if(heading&&heading.textContent!==title)heading.textContent=title;
    const input=panel.querySelector('textarea');
    if(input)input.placeholder=english?'e.g. Traffic is heavy. I may arrive 15 minutes late.':chinese?'例如：路况较堵，预计晚到 15 分钟。':'เช่น รถติด น่าจะถึงช้าประมาณ 15 นาทีครับ';
  }
  const observer=new doc.defaultView.MutationObserver(sync);
  observer.observe(root,{childList:true,subtree:true,characterData:true});
  observer.observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
  const refresh=()=>root.querySelector('[data-refresh]')?.click();
  root.addEventListener('mmd:model-session-refresh',refresh);
  const controller={sync,destroy(){observer.disconnect();root.removeEventListener('mmd:model-session-refresh',refresh);delete root._consoleCustomerUpdates;}};
  root._consoleCustomerUpdates=controller;sync();return controller;
}
