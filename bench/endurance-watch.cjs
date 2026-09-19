// Persist completed measurements and periodic recovery snapshots, never app saves.
const fs=require('fs'),zlib=require('zlib');
const from='/tmp/frachtfieber-endurance',to='audit/endurance-200';fs.mkdirSync(to,{recursive:true});
function sync(){
 try{
  for(const f of ['metadata.json','days.jsonl','done.json','error.json'])if(fs.existsSync(from+'/'+f)){const tmp=to+'/'+f+'.tmp';fs.copyFileSync(from+'/'+f,tmp);fs.renameSync(tmp,to+'/'+f);}
  const cp=fs.readdirSync(from).filter(f=>/^state-day\d+\.json$/.test(f)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]))[0];
  if(cp && !fs.existsSync(to+'/'+cp+'.gz')){const tmp=to+'/'+cp+'.gz.tmp';fs.writeFileSync(tmp,zlib.gzipSync(fs.readFileSync(from+'/'+cp)));fs.renameSync(tmp,to+'/'+cp+'.gz');}
  if(fs.existsSync(from+'/done.json')||fs.existsSync(from+'/error.json'))process.exit(0);
 }catch(e){fs.writeFileSync(to+'/watch-error.txt',String(e));}
}
sync();setInterval(sync,60000);
