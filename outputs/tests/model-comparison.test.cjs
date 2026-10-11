'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Comparison=require('../model-comparison.js'),F=require('../simulation.js');
test('UI comparison matches compiled anatomy, solver and learning parameters of all four shipped models',async()=>{
  const {DesktopEngine}=require('../../desktop/engine.cjs'),engine=new DesktopEngine(path.resolve(__dirname,'..'),()=>{},()=>{});
  const source=fs.readFileSync(path.join(__dirname,'../simulation.js'),'utf8');
  for(const model of Comparison.models){
    const graph=await engine.progressGraph(model.id),learning=F.ensureLearning(graph);
    assert.equal(model.neurons,graph.n,model.id);assert.equal(model.connections,graph.edgeCount,model.id);
    assert.equal(model.slotBudget,graph.solver?.activeNeuronBudget??null,model.id);
    const passes=graph.solver?.iterationsPerControlTick??Number(source.match(new RegExp(model.id.toUpperCase()+'_ITERATIONS_PER_CONTROL_TICK=(\\d+)'))?.[1]);
    assert.equal(model.passes,passes,model.id);assert.equal(model.readout,learning.nodes.length,model.id);
    assert.equal(model.gainGroups,learning.gainGroups,model.id);assert.equal(model.parameters,learning.length,model.id);
    assert.equal(model.sensors,F.SENSOR_COUNT);assert.equal(model.controlRateHz,learning.controlRateHz);assert.equal(model.maxAgents,F.MAX_POPULATION);
  }
});
test('Comparison catalog is immutable and distinguishes V5 compute capacity from unchanged anatomy',()=>{
  assert.ok(Object.isFrozen(Comparison));assert.ok(Object.isFrozen(Comparison.models));
  for(const model of Comparison.models)assert.ok(Object.isFrozen(model));
  const v4=Comparison.models.find(m=>m.id==='v4'),v5=Comparison.models.find(m=>m.id==='v5');
  assert.equal(v4.neurons,v5.neurons);assert.equal(v4.connections,v5.connections);assert.equal(v5.slotBudget,v4.slotBudget*4);
  assert.equal(v5.passes,v4.passes*2);assert.equal(v5.readout,v4.readout*2);assert.equal(v5.gainGroups,v4.gainGroups*2);
  assert.throws(()=>{v5.neurons=200000;},TypeError);
});
function fakeDetails(){
  const doc={createElement:tag=>new Element(tag)};
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.ownerDocument=doc;this.dataset={};this.attributes={};this.textContent='';this.classes=new Set();this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};}
    append(element){this.children.push(element);}setAttribute(key,value){this.attributes[key]=value;}removeAttribute(key){delete this.attributes[key];}
  }
  const root=new Element('details'),anatomy=new Element('tbody'),learning=new Element('tbody'),selection=new Element('p');root.open=false;
  const nodes={anatomy,learning,selection};root.querySelector=selector=>nodes[selector.match(/data-comparison="(.+)"/)[1]];
  root.querySelectorAll=()=>[...anatomy.children,...learning.children];return {root,...nodes};
}
test('Comparison builds only eight rows once, formats Italian numbers and updates only selected DOM state',()=>{
  const {root,anatomy,learning,selection}=fakeDetails();assert.equal(Comparison.update(root,'v5'),true);
  assert.equal(root.open,false);assert.equal(anatomy.children.length,4);assert.equal(learning.children.length,4);
  assert.deepEqual(anatomy.children[3].children.map(c=>c.textContent),['V5','166.700','6.242.118','32.768']);
  assert.deepEqual(learning.children[3].children.map(c=>c.textContent),['V5','4','128','346']);
  assert.equal(anatomy.children[0].children[3].textContent,'Denso');const row=anatomy.children[0];root.open=true;
  for(const model of Comparison.models){
    Comparison.update(root,model.id);assert.equal(root.open,true);assert.equal(anatomy.children.length,4);assert.equal(anatomy.children[0],row);
    assert.equal(root.querySelectorAll().filter(r=>r.classes.has('is-current')).length,2);
    assert.ok(root.querySelectorAll().filter(r=>r.attributes['aria-current']==='true').every(r=>r.dataset.modelId===model.id));
    assert.ok(selection.textContent.startsWith(model.id.toUpperCase()+' selezionato'));
  }
});
test('Unknown model or missing disclosure causes no UI mutation',()=>{
  const {root,anatomy,selection}=fakeDetails();assert.equal(Comparison.update(root,'off'),false);assert.equal(Comparison.update(null,'v5'),false);
  assert.equal(anatomy.children.length,0);assert.equal(selection.textContent,'');assert.deepEqual(root.dataset,{});
});
test('Comparison wiring remains read-only, lightweight and outside the animation/learning loops',()=>{
  const file=fs.readFileSync(path.join(__dirname,'../model-comparison.js'),'utf8'),app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(Buffer.byteLength(file)<5000);assert.doesNotMatch(file,/\b(fetch|require|requestAnimationFrame|setInterval|desktopCompute)\s*\(/);
  assert.equal((app.match(/MaleCNSModelComparison\.update\(/g)||[]).length,1);
  assert.match(app,/function updateModelSummary\(\)\{\s*MaleCNSModelComparison\.update/);
  assert.ok(html.indexOf('src="model-comparison.js"')<html.indexOf('src="app.js"'));
  assert.match(html,/<details class="model-comparison" id="model-comparison-details">/);
  assert.match(html,/più capacità non garantisce un apprendimento più rapido/);
});
