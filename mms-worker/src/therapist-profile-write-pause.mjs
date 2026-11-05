export function profileWritesPaused(env) {
  return env.MMS_PROFILE_WRITES_PAUSED === 'true';
}

export function profileWritePaused(request, env) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  return profileWritesPaused(env)
    && (path === '/male-massage/therapists/api/auth/profile' || path.startsWith('/male-massage/therapists/api/auth/profile/'))
    && !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}

export function profileWritePauseResponse() {
  return Response.json({ok:false,error:{code:'PROFILE_WRITES_PAUSED'}}, {status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
}
