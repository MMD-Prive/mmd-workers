import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./',import.meta.url));
const cases={outage:'outage.mjs',races:'races.mjs'};
const selected=process.argv.slice(2);
if(selected.some(key=>!cases[key]))throw Error('Choose outage or races');
const server=spawn(process.execPath,[directory+'server.mjs'],{cwd:directory,stdio:['ignore','pipe','pipe']});
const stopped=new Promise(resolve=>server.once('exit',resolve));
let startup;
try{
 await new Promise((resolve,reject)=>{
  startup=setTimeout(()=>reject(Error('Local runtime startup timed out')),30000);
  server.stdout.on('data',bytes=>{if(bytes.toString().includes('http://127.0.0.1:'))resolve();});
  server.stderr.on('data',bytes=>process.stderr.write(bytes));
  server.once('error',reject);server.once('exit',()=>reject(Error('Local runtime stopped before ready')));
 });
 clearTimeout(startup);
 for(const key of selected.length?selected:Object.keys(cases)){
  const code=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[directory+cases[key]],{cwd:directory,stdio:'inherit'});
   child.once('error',reject);child.once('exit',resolve);
  });
  if(code!==0){process.exitCode=1;break;}
 }
}finally{
 clearTimeout(startup);server.kill('SIGTERM');await stopped;
}
