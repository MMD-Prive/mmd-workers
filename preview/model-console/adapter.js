(() => {
  const original=window.fetch.bind(window);
  window.fetch=(input,options={})=>{
    const url=new URL(input instanceof Request?input.url:input,location.href);
    if(url.pathname.startsWith('/__preview/'))return original(url.pathname+url.search,options);
    const init=input instanceof Request?{method:input.method,headers:input.headers,...options}:options;
    return original('/__preview/api?path='+encodeURIComponent(url.pathname+url.search),init).then(response=>{
      if(init.method&&init.method!=='GET')window.parent.postMessage({type:'mmd-preview-changed'},location.origin);
      return response;
    });
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link)return;
    const url=new URL(link.href,location.href);
    if(url.hash&&url.pathname===location.pathname)return;
    if(['/aftercare','/sigil/confirm/job-confirmation','/sigil/model/console','/sigil/model/dashboard','/internal/admin/jobs/completion'].includes(url.pathname)){
      event.preventDefault();location.href=url.pathname+'?t=preview-only-not-a-token';return;
    }
    if(url.origin!==location.origin||!url.hash){event.preventDefault();window.parent.postMessage({type:'mmd-preview-link',label:link.textContent},location.origin);}
  });
})();
