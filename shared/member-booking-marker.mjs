const OWNER=/^[a-f0-9]{64}$/;
function markerValue(ref,m){const parts=[m.schema,m.owner,ref,m.scope,m.fingerprint];if(m.publicDetails!==undefined)parts.push(JSON.stringify(m.publicDetails));if(m.client_id)parts.push(m.client_id);return parts.join(':');}
export async function validMarker(secret,ref,m){return m?.schema==='member_booking_owner_v2'&&['public','private'].includes(m.scope)&&OWNER.test(m.fingerprint||'')&&m.signature===await sign(secret,markerValue(ref,m));}
async function sign(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function signMarker(secret, ref, marker) { return sign(secret, markerValue(ref, marker)); }
