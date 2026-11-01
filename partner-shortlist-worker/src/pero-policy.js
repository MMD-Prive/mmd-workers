// Server-only rules for the owner's Pero job. No client claims are trusted.
export const PERO_JOB = '166c809c80a5eb51163364be77e538a2';
export const BENZ_T = 'rec0xpNoARWnLmxbF';
export const TTL = 60 * 60 * 1000;
export const scoped = value => value.id === PERO_JOB || value.policy === 'standard-pn-60m';
export function eligible(model, value) {
  return model.canonicalModelId !== BENZ_T
    && !(value.ownerOnly?.excludedCanonicalModelIds || []).includes(model.canonicalModelId)
    && model.qualification?.category === 'standard'
    && model.qualification?.straight === true
    && model.qualification?.pn !== false && model.qualification?.accepting !== false
    && model.display.status !== 'unavailable';
}
export function filters(params) {
  const allowed = new Set(['search','q','heightMin','heightMax','weightMin','weightMax','body','skin']);
  for (const [key] of params) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('invalid_filters');
  const f = {active: params.get('search') === '1'};
  for (const key of ['q','body','skin']) {f[key] = (params.get(key)||'').trim().toLowerCase(); if(f[key].length>80) throw new Error('invalid_filters');}
  for (const [key,min,max] of [['heightMin',100,230],['heightMax',100,230],['weightMin',30,250],['weightMax',30,250]]) {
    const raw=params.get(key); f[key]=raw===null||raw===''?null:Number(raw);
    if(f[key]!==null && (!Number.isFinite(f[key])||f[key]<min||f[key]>max)) throw new Error('invalid_filters');
  }
  if((f.heightMin!==null&&f.heightMax!==null&&f.heightMin>f.heightMax)||(f.weightMin!==null&&f.weightMax!==null&&f.weightMin>f.weightMax)) throw new Error('invalid_filters');
  return f;
}
function distance(value,min,max) {
  if(min===null&&max===null)return 0;
  if(!Number.isFinite(value))return Infinity;
  return Math.max(min===null?0:min-value,max===null?0:value-max,0);
}
export function matches(value, f) {
  if(!f.active)return value.models.filter(m=>eligible(m,value)).map(m=>({...m,match:'exact'}));
  return value.models.filter(m=>eligible(m,value)).map(m=>{
    const d=m.display, q=m.qualification;
    if(f.q&&!`${d.name} ${d.code}`.toLowerCase().includes(f.q))return null;
    if(f.body&&String(q.body||'').toLowerCase()!==f.body)return null;
    if(f.skin&&String(q.skin||'').toLowerCase()!==f.skin)return null;
    const hd=distance(d.height,f.heightMin,f.heightMax),wd=distance(d.weight,f.weightMin,f.weightMax);
    if(hd>3||wd>5)return null;
    return {...m,match:hd||wd?'near':'exact',distance:hd/3+wd/5};
  }).filter(Boolean).sort((a,b)=>a.distance-b.distance||a.display.name.localeCompare(b.display.name,'th'));
}
