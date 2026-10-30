/* Presentation only: reorganizes existing controls; never owns simulation state. */
(function(root){
  'use strict';
  root.MaleCNSSessionUI={create(doc){
    const $=id=>doc.getElementById(id),find=s=>doc.querySelector(s);
    const make=(tag,className,text)=>{const e=doc.createElement(tag);e.className=className;if(text)e.textContent=text;return e;};
    const icon=(d,filled=false)=>{const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('ui-icon');const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);p.setAttribute('fill',filled?'currentColor':'none');p.setAttribute('stroke',filled?'none':'currentColor');p.setAttribute('stroke-width','1.6');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);return svg;};
    const actionIcon=(id,d,filled=false)=>{const button=$(id),label=make('span','action-label',button.textContent);button.replaceChildren(icon(d,filled),label);};
    const workspace=find('.workspace'),simulation=find('.simulation-panel'),config=find('.controls-panel'),ledger=find('.ledger-panel'),agent=find('.agent-panel'),learningSummary=find('.learning-summary');
    const nav=make('nav','session-navigation');nav.setAttribute('aria-label','Aree del laboratorio');
    $('view-circuit').textContent='Sessione';$('open-model-test').textContent='Confronto modelli';
    nav.append($('view-circuit'),$('open-model-test'),$('view-brain'),$('view-split'));
    find('.topbar').insertBefore(nav,find('.topbar-meta'));find('.workspace-switcher').remove();
    for(const id of ['view-circuit','view-brain','view-split'])$(id).disabled=true;
    const main=make('div','session-main'),bottom=make('div','session-bottom');
    const historyPanel=make('section','panel results-panel');historyPanel.setAttribute('aria-labelledby','results-title');
    const heading=make('h2','panel-title','Risultati generazioni');heading.id='results-title';historyPanel.append(heading);
    const tableWrap=make('div','generation-table-wrap');tableWrap.tabIndex=0;tableWrap.setAttribute('role','region');tableWrap.setAttribute('aria-label','Ultime generazioni, tabella scorrevole');
    const table=make('table','generation-table');
    const thead=doc.createElement('thead'),tr=doc.createElement('tr');
    for(const label of ['Gen.','Progresso sicuro','Giri','Miglior giro']){const th=make('th','',label);th.scope='col';tr.append(th);}thead.append(tr);
    const tbody=doc.createElement('tbody');tbody.id='generation-results';table.append(thead,tbody);tableWrap.append(table);historyPanel.append(tableWrap);
    const empty=make('div','generation-empty');empty.id='generation-empty';
    const flag=icon('M4 21V4l16-2v12L4 16 M4 4l5-.7v5l-5 .7 M14 2.7v5l6-.7 M9 8.3v5l5-.7v-5',false);flag.classList.add('empty-flag');
    const checks=doc.createElementNS('http://www.w3.org/2000/svg','path');checks.setAttribute('d','M4 4l5-.7v5l-5 .7Z M14 2.7l6-.7v5l-6 .7Z M9 8.3l5-.7v5l-5 .7Z');checks.setAttribute('fill','currentColor');flag.append(checks);
    empty.append(flag,make('strong','','Nessuna generazione completata.'),make('p','','Qui compariranno distanza, giri e tempi realmente misurati.'));historyPanel.append(empty);
    const graph=make('details','history-details');graph.append(make('summary','','Andamento e confronto della popolazione'),find('.history-wrap'));historyPanel.append(graph);
    ledger.append(learningSummary);$('evolution-title').textContent='Stato simulazione';
    bottom.append(ledger,historyPanel,agent);main.append(simulation,bottom,find('.simulation-footer'));workspace.append(main);
    const test=$('model-test-panel');main.prepend(test);test.hidden=!test.open;
    config.id='session-config';$('controls-title').textContent='Configurazione sessione';
    const settingsButton=make('button','button button--secondary settings-access','Impostazioni');settingsButton.type='button';settingsButton.id='open-settings';settingsButton.setAttribute('aria-controls','session-config');
    find('.topbar-meta').prepend(settingsButton);settingsButton.addEventListener('click',()=>{config.scrollIntoView({block:'start'});$('circuit-select').focus({preventScroll:true});});
    const circuitControls=find('.circuit-controls');config.insertBefore(circuitControls,find('.control-stack'));
    const model=find('.select-control');circuitControls.insertBefore(model,$('camera-select').parentElement);
    const modelNotes=make('details','model-notes');modelNotes.append(make('summary','','Capacità e limiti del modello'),$('model-capacity-note'));model.append(modelNotes);
    test.querySelector('.model-test-body').append($('model-comparison-details'));
    config.insertBefore(find('.run-actions'),find('.progress-files'));
    const advanced=make('details','advanced-session-controls');advanced.append(make('summary','','Controlli e regole avanzati'));
    const populationRange=$('population-range'),populationLabel=populationRange.parentElement,stack=find('.control-stack');
    const populationField=make('div','population-field'),populationTitle=make('label','control-label','Popolazione (auto)');populationTitle.htmlFor='population-number';
    const populationNumber=make('input','');populationNumber.id='population-number';populationNumber.type='number';populationNumber.min=populationRange.min;populationNumber.max=populationRange.max;populationNumber.step=populationRange.step;populationNumber.value=populationRange.value;populationNumber.setAttribute('aria-describedby','population-note');populationNumber.disabled=true;
    populationField.append(populationTitle,populationNumber,$('population-note'));stack.insertBefore(populationField,populationLabel);advanced.append(populationLabel,$('next-generation'));
    config.insertBefore(advanced,find('.progress-files').nextSibling);
    populationNumber.addEventListener('change',()=>{if(populationRange.disabled){populationNumber.value=populationRange.value;return;}const v=populationNumber.valueAsNumber;if(!Number.isFinite(v)){populationNumber.value=populationRange.value;return;}populationRange.value=String(Math.max(Number(populationRange.min),Math.min(Number(populationRange.max),Math.round(v))));populationRange.dispatchEvent(new Event('input',{bubbles:true}));populationRange.dispatchEvent(new Event('change',{bubbles:true}));populationNumber.value=populationRange.value;});
    for(const [id,text]of [['population-range','Popolazione (slider)'],['mutation-range','Mutazione base'],['speed-range','Velocità simulazione']])$(id).parentElement.querySelector('.control-label').textContent=text;
    actionIcon('toggle-run','M7 4l13 8-13 8Z',true);actionIcon('reset-sim','M20 8V3l-4 4a8 8 0 1 0 3 9 M20 3h-5');actionIcon('save-progress','M12 3v12m-4-4l4 4 4-4 M4 16v5h16v-5');actionIcon('load-progress','M3 6h7l2 3h9v11H3Z');
    const mapNotes=make('details','map-notes');mapNotes.append(make('summary','','Vista, dimensioni e crediti'));
    mapNotes.append($('circuit-change-note'),modelNotes);
    const computeNote=make('p','hint',$('population-note').textContent);modelNotes.append(computeNote);$('population-note').textContent='Fino a 100 auto per generazione e worker.';
    for(const selector of ['.track-measures','#track-elevation-note','#landscape-source-note','#track-navigation-note','#track-3d-status','.track-asset-credit','.track-display-tools','#track-model-note','#track-curb-reference'])mapNotes.append(find(selector));
    config.append(mapNotes,find('.experiment-details'),find('.provenance-panel'));
    const canvasWrap=find('.canvas-wrap');canvasWrap.append(find('.track-toolbar'),find('.field-readout'));
    const title=$('simulation-title');title.textContent='Circuito · simulazione';find('.pane-heading h2').replaceWith(title);find('.panel-heading--simulation').remove();
    workspace.append(config,main);find('.inspector-column').remove();
    const speedCell=$('agent-speed').parentElement;speedCell.className='vehicle-speed';find('.powertrain-readings').append(speedCell);
    const readings=find('.agent-summary');find('.vehicle-cockpit').append(readings);
    const vehicleDetails=find('.vehicle-details');agent.append(vehicleDetails);
    const picker=find('.agent-picker');
    for(const [id,label,offset,path] of [['agent-previous','Auto precedente',-1,'M12 4l-6 6 6 6'],['agent-next','Auto successiva',1,'M8 4l6 6-6 6']]){
      const button=make('button','agent-step');button.id=id;button.type='button';button.setAttribute('aria-label',label);
      const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('aria-hidden','true');
      const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);button.append(svg);picker.insertBefore(button,$('follow-best'));
      button.addEventListener('click',()=>{const select=$('agent-select'),count=select.options.length;if(!count)return;select.selectedIndex=(select.selectedIndex+offset+count)%count;select.dispatchEvent(new Event('change',{bubbles:true}));});
    }
    const agentHeading=agent.querySelector('.panel-heading');agentHeading.append(picker);
    const selectionMode=make('div','agent-selection-mode');selectionMode.append($('selected-color-dot'),$('follow-best'),$('car-closeup'));agent.insertBefore(selectionMode,find('.vehicle-cockpit'));
    $('score-details').append(readings,$('agent-selection-note'));
    $('score-details').append(vehicleDetails);
    $('score-details').querySelector('summary').textContent='Telemetria, ricompense e meccanica';
    const stats=ledger.querySelector('.stat-grid'),cells=[...stats.children],rules=ledger.querySelector('.generation-details');
    rules.append(cells[1]);advanced.append(rules);cells[2].classList.remove('stat-cell--wide');
    for(const [id,label]of [['learning-laps','Giri validi max'],['learning-lap-time','Miglior giro']]){
      const value=$(id),old=value.parentElement,cell=make('div','stat-cell');cell.append(make('span','stat-label',label),value);value.classList.add('stat-value');stats.insertBefore(cell,cells[2]);old.remove();
    }
    rules.append($('learning-mean').parentElement);$('generation-value').previousElementSibling.textContent='Generazione';$('trial-time').previousElementSibling.textContent='Tempo simulato';
    const active=make('div','');active.append(make('dt','','Auto attive'),make('dd',''));active.lastChild.append($('alive-count'));learningSummary.append(active);
    const stateSummary=make('div','session-state-summary');stateSummary.append(make('span','stat-label','Stato simulazione'),make('strong','','In pausa'));stateSummary.lastChild.id='session-state-summary';ledger.append(stateSummary);
    const outputGroup=find('.signal-group--outputs'),outputRows=make('div','output-rows'),assists=make('dl','vehicle-assist-summary');for(const row of [...outputGroup.querySelectorAll('.signal-row')])outputRows.append(row);
    for(const [id,label]of [['ui-abs','ABS'],['ui-tc','TC'],['ui-gearbox','Cambio']]){const entry=make('div','');entry.append(make('dt','',label),make('dd','','In attesa'));entry.lastChild.id=id;assists.append(entry);}outputGroup.append(outputRows,assists);vehicleDetails.append($('vehicle-aids'));
    const runBadge=find('.field-readout');runBadge.querySelector('.readout-label').textContent='Simulazione';const pauseIcon=icon('M6 4h4v16H6Z M14 4h4v16h-4Z',true);pauseIcon.classList.add('run-badge-icon');runBadge.append(pauseIcon);
    const saveNotes=make('details','save-notes');saveNotes.append(make('summary','','Formato e compatibilità'),$('progress-file-note'));find('.progress-files').insertBefore(saveNotes,$('progress-status'));
    let historyKey='';
    const syncNavigation=()=>{const open=test.open,view=$('visual-stage').dataset.view;for(const [id,value]of [['view-circuit','circuit'],['view-brain','brain'],['view-split','split']])$(id).setAttribute('aria-pressed',String(!open&&value===view));$('open-model-test').setAttribute('aria-pressed',String(open));};
    for(const id of ['view-circuit','view-brain','view-split'])$(id).addEventListener('click',()=>{test.open=false;test.hidden=true;});
    graph.addEventListener('toggle',()=>window.dispatchEvent(new Event('resize')));
    return {ready(){for(const id of ['view-circuit','view-brain','view-split'])$(id).disabled=false;populationNumber.disabled=populationRange.disabled;},updateVehicle(v){$('ui-abs').textContent=v.absEnabled?(v.absActive?'Interviene':'Attivo'):'Spento';$('ui-tc').textContent=v.tcEnabled?(v.tcActive?'Interviene':'Attivo'):'Spento';$('ui-gearbox').textContent=v.gearboxMode==='auto'?'Automatico':'Manuale';},syncTest(){test.hidden=!test.open;syncNavigation();},syncNavigation,update({running,circuitLabel,history,pixelsPerMeter}){
      $('simulation-title').textContent=circuitLabel+' · simulazione';doc.body.dataset.running=String(running);syncNavigation();
      if(doc.activeElement!==populationNumber)populationNumber.value=populationRange.value;populationNumber.disabled=populationRange.disabled;$('session-state-summary').textContent=running?'In corso':'In pausa';
      $('toggle-run').querySelector('.action-label').textContent=running?'Pausa':'Riprendi';$('toggle-run').querySelector('path').setAttribute('d',running?'M6 4h4v16H6Z M14 4h4v16h-4Z':'M7 4l13 8-13 8Z');pauseIcon.style.visibility=running?'hidden':'visible';
      const key=history.map(h=>`${h.generation}:${h.bestSafeProgress}:${h.bestProgress}:${h.maxLaps}:${h.bestLapTime}`).join('|')+'|'+pixelsPerMeter;
      if(key!==historyKey){historyKey=key;const rows=history.slice(-6).reverse().map(h=>{const row=doc.createElement('tr');for(const [i,value]of [String(h.generation),Math.round((h.bestSafeProgress??h.bestProgress??0)/pixelsPerMeter).toLocaleString('it-IT')+' m',String(h.maxLaps??h.laps??0),Number.isFinite(h.bestLapTime)?`${Math.floor(h.bestLapTime/60)}:${String(Math.floor(h.bestLapTime%60)).padStart(2,'0')}.${Math.floor(h.bestLapTime%1*10)}`:'—'].entries()){const cell=doc.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=value;row.append(cell);}return row;});tbody.replaceChildren(...rows);empty.hidden=rows.length>0;}
    }};
  }};
})(globalThis);
