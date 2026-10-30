'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Theme=require('../ui-theme.js');
function fixture(initial,storageFailure=false,loading=false){
  const store=new Map(initial===undefined?[]:[[Theme.STORAGE_KEY,initial]]),writes=[];
  const storage={getItem:key=>{if(storageFailure)throw Error('Storage unavailable');return store.get(key)??null;},setItem:(key,value)=>{if(storageFailure)throw Error('Storage unavailable');store.set(key,value);writes.push([key,value]);}};
  const button=new EventTarget();button.attributes={};button.setAttribute=(key,value)=>button.attributes[key]=value;
  const meta={content:null,setAttribute(key,value){if(key==='content')this.content=value;}};
  const doc=new EventTarget();doc.documentElement={dataset:{}};doc.defaultView={CustomEvent};doc.readyState=loading?'loading':'complete';
  doc.querySelector=()=>meta;doc.getElementById=id=>id==='theme-toggle'?button:null;
  const changes=[];doc.addEventListener('malecns-theme-change',event=>changes.push(event.detail.theme));
  return {doc,button,meta,storage,store,writes,changes};
}
test('Theme defaults to the approved light UI without writing a preference',()=>{
  const f=fixture(),c=Theme.create(f.doc,f.storage);
  assert.equal(c.getTheme(),'light');assert.equal(f.doc.documentElement.dataset.theme,'light');
  assert.equal(f.button.attributes['aria-pressed'],'false');assert.equal(f.meta.content,'#fcfefe');assert.equal(f.writes.length,0);
});
test('Saved dark preference applies before DOMContentLoaded / first paint',()=>{
  const f=fixture('dark',false,true),c=Theme.create(f.doc,f.storage);
  assert.equal(c.getTheme(),'dark');assert.equal(f.doc.documentElement.dataset.theme,'dark');
  assert.equal(f.meta.content,'#101720');assert.equal(f.button.attributes['aria-pressed'],undefined);
  f.doc.dispatchEvent(new Event('DOMContentLoaded'));assert.equal(f.button.attributes['aria-pressed'],'true');
});
test('Native button toggles, saves only the UI preference and emits actual changes',()=>{
  const f=fixture(),c=Theme.create(f.doc,f.storage);
  f.button.dispatchEvent(new Event('click'));assert.equal(c.getTheme(),'dark');assert.equal(f.button.attributes['aria-pressed'],'true');
  f.button.dispatchEvent(new Event('click'));assert.equal(c.getTheme(),'light');assert.equal(f.button.attributes['aria-pressed'],'false');
  assert.deepEqual(f.writes,[[Theme.STORAGE_KEY,'dark'],[Theme.STORAGE_KEY,'light']]);assert.deepEqual(f.changes,['dark','light']);
  assert.equal(f.store.size,1);assert.match(f.button.title,/Attiva/);
});
test('Recreating the UI restores the saved choice; repeated mounting does not double toggle',()=>{
  const f=fixture(),c=Theme.create(f.doc,f.storage);c.mount();c.mount();f.button.dispatchEvent(new Event('click'));
  assert.equal(c.getTheme(),'dark');assert.equal(f.changes.length,1);
  const reopened=fixture(f.store.get(Theme.STORAGE_KEY));assert.equal(Theme.create(reopened.doc,reopened.storage).getTheme(),'dark');
});
test('Unavailable local storage never disables the theme switch',()=>{
  const f=fixture(undefined,true),c=Theme.create(f.doc,f.storage);
  assert.equal(c.getTheme(),'light');assert.doesNotThrow(()=>f.button.dispatchEvent(new Event('click')));assert.equal(c.getTheme(),'dark');
});
test('Unknown preferences and invalid theme commands do not inject arbitrary theme values',()=>{
  const f=fixture('unrecognized'),c=Theme.create(f.doc,f.storage);assert.equal(c.getTheme(),'light');
  assert.equal(c.setTheme('unrecognized'),false);assert.equal(c.setTheme(null),false);assert.equal(c.getTheme(),'light');assert.equal(f.writes.length,0);
  assert.equal(c.setTheme('light'),true);assert.equal(f.changes.length,0);
});
test('Theme script is local, packaged and runs before the stylesheet',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),pkg=require('../../package.json');
  assert.ok(html.indexOf('src="ui-theme.js"')<html.indexOf('href="styles.css"'));assert.ok(pkg.build.files.includes('outputs/ui-theme.js'));
  assert.match(html,/<button[^>]+id="theme-toggle"[^>]+type="button"[^>]+aria-pressed="false"/);assert.equal(pkg.version,'5.7.0');
});
test('Both themes keep readable text, action, hover, selection, chart and focus contrast',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8'),blocks=[...css.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/g)];
  const tokens=block=>Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(m=>[m[1],m[2]]));
  const light=tokens(blocks[0][1]),dark={...light,...tokens(blocks[1][1])};
  const lum=hex=>{const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  for(const [name,p]of Object.entries({light,dark})){
    for(const foreground of ['paper','graphite','muted','coral','teal','amber','danger','link','history-ink','history-best'])assert.ok(contrast(p[foreground],p.panel)>=4.5,name+' '+foreground);
    for(const background of ['coral','primary-hover'])assert.ok(contrast(p['on-accent'],p[background])>=4.5,name+' action '+background);
    assert.ok(contrast(p.paper,p['selection-bg'])>=4.5,name+' selection');
    assert.ok(contrast(p['focus'],p.panel)>=3,name+' focus');
    assert.ok(contrast(p.coral,p['panel-raised'])>=4.5,name+' theme toggle');
  }
});
