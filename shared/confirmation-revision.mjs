// Bind acknowledgement to the details that were actually displayed. Existing
// clients remain compatible until a canonical change has been approved/applied.
const fields=["fldpnqoIsUMfN7y3c","fldBeG0FkWwa8kgnp","fldiDSz0wW9Ct9I3P","fldIiRpaxoafjTkFt","fldoUDQ8sH93idPx0","fldmwuvOaiCFdzzRa","fldrXQAyOMPCvbOaY","fld6P6if0vDZCeV0C"];
const fail=code=>{throw Object.assign(new Error(code),{status:503});};
export async function confirmationRevision(env,session,sessionId){
  const source=session.fields||{}, linked=source.fld1NL4YdaEQHO2dC||[];
  if(!Array.isArray(linked)||linked.length>100)fail("confirmation_changes_unavailable");
  let required=false,blocked=false,versions=[];
  if(linked.length){
    const url=new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS||"tblhQGfJc4GgiteZr")}`);
    url.searchParams.set("filterByFormula",`{session_id}='${String(sessionId).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}'`);
    url.searchParams.set("returnFieldsByFieldId","true");url.searchParams.set("pageSize","100");
    for(const f of ["fldbL2Ya44l6xEYe1","fldMD3Fhu0ibDmjk0","fldxg0WIVCmxtdRCF","fldcBkBS70bWBgI8A","fldnnAWYmA0U1q8nX"])url.searchParams.append("fields[]",f);
    const req=new Request(url,{headers:{authorization:`Bearer ${env.AIRTABLE_API_KEY}`}});
    const response=env.AIRTABLE_HTTP?.fetch?await env.AIRTABLE_HTTP.fetch(req):await fetch(req);
    const data=await response.json().catch(()=>null);
    if(!response.ok||!Array.isArray(data?.records)||data.offset)fail("confirmation_changes_unavailable");
    const seen=new Set();
    for(const r of data.records){const f=r.fields||{};
      if(seen.has(r.id)||!linked.includes(r.id)||f.fldMD3Fhu0ibDmjk0!==sessionId||JSON.stringify(f.fldbL2Ya44l6xEYe1)!==JSON.stringify([session.id]))fail("confirmation_changes_ambiguous");
      seen.add(r.id);
      const status=f.fldcBkBS70bWBgI8A;
      if(!["pending_review","approved","applied","rejected","withdrawn"].includes(status))fail("confirmation_changes_ambiguous");
      if(f.fldxg0WIVCmxtdRCF!=="remark"&&["approved","applied"].includes(status)){
        if(!Number.isFinite(Date.parse(f.fldnnAWYmA0U1q8nX)))fail("confirmation_changes_ambiguous");
        required=true;blocked ||= status==="approved";
        versions.push([r.id,status,f.fldnnAWYmA0U1q8nX]);
      }
    }
    if(seen.size!==linked.length)fail("confirmation_changes_incomplete");
  }
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([session.id,fields.map(f=>source[f]??null),versions.sort((a,b)=>a[0].localeCompare(b[0]))])));
  return {confirmation_revision:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join(""),confirmation_revision_required:required,confirmation_change_pending:blocked};
}
