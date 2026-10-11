import fs from 'node:fs/promises';
const url='https://newsroom.porsche.com/dam/jcr%3A3b5e8287-01fb-481f-9d5c-2add88364f30/250808e_Technical%20Data%20911%20GT3%20R26.pdf';
const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);
await fs.mkdir('tmp/pdfs/porsche-992',{recursive:true});
await fs.writeFile('tmp/pdfs/porsche-992/technical-data-gt3-r-2026.pdf',Buffer.from(await r.arrayBuffer()));
console.log('Downloaded Porsche primary technical sheet');
