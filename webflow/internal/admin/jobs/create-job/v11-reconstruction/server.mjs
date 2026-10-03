import {createServer} from 'node:http';
import {build} from './build.mjs';
const html=await build();
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const client={client_id:'recSyntheticClient01',client_name:'Synthetic Client',membership_status:'active'};
const model={model_id:'recSyntheticModel01',model_name:'Synthetic Model',status:'active',tier:'exclusive',orientation:'straight'};
// Local mock transport only. No forwarding, secrets, production connection or writes.
createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/internal/admin/jobs/create-job'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
 if(u.pathname==='/v1/admin/ping'&&req.method==='GET')return json(res,200,{ok:true});
 if(u.pathname==='/v1/admin/clients/lineage-lookup'&&req.method==='POST'){
  let body='';req.on('data',b=>{body+=b;if(body.length>8192)req.destroy();});req.on('end',()=>{try{const q=JSON.parse(body).query||'';json(res,200,{records:/synthetic/i.test(q)?[client]:[]});}catch{json(res,400,{ok:false,error:'Invalid JSON'});}});return;
 }
 if(u.pathname==='/v1/admin/clients/recent'&&req.method==='GET')return json(res,200,{records:[client]});
 if(u.pathname==='/v1/admin/models/search'&&req.method==='GET')return json(res,200,{items:/synthetic/i.test(u.searchParams.get('q')||'')?[model]:[]});
 if(u.pathname==='/v1/admin/models/list'&&req.method==='GET')return json(res,200,{items:[]});
 if(u.pathname==='/internal/admin/jobs/job-board'&&req.method==='GET')return json(res,501,{ok:false,error:'Job Board is a separate authenticated route. This review server does not reconstruct it.'});
 return json(res,405,{ok:false,error:'Review transport blocks this endpoint. No job is created.'});
}).listen(Number(process.env.PORT||4187),'127.0.0.1',()=>console.log('Synthetic V11 review: http://127.0.0.1:'+Number(process.env.PORT||4187)+'/internal/admin/jobs/create-job'));
