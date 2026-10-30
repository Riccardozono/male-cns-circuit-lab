'use strict';
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8'),assert=require('node:assert/strict'),I=require('./neural-research-source-identity.cjs');
const packet=require('../.impeccable/review/neural-sacl/direct-curriculum-prepared/snapshots.json');
assert.equal(packet.format,'male-cns-actual-neuronal-curriculum-states-v1');assert.equal(packet.snapshots.length,5);
for(const[file,digest]of Object.entries(packet.sourceHashes))assert.equal(I.sha(fs.readFileSync(path.resolve(file))),digest,file);
function get(index){assert(Number.isInteger(index)&&index>=0&&index<packet.snapshots.length);const p=packet.snapshots[index],buffer=Buffer.from(p.data,'base64');assert.equal(I.sha(buffer),p.sha256);return v8.deserialize(buffer);}
module.exports={get,count:packet.snapshots.length,metadata:()=>({format:packet.format,states:packet.snapshots.map(({data,...s})=>s)})};
