'use strict';
// Read-only presentation overrides for the private inference verification app.
// The ordinary app, its training controls and save formats are not modified.
const standardRefresh=refresh;
refresh=function(...args){
  standardRefresh(...args);
  const note='Verifica del campione sperimentale: i pesi sono già appresi e non cambiano in questa vista. Questa prova parte dal traguardo; non riproduce comandi registrati. Nessun giro completo ancora dimostrato.';
  $('mode-note').textContent=note;
  $('generation-note').textContent='Solo inferenza: nessun aggiornamento dei pesi e nessuna nuova generazione. Reset riparte dal traguardo. Fine per le regole fisiche o due giri reali.';
  $('model-capacity-note').textContent='V3: 7.721 neuroni e 242.486 connessioni reali; readout di 128 discendenti più contesti neurali appresi. Dinamica artificiale, non fisiologia completa della mosca.';
  $('learning-trend').textContent='L’apprendimento avviene nelle prove separate; questa finestra verifica la policy esportata.';
  $('history-caption').textContent='Questa vista non registra generazioni di apprendimento.';
  $('progress-file-note').textContent='Il modello sperimentale ha un formato dedicato. I salvataggi .malecns-save della normale app non vengono caricati o sostituiti qui.';
  $('progress-status').textContent='Salvataggio originale e profilo della normale app separati.';
  for(const id of ['controller-select','circuit-select','population-range','mutation-range','next-generation','save-progress','load-progress','model-test-start','model-test-limit','open-model-test','vehicle-gearbox','vehicle-abs','vehicle-tc','gear-up','gear-down']){
    $(id).disabled=true;$(id).title='Controllo della normale app non disponibile nella verifica del campione.';
  }
  $('model-comparison-details').hidden=true;$('model-test-panel').hidden=true;
  const population=$('population-range');population.min='1';population.max='1';population.value='1';
  $('population-note').textContent='Una sola auto per verificare il campione. La normale app conserva le popolazioni fino a 100.';
  $('mutation-output').textContent='Non attiva';$('controller-select').selectedOptions[0].textContent='V3 · campione neurale sperimentale';
  $('model-capacity-note').setAttribute('role','note');
  if(!document.getElementById('context-preview-note')){
    const p=document.createElement('p');p.id='context-preview-note';p.className='hint';p.setAttribute('role','note');
    p.textContent='Solo verifica del campione: non allena i pesi. Riprendi muove l’auto; Reset torna in partenza.';
    $('controller-select').insertAdjacentElement('afterend',p);
  }
  $('mutation-output').textContent='0%';
  const results=$('results-title');if(results)results.textContent='Apprendimento separato';
  const label=$('generation-value').previousElementSibling;if(label)label.textContent='PROVA';
  const heading=$('evolution-title');if(heading)heading.textContent='Verifica della policy';
  $('toggle-run').disabled=!selected().alive;
  if(!selected().alive){$('toggle-run').textContent='Prova conclusa';$('toggle-run').title='Usa Reset per ripartire dal traguardo.';}
};
