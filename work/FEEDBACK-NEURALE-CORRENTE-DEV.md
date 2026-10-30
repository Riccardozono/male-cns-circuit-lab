# Correzione da attività neurale corrente

Esperimento privato: nessuna modifica al default Windows, alla versione 5.6.0,
ai salvataggi, alla fisica o alle penalità distribuite.
Il riferimento da superare è 6.599,833256472155 m e 4.061,6942943133963 punti,
un giro in 742,5501609581744 secondi. Non usare un riferimento storico più debole.

## Struttura

Il controller precedente è interamente congelato. Un nuovo readout di 18
coefficienti riceve otto valori CORRENTI di neuroni discendenti reali del
modello V3, più una costante. Sono selezionati dalla variabilità e correlazione
delle attività realmente osservate nella parte finale della corsa del campione.
Non si usano comandi ideali, posizione, tempo, traiettoria o stato fisico come
etichette o nuovi ingressi. La memoria neurale precedente modula l'attivazione
del readout. Non sono 18 nuovi neuroni biologici.

Questa differisce dalle sole tracce decadenti: a parità di memoria, i nuovi
comandi possono cambiare quando cambia l'attività neurale attuale. Due test
verificano questa proprietà, la conservazione del controller con pesi/gate
zero e i limiti con pedali esclusivi.

## Errore preliminare conservato e revisione R2

La prima preparazione ha indicato l'inizio della memoria leggendo lo stato
memorizzato dal precedente comando prima di chiamare lo step nativo. La lettura
diagnostica era quindi un controllo indietro rispetto all'attivazione usata
per il comando corrente: indice 8.377 invece di 8.376.
Il controllo del trasporto ha fermato `neuronal-current-feedback256-first`
prima di valutare qualsiasi candidato. `failure.json` e tutti i sorgenti
originali sono conservati. Non interpretare questa prova come 256 episodi.

La revisione R2 usa le caratteristiche neurali dell'osservazione corrente
per individuare la prima attivazione. Non salta l'assert, non introduce un
ritardo nei comandi e non altera le vecchie prove o l'app.
I nuovi sorgenti terminano in `-r2.cjs` o `_r2.py`; i dati separati sono
in `current-neuronal-feedback-prepared-r2`.

La preparazione e la verifica nativa devono riprodurre tutti i valori reali
prima del comando, rifare il fit e coincidere con la traccia del campione.
Poi quattro processi fisici raggiungono autonomamente il prefisso e confrontano
zero readout sia da partenza completa sia dal prefisso. Le prove corte non
sono giri completi indipendenti. Solo episodi conclusi entrano nella selezione.

## Comandi locali

Node fissato: `.impeccable/runtime-node24/node.exe`.
Python locale: `.impeccable/rl-venv/Scripts/python.exe`.

```
work/prepare-current-feedback-r2.cjs
work/verify-current-feedback-native-r2.cjs
work/train_current_neuronal_feedback_r2.py --tag neuronal-current-feedback256-r2 --generations 16
work/verify_current_neuronal_feedback_r2.py neuronal-current-feedback256-r2
work/verify-current-feedback-native-r2.cjs neuronal-current-feedback256-r2
```

Non riavviare comandi già in esecuzione o sovrascrivere le prove: controllare
prima processi e handle. Il verificatore numerico ricostruisce tutti gli
aggiornamenti CMA ma non esegue nuove corse. Un eventuale candidato richiede
due partenze complete e la prova nativa finale. Consultare i report terminali
per l'esito effettivo: questa architettura non è una promessa di convergenza.

## Verifiche della preparazione R2

`current-neuronal-feedback-prepared-r2/independent-native.json` è passato:
8.531 controlli e 4.401.996 valori osservati riprodotti esattamente, fit rifatto
e prima attivazione a 8.376. La traccia completa resta
`1b598d56f9d312ecb07e68679a493b388477eb56eeeee4ec2826dc981b48763a`,
con 8.531 chiamate GPU e nessun fallback CPU.
Il fit usa 155 osservazioni effettive successive all'attivazione; i dati
prima dell'attivazione sono comunque conservati e verificati nel replay.

Gli indici nella sequenza di 516 valori sono
`394, 432, 418, 497, 420, 408, 414, 397`: appartengono ai 128 neuroni
discendenti correnti, non ai blocchi storici o ai quattro valori aggiuntivi
del decoder. Nei 155 campioni, le otto feature normalizzate hanno intervalli
non nulli (circa 1,70–1,97): non sono ingressi costanti. La nona feature è
una costante di bias. Questo controllo non dimostra che gli ingressi siano
sufficienti a imparare la curva o a generalizzare.

L'esperimento corretto è `neuronal-current-feedback256-r2`; quello senza
`r2` resta fallito prima dell'allenamento e non deve essere contato tra
le prove concluse.

## Risultato terminale R2

`neuronal-current-feedback256-r2` ha concluso 256 candidati, 16 aggiornamenti
CMA e 19.184 controlli di suffisso, senza un miglioramento pulito. 171 prove
sono terminate per urto, 45 per arresto e 40 per lentezza.
Il miglioramento del campione resta quindi NON dimostrato: non promuovere
il readout perché i test numerici o l'integrazione funzionano.

Il verificatore ha ricostruito esattamente tutte le proposte, i punteggi
ufficiali usati per la selezione e gli stati dell'ottimizzatore. SHA-256
del report:
`41606d1c0d15e2feb3dd48643392bf8ee74420d331c9ba9245da41975703925a`.

Il candidato più lontano, 6.634,520829 m, termina per urto con 2.236,547578
punti ed è inferiore al riferimento pulito. Una corsa nativa indipendente
con tutti i suoi 18 pesi NON nulli ha riprodotto esattamente il risultato
e la traccia di 8.468 controlli:
`f8aa432576230e95cae4659bc883def33c425fa1a3bb43c89982f6ab97dbfe7f`.
La memoria era attiva per 91 controlli; 8.468 chiamate GPU, nessun fallback.
File `failed-candidate-native-transfer.json`: è una diagnostica di trasferimento,
non una promozione. Non prova correttezza universale o la causa dell'urto.

Sono preservati sia il fallimento iniziale sia la revisione corretta; il primo
ha zero candidati valutati e NON si somma ai 256. `APPLICABILITY.json` nella
prima preparazione distingue la validità del replay a pesi zero dall'errore
di etichettatura dell'inizio del contesto, che ne impediva l'allenamento.

L'app utilizzabile non è stata modificata. Questo esperimento dimostra che
il feedback attuale è implementato e trasferisce il candidato controllato,
non che abbia imparato una strategia migliore. Ripetere lo stesso CMA senza
un nuovo criterio di proposta dei candidati non è giustificato da questi dati.
