const validSession = value => typeof value === 'string' && /^[-\w]{1,220}$/.test(value);
export function doubleMomentLoginPath(params) {
  const sid=params.get('session_id');
  if(params.getAll('session_id').length!==1||!validSession(sid))return '/member/liff';
  return '/member/liff?'+new URLSearchParams({intent:'status',return_to:'double_moment_job',job_session:sid});
}
// Navigation only: the returned page must still read the authenticated customer's API.
export function resolveDoubleMomentJobReturn(query,state=new URLSearchParams()) {
  const values={};
  for(const key of ['return_to','job_session','intent','liff_intent','campaign','view']){
    const a=query.getAll(key),b=state.getAll(key);
    if(a.length>1||b.length>1||a.length&&b.length&&a[0]!==b[0])return '';
    values[key]=a[0]??b[0]??'';
  }
  if(query.getAll('liff.state').length+query.getAll('liff_state').length>1)return '';
  if(values.return_to!=='double_moment_job'||!validSession(values.job_session)||values.campaign||values.view)return '';
  if([values.intent,values.liff_intent].some(v=>v&&!['status','unknown'].includes(v)))return '';
  return '/member/double-moment?'+new URLSearchParams({session_id:values.job_session});
}
