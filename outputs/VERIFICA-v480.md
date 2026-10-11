# Verifica Windows 4.8.0 — ricompense episodiche

Revisione di scoring `episodic-2`. Le fonti primarie per il comportamento sono
[rewards.js](rewards.js) e [simulation.js](simulation.js);
[formule complete](RICOMPENSE-v480.md).

## Prove già eseguite sul sorgente

- **237 test passati, 0 falliti, 0 saltati**:
  [TAP completo](test-results-v480.tap). Comprendono premio soltanto per strada
  nuova, 32 checkpoint ordinati, due giri, falsi attraversamenti, teletrasporti,
  lentezza, finalizzazione una volta, regressione per ogni giro, record stabile,
  coerenza del ledger e stato identico a 1×/30×.
- Probe neurale V2 Lab da zero, seed 7717, 32 agenti, 12 generazioni naturali:
  progresso massimo della generazione 1 **439,44 m**, della 12 **1.255,41 m**;
  12 aggiornamenti/384 episodi. Dato nel TAP, nessun pilota assistito. Questo
  dato non dimostra giri completati su ogni circuito o convergenza V3/V4.
- App Electron reale: **87 controlli** su V2/V3/V4 × Monza/Monaco/Le Mans,
  **100 agenti** per caso, campioni neurali veri, somme premi/costi, riferimento,
  selezione finale effettiva e aggiornamento ES dopo “Evolvi ora”. V4 WebGPU
  attivo, nessun errore console. [Rapporto sorgente](rewards-source-v480/pass-2/rewards-smoke.json).
- Una verifica visiva wide/narrow e mappa/atlante affiancati: dettaglio leggibile
  e nessun overflow rilevato. Mappe, atlas e selezione restano interattivi.

## Verifica di rilascio e confronto

[Preservazione del nucleo](rewards-core-verification-v480.json) confronta con
il pacchetto 4.7.0 conservato: anatomia, decoder/sensori, ottimizzatore,
fisica Porsche, geometria, rendering e GPU rimangono invariati. La selezione,
il termine degli episodi e il punteggio cambiano intenzionalmente. Sul worker
sono aggiunti soltanto i campi di telemetria del punteggio.

[Confronto a budget fisso](rewards-learning-v480.json): V2, 32 agenti,
8 generazioni naturali, tre seed su tutte e quattro le piste, 4.7.0 contro
4.8.0. I punteggi fra versioni non sono numericamente confrontabili; leggere
progresso, giri e casi censurati. Non estrapolare ai modelli V3/V4.

Tutti i **24 casi** hanno concluso le 8 generazioni richieste, senza censura.
Nel progresso massimo, la 4.8.0 supera la 4.7.0 in **4 delle 12 coppie** e
rimane sotto nelle altre 8; **0 giri** in entrambe le versioni a questo budget.
Il risultato è misto e **non dimostra una migliore velocità di apprendimento**.
Il nuovo obiettivo valuta anche costi che il vecchio ranking ignorava: il
progresso grezzo non basta a confrontare la qualità, ma qui non è stata
dimostrata neppure una superiorità generalizzata sui giri/tempi. I risultati
non vengono sostituiti con traiettorie assistite o dati sintetici.

[Audit post-build](release-verification-v480.json) registra file sorgente/bundle,
hash dei due EXE, firme, test nell'**effettivo portable** su GPU e CPU fallback,
progressi native e conservazione byte-per-byte della release precedente.
Il rapporto viene prodotto dopo compilazione e prove: l'esistenza di questa
pagina da sola non prova che la build o il collaudo finale siano riusciti.

Installer prodotto, non installato automaticamente; EXE non firmati quando
l'audit riporta `NotSigned`. I salvataggi 4.8.0 richiedono esattamente 4.8.0;
4.7.0 e tutti i salvataggi precedenti sono conservati.

## Pacchetto portable e istanze contemporanee

Il primo collaudo CPU in parallelo al collaudo progressi ha dato timeout al
cambio V3 → V4. È stato rilevato un problema nel wrapper portable del builder
installato: il percorso di estrazione di default è fissato per build e viene
eliminato alla chiusura di ciascun avvio. La configurazione finale usa
`unpackDirName: true`, che nella versione installata 26.15.3 evita la definizione
`UNPACK_DIR_NAME` e usa `$PLUGINSDIR/app`, unico per avvio. Il testo descrittivo
del relativo schema non coincide con la condizione del codice: la scelta è
basata sul codice effettivo e verificata sul portable generato, non sulla
descrizione dello schema. Nessuna modifica ai sorgenti di node_modules.

Il rapporto finale registra i collaudi della build ricompilata e i percorsi
distinti delle istanze. Il primo timeout resta in
`rewards-cpu-v480/rewards-error.json`; non viene cancellato o presentato come un
passaggio riuscito. La diagnosi del timeout non è una misura di convergenza.

**Limite delle prove:** movimento, scoring e aggiornamento ES non equivalgono
a convergenza su tutte le piste. Il confronto qui è breve, V2 soltanto.
Non è una prova di FPS sostenuti, velocità reale 30× o fisiologia della mosca.
