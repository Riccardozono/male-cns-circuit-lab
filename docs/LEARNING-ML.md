# Apprendimento: correzioni e verifiche di sviluppo

Verifiche del 12–13 ottobre 2026, confrontate con il sorgente distribuito in
`v5.6.0` (`7cb6fcf0b12bd56bd7a7510fef147f7356a2f3a4`). Questo lavoro non
crea una nuova versione, non sposta il tag e non sostituisce portable o installer
pubblicati. La copia locale di prova è separata in `dist-learning-dev-560`.

## Che cosa apprende il sistema

La guida resta un controllo neurale ricorrente sul grafo anatomico MaleCNS.
Le ricompense dei tentativi ordinano le policy e una strategia evolutiva
diagonale aggiorna media e dispersione dei parametri: non è PPO, non è una
replica dell'apprendimento biologico e non aggiorna individualmente ogni
sinapsi del connettoma. Restano 202 parametri dell'adattatore per V2–V4 e
346 per V5. Non sono stati aggiunti un pilota, traiettorie prestabilite,
etichette di guida, campioni inventati o un bypass sensori→comandi.

L'uso di ranking e perturbazioni opposte è coerente con la famiglia delle
[Evolution Strategies di Salimans et al.](https://arxiv.org/abs/1703.03864).
La particolare politica di selezione e le soglie sotto sono scelte di questo
simulatore, non risultati o garanzie del paper.

## Modifiche conservate

- **Pareggi corretti.** Se tutti i tentativi hanno lo stesso punteggio, media
  e dispersione rimangono invariate. Il contatore `updates` conta i round
  elaborati, compresi quelli neutri: non prova da solo che la guida migliori.
  Nei pareggi parziali, le utilità di ranking sono mediate sull'intero gruppo,
  anche se questo attraversa il limite di selezione. L'ordine degli agenti
  non deve inventare una preferenza.
- **Campionamento antitetico ai limiti.** La perturbazione è limitata prima di
  formare i figli, evitando che il clipping indipendente deformi la coppia.
  Le deviazioni rimangono normalizzate dalle scale dell'ottimizzatore.
- **Più prove nelle piccole popolazioni.** Sotto 16 agenti il budget ordinario
  delle élite è `max(1, floor(population / 8))`; da 16 in su resta 4. Campione
  importato e storico, quando distinti, mantengono i propri slot protetti.
  Mutazione zero conserva il comportamento senza apprendimento.
- **Valutazione separata dai punti.** I confronti riportano distanza valida,
  giri, seed, popolazione, budget in generazioni e backend. Le curve di punti
  non sono una prova di convergenza.

Ricompense `progress-3`, decoder, dinamica neurale, sensori, fisica, circuiti,
formato dei salvataggi e dimensioni dei tensori sono rimasti quelli della
5.6.0. Non viene effettuata alcuna migrazione o aggiramento dei controlli.

## Risultato misurato su V3

CPU, Monza, partenza da zero, 8 agenti, mutazione 0,16, 12 generazioni naturali.
La misura è la mediana del massimo progresso valido nelle ultime 5 generazioni,
in metri, non il tempo sul giro e non la durata reale del benchmark.

| Seed | 5.6.0 distribuita | Sorgente corretto | Differenza |
| --- | ---: | ---: | ---: |
| 7717 | 732,42 m | 732,78 m | +0,05% |
| 1847 | 406,96 m | 688,40 m | +69,16% |

La media delle due mediane passa da 569,69 a 710,59 m (+24,73%). Due seed non
dimostrano un'accelerazione universale. Nessuna delle prove completa un giro.
Non estendere il risultato a 100 agenti o al backend GPU senza altre misure.

## Esperimenti scartati

Sono state provate anche ricerche principalmente attorno ai genitori,
ricompensa di progresso quadruplicata, maggiore centratura sul campione,
popolazione iniziale accoppiata e normalizzazione del decoder. I miglioramenti
su singoli casi non bastavano: alcune varianti regredivano su Monza/V3 o
fallivano il test di guida preesistente. Non sono incluse nel sorgente finale.
Le varianti interrotte e i limiti temporali non vanno presentati come prove
concluse o convergenza. I dati privati di verifica restano ignorati da Git.

## Verifiche e riproducibilità

- `npm test`: 366 test superati, inclusi il benchmark di guida già esistente,
  assenza di bypass neurale e prosecuzione deterministica dopo ripristino.
- `node work/verify-learning.cjs`: 19 controlli superati, inclusi stati
  sintetici generati dal pacchetto originale per V2/V3/V4/V5, anatomia e
  checksum degli eseguibili pubblicati. Non importa salvataggi dell'utente.
- Smoke nativo dei salvataggi con profilo isolato e fallback CPU: 49 controlli
  superati, nessun errore console.
- V4/V5 sono stati eseguiti sul motore ibrido con WebGPU NVIDIA Lovelace,
  Monza, seed 7717, 16 agenti, senza campioni precedenti o generazioni forzate.
  Nel limite di 120 s reali per caso V4 ha completato 20 generazioni e V5 9:
  la prova V5 è censurata. Entrambi sono rimasti senza giri completati. I tempi
  reali di queste esecuzioni concorrenti non sono una misura comparativa di
  prestazioni. Questo non dimostra un miglioramento dei modelli completi.

Per un confronto CPU, scegliere tag nuovi: gli strumenti rifiutano di
sovrascrivere report esistenti.

```powershell
node work/benchmark-learning.cjs --source=dist-landscape-v560/win-unpacked/resources/app/outputs --models=v3 --circuits=monza --seeds=7717,1847 --generations=12 --population=8 --tag=old-repeat
node work/benchmark-learning.cjs --models=v3 --circuits=monza --seeds=7717,1847 --generations=12 --population=8 --tag=new-repeat
node work/benchmark-learning-hybrid.cjs --tag=hybrid-repeat
```

Gli strumenti CPU supportano V2–V5 e circuiti/seed multipli; il motore CPU dei
modelli grandi può essere costoso. Il test ibrido ha un limite reale di
sicurezza e usa un profilo Electron separato. Il limite non forza l'evoluzione
e non aggiunge un tempo massimo alla simulazione ordinaria.

Il sorgente si avvia con `npm start`. La copia di sviluppo si avvia anche con
`Avvia-apprendimento-dev.ps1`, che usa un profilo separato dai progressi
dell'app distribuita. Non è una nuova release Windows.

Evidenze locali: `.impeccable/review/learning-ml/final-all.tap`,
`baseline-v2.json`, `final-v2.json`, `baseline-large.json`, `final-v3.json`,
`preservation.json`, `final-progress/progress-smoke.json`,
`hybrid-final/result.json`. I report grezzi possono contenere percorsi locali:
non vengono pubblicati o inclusi nei pacchetti.
