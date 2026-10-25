// Read-only release preflight. Never creates tables, fields or select options.
const token=process.env.MMD_AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const base=process.env.MMD_AIRTABLE_BASE_ID || 'appsV1ILPRfIjkaYg';
if(!token){console.error('MMD_AIRTABLE_TOKEN is required for read-only schema preflight');process.exit(2);}
const response=await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(base)}/tables`,{headers:{authorization:`Bearer ${token}`}});
if(!response.ok){console.error('Airtable schema request failed: HTTP '+response.status);process.exit(2);}
const data=await response.json();const errors=[];
const requirements={
  tblVv58TCbwh5j1fS:['line_user_id'],
  tblC98mKWbzmPuNzX:['fldLTq2kZbyRv22IA','fldojgjSQLaO0uQLX','fldhwC79ndbnEXSZz','fldEcDkF7CH9VixWM','Client'],
  tblWGGJJOx5eBvBZJ:['Payment Reference','session_id','Package Code','payment_stage','Amount','Client','Payment Status','Verification Status'],
  tblfJfM4Sqag9zrLi:['payment_ref','status'],
};
for(const [id,keys] of Object.entries(requirements)){
  const table=data.tables?.find(t=>t.id===id);if(!table){errors.push('missing table '+id);continue;}
  for(const key of keys){const field=table.fields.find(f=>f.id===key||f.name===key);if(!field){errors.push(id+': missing '+key);continue;}
    if(id==='tblC98mKWbzmPuNzX'&&['formula','rollup','lookup','multipleLookupValues','autoNumber'].includes(field.type))errors.push(id+': not writable '+key);
    const option=key==='Package Code'?'black_card':key==='payment_stage'?'membership':null;
    if(option&&field.type==='singleSelect'&&!field.options?.choices?.some(c=>c.name===option))errors.push(id+': missing select option '+key+'='+option);
  }
}
for(const error of errors)console.error(error);
if(errors.length)process.exit(1);console.log('Black Card schema preflight passed (read-only)');
