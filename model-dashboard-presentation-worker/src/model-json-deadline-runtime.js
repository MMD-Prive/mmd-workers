/** Inline browser runtime, kept as text so bundling cannot inject closure helpers.
 * This is a JSON-only request adapter, not a general Response replacement.
 * Its deadline covers both fetch headers and the complete JSON body.
 */
export const MODEL_JSON_DEADLINE_RUNTIME = `
  async function boundedFetch(url,init,timeoutMs){
    var controller=new AbortController();
    var budget=timeoutMs||15000;
    var deadlineAt=Date.now()+budget;
    var timer;
    var timedOut=false;
    var deadline=new Promise(function(_,reject){
      timer=setTimeout(function(){
        timedOut=true;
        reject(new Error("model_job_request_timeout"));
        controller.abort();
      },budget);
    });
    var operation=(async function(){
      var response=await fetch(url,Object.assign({},init,{signal:controller.signal}));
      var body;
      try{
        body=await response.json();
      }catch(error){
        // Malformed JSON keeps the existing fail-closed caller contract.
        // An aborted body must remain a timeout, never a successful null body.
        if(timedOut||(error&&error.name==="AbortError"))throw error;
        body=null;
      }
      if(timedOut||Date.now()>=deadlineAt){
        controller.abort();
        throw new Error("model_job_request_timeout");
      }
      return {ok:response.ok,status:response.status,json:function(){return Promise.resolve(body);}};
    })();
    try{
      // The race also settles the UI if a WebView/polyfill ignores abort.
      // Late work only produces a value; it cannot navigate or mutate the UI.
      return await Promise.race([operation,deadline]);
    }catch(error){
      if(timedOut||(error&&error.name==="AbortError"))throw new Error("model_job_request_timeout");
      throw error;
    }finally{clearTimeout(timer);}
  }
`;
