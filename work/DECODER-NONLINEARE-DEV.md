# Decoder non lineare e critico: esperimenti privati

Aggiornamento successivo: [conservazione del prior ed esplorazione](PRIOR-NEURALE-E-ESPLORAZIONE-DEV.md).
Comprende l'esito negativo del decoder a 251 discendenti e del readout
libero a 642 ingressi, le verifiche R8 e la nuova prova con kernel neurali.
Le sezioni seguenti conservano la cronologia delle prove precedenti.

Stato di lavoro del 18 ottobre 2026. Nessun nuovo modello promosso nella
copia Windows; l'obiettivo dei due giri rimane da raggiungere.

## Architettura effettiva

Il nuovo decoder riceve le stesse 77 caratteristiche neurali: 64 attività
discendenti normalizzate, 12 contesti neurali già appresi e una costante.
Il connettoma V3 resta di 7.721 cellule e 242.486 connessioni, con dinamica
artificiale. Encoder, guadagni sinaptici e basi dei contesti sono congelati.

Al percorso lineare di 154 parametri viene affiancato un percorso
77 → 64 tanh → 2, per un totale di 5.276 parametri motori addestrabili.
Le 64 unità aggiunte appartengono al decoder artificiale. All'inizio i suoi
pesi d'uscita sono zero: il comportamento iniziale coincide esattamente
con quello lineare, mentre entrambi i percorsi possono essere addestrati.
La politica usa attività neurali; non riceve traiettorie, coordinate,
tempo di gara o azioni di un insegnante.

Test numerico passato: pesi, critico e RNG iniziali equivalenti, gradiente
sui due percorsi, corrispondenza Float64 fra Node e Torch. Un errore del
primo test era dovuto alla conversione della fixture in Float32, corretta
prima delle prove fisiche.

`direct-neuronal-nonlinear-preflight/verification.json` e
`direct-neuronal-scaled-preflight/verification.json` ripetono realmente la
corsa iniziale e 64 transizioni campionate nel motore indipendente.
La traccia iniziale è identica a quella precedente: 803,478 m, urto,
0 giri. Questa è la base debole dell'esperimento; il riferimento globale
più forte rimane distinto e non viene abbassato per promuovere i risultati.

## Ripresa di un allenamento interrotto

`direct-neuronal-nonlinear64-r7-first` si è interrotto dopo 54 aggiornamenti,
senza report conclusivo e senza processi attivi al controllo del 18 ottobre.
I file originali sono conservati. Il programma
`resume_direct_nonlinear_study.py` ricostruisce davvero le quattro simulazioni,
il RNG e tutti gli aggiornamenti dell'ottimizzatore: le 55.296 transizioni
ri-eseguite coincidono esattamente con i dati originali. Completa poi le
10.240 transizioni mancanti in `direct-neuronal-nonlinear64-r7-resumed`.
Il replay non viene contato come nuovo apprendimento.

Il report finale contiene 65.536 transizioni uniche, 115 episodi di training
conclusi e 64 aggiornamenti. Gli episodi non equivalgono a giri o generazioni.
La verifica numerica ricostruisce tutti i 64 aggiornamenti, inclusi i file
del prefisso originale. La ripetizione nativa dell'ultima politica conferma
476 controlli e la stessa traccia: 695,945 m, urto, 0 giri.
Tutti i 5.276 parametri risultano cambiati; ciò prova l'attività
dell'ottimizzazione, ma il modello non guida meglio.

Report SHA-256: `22a01c84ba8714a6e423915ba492f5162409f6c82c4bed1901b5f4c75a7042d6`.

## Scala dei segnali e normalizzazione

`audit_direct_neuronal_feature_scale.py` controlla 65.536 osservazioni
effettive del precedente controllo R7. La deviazione standard mediana è
0,03047 sulle attività e 0,01396 sui contesti; alcuni contesti hanno una
variazione molto più piccola. Il 98,59% degli argomenti iniziali delle
tanh del nuovo ramo è entro ±0,2. Questa soglia descrive i dati e non
dimostra da sola la causa dell'insuccesso.

`prepare_direct_neuronal_scaler.py` usa soltanto le prime 1.024 osservazioni
di training del controllo per stimare centro e scala. Non usa azioni,
ricompense o dati delle valutazioni. La deviazione minima 0,02 e il clipping
a ±5 sono impostazioni esplicite dell'esperimento. Il percorso lineare
continua a ricevere i segnali grezzi, preservando la politica iniziale.
Sul campione usato per il fit, la variazione mediana dell'attivazione
nascosta passa da 0,001265 a 0,05900.

Studio `direct-neuronal-scaled64-r7-first`: 65.536 transizioni, 338 episodi
conclusi, 64 aggiornamenti e otto valutazioni complete, tutte senza giri.
La politica finale si arresta dopo 17,880 m. Il suo punteggio R5 è
-4.396,411; applicando il costo terminale R7 diventa -6.696,411.
Aggiornamenti ricostruiti esattamente e corsa nativa ripetuta: 161 controlli,
nessun fallback CPU. La normalizzazione da sola ha peggiorato questa prova.

Report SHA-256: `4aa3f0b7adc3662494976b2962875ea3d9690768e27699db8fc26c29741b1a0a`.

## Calibrazione iniziale del critico

`prepare_direct_critic_baseline.py` raccoglie altre 4.096 transizioni reali
senza aggiornare la politica iniziale. Cinque episodi completi sono ripartiti
fra quattro processi; i segmenti finali incompleti sono esclusi dai target.
I ritorni completi, con gamma 1 e ricompensa divisa per 100, stimano un solo
offset iniziale dell'uscita del critico. Tre processi servono al fit e il
quarto resta fuori dal calcolo. L'errore RMSE su quest'ultimo scende da
64,6121 a 1,64254. L'offset è -63,50873463115077.

`verify-direct-critic-calibration.cjs` ripete nel motore indipendente tutte
le 4.096 transizioni. Il test del learner conferma che cambia soltanto il
bias finale del critico; pesi motori, distribuzione iniziale e RNG coincidono.
Il campione è limitato a cinque episodi iniziali: non dimostra accuratezza
delle stime su tutto il circuito o guida migliore.

Studio `direct-neuronal-calibrated64-r7-first`: 65.536 transizioni PPO
aggiuntive alle 4.096 della calibrazione, 95 episodi conclusi e 64
aggiornamenti. Nessuna delle otto politiche valutate completa un giro.
Ultima politica: 798,081 m e arresto, R5 -3.574,786 / R7 -5.874,786.
Verifica numerica completa passata; 686 controlli nativi identici e CUDA
senza fallback CPU. Recupera distanza rispetto al collasso del controllo
normalizzato, ma non supera il punto iniziale di 803,478 m.

Report SHA-256: `b274536c9f7fe4e24595acdc299e6957d69caa8f8a4c461c8e55312dba3aba57`.

## Credito temporale

La ricorrenza GAE corrente usa gamma 1 e lambda 0,98. Il contributo diretto
di un residuo terminale viene moltiplicato per 0,98 a ogni controllo:
0,13262 dopo 100 controlli e 0,017588 dopo 200. Questo calcolo non esclude
il contributo della stima del critico nelle transizioni intermedie.

`direct_neuronal_ppo_wholecredit.py` prova lambda 1, mantenendo il critico
calibrato e tutte le altre impostazioni. Il test verifica credito fino
all'inizio del segmento, separazione fra episodi e processi e bootstrap
del segmento incompleto. I segmenti restano lunghi 256 controlli; non
vengono presentati come ritorni Monte Carlo completi di episodi arbitrari.

Studio `direct-neuronal-wholecredit64-r7-first`: 65.536 transizioni PPO,
131 episodi conclusi e 64 aggiornamenti, oltre alla calibrazione già
descritta. Tutte le otto valutazioni complete hanno 0 giri. Il massimo
progresso valutato è 804,836 m, con urto; il punteggio R7 è -5.392,457,
inferiore a quello iniziale. L'ultima politica urta a 707,274 m, R7
-5.657,384. Ricostruzione numerica completa e 481 controlli nativi
corrispondenti, CUDA senza fallback. Nessuna promozione.

Report SHA-256: `41ff05692ea60f341c7ce1df83b266f112aa10fe917da15645a5de1fab2b63c6`.

## Curriculum da stati realmente raggiunti

`prepare-direct-curriculum-snapshots.cjs` percorre realmente la corsa
iniziale e salva cinque stati prima dell'errore, ai controlli 451, 510,
547, 574 e 605. Le posizioni, la velocità, la trasmissione, il registro
ricompense e l'attività neurale sono quelli della simulazione effettiva.
La stessa corsa completa conserva la traccia iniziale verificata.

`verify-direct-curriculum-preflight.cjs` raggiunge indipendentemente quei
cinque punti e confronta l'intero corpo dell'auto e le osservazioni neurali.
Ripete inoltre 320 transizioni effettive dopo le riprese, inclusi eventuali
reset. La valutazione dalla linea conserva la traccia originale.

Il reset di training sceglie la linea con probabilità 0,25; altrimenti
sceglie uniformemente uno dei cinque stati reali. Un RNG separato sceglie
gli stati. L'identità del punto e le coordinate sono metadati di reset,
esclusi dalle 77 caratteristiche della politica. Il decoder rimane
interamente addestrabile, senza protezione di un prefisso di guida.
`actualNewProgress` e `actualNewControls` escludono il tratto già percorso
prima dello stato salvato. Tutte le valutazioni partono dalla linea.

Il primo avvio `direct-neuronal-curriculum64-r7-first` si è fermato prima
di qualsiasi rollout: un processo inizializzato da snapshot non aveva
ancora eseguito CUDA, quindi la richiesta dell'identità del backend
falliva correttamente. L'ambiente `neural-direct-curriculum-env-r2.cjs`
esegue prima una vera osservazione iniziale sulla GPU, poi installa lo
stato scelto senza far avanzare nuovamente il cervello salvato.
La verifica aggiornata include quattro avvii in processi nuovi.
Un problema di risoluzione dei percorsi nello scanner delle dipendenze
del test è stato corretto prima di produrre la nuova prova conclusiva.

Il confronto `direct-neuronal-curriculum64-r7-r2` ha completato 65.536
transizioni PPO e 64 aggiornamenti. Dei 344 episodi di training conclusi,
78 partono dalla linea e 266 da uno stato verificato. Il verificatore
controlla separatamente il tratto nuovo e il prefisso storico, e che
tutte le otto valutazioni della politica media partano dalla linea.
Restano stessi PPO, lambda 1, critico calibrato, rumore, fisica e obiettivo
R7 della prova precedente; cambia la distribuzione iniziale del training.

Nessuna valutazione completa un giro. L'ultima arriva a 727,500 m e urta;
R5 e R7 valgono -5.580,270. Tutti i 64 aggiornamenti sono ricostruiti
esattamente; una ripetizione nativa completa conferma i 521 controlli e
la traccia finale, CUDA senza fallback. Nessun candidato supera il
riferimento e il curriculum non viene promosso nell'app.

Report SHA-256: `16787aa159246e4f26e1851da90f9dfa998be771ec60dcc935037d0908a34c7d`.

## Lettura di tutti i neuroni discendenti: preparazione verificata

Un controllo diretto del grafo V3 trova 251 cellule classificate
`descending_neuron`. Il decoder precedente ne leggeva 64.
`neural-direct-motorpool-core.cjs` aggiunge alla lettura le restanti 187,
usando la stessa attività già calcolata dallo stesso passaggio CUDA.
Le caratteristiche diventano 264: 251 neuroni, 12 contesti e una costante.
Il decoder con 64 unità artificiali ha ora 17.618 parametri motori.
La rete anatomica resta di 7.721 cellule e 242.486 connessioni.

I coefficienti lineari dei nuovi ingressi e l'uscita del ramo non lineare
partono da zero. La guardia di attività originale è conservata. La
prova `direct-neuronal-motorpool-preflight/verification.json` ripete
la corsa iniziale completa con la stessa traccia e risultato, più
64 transizioni campionate. Il test numerico a 264 ingressi verifica
layout, gradiente, RNG, critico e corrispondenza Float64 Node/Torch.

L'ambiente `neural-direct-motorpool-env-transport.cjs` porta il limite
esplicito dei messaggi a 1 MiB, necessario per serializzare tutti i
parametri in Float64. `transport-verification.json` passa un messaggio
effettivo di 366.171 caratteri e ripete 64 transizioni nel motore nativo
con una piccola perturbazione diagnostica dei parametri.

Questa variante è pronta per le prove di apprendimento, ma non è ancora
stata addestrata. Lettura più ampia e test di equivalenza non provano
che impari meglio. Servono preprocessing/critico compatibili con i
264 ingressi e un confronto di training completo prima dell'adozione.
Il formato privato è distinto dai salvataggi e dalle famiglie precedenti.

## Confini delle prove

Tutti i percorsi di evidenza citati sono sotto
`.impeccable/review/neural-sacl/`, relativi alla radice del progetto.
Le prove numeriche dimostrano ricostruibilità degli aggiornamenti; le prove
native dimostrano la ripetibilità delle corse selezionate. Nessuna di queste
proprietà da sola prova un apprendimento riuscito o la soluzione dei due giri.
Versione 5.6.0 e modello della copia Windows restano quelli qualificati.
