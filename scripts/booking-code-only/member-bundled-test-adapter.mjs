import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {replacements,getFunction} from './member-builder.mjs';
const candidate=process.env.MEMBER_CANDIDATE?fs.readFileSync(process.env.MEMBER_CANDIDATE,'utf8'):null;
const funcs=Object.entries(replacements()).map(([name,body])=>{if(!candidate)return body;const n=getFunction(candidate,name);return candidate.slice(n.start,n.end);});
const bundle=fs.readFileSync(process.env.ARTIFACT_ROOT?process.env.ARTIFACT_ROOT+'/member-identity-bundle.js':new URL('./member-identity-bundle.js',import.meta.url),'utf8');
if(candidate&&!candidate.includes(bundle))throw Error('compiled resolver missing from actual candidate');
const code=bundle+'\n'+funcs.join('\n')+'\n;({resolveBookingPerRename:__publicBookingIdentityPatch.resolveBookingPerRename,handleDiscoveryViewer,attachDiscoverySession})';
const r=vm.runInNewContext(code,{Request,Response,Headers,URL,URLSearchParams,TextEncoder,AbortController,Uint8Array,crypto:webcrypto,setTimeout,clearTimeout,fetch,cookieValue3:(request,name)=>{const parts=(request.headers.get('cookie')||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));return parts.length===1?parts[0].slice(name.length+1):''}});
export const resolveBookingPerRename=async(...args)=>structuredClone(await r.resolveBookingPerRename(...args)),handleDiscoveryViewer=r.handleDiscoveryViewer,attachDiscoverySession=r.attachDiscoverySession;
