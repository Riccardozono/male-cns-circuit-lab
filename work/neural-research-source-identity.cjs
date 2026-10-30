'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function collect(entries){
  const files=new Set();function visit(file){const full=path.resolve(root,file),relative=path.relative(root,full).replaceAll('\\','/');if(relative.startsWith('../')||path.isAbsolute(relative))throw Error('Only local research sources required');if(files.has(relative))return;files.add(relative);if(!/\.(cjs|js|mjs)$/.test(full))return;
    for(const m of fs.readFileSync(full,'utf8').matchAll(/\brequire\(\s*(['"])(\.[^'"]+)\1\s*\)/g))visit(require.resolve(path.resolve(path.dirname(full),m[2])));
  }entries.forEach(visit);return Object.fromEntries([...files].sort().map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
}
module.exports={collect,sha};
