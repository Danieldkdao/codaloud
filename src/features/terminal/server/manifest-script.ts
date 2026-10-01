import {
  maxSelectedSyncFileBytes,
  maxSyncFileBytes,
  maxSyncedFiles,
} from "../constants";

// The cache lives beside the workspace so neither sync nor Git can transfer it.
export const manifestScript = `const fs=require('fs'),crypto=require('crypto'),path=require('path');
const root=process.argv[1],allowed=JSON.parse(process.argv[2]),knownHash=process.argv[3],started=Date.now();
const cachePath=path.join(path.dirname(root),'.codaloud-sync-'+crypto.createHash('sha256').update(root).digest('hex')+'.json');
let previous={};try{const stat=fs.lstatSync(cachePath);if(stat.isFile()&&stat.size<=32*1024*1024){const fd=fs.openSync(cachePath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const size=fs.fstatSync(fd).size;if(size<=32*1024*1024){const buffer=Buffer.alloc(size);let offset=0,length;while(offset<size&&(length=fs.readSync(fd,buffer,offset,size-offset,null))>0)offset+=length;const saved=JSON.parse(buffer.subarray(0,offset).toString('utf8'));if(saved.version===1&&saved.files&&typeof saved.files==='object')previous=saved.files}}finally{fs.closeSync(fd)}}}catch{}
const excluded=new Set(['.expo','.next','node_modules','dist','build','coverage','.venv','venv','__pycache__']);
const matches=name=>allowed.some(rule=>rule.includes('/')?(name===rule||name.startsWith(rule+'/')):rule.endsWith('*')?name.split('/').some(part=>part.startsWith(rule.slice(0,-1))):name.split('/').includes(rule));
const selected=name=>!name.split('/').some(part=>excluded.has(part))||matches(name)||allowed.some(rule=>rule.startsWith(name+'/'));
const fingerprint=stat=>[stat.size,stat.mtimeNs,stat.ctimeNs,stat.ino,stat.mode].join(':');
const out=Object.create(null),next=Object.create(null),stack=[['',root]],buffer=Buffer.alloc(256*1024);let count=0,visited=0,manifestBytes=0,hashed=0,reused=0,bytesHashed=0;
while(stack.length){const [rel,dir]=stack.pop();for(const item of fs.readdirSync(dir,{withFileTypes:true})){
if(++visited>200000||Date.now()-started>110000)throw Error('Workspace scan limit exceeded');
const name=rel?rel+'/'+item.name:item.name,full=path.join(dir,item.name);
if(name.split('/').some(part=>part.toLowerCase()==='.git')||!selected(name))continue;
if(item.isDirectory()){stack.push([name,full]);continue}if(!item.isFile())continue;
if(++count>${maxSyncedFiles})throw Error('Too many workspace files');
let stat;try{stat=fs.lstatSync(full,{bigint:true})}catch(error){if(error.code==='ENOENT')continue;throw error}
if(!stat.isFile())continue;
if(stat.size>BigInt(${maxSelectedSyncFileBytes})){if(matches(name))throw Error('Selected workspace file exceeds 128 MiB');continue}
if(stat.size>BigInt(${maxSyncFileBytes})&&!matches(name))continue;
const key=fingerprint(stat),old=Object.hasOwn(previous,name)?previous[name]:null;let hash;
if(old&&old.key===key&&/^[a-f0-9]{64}$/.test(old.hash)){hash=old.hash;reused++}
else{const digest=crypto.createHash('sha256'),fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{
if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==key)throw Error('Workspace file changed while checking: '+name);
let length;while((length=fs.readSync(fd,buffer,0,buffer.length,null))>0){digest.update(buffer.subarray(0,length));bytesHashed+=length}
if(fingerprint(fs.fstatSync(fd,{bigint:true}))!==key)throw Error('Workspace file changed while checking: '+name);
hash=digest.digest('hex');hashed++}finally{fs.closeSync(fd)}}
if((manifestBytes+=Buffer.byteLength(name)+80)>16*1024*1024)throw Error('Workspace manifest exceeds the size limit');
out[name]=hash;next[name]={key,hash};}}
const temporary=cachePath+'.'+process.pid+'.tmp';try{const saved=JSON.stringify({version:1,files:next});if(Buffer.byteLength(saved)<=32*1024*1024){fs.writeFileSync(temporary,saved,{mode:0o600});fs.renameSync(temporary,cachePath)}}catch{try{fs.unlinkSync(temporary)}catch{}}
const digest=crypto.createHash('sha256');for(const name of Object.keys(out).sort())digest.update(name+'\\0'+out[name]+'\\0');const hash=digest.digest('hex'),unchanged=hash===knownHash;
console.log(JSON.stringify({manifest:unchanged?undefined:out,hash,unchanged,metrics:{hashed,reused,bytesHashed,durationMs:Date.now()-started}}));`;

export type ManifestMetrics = {
  hashed: number;
  reused: number;
  bytesHashed: number;
  durationMs: number;
};
