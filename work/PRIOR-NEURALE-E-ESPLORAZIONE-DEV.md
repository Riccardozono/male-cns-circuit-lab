# Conservazione delle competenze ed esplorazione neurale

Stato delle prove private del 18 ottobre 2026. Nessun modello nuovo è stato
installato nell'app Windows. Versione 5.6.0, release, UI e salvataggi conservati.
Due giri completi appresi e ripetuti dalla partenza: **non confermati**.

## Perché non basta aumentare il decoder

Le prove sul decoder con tutti i 251 neuroni discendenti sono terminate.
Il reservoir V3 resta di 7.721 cellule e 242.486 connessioni; i parametri
aggiunti al decoder non sono nuovi neuroni anatomici.

| Studio privato | Nuove transizioni PPO | Episodi di training conclusi | Ultima corsa completa dalla linea |
| --- | ---: | ---: | --- |
| `direct-neuronal-motorpool64-r7-first` | 65.536 | 94 | 790,830 m, stallo, 0 giri |
| `direct-neuronal-temporal64-r7-first` | 65.536 | 161 | 316,706 m, urto, 0 giri |

Entrambi hanno 64 aggiornamenti ricostruiti esattamente dal verificatore;
la corsa nativa indipendente ripete la traccia dell'ultima politica, con
708 e 398 controlli rispettivamente, senza fallback CPU nel passaggio neurale.
Queste verifiche confermano l'esecuzione, non un miglioramento di guida.

## Nuovo punto di partenza: mantenere la politica già appresa

`neural-prior-readout-core-r2.cjs` conserva come rappresentazione nascosta
il decoder neurale già allenato, capace di un giro. L'ancora è fissa e
verificata tramite hash; non cambia se cambia il registro dei campioni.
Il nuovo readout riceve 642 valori: storia neurale effettiva, memorie del
decoder, attività di tutti i 251 discendenti, costante e due uscite della
rappresentazione neurale appresa. Non riceve posizione, giro, orologio,
traiettoria o comandi di un insegnante.

Il readout libero ha 42.566 parametri. La sua inizializzazione identità
riproduce esattamente 8.520 controlli della politica conservata: 6.597,375 m,
un giro in 742,550 s, poi stallo. L'azzeramento del nuovo readout ferma
realmente l'auto: non c'è un vecchio comando che lo scavalca.
Encoder, reservoir e rappresentazione precedente restano congelati:
non è apprendimento biologico completo né una partenza da zero.

Prove: `learned-prior-final-readout-preflight/verification.json` e
`learned-prior-training-preflight/verification.json`, sotto
`.impeccable/review/neural-sacl/`.

## Esplorazione e punteggio: difetti osservati

In uno stato finale realmente raggiunto, il comando longitudinale medio
è -0,438. Con deviazione 0,02, la probabilità gaussiana di dare gas al
primo campione è circa 1,39 × 10^-106; con deviazione 0,7 è circa 0,266.
Queste probabilità valgono per quello stato, non per tutta la pista.
Tre coppie di sonde fisiche di sei secondi mostrano che aumentare il
rumore fa provare il gas, ma produce solo centimetri e un urto in una
delle prove. Non è un modello che ha imparato a uscire dal blocco.

R7 penalizzava lo stallo di 2.300 punti aggiuntivi ma non gli urti.
Nella coppia osservata, un urto a bassissima velocità superava così lo
stallo senza avere acquisito una capacità utile. Il costo privato R8
aggiunge 500 punti di penalità a urto, uscita pista e progresso invalido,
pareggiando il costo minimo dei fallimenti. Corregge quella graduatoria;
non dimostra l'ottimalità universale della ricompensa. Punteggio R5 e
fisica originali restano separati e immutati.

Prove: `learned-prior-exploration-escape/verification.json`,
`exploration-and-score-audit.json` nella stessa cartella, e i due test
`neural-prior-training-objective-r8.test.cjs`.

## Readout libero: regressione verificata, non promosso

La preparazione R8 registra 2.048 vere transizioni, ripetute tutte nel
motore nativo; normalizzazione stimata su 1.024 osservazioni e calibrazione
del critico sono separate dalla valutazione della guida.
Il training riparte da uno stato raggiunto davvero a 6.350,182 m, dopo un
giro storico. Quel giro ripristinato non conta come nuovo apprendimento.

`learned-prior-ppo64-r8-first` termina 65.536 nuove transizioni, 381 episodi
conclusi e 64 aggiornamenti. Tutte le otto valutazioni della politica media
dalla linea si fermano a 0 m, 0 giri. La ripetizione nativa indipendente
conferma 81 controlli e 8,017 s. Il modello ha perso la capacità di partire;
non viene scelto come campione e non viene installato nell'app.

Verifica numerica: `verification.json`, report SHA-256
`bccd67f3c1c152da87c613b8c32af84c2bb5ded783dedeb372c6f84a40f8d79f`.
Guida indipendente: `latest-policy-native.json`, nella cartella dello studio.

## Supporto locale: limite misurato

Otto kernel compatti sono stimati senza azioni o ricompense sulle prime
1.024 osservazioni neurali effettive della preparazione R8. I gruppi di
caratteristiche hanno pesi bilanciati, così i 512 valori di storia non
sopraffanno automaticamente gli altri ingressi.

La profilazione fisica della politica iniziale rileva un kernel attivo
in 6.624 dei 7.426 controlli del primo giro e 1.022 dei 1.094 successivi.
L'attivazione massima è rispettivamente 0,897 e 0,920. Quindi questo
supporto **non isola** la parte successiva al primo giro e non garantisce
conservazione delle competenze dopo un aggiornamento.
I giri sono usati solo per raggruppare il rapporto, mai nel calcolo dei kernel.
Prova: `learned-prior-local-support/baseline-profile.json`.

## Nuova prova deterministica, ancora da qualificare

`neural-prior-kernel-motors.cjs` usa gli otto kernel e 16 coefficienti
adattabili sui due motori, mantenendo tutta la rappresentazione neurale
precedente. Il comando grezzo viene poi limitato all'intervallo consentito;
gas e freno sono mutuamente esclusivi. Non è un aumento di neuroni né un
riaddestramento dell'intero connettoma. Due test passano: identità iniziale
sulle 2.048 osservazioni reali e corrispondenza fra coefficienti chiesti,
limitati ed effettivamente passati all'ottimizzatore.

Il preflight fisico `verify-neural-prior-kernel-preflight.cjs` è passato:
corsa completa identica di 8.520 controlli, risultato del prefisso identico,
64 transizioni con coefficienti cambiati riprodotte dopo ripristino completo.
Il training `learned-prior-kernel-frontier16-first` ha terminato 16 generazioni,
256 episodi candidati e 53.198 controlli nuovi dopo il prefisso. Nessun candidato
supera il modello iniziale, anche nel training locale. Cinque valutazioni dalla
linea conservano lo stesso modello a pesi nuovi zero. Il verificatore ricostruisce
esattamente tutti i 16 aggiornamenti CMA e la contabilità dei campioni.
Il controllo dell'archivio ripete davvero il candidato selezionato dal prefisso
e dalla partenza: stessa traccia iniziale, nessun miglioramento qualificato.
Report SHA-256: `f8c9d219c05e9382b82efe822d20a174d3bacac2c97b39c8ffce24b3476c3698`.
Il trainer predisposto usa quattro processi reali e politiche deterministiche.
L'obiettivo `frontier`, se selezionato, serve soltanto a esplorare nuovo
progresso e può conservare urti come genitori di ricerca. Non modifica R5/R8
e non consente di promuovere un modello incidentato. La promozione richiede
sempre guida completa dalla linea, pulita e migliore del riferimento globale
di ricerca di 6.599,862 m. Il progresso del prefisso ripristinato è escluso
dai nuovi controlli, metri e giri registrati.

## Autorità del decoder: limite locale individuato e nuova base

La raccolta `learned-prior-retention-inputs/verification.json` ripete la
politica conservata e registra, ogni quattro controlli, 1.857 ingressi neurali
del primo giro e 273 successivi. Non salva azioni ideali, pose o traiettorie
come input della politica. L'intera traccia fisica coincide ancora con quella
del campione. Questi campioni non sono nuovi giri imparati.

`kernel-authority.json` controlla gli ultimi 20 vettori effettivamente
osservati. In tutti, il supporto compatto rende impossibile annullare il freno
con coefficienti entro ±4: il massimo comando longitudinale ottenibile resta
negativo, con massimo complessivo -0,41549. Ciò è un limite di questo decoder
sperimentale in questi stati; non è una prova che il freno dell'app sia guasto
o che nessuna politica possa raggiungere stati diversi passando prima.

Un primo fit ai 273 stati della politica media con la stessa regola compatta
fallisce il controllo di autorità prima di produrre un modello. File e cartella
del tentativo restano conservati. Non è stato avviato un training su quel fit.

La nuova base `learned-prior-greedy-support-r2/support.json` usa gli stessi
273 ingressi, normalizzazione, gruppi e otto centri, ma normalizza kernel
gaussiani con softmax stabile. Le caratteristiche sono positive e sommano a
uno: il dominio non si spegne più come con un filtro compatto. I coefficienti
possono ora superare l'intera gamma di sterzo e gas/freno. Non è una garanzia
di guida corretta o di conservazione del primo giro dopo il training.

Il fattore dei coefficienti di sterzo è 0,5; la covarianza iniziale di ricerca
è 0,16 sullo sterzo e 1 sul longitudinale, per non aumentare automaticamente
il rumore iniziale di sterzo quando si amplia l'autorità massima.
Tre test passano su 2.130 ingressi reali: identità iniziale, normalizzazione,
autorità nei due sensi, superamento del precedente limite negli ultimi 20
stati e corrispondenza dei coefficienti effettivi passati all'ottimizzatore.

Il preflight `verify-neural-prior-greedy-kernel-preflight.cjs` è passato:
traccia completa iniziale identica di 8.520 controlli, stesso risultato
dal prefisso, 64 transizioni con pesi diversi riprodotte esattamente.
`learned-prior-greedy-kernel-frontier16-first` termina altre 256 prove e
48.953 controlli nuovi dopo il prefisso, senza superare la politica iniziale.
Tutti i 16 aggiornamenti CMA sono ricostruiti esattamente; il candidato
selezionato dall'archivio, ancora con coefficienti zero, è ripetuto dal prefisso
e dalla linea. Report SHA-256:
`273dc67015b15ebdf24461e4c7b06c4dbc75c176cd8ee5ed71276ed6b46b11d6`.
Questo risultato dimostra che correggere l'autorità del decoder non basta,
in questa configurazione, a ottenere il miglioramento cercato.
Nei metadati di diagnostica il campo ereditato
`artificialHiddenUnits: 64` appartiene al readout libero di origine, non
usato come nuovo readout in questa prova: i coefficienti realmente cercati
qui sono 16 su otto funzioni gaussiane, non 64 nuovi neuroni biologici.

## Memoria neurale interna e protezione della competenza precedente

L'audit `learned-prior-hidden-state-audit/verification.json` ripete la
stessa guida di 8.520 controlli e legge 33 valori interni di picco e ritenzione
neurale, ogni 32 controlli: 267 osservazioni. Queste memorie non sono ingressi
espliciti del vettore a 642 valori. Alcune cambiano e restano memorizzate;
altre sono sempre zero. Non sono 33 nuovi neuroni biologici.

Nel campione, `stateHeadNeuronalPeak` resta zero nel primo giro e fino al
controllo 8.288, mentre è 0,83676 al controllo 8.384. La misurazione ha
etichetta di giro e progresso solo nel rapporto: il valore è calcolato
dal contesto neurale precedente, senza leggere giro, coordinate o orologio.
La variabilità osservata non dimostra da sola la causa del fallimento.

La nuova prova `neural-prior-gated-kernel-native.cjs` espone quel valore
interno con un accessor dedicato, senza copiare il veicolo per ottenere
un singolo scalare, e lo usa per modulare le correzioni apprese. Non
inserisce un interruttore basato sul giro. Conserva il reservoir, la
rappresentazione appresa, otto kernel gaussiani e 16 coefficienti adattabili.
L'ingresso effettivo comprende i 642 valori più una memoria neurale.
Il readout non contiene il ramo denso a 64 unità, inutilizzato dalle prove kernel;
il metadato ereditato è corretto esplicitamente in questa nuova famiglia.

Il preflight fisico `verify-neural-prior-gated-kernel-preflight.cjs` è passato.
Confronta l'intero primo giro sotto coefficienti estremi +4 con quello a
coefficienti zero: tutti i 7.426 controlli hanno lo stesso stato completo
e memoria di attivazione zero. Più avanti, con memoria 0,59883 al checkpoint,
i nuovi coefficienti cambiano davvero 64 comandi su 64; il ripristino dopo
reset e la ripetizione di tutte le 64 transizioni coincidono esattamente.
La traccia completa a coefficienti zero conserva il risultato iniziale.
Una verifica sui soli campioni ogni 32 controlli non avrebbe dimostrato
questa conservazione fisica. Non è una prova di due giri appresi.

`learned-prior-gated-kernel-frontier16-first` è terminato: 256 episodi reali,
68.918 controlli nuovi e 16 aggiornamenti CMA. Il candidato più lontano arriva
a 6.621,870 m ma urta; il replay nativo indipendente conferma l'urto e un R5
di 2.240,529. Non viene promosso. La verifica numerica passa e ricostruisce
esattamente le richieste/risposte dell'ottimizzatore; il modello a pesi zero
resta l'unica elite pulita verificata. Il driver NVIDIA installato è poi
cambiato: per le nuove prove è stata creata una copia di ricerca separata,
senza modificare l'originale.

L'ottimizzatore predisposto cerca anche una componente comune dei coefficienti
di ciascun motore: correlazione iniziale 0,75 fra le otto funzioni, covarianza
incrociata sterzo/gas zero. Le varianze marginali dei coefficienti restano
0,16 per lo sterzo e 1 per il longitudinale. Serve a evitare che la media
delle funzioni normalizzate attenui troppo l'esplorazione del comando.
È una scelta di progetto, non una misura di miglioramento della guida.
Due test algebrici aggiuntivi passano su matrice positiva definita,
coefficienti effettivi limitati e varianza del readout sugli ingressi reali.

La possibile correzione anticipata con `frontierNeuronalPeak_3` è stata
verificata sul driver attuale. Il modello di ricerca copiato ha riprodotto
esattamente la traccia completa originale: 8.520 controlli, 6.597,375 m,
un giro in 742,550 s e stesso hash d'azione. Con coefficienti estremi +4,
lo stato completo dell'auto ha coinciso col modello nullo in tutti i 7.426
controlli del primo giro e il gate è rimasto zero; RTX 4060, 15.948 chiamate
CUDA e zero fallback CPU nel preflight. Questo protegge la competenza del
primo giro per questo specifico prior, non dimostra un miglioramento.

Il nuovo `learned-prior-frontier3-gated-kernel-r8-16x16` ha terminato 256
episodi e 72.028 controlli nuovi. La verifica numerica ricostruisce i 16
aggiornamenti CMA. L'élite resta il modello nullo; le valutazioni complete
alle generazioni 1, 4, 8, 12 e 16 ripetono la baseline esatta. Il massimo
grezzo è 6.598,320 m (solo 0,945 m oltre il punto di stallo), ma termina per
urto: R5 2.184,583, R8 1.684,583, un giro sempre in 742,550 s e arresto 45
controlli prima. Replay della pratica e due guide native da linea riproducono
esattamente quel risultato. È una collisione, non un progresso qualificato;
nessuna variante è promossa o integrata nell'app/salvataggio. Servono ancora
due giri e verifiche su altri modelli/circuiti/avvii da zero.

L'audit dell'ultima finestra fisica (96 controlli) mostra che i comandi gas e
freno non si sovrappongono: zero tick di sovrapposizione sia nella baseline sia
nel candidato. Nel candidato il freno è attivo ai controlli 8.459–8.464 e la
velocità scende da 11,76 a 5,83 m/s; dal controllo 8.465 il cervello rilascia
il freno e riapplica gas (0,62–0,83) mentre il sensore frontale normalizzato
scende da 0,05 a 0,01. La velocità risale a 11,03 m/s al controllo 8.474 e
l'auto urta al controllo 8.475. Questo indica che il freno fisico risponde e
che il candidato sceglie poi un comando longitudinale rischioso con poco
spazio frontale; da solo non identifica la causa neurale né prova un guasto del
simulatore. Evidenza completa in `frontier3-impact-window-v2/report.json`.

Le prove da prefisso non sono prove della capacità di percorrere due giri.
Nessuna nuova architettura viene trasferita silenziosamente nei vecchi file
di salvataggio o nelle distribuzioni Windows.
