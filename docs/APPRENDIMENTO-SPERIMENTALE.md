# Apprendimento sperimentale — verifica del 14 ottobre 2026

Il problema di guida **non è ancora risolto**: nessuna delle prove riportate
qui completa un giro di Monza. La build Windows CPU DEV e gli esperimenti di
apprendimento sono due prodotti distinti. Il decoder sperimentale non è
installato nella build CPU DEV e i checkpoint JSON di ricerca non sono normali
file `.malecns-save` della release 5.6.0.

## Risultati fisici verificati

| Prova | Distanza massima effettiva | Giri | Esito |
| --- | ---: | ---: | --- |
| Campione del salvataggio originale V3/Monza | 795,680 m | 0 | Urto |
| Decoder sperimentale, migliore campione per ricompensa | 881,382 m | 0 | Urto |
| Decoder con memoria recente, migliore candidata per distanza | 884,343 m | 0 | Urto |

Questi risultati sono stati ripetuti guidando dal traguardo, senza riposizionare
l'auto. I punteggi di ricompensa del sistema originale e dell'obiettivo
sperimentale non vengono confrontati come se fossero identici.

La candidata a 884,343 m ha punteggio −3004,698, peggiore del campione a
881,382 m (−2999,336), nell'identico obiettivo sperimentale. È conservata come
esploratrice di stati nuovi, non promossa a campione per ricompensa.

## Cosa è stato provato

- Crescita di funzioni del decoder basate su attività realmente prodotta dai
  neuroni discendenti del grafo MaleCNS. Aggiungere coefficienti inizialmente
  zero conserva esattamente il comportamento precedente.
- Due stati di memoria artificiali del decoder. **Non sono nuovi neuroni
  biologici**: il grafo V3 rimane di 7.721 neuroni e 242.486 connessioni.
- Nuove funzioni che distinguono attività neurali simili in presenza di memoria
  recente diversa. Le loro posizioni nello spazio delle caratteristiche vengono
  dalle prove effettive del modello, non da traiettorie o comandi prescritti.
- CMA-ES sui coefficienti motori e confronti di variazioni congiunte oppure di
  un solo comando. La ricerca per distanza è dichiarata come obiettivo
  ausiliario; ricompensa e distanza conservano archivi separati.
- Ogni candidata accettata è verificata con una prova fisica completa dal
  traguardo. I segmenti riutilizzati sono ammessi soltanto dopo aver verificato
  l'equivalenza con una prova intera; non vengono presentati come giri completati.

Coordinate, direzione della pista, tempo dell'episodio, waypoint e comandi
desiderati non entrano nelle caratteristiche del decoder. Il progresso è usato
per ricompensa e diagnosi, non come ingresso del controllo.

## Esiti negativi da conservare

La ricerca concentrata sui contesti recenti non ha superato gli 881,382 m.
Il primo confronto CMA-ES con memoria recente non ha migliorato quel limite;
la ricerca più ampia ha prodotto un'esploratrice a 883,996 m, poi affinata a
884,343 m. Aggiungere ulteriori otto funzioni al decoder e provare altre 576
candidate **non ha aumentato** la distanza di 884,343 m. Aumento della capacità
e numero di tentativi non sono prove di apprendimento utile.

L'effetto resta da verificare su altri seed, modelli e circuiti. Non posso
confermare una convergenza generalizzata o il superamento della variante.

## Evidenze locali

- `.impeccable/review/exact-coo/root-replay/verification.json`: replay del
  salvataggio originale, prima e dopo l'ottimizzazione CPU.
- `.impeccable/review/neural-local-rbf/coverage-guard4/report.json`: campione
  sperimentale a 881,382 m.
- `.impeccable/review/neural-local-rbf/causal-cma-wide-guard4/report.json`:
  candidata a 883,996 m.
- `.impeccable/review/neural-local-rbf/causal-single-axis-guard4/report.json`:
  candidata a 884,343 m, con verifica indipendente.
- `.impeccable/review/neural-local-rbf/causal-growing-guard4/report.json`:
  ulteriore crescita senza miglioramento.
- `node --test work/neural-causal-memory.test.cjs work/causal-checkpoint.test.cjs
  work/exact-dense.test.cjs work/progress-guard4.test.cjs
  work/guard-memory-growth.test.cjs work/neural-coverage.test.cjs`: **15 test
  superati**, inclusi conservazione del comportamento, memoria, comandi
  esclusivi e rifiuto di checkpoint incompatibili.

Salvataggio originale, build precedenti, portable, installer e tag pubblicato
restano conservati. Nessuna nuova versione o release è stata pubblicata.
