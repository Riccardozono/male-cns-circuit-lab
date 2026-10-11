/* Read-only presentation of shipped model configurations. Values are checked
 * against compiled graphs in tests/model-comparison.test.cjs. This module never
 * loads a connectome or receives a simulation, optimizer, RNG or motor command. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSModelComparison=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const models=Object.freeze([
    Object.freeze({id:'v2',neurons:1121,connections:32351,slotBudget:null,passes:2,readout:64,gainGroups:16,parameters:202,sensors:28,controlRateHz:10,maxAgents:100,
      description:'Sottoinsieme compatto ricostruito dal V3; non è il file storico originale. Aggiornamento denso su CPU.'}),
    Object.freeze({id:'v3',neurons:7721,connections:242486,slotBudget:null,passes:4,readout:64,gainGroups:16,parameters:202,sensors:28,controlRateHz:10,maxAgents:100,
      description:'Nucleo anatomico storico, più grande del V2. Aggiornamento denso su CPU.'}),
    Object.freeze({id:'v4',neurons:166700,connections:6242118,slotBudget:8192,passes:2,readout:64,gainGroups:16,parameters:202,sensors:28,controlRateHz:10,maxAgents:100,
      description:'Grafo anatomico completo; elaborazione sparsa fino a 8.192 slot per agente e passo.'}),
    Object.freeze({id:'v5',neurons:166700,connections:6242118,slotBudget:32768,passes:4,readout:128,gainGroups:32,parameters:346,sensors:28,controlRateHz:10,maxAgents:100,
      description:'Stesso grafo del V4, con 4× gli slot, il doppio dei passaggi e un decoder più ampio. Richiede più calcolo, non aggiunge neuroni al dataset.'})
  ]);
  const number=value=>value.toLocaleString('it-IT');
  function fillTable(body,columns){
    const doc=body.ownerDocument;
    for(const model of models){
      const row=doc.createElement('tr'),heading=doc.createElement('th');
      row.dataset.modelId=model.id;heading.scope='row';heading.textContent=model.id.toUpperCase();row.append(heading);
      for(const column of columns){const cell=doc.createElement('td');cell.textContent=column(model);row.append(cell);}
      body.append(row);
    }
  }
  function update(details,modelId){
    const model=models.find(m=>m.id===modelId);if(!details||!model)return false;
    if(details.dataset.comparisonBuilt!=='1'){
      fillTable(details.querySelector('[data-comparison="anatomy"]'),[m=>number(m.neurons),m=>number(m.connections),m=>m.slotBudget===null?'Denso':number(m.slotBudget)]);
      fillTable(details.querySelector('[data-comparison="learning"]'),[m=>number(m.passes),m=>number(m.readout),m=>number(m.parameters)]);
      details.dataset.comparisonBuilt='1';
    }
    for(const row of details.querySelectorAll('[data-model-id]')){
      const selected=row.dataset.modelId===modelId;row.classList.toggle('is-current',selected);
      if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
    }
    details.querySelector('[data-comparison="selection"]').textContent=model.id.toUpperCase()+' selezionato · '+model.description;
    return true;
  }
  return Object.freeze({models,update});
});
