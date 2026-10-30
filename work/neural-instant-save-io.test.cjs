'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),Save=require('./neural-instant-save.cjs');
const root=path.resolve(__dirname,'..');
const script=`import ctypes,sys
from ctypes import wintypes
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p]
k.CreateFileW.restype=wintypes.HANDLE
k.CloseHandle.argtypes=[wintypes.HANDLE]
h=k.CreateFileW(sys.argv[1],0x80000000,3,None,3,0,None)
assert h != ctypes.c_void_p(-1).value
print('LOCKED',flush=True)
sys.stdin.readline()
k.CloseHandle(h)
`;
async function fixture(){const dir=path.join(root,'.impeccable/review/neural-sacl','instant-save-io-'+crypto.randomUUID());await fs.mkdir(dir);const file=path.join(dir,'progress.malecns-instant-dev');await fs.writeFile(file,'previous');return {dir,file};}
async function lock(file){const child=spawn(path.join(root,'.impeccable/rl-venv/Scripts/python.exe'),['-c',script,file],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']}),exit=new Promise(resolve=>child.once('exit',resolve));let errors='';child.stderr.on('data',b=>errors+=b);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Reader startup: '+errors)),5000);child.stdout.once('data',b=>{clearTimeout(timer);if(!b.toString().includes('LOCKED'))reject(Error('Reader did not lock'));else resolve();});child.once('error',reject);});return {child,exit};}
test('Atomic app save tolerates a transient actual Windows reader',async()=>{const {dir,file}=await fixture(),reader=await lock(file),start=Date.now();try{setTimeout(()=>reader.child.stdin.end(),180);await Save.write(file,'complete-new-progress');assert(Date.now()-start>=100);assert.equal(await fs.readFile(file,'utf8'),'complete-new-progress');assert(!(await fs.readdir(dir)).some(n=>n.endsWith('.pending')));}finally{reader.child.stdin.end();await reader.exit;}});
test('Persistent reader does not corrupt the previous app save',async()=>{const {dir,file}=await fixture(),reader=await lock(file);try{await assert.rejects(Save.write(file,'must-not-replace',{attempts:2}));assert.equal(await fs.readFile(file,'utf8'),'previous');assert(!(await fs.readdir(dir)).some(n=>n.endsWith('.pending')));}finally{reader.child.stdin.end();await reader.exit;}});
