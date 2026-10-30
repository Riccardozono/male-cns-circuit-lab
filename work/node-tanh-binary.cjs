'use strict';
// Pinned actual Math.tanh outputs, including signed-zero/NaN binary handling.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(process.versions.node!=='24.19.0'||require('node:os').endianness()!=='LE')throw Error('Pinned little-endian numerical runtime required');
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);if(fs.existsSync(output))throw Error('Preserve existing reference outputs');
const bytes=fs.readFileSync(input);if(bytes.length%8||bytes.length>64*1024*1024)throw Error('Bounded Float64 input required');const x=new Float64Array(bytes.length/8);Buffer.from(x.buffer).set(bytes);const y=x.map(Math.tanh),result=Buffer.from(y.buffer);fs.writeFileSync(output,result);console.log(JSON.stringify({values:x.length,node:process.versions.node,v8:process.versions.v8,inputSha256:crypto.createHash('sha256').update(bytes).digest('hex'),outputSha256:crypto.createHash('sha256').update(result).digest('hex')}));
