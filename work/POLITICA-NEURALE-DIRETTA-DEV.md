# Politica diretta e correzione dell'incentivo all'arresto

Esperimenti privati. App Windows 5.6.0, salvataggi, release e campione
utilizzabile invariati. R6 indica una revisione del premio di allenamento,
NON una nuova versione dell'app.

## Cosa cambia rispetto alla cascata

Il grafo V3 reale resta di 7.721 neuroni e 242.486 connessioni. I 28 sensori
attraversano la stessa dinamica ricorrente artificiale CUDA; non vengono
passati direttamente al decoder, né sono usati posizione, tempo, traiettoria
o azioni ideali come ingressi del controller.

Il nuovo readout riceve 64 neuroni discendenti reali e 12 funzioni di contesto
del precedente adattatore, più una costante: 77 feature e 154 pesi motori
tutti aggiornabili con PPO. Non c'è il precedente comando motore congelato
né una cascata di correzioni o proiezione che blocchi il prefisso. Gas e freno
sono separati dal segno di un unico output longitudinale. In assenza di
segnale neurale si restituiscono comandi zero.

I parametri sensoriali/gain e i pesi iniziali del readout sono riutilizzati
da un checkpoint appreso, senza copiare posizioni o usare azioni come etichette.
NON è quindi un pieno cold start. Le 12 basi di contesto restano congelate,
mentre tutti i 154 coefficienti motori sono liberi. Il critico e le due
deviazioni standard di esplorazione non sono nuovi neuroni biologici.

Questa prova differisce anche dal vecchio `train-neural-ppo.cjs`: non ha
proiezione protettiva, nessuna banca di posizioni e usa la fisica/premi
experimental-penalty5 con pass neurale CUDA esatto. Ogni episodio parte
dal traguardo di Monza con la stessa GT3; nessuna pista semplificata.

## Verifiche e prova diretta R5

`direct-neuronal-policy-preflight-r2/verification.json`: corsa media iniziale
identica in ambiente di training e nativo, 648 controlli. Altre 64 transizioni
stocastiche realmente campionate sono state riprodotte nel nativo e confrontate
su osservazioni, premio, fine episodio e pedali. Inizializzazione: 803,478443 m,
−5.389,358099 punti, zero giri, urto. È più debole del riferimento globale
a un giro e non deve sostituirlo per il solo fatto di imparare qualcosa.

Due test controllano GAE separata per ambiente e terminale, e bootstrap
dei segmenti interrotti senza assegnare ricompense terminali inventate.
Gli aggiornamenti usano gamma 1, lambda 0,98, premi fisici divisi per 100,
ottimizzatori separati attore/critico e nessuna proiezione sui pesi del prefisso.

`direct-neuronal-ppo64-from-line`: 65.536 transizioni, 304 episodi realmente
terminati durante i rollout, 64 aggiornamenti. Il verificatore ha ricostruito
esattamente pesi, deviazioni, perdite e hash del critico a ogni aggiornamento.
Report SHA-256:
`9c69ca87e45fd1825d93ad11b8e5bc8051de288e75edf9e6d63f65387c1ea5c9`.
Nessun candidato supera il riferimento globale. La valutazione scelta dal
punteggio R5 percorre 87,907011 m e si ferma per lentezza con −4.346,300352
punti: il punteggio è migliore ma la guida è peggiorata rispetto agli 803 m.
Non chiamarlo miglioramento di guida perché la loss del critico diminuisce.

## Problema di obiettivo osservato e correzione R6

R5 assegna penalità base collisione 3.200 e arresto/lentezza 1.400. Nelle due
corse realmente osservate sopra, il comportamento che si ferma prima ottiene
un punteggio superiore. Questa è una discrepanza misurata rispetto all'intento
di apprendere progresso; non dimostra da sola tutte le cause dell'insuccesso.

`neural-direct-training-objective.cjs` aggiunge SOLO al premio di allenamento
un costo terminale di 1.800 in caso di arresto o lentezza, portandolo alla
penalità base di collisione. Non riduce la collisione, non cambia regole di
terminazione o fisica e non tocca il modulo R5 congelato. I punteggi R5 grezzi
sono conservati separatamente; le transizioni non concluse non ricevono il costo.

`direct-neuronal-policy-preflight-r6/verification.json` ripete entrambe le corse
nel training R6 e nel nativo: tracce e punteggi fisici R5 identici. La corsa da
803 m mantiene −5.389,358099; quella da 88 m ha score di training −6.146,300352.
L'ordinamento scorretto di QUESTA coppia è corretto, senza un comando imposto.
Altre 64 transizioni reali confrontano premio grezzo e costo esplicito.
Due test verificano la parità terminale e l'assenza di penalità su segmenti aperti.

## Confronto controllato R6

`direct-neuronal-ppo64-from-line-r6` riparte dagli stessi pesi, critico e semi.
`matched-first-rollout.json` confronta dopo la raccolta le prime 1.024 transizioni:
osservazioni, azioni campionate, next state, terminali e premio fisico R5 devono
essere identici. I vecchi dati sono usati solo per questa verifica, non come
etichette o azioni di insegnamento. Cambiano solo i premi terminali R6.

La selezione diagnostica confronta lo score R6, ma la promozione verso l'app
richiede ANCORA il punteggio R5 originale e il progresso/giri del riferimento
globale verificato a 6.599,861744 m: non si dichiara successo abbassando l'asticella.
Un eventuale candidato deve superare due corse complete e la successiva prova
nativa indipendente. Le valutazioni durante l'allenamento interrompono alcuni
episodi aperti: quei segmenti sono dichiarati censurati e non contati come finiti.

Comandi Python locali:

```
work/train_direct_neuronal_ppo.py --tag direct-neuronal-ppo64-from-line --updates 64
work/verify_direct_ppo_study.py direct-neuronal-ppo64-from-line
work/train_direct_neuronal_ppo_r6.py --tag direct-neuronal-ppo64-from-line-r6 --updates 64
work/verify_direct_ppo_study.py direct-neuronal-ppo64-from-line-r6
```

Le prove sono già avviate/eseguite: non riavviarle da uno stato vecchio senza
controllare il processo effettivo. I report terminali e i verificatori sono
le fonti per l'esito, non i soli contatori degli aggiornamenti o questa descrizione.

## Esiti terminali dei confronti

R6 con esplorazione iniziale invariata: 65.536 transizioni, 214 episodi
realmente conclusi nei rollout e 64 aggiornamenti, nessun candidato globale.
Il migliore secondo lo score di training resta l'inizializzazione da 803 m;
l'ultima valutazione percorre 249,431296 m e urta. Tutti i 64 aggiornamenti
sono stati ricostruiti esattamente dal verificatore. Report SHA-256:
`ff3d64d408199081db555e294e663df996a5e95e5844ed7d9cb2ba42bb8a9f49`.
Le prime 1.024 transizioni coincidono fisicamente con R5; cambiano sei premi
terminali. La correzione del caso 88 m contro 803 m è verificata, ma NON
ha prodotto da sola una guida migliore.

### Controllo della scala di esplorazione

`direct-neuronal-ppo64-from-line-r6-low-noise` cambia soltanto le deviazioni
iniziali delle due Gaussiane da [0,08; 0,2] a [0,02; 0,02]. Stessi pesi,
critico, semi, algoritmo e premio R6. Sono stati confrontati 2.048 estratti
normali nelle prime 1.024 transizioni, errore massimo 1,33e-15: i numeri
casuali coincidono, mentre le traiettorie fisiche sono legittimamente diverse
per l'ampiezza del rumore. Nessuna azione storica viene usata come insegnamento.

Anche questa prova conclude 65.536 transizioni e 64 aggiornamenti, con 95
episodi realmente terminati. Il verificatore ricostruisce esattamente tutte
le operazioni numeriche; report SHA-256:
`7d7cd9405f1c9a06949b38a9dda7e59b58fab3793386b837d1e697695c201f96`.
La massima distanza nelle valutazioni medie è 805,208224 m, terminata per urto.
Il migliore scelto dallo score R6 percorre 796,184572 m e si ferma:
R5 −3.576,656321, R6 −5.376,656321. Non è un miglioramento sul riferimento
globale e non viene installato. Un'ulteriore corsa nativa indipendente di
685 controlli riproduce esattamente questa valutazione e i due punteggi,
con 685 chiamate GPU e nessun fallback: `independent-mean-native.json`.

Resta dunque un ordinamento locale che preferisce fermarsi vicino all'urto:
796 m fermi ottengono uno score R6 leggermente superiore agli 803 m con urto
dell'inizializzazione. La parità della SOLA penalità base non include l'ulteriore
costo d'impatto della collisione. Non presentare R6 come correzione universale
del premio o una soluzione del primo tratto. I dati sostengono un controllo
successivo dei costi terminali completi e della capacità del readout, non
altre affermazioni di convergenza dalla sola riduzione delle perdite.

Tutte e tre le prove sono concluse; nessun processo di training lasciato
in esecuzione. Il campione globale a un giro e la copia Windows restano invariati.
