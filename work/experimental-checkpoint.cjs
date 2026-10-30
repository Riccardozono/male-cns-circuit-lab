'use strict';
// Strict, explicit research checkpoints. Never a legacy .malecns-save parser.
const fs=require('node:fs'),crypto=require('node:crypto');
const checksum=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const hashFile=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function seal(body){if(Object.hasOwn(body,'checksum'))throw Error('Checksum already present');return {...body,checksum:checksum(body)};}
function verify(document,{format,graph,sourceSha256,legacySourceSha256,sourceHashes}){
  const {checksum:expected,...body}=document;
  if(!expected||expected!==checksum(body))throw Error('Invalid checkpoint checksum');
  if(document.schema!==1||document.format!==format||document.appVersion!=='5.6.0'||document.sourceSha256!==sourceSha256||document.legacySourceSha256!==legacySourceSha256||JSON.stringify(document.graph)!==JSON.stringify(graph))throw Error('Incompatible checkpoint identity');
  if(!document.sourceHashes||Object.keys(sourceHashes).some(file=>sourceHashes[file]!==document.sourceHashes[file]))throw Error('Incompatible checkpoint implementation');
  return body;
}
function atomicWrite(file,document){const next=file+'.pending';fs.writeFileSync(next,JSON.stringify(document,null,2),{flag:'w'});fs.renameSync(next,file);}
module.exports={checksum,hashFile,seal,verify,atomicWrite};
