// Exact helper assignment expressions recovered from the live owner policy IIFE.
// Only unrelated assignments were omitted; helper behavior was not rewritten.
export const RECOVERED_HELPER_SOURCE = "var C=(e,t=500)=>String(e??\"\").trim().slice(0,t),le=e=>C(e).normalize(\"NFKC\").toLowerCase().replace(/\\s+/g,\" \"),Ac=e=>Array.isArray(e)?e:[],ne=e=>Ac(e).map(t=>C(t?.id||t)),Zi=e=>Number.isFinite(Date.parse(e)),_n=e=>[\"approved\",\"verified\",\"reviewed\",\"published\",\"active\"].includes(le(e)),un=e=>[\"per\",\"boss-per\",\"boss_per\",\"\\u0E40\\u0E1B\\u0E2D\\u0E23\\u0E4C\"].includes(le(e)),kc=e=>Number(e)>0&&Number.isFinite(Number(e))?Number(e):null;";
export const RECOVERED_HELPER_SHA256 = "e997f2deefe4831a531c894af10bc3d7ba59d50172531342f5ca58fa4407d06e";
