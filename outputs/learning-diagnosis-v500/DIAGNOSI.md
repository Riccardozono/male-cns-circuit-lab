# Diagnosi dell’apprendimento — app 5.0.0, 9 ottobre 2026

## Esito

Riprodotta una regressione del progresso su Monza in V2, V3, V4 e V5 mentre
il punteggio di selezione migliora. I pesi dell’ottimizzatore cambiano davvero;
gli aggiornamenti da soli non dimostrano una guida migliore. Nessuna correzione
è stata applicata al programma e nessun progresso dell’utente è stato caricato
o modificato. Sono stati aggiunti solo strumenti e rapporti diagnostici.

## Prova attuale, non sessione dell’utente

Stesso circuito Monza, seed 7717, 16 agenti, mutazione 16%, velocità richiesta
30×, un worker e partenza da zero per ogni modello. V2/V3 CPU, V4/V5 WebGPU
su adattatore NVIDIA Lovelace rilevato. Obiettivo di osservazione: 60 generazioni
naturali, oppure 90 secondi reali per modello; nessun comando “Evolvi ora”.
V3 e V5 hanno raggiunto il limite reale prima di 60 generazioni. Un solo seed
e circuito non permettono di generalizzare a tutte le impostazioni o di
identificare il contenuto della sessione che l’utente sta guardando.

| Modello | Generazioni concluse | Mediana massimo progresso, prime 5 | Mediana massimo progresso, ultime 5 | Agenti con giro valido |
| --- | ---: | ---: | ---: | ---: |
| V2 | 60 | 34,9 m | 4,8 m | 0 |
| V3 | 18 | 55,6 m | 7,8 m | 0 |
| V4 | 60 | 169,5 m | 3,4 m | 0 |
| V5 | 53 | 66,4 m | 4,6 m | 0 |

La metrica è la distanza nuova massima di una singola auto per generazione,
non la distanza cumulativa di tutta la popolazione. Ogni colonna riassume
cinque generazioni; non va confusa con la migliore auto storica. Il rapporto
contiene 191 generazioni concluse e 3.056 episodi, e nessun errore di console.
Le medie dei pesi cambiano in tutti i casi (`meanRmsDelta` > 0).

Fonte: `diagnosis.json`, casi separati `v2.json`–`v5.json`; codice del runner:
`../../work/diagnose-learning-v500.cjs`. Strumentazione di sola lettura su una
copia dell’app dal sorgente in un profilo temporaneo separato. Il loader usa
Electron 38.8.6; `appVersion` dell’interfaccia e dei moduli è 5.0.0. Gli hash
dei dieci file di produzione controllati sono identici prima e dopo la prova.

## Problemi riscontrati

1. **Obiettivo disallineato prima del primo giro.** Si seleziona il punteggio
   netto (`simulation.js`, `compareAgents`/`evolve`). Il costo del tempo, la
   penalità terminale e il premio di progresso possono rendere preferibile un
   tentativo più corto che termina con un urto. Nel controllo sintetico dello
   stesso scorer, circa 50 m a 20 m/s e poi un urto valgono −4.164 pt; circa
   100 m alla stessa velocità e stesso urto valgono −4.170 pt. Entrambi sono
   prima del primo checkpoint. Questa inversione è riproducibile senza un
   modello neurale: `reward-audit.json`, runner `audit-learning-rewards-v500.cjs`.
   È una prova delle ricompense, non una macchina reale guidata su Monza.
   Il rapporto conserva anche il controesempio 100→200 m: il nuovo checkpoint
   può invertire il confronto. Non ogni tentativo più lungo riceve meno punti.

2. **La stagnazione misura il punteggio, non il progresso.** `evolve` azzera
   la stagnazione quando migliora il record di fitness. Dopo la quinta
   generazione, in quel caso riduce la mutazione base al fattore 0,82 anche
   quando la distanza sta regredendo. Il comportamento è presente nel codice
   e nei campi `stagnation`/`mutationAmount` degli storici reali.

3. **Ricambio esplorativo escluso nel ramo appreso.** Il ramo con ottimizzatore
   e `policyWeights` imposta a zero gli immigranti e genera i nuovi individui
   dalla stessa media/distribuzione (`simulation.js:558`, `:591`). Tutte le
   generazioni misurate hanno `immigrantCount: 0`. La deviazione media delle
   mutazioni scende da circa 0,128–0,130 a 0,025–0,089 a seconda del modello:
   viene concentrata la ricerca proprio sul comportamento che migliora il
   punteggio sbagliato. Questo è un meccanismo di rinforzo della trappola,
   non una prova isolata che il solo ricambio basterà a risolverla.

4. **Il grafico non è una misura diretta della guida.** `app.js:217` disegna
   soltanto fitness migliore e media. Il progresso è nel riepilogo storico,
   non una curva nel grafico. Un aumento della curva può quindi coesistere
   con una riduzione della strada percorsa. Anche la modalità confronto
   riparte intenzionalmente da zero ad ogni esecuzione, per scelta dell’utente;
   non accumula i risultati fra confronti diversi.

## Intervento proposto, non applicato

Ribilanciare il punteggio iniziale affinché il progresso valido abbia una
preferenza coerente prima del primo giro, evitando che terminare presto con
un urto sia una scorciatoia. Rendere la stagnazione sensibile a progresso,
checkpoint e giri; mantenere una quota di esplorazione indipendente dalla
distribuzione corrente. Conservare i comandi generati dal grafo MaleCNS,
senza pilota di pista, percorso obbligato o esempi di guida inventati.

La correzione richiederà prove prima/dopo con più seed e criteri anti-exploit;
nessuna garanzia di completare un giro viene dedotta da questa diagnosi.
I nove test esistenti di `tests/learning.test.cjs` passano: dimostrano collegamento
e aggiornamenti, non che l’obiettivo ricompensi la guida voluta.
