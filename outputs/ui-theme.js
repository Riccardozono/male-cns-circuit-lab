/* Interface preference only. Never reads or writes a training checkpoint. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.MaleCNSTheme=api;
  if(root.document){
    let storage;try{storage=root.localStorage;}catch{}
    api.controller=api.create(root.document,storage);
  }
})(globalThis,function(){
  'use strict';
  const STORAGE_KEY='malecns-ui-theme';
  function create(doc,storage){
    let theme='light',button=null;
    try{if(storage?.getItem(STORAGE_KEY)==='dark')theme='dark';}catch{}
    const sync=()=>{
      doc.documentElement.dataset.theme=theme;
      doc.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#101720':'#fcfefe');
      if(button){
        button.setAttribute('aria-pressed',String(theme==='dark'));
        button.title=theme==='dark'?'Modalità scura attiva. Passa al tema chiaro.':'Attiva la modalità scura.';
      }
    };
    const setTheme=next=>{
      if(!['light','dark'].includes(next))return false;
      if(next===theme)return true;
      theme=next;sync();
      try{storage?.setItem(STORAGE_KEY,theme);}catch{}
      const EventClass=doc.defaultView?.CustomEvent;
      if(EventClass)doc.dispatchEvent(new EventClass('malecns-theme-change',{detail:{theme}}));
      return true;
    };
    const mount=()=>{
      const nextButton=doc.getElementById('theme-toggle');
      if(nextButton&&nextButton!==button){
        button=nextButton;
        button.addEventListener('click',()=>setTheme(theme==='dark'?'light':'dark'));
      }
      sync();
    };
    sync(); // Runs in the head, before the stylesheet/first paint.
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
    return {getTheme:()=>theme,setTheme,mount};
  }
  return {STORAGE_KEY,create};
});
