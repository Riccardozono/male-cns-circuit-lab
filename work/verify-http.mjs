import fs from 'node:fs';
import assert from 'node:assert/strict';
for(const file of ['index.html','app.js','simulation.js','styles.css','data/connectome.js','data/provenance.json','data/source-verification.json']) {
  const response=await fetch('http://127.0.0.1:5173/'+file);
  assert.equal(response.status,200);
  assert.equal(await response.text(),fs.readFileSync(new URL('../outputs/'+file,import.meta.url),'utf8'));
  console.log('served=disk',file);
}
const html=fs.readFileSync(new URL('../outputs/index.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length);
console.log('Unique HTML IDs:',ids.length);
