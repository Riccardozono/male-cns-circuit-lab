# Verifica V5 — app 5.0.0, 1 ottobre 2026

## Verificato sul codice e sull'app Windows

- 245 test automatici: [risultati TAP](test-results-v500.tap). Copertura V5:
  anatomia immutata, 128 discendenti reali, 64 esterni al nucleo, tutti i 32
  gruppi utilizzati, limite 32.768 raggiunto, pedali esclusivi, zero attività
  o zero connessioni → zero azioni, aggiornamenti ES, progressi/revisioni e
  rifiuto dei genomi incompatibili.
- 15 file fondamentali byte-identici alla 4.8.0, fra cui anatomia, ricompense,
  fisica Porsche, circuiti, cordoli, atlante e renderer. V2/V3/V4: attività,
  veicoli, score, genomi, ottimizzatore e storico identici alla 4.8.0 per
  36 tick, 4 agenti, seed 7717 e una successiva evoluzione. È una prova
  deterministica circoscritta, non tutti i seed/GPU possibili.
  [Audit](model-core-verification-v500.json).
- 126 controlli sul runtime Windows GPU: quattro modelli × Monza/Monaco/Le Mans,
  100 auto in ogni caso, movimento reale, A-100 con propria attività neurale,
  sensori/bordi/fisica/score finiti, voci del punteggio riconciliate, sola lettura
  di mappa/atlante/score in pausa, 100 episodi considerati una sola volta
  dall'ottimizzatore, selezione della generazione basata sul netto.
  [Prova sorgente](model-source-v500/rewards-smoke.json).
- Selettore e distinzione neuroni/slot verificati in una sola ispezione
  1540×980, 390×844 e mappa/atlante affiancati. Nessun overflow o ID duplicato;
  nessuna correzione cosmetica ulteriore. Impeccable ha guidato la conservazione
  della UI corrente e la spiegazione compatta della capacità.

I test del runtime con comando manuale di evoluzione verificano punteggi,
selezione e persistenza, **non** la capacità appresa di completare un giro.

## Prova di apprendimento breve, senza guida assistita

V4/V5, Laboratorio/Monza/Monaco/Le Mans, 16 auto, seed 7717, mutazione 16%,
due generazioni concluse naturalmente per caso. Nessun comando di evoluzione
anticipata, nessun checkpoint o teacher: 8 casi, 16 generazioni, 256 episodi.
Tutti completati nel limite di osservazione; nessuno ha completato un giro
in questo budget. Ciascun ottimizzatore ha eseguito due aggiornamenti.
Il V5 ha raggiunto 32.768 slot, V4 8.192.
[Risultati sorgente](model-benchmark-v500/pass-2/model-benchmark.json).

Il progresso è migliorato in alcuni casi e peggiorato in altri. Non posso
confermare una superiorità generale del V5 o una maggiore rapidità di
apprendimento: due generazioni e un seed sono insufficienti. La prima prova
era contemporanea ad altri controlli CPU, quindi i rapporti di throughput
registrati non sono un benchmark hardware isolato. I campioni temporali
possono inoltre omettere le code fra generazioni.

## Distribuzione e prove finali

Portable e installer x64 sono destinati a `dist-model-v500/`; le verifiche
post-build dei veri eseguibili, hash, firme e preservazione della 4.8.0 vengono
registrate in [release-verification-v500.json](release-verification-v500.json).
Quell'audit conferma lo stato finale; la sola esistenza della build non basta.
L'installer non viene eseguito né installato automaticamente.

Prove finali separate: `model-portable-v500/rewards-smoke.json` (GPU),
`model-cpu-v500/final/rewards-smoke.json` (fallback CPU),
`progress-portable-v500/progress-smoke.json` (salva/carica V2/V3/V4/V5 e
100 agenti V4/V5), `model-benchmark-v500/portable/model-benchmark.json`
(generazioni naturali). Il confronto dei file sorgente/pacchetto e i risultati
effettivi sono riportati dall'audit finale, non dedotti dai nomi delle cartelle.

App version 5.0.0 distinta dal modello V5; nessun nuovo neurone biologico
inventato. La dinamica resta artificiale; non è validata fisiologia della mosca
o una garanzia di 30× reale. Salvataggi 4.8.0 e vecchi eseguibili sono preservati.
