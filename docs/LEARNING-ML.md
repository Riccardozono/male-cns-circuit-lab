# Apprendimento: correzioni e verifiche di sviluppo

## 30 ottobre 2026 — diagnostici pubblicati nel branch dev

Questi strumenti sono ricerca separata dall'app: non cambiano fisica, sensori,
ricompense, controllore, versione o compatibilità dei salvataggi distribuiti.
Nessuna delle nuove varianti ha raggiunto l'obiettivo di due giri. Dataset,
pesi allenati, salvataggi e report integrali rimangono locali sotto `.impeccable/`;
non sono inclusi nel repository. I replay che usano quei dati richiedono quindi
gli artefatti privati originali; un clone da solo non basta a riprodurli.

### Ordinamento dell'ottimizzatore

`work/research-v3-sensory-compensation.cjs` aggiunge
`--optimizer-objective=fitness`: cambia soltanto in memoria il ranking ES,
lasciando invariata la scelta dei genitori e del campione sicuro. L'audit registra
l'ordinamento effettivo e la variazione dei parametri. V3/decoder7, Monza,
checkpoint gen.180, 100 auto, seed 850817, tre generazioni allenate:

| Obiettivo ES | Auto sicure gen.181/182/183 | Progresso sicuro gen.181/182/183 | Giri |
|---|---:|---:|---:|
| Controllo, progresso sicuro | 67 / 60 / 66 | 798,967 / 798,967 / 799,655 m | 0 |
| Fitness con penalità | 67 / 59 / 58 | 798,967 / 798,967 / 799,655 m | 0 |

Il ranking per fitness preferisce anche urti precoci: nelle tre generazioni
allenate i primi classificati dell'ES urtano a 21,918, 9,660 e 13,812 m.
La frontiera sicura non avanza; variante respinta. Il ramo usa 155.069 chiamate
CUDA e zero fallback CPU, con checkpoint d'uscita validato. Report locale:
`progress56-optimizer-objective-v3-monza-gen180-rtx-20261030/fitness/`.

### Trasferimento di una precedente policy neurale

Un replay separato riproduce una policy privata già allenata: 6.590,792 m,
un giro e 849,483 s, nel suo runtime storico `penalty5`. Questo risultato non
prova la compatibilità con l'app corrente. I nuovi strumenti
`work/current-physics-runtime.cjs`, `work/current-statehead-environment.cjs` e
`work/replay-statehead-current-physics.cjs` mantengono i validatori del modello
originale e confrontano il suo comportamento nel corpo e sul circuito correnti.

Il prototipo `first-lap-moving` consente di proseguire il primo giro soltanto
con movimento e progresso effettivi; mantiene i costi del passo lento e le
terminazioni per urto, uscita, stallo e due giri. È un'ablation esplicita,
non una nuova regola dell'app. La seconda ablation disattiva solo l'osservazione
dell'ingombro: le collisioni fisiche rimangono attive.

| Osservazioni della policy storica | Termine per passo lento | Progresso | Giri |
|---|---|---:|---:|
| Ingombro corrente | Regola corrente | 19,691 m | 0 |
| Raggi centrali | Regola corrente | 25,083 m | 0 |
| Ingombro corrente | Prototipo primo giro in movimento | 690,275 m | 0 |
| Raggi centrali | Prototipo primo giro in movimento | 6.578,247 m | 1 |

L'ultimo giro dura 744,013 s; l'episodio termina per passo lento a 849,483 s.
Nessuna combinazione completa due giri. Tutti i replay usano il grafo anatomico
su RTX 4060, senza fallback CPU. Non viene proposta la rimozione dei sensori
d'ingombro nell'app. Report locali `progress56-statehead-current-*20261030/`;
verifica storica `progress56-protected-parent-verification-20261030/`.

### Readout da esperienza neurale propria

`work/collect-neural-self-experience.cjs` registra 7.441 campioni fino al primo
giro effettivo della policy precedente. I comandi provengono dalle azioni da
essa eseguite con raggi centrali e il prototipo di passo; contemporaneamente
un osservatore misura l'attività neurale con i sensori d'ingombro correnti.
I due osservatori condividono il contatore CUDA: il totale 14.884 non va sommato
due volte. La raccolta è un prefisso di un episodio, non una generazione conclusa.

`work/train_neural_self_readout.py` allena su RTX 4060 un readout
514→128→64→2, con quattro frame di 128 neuroni discendenti reali e gli ultimi
due comandi eseguiti. Non riceve posizione, tracciato, tempo o velocità obiettivo.
È consolidamento supervisionato della propria esperienza, non SIL/PPO. I 4.500
aggiornamenti riducono l'errore sui dati di training, senza validazione separata
sui dati. Il modello esportato resta `research-unverified`.

`work/replay-neural-self-readout.cjs` prova il nuovo readout da fermo con sensori
d'ingombro attivi. In inferenza non importa la vecchia policy: usa solo attività
neurale corrente, storia dei comandi e nuovi pesi. Grafo su CUDA, readout su CPU.

| Epoca | Regola corrente: progresso / esito | Prototipo movimento: progresso / esito | Giri |
|---|---|---|---:|
| 50 | 762,032 m / passo lento | 826,864 m / urto | 0 |
| 150 | 645,471 m / urto | 645,471 m / urto | 0 |
| 300 | 424,600 m / urto | 424,600 m / urto | 0 |

Tutti e sei gli episodi terminano realmente, senza censura o fallback CPU.
La corrispondenza Torch/JavaScript è verificata su otto campioni reali per epoca,
con errore massimo 6,67e−16. Il calo della loss non si trasferisce alla guida:
nessun modello promosso nell'app. Report locali `progress56-self-epoch*20261030/`,
dataset `progress56-neural-self-experience-20261030/` e training
`progress56-neural-self-readout-training-20261030/`.

Verifiche del codice pubblicato: `node --test work/neural-self-readout.test.cjs`
supera 5/5 test, inclusi corruzione dei modelli, evidenze di parità incomplete,
pedali esclusivi, osservazioni V3 reali e isolamento del prototipo di passo.
Controllata anche la sintassi dei sette script JavaScript e dello script Python.
La suite dell'app 464/464 riportata sotto appartiene alla precedente correzione;
non è stata ripetuta per questi strumenti isolati. L'apprendimento resta aperto
e non è stata preparata o pubblicata una nuova distribuzione Windows.

## 30 ottobre 2026 — compensazione dell'encoder e teste motore

`mutateSensoryBlock()` correggeva soltanto gli ultimi due bias, invertendo con
`atanh` le azioni già tagliate o saturate. Nel decoder sperimentale 7 le teste
sono tre: la correzione dello sterzo finiva nel gas e lo sterzo restava senza
correzione. Anche con due teste, l'inversione non recuperava il segnale latente
quando `tanh` era saturo. Questo violava lo scopo della mutazione sensoriale:
esplorare l'encoder preservando la risposta del genitore in un contesto osservato.

La compensazione ora legge attività e caratteristiche effettivamente prodotte
dalla rete, usa disposizione e normalizzazione dichiarate dal decoder e corregge
ogni preattivazione prima di `tanh` e del taglio dei pedali a zero. Restano attivi
i limiti dei pesi e delle coppie di mutazioni opposte. Il passo dell'encoder
viene limitato prima di misurarne l'effetto; se la compensazione di un bias
non rientra nei limiti, prova passi più piccoli e respinge un tentativo impossibile.
Ridurre il passo dopo la compensazione rendeva quest'ultima inesatta per la
rete non lineare. Non introduce azioni da
imitare, coordinate del circuito o nuove informazioni nei salvataggi.

La regressione a tre teste fallisce sul sorgente precedente (sterzo latente
variato di circa −0,001003 nel caso riprodotto) e passa con la correzione.
I test mirati verificano anche una testa del gas negativa nascosta dal taglio
a zero e un comando a due teste oltre la saturazione; sul sorgente precedente
quest'ultimo perdeva 0,406132 di segnale latente. Entrambe le regressioni
falliscono prima della correzione e passano dopo. I 19 test mirati passano;
la suite finale supera 464/464 test e l'ultimo aggiornamento del gate di
confronto è verificato separatamente (3/3). Sono prove del contratto del
mutatore, non di un giro.

Confronto fisico: checkpoint decoder7 gen.180, V3/Monza, popolazione 100, seed
850817, gen.180 di riferimento e gen.181–183 allenate, RTX 4060. Il ramo legacy
ripristina in memoria la sola funzione di `ad801d7`; il ramo corretto usa il
sorgente corrente. L'audit richiede che la mutazione sensoriale sia eseguita
realmente e che checkpoint d'ingresso e salvataggio personale restino invariati.
I risultati vengono confrontati per giri, progresso sicuro, frontiera e urti;
la promozione come miglioramento dell'apprendimento richiede un giro o almeno
2 m persistenti di frontiera sicura. Il runner riproducibile è
`work/research-v3-sensory-compensation.cjs`.

| Ramo, seed 850817 | Auto sicure gen.181/182/183 | Progresso sicuro gen.181/182/183 | Giri |
|---|---:|---:|---:|
| Compensazione precedente | 67 / 62 / 66 | 798,967 / 798,967 / 799,655 m | 0 |
| Compensazione corretta | 67 / 60 / 66 | 798,967 / 798,967 / 799,655 m | 0 |

L'audit conta sette mutazioni sensoriali per ramo. La correzione cambia gli
esiti di due auto in gen.181 e dieci in gen.182, ma non aggiorna la frontiera
storica (798,967 m). Non va presentata come soluzione all'apprendimento.
Entrambi i checkpoint gen.184 sono validati; zero fallback CPU e input invariati.
Il confronto riproducibile è in `work/compare-learning-replays.cjs`; rifiuta
seed, checkpoint o sorgenti non corrispondenti e un baseline fisico diverso.
I giri degli episodi terminati con un urto non valgono come vantaggio sicuro.
Il confronto è stato rieseguito dopo la rifinitura dei limiti: stessi conteggi,
stesso progresso sicuro e zero giri. Il ramo finale corretto registra 155.490
chiamate GPU, zero fallback CPU; checkpoint gen.184 validato con SHA-256
`61b84c34ee9a9653c9b77dfc191ec83b02783fdafbaaa5469ad105eff13dd36e`.
Il sorgente `outputs/simulation.js` verificato ha SHA-256
`34a723cd33fed6862132780c3b76cac773dc1ba667f8b2470477ba141bd0284b`.

Un replay di sola osservazione del leader, 712 chiamate CUDA, registra 128
caratteristiche ricorrenti e riproduce lo stop a 798,967 m. Nel campione a
790,575 m, una variazione ipotetica di 0,1 del segnale latente di sterzo richiede
una variazione di norma 0,08631 dei pesi, pur preservando quattro risposte
precedenti. È una misura algebrica di espressività di quel singolo genoma:
non è una traiettoria, un peso installato nell'app o un risultato di guida.
Analisi: `work/analyze-neural-readout-geometry.cjs`.

La variante sperimentale `work/neural-context-mutation.cjs` preserva invece le
quattro situazioni neurali più frequenti nella memoria del genitore, senza
usare coordinate. Esplora anche sterzo e pedali insieme. Il primo confronto
senza limite dell'ampiezza mantiene gli ancoraggi entro 8,89e-16, ma peggiora
gli esiti fisici: 34/34/45 auto sicure contro 67/60/66 e zero giri; non promossa.
La conservazione di poche risposte non garantisce stabilità durante la guida.

Il ramo successivo limita la variazione RMS dei comandi al budget di rumore
atteso dalle scale di mutazione esistenti, misurato sui contesti osservati, e
limita le variazioni nei contesti rari. Nei due seed appaiati:

| Seed | Auto sicure controllo | Auto sicure variante | Progresso sicuro finale controllo / variante | Giri |
|---|---:|---:|---:|---:|
| 850817 | 67 / 60 / 66 | 38 / 43 / 56 | 799,655 / 800,132 m | 0 |
| 850816 | 66 / 61 / 52 | 53 / 45 / 53 | 800,656 / 798,967 m | 0 |

Il limite viene rispettato negli audit, ma non emerge un vantaggio stabile:
entrambe le frontiere restano ferme e le collisioni aumentano in gran parte
delle generazioni. Anche questa variante è scartata come miglioramento della
guida. Le mutazioni di contesto restano strumenti di ricerca; non sono
integrate nel controllore dell'app. Il problema di apprendimento è ancora aperto.
La progettazione si riferisce ai principi di esplorazione nei parametri e
controllo delle variazioni in uscita descritti da
[Plappert et al.](https://arxiv.org/abs/1706.01905) e
[Lehman et al.](https://arxiv.org/abs/1712.06563); questo esperimento non è una
replica dei loro algoritmi né una prova dei risultati riportati nei paper.

Report locali, checksum, checkpoint di ricerca e inventario della pulizia:
`.impeccable/review/learning-ml/progress55-sensory-bias-heads-seed850817-gen180-rtx-20261030/`.
La review automatica ha respinto con «blocked by policy» la rimozione di 150
cartelle di cache in profili di prova inattivi (630 file, 202.238.640 byte).
Nessun file di cache è stato eliminato. Le prove di apprendimento restano
isolate dai pacchetti Windows distribuiti. La preparazione della versione pronta
da pubblicare resta incompleta: nessuna prova di un giro, tanto meno dei due
giri richiesti, è stata ottenuta in questi confronti. Non sono state create
versioni, tag o release aggiuntivi.

## 29 ottobre 2026 — soglia del passo e mutazione delle nuove sessioni

Un V2 da zero procedeva a **2,001–2,011 m/s**, appena sopra il vecchio limite
di passo di **1,75 m/s**, e poteva così restare attivo senza completare giri.
La revisione `progress-8-pace-recovery-margin` alza la frazione minima di
andatura a `0,075`; dopo la finestra di otto secondi lascia proseguire un'auto
lenta soltanto se sta sopra **1,25×** la soglia minima e registra nuovo
progresso sicuro. `progress-7-moving-pace` conserva la precedente regola per
le sessioni che la usano.

La mutazione iniziale ora è **32%** nelle sessioni nuove, tanto nell'interfaccia
quanto nei motori browser/Windows e nel confronto modelli. Il controllo
visualizza il valore reale del motore. Caricando un salvataggio si conserva la
mutazione contenuta nel file.

Nel test naturale V2 del **Laboratorio**, seed 7717, 32 auto e 12 generazioni
da zero, con mutazione 16% il fronte sicuro è passato
da **86,824 a 132,966 m**; con 32% dallo stesso punto di partenza a
**851,059 m** (circa 9,8× il fronte finale del controllo). La media sicura è
passata da **19,738 a 369,949 m**. Il seed di verifica 850816 ha dato
**58,633 m** al 16% e **77,468 m** al 32% (+32%). Nessuno dei due seed ha
completato un giro. Sono misure di progresso iniziale V2, non di convergenza.

Sul V3 già allenato a Monza, il 32% non ha migliorato il checkpoint: a gen.110
il fronte sicuro è **797,586 m**, contro **798,730 m** al 16%; 72 auto sicure
in entrambi i rami e zero giri. Non cambiare la mutazione nei salvataggi
esistenti e non interpretare il nuovo predefinito come una cura generale per
V3/V4/V5.

Il bias di lancio è ora passato realmente al decoder e viene tolto oltre
**2 m/s**, per non sovrascrivere la policy già in marcia. Il confronto V3/Monza
ha ridotto il danno rispetto al bias costante, ma entrambi i rami sono rimasti
senza giri: anche questo è solo un accorgimento locale, non una soluzione
all'apprendimento.

Verifica locale: `npm test` — **454 test superati, 0 falliti**; benchmark V2
12 generazioni naturali incluso. La versione resta **5.7.0**: nessun tag,
commit di versione o release GitHub è stato creato. La pulizia dei file
segnalati resta incompleta perché il controllo automatico ha bloccato le
cancellazioni; non sono stati rimossi file.

## 29 ottobre 2026 — memoria delle situazioni in movimento

La memoria temporanea usata per orientare le mutazioni non registra più i
campioni quando la velocità dell'auto è sotto 2 m/s. Prima, una vettura ferma
con il freno premuto poteva ripetere la stessa attività neurale a ogni passo e
rendere proprio quella risposta la più frequente, proteggendola dalle mutazioni.
Il filtro agisce soltanto sulla memoria di training: non cambia i sensori della
rete, le azioni in inferenza, la fisica, le ricompense o il formato dei salvataggi.

Nel confronto V3/Monza dal medesimo checkpoint gen.106, seed 7717 e 100 auto,
il controllo rimane a **791,439 m sicuri** nelle gen.106–109. Con il filtro, il
fronte passa a **798,730 m sicuri** in gen.108 e resta lì in gen.109 (+7,292 m);
gli episodi sicuri passano da 66 a 70 nella gen.109. Entrambi fanno zero giri.
Quattro generazioni successive (gen.110–113) mantengono 798,730 m senza
completare un giro: è un miglioramento locale riprodotto, ma il nuovo fronte si
ristagna.

Il replay del leader sicuro gen.114 si arresta ancora in pista a 0 km/h, con
acceleratore 0, freno 0,175 e sterzo 0,006. Un A/B dal medesimo checkpoint prova
mutazioni coordinate di sterzo e motore: dopo una generazione di selezione il
fronte sicuro resta 798,730 m, uguale al controllo. Non promuovere questa
seconda variante. Prove su un solo seed e pista: non dimostrano un giro, una
convergenza generale o un vantaggio su altri modelli.

## 29 ottobre 2026 — pratica allineata e mutazione longitudinale

`evaluatePractice()` usava il guadagno sensoriale e il bias motore standard
(`0,35` e `0,18`) anche per Monza, Monaco e Le Mans. La simulazione reale delle
piste strette usa invece `0,8` e `0,02`. `neuralStepForTrack()` ora applica a
pratica e pista gli stessi parametri. Un test di regressione confronta i due
percorsi di controllo.

Un replay CUDA V3/Monza del checkpoint gen. 80 ha poi mostrato che l'agente
sicuro fermo a 790,461 m mantiene gas zero e freno applicato; la telemetria
conferma che la vettura rallenta fino a fermarsi. Il problema osservato in
questo replay è la policy longitudinale che non riapplica il gas, non un
attuatore del freno guasto. La mutazione per un frontier fermo ora modifica
solo l'uscita longitudinale gas/freno e preserva la sterzata.

Confronto appaiato, quattro generazioni per ramo, seed 7717 e popolazione 40.
Il primo esito fisico coincide con il riferimento; fra le generazioni 81–83,
la media di progressione degli agenti sicuri è salita da 138,71 m a 277,86 m
e gli agenti sicuri oltre 500 m da 4,33 a 8,67 per generazione. Gli hash del
sorgente comportamentale differiscono solo in `outputs/simulation.js`.
RTX 4060: 62.934 chiamate CUDA nel ramo trattato, zero fallback CPU. Il miglior
progresso sicuro è rimasto 790,461 m in entrambi i rami, con zero giri: è un
segnale d'esplorazione su un solo seed, non convergenza o generalizzazione.

Il replay CPU diagnostico riproduce gli esiti terminali CUDA e conferma che il
salvataggio originale dell'autore non è cambiato. La candidata locale 5.7.0
rimane separata dalla release 5.6.0; attribuzione dei modelli, commit, tag e
pubblicazione attendono la conferma dei modelli di sviluppo usati.

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

## Aggiornamento locale 20 ottobre 2026 — esiti sicuri

Questa correzione riguarda il sorgente di sviluppo; non è contenuta nei binari
5.6.0 già distribuiti. La fisica, le ricompense, i parametri delle reti e il
formato dei salvataggi non cambiano.

- Gli urti, le uscite, i progressi non validi e le prove censurate restano nelle
  metriche diagnostiche, ma non aggiornano l'ottimizzatore, il campione pulito,
  la frontiera fisica sicura o l'archivio dei genitori. Una generazione di soli
  esiti non sicuri conserva il campione precedente e, con mutazione attiva,
  riparte con esploratori nuovi.
- Le prove valide si ordinano prima con il punteggio effettivo, ricompense meno
  tutte le penalità (giri lenti e mancati inclusi). Giri, tempo e distanza non
  possono scavalcare un saldo peggiore; a parità aiutano a risolvere il pareggio.
  Un leader sicuro di distanza può comunque generare varianti mirate senza
  sostituire il campione con una corsa peggiore.
- Fermare manualmente una generazione senza incidente non la trasforma in un
  urto: riceve la normale penalità per il mancato giro e resta un episodio
  valutabile. A mutazione zero non vengono inventati parametri o esploratori.
- La frontiera sicura resta runtime-only per non aggiungere campi al formato
  `.malecns-save` della 5.6.0. Riprendendo un vecchio salvataggio, questa
  frontiera riparte da zero e viene ricostruita dai successivi esiti sicuri;
  il campo diagnostico storico continua invece a conservare il suo significato.

Nel test naturale V2 integrato (seed 7717, Laboratorio, 32 auto, mutazione
0,16, 12 generazioni da zero) il massimo progresso passa da **439,44 m** nella
prima generazione a **1.428,85 m** nella dodicesima; l'ottimizzatore registra
246 episodi sicuri e 12 aggiornamenti. È un risultato di un singolo scenario,
non una prova di giro completato, convergenza o miglioramento di V3/V4.
La suite completa successiva va eseguita prima di distribuire questi sorgenti.

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

V2 è stato confrontato su Monza, Monaco e Le Mans, con i seed 7717, 1847 e
9021, 16 agenti e 20 generazioni: i nove storici sono identici alla baseline.
Questo verifica l'assenza di regressioni in quei casi, non un'accelerazione.

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
- Copia Windows x64 di sviluppo compilata con pubblicazione disabilitata:
  50 controlli sui sorgenti/dati/asset del pacchetto e 49 controlli nativi di
  salvataggio/ripristino nell'eseguibile superati. Versione 5.6.0, binario non
  firmato, nessun installer eseguito o sostituito.
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
`hybrid-final/result.json`, `dev-app-progress/progress-smoke.json`.
I report grezzi possono contenere percorsi locali:
non vengono pubblicati o inclusi nei pacchetti.

## Soglia di lentezza: revisione di sviluppo `progress-7-moving-pace`

Nella revisione precedente la velocità media degli ultimi otto secondi può
essere insufficiente anche quando l'auto, proprio al controllo della soglia,
supera la velocità minima e avanza su strada mai percorsa. La nuova revisione mantiene
la penalità di 1.400 punti, ma in questo caso specifico non termina subito
l'episodio: richiede sia la velocità corrente almeno pari al minimo, sia un
incremento effettivo del progresso massimo. Urti, uscite di pista, progressi
non validi e assenza di avanzamento continuano a terminare la prova.

La modifica riguarda le nuove sessioni del sorgente di sviluppo. I salvataggi
esistenti conservano la loro revisione, comprese `progress-3` e
`progress-6-missing-lap`: caricarli non applica automaticamente questa regola.
Il salvataggio originale dell'utente non è stato modificato. È stata preparata
una copia sperimentale separata `SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save`
nella cartella locale `.impeccable/review/learning-ml/saved-v3-moving-pace-copy-20261027-85/`.
La copia conserva i cinque worker, i genomi della popolazione e dell'archivio,
lo stato e i contatori dell'ottimizzatore; azzera storico, punteggi, classifiche
e record precedenti per non confrontare ricompense diverse. La copia viene
caricata in pausa, con 40 auto per worker. Report e verifica locali descrivono
anche i genomi dell'archivio mantenuti come campioni esterni da rivalutare.
Un salvataggio creato con `progress-7-moving-pace` non è compatibile con la
release 5.6.0 già distribuita, che non riconosce questa revisione, anche se il
numero di versione del sorgente rimane 5.6.0 durante lo sviluppo. Non
sostituire binari distribuiti né presentare tali file come compatibili.

Per aprire il sorgente come app Windows separata è disponibile
`Avvia-sviluppo-lentezza-v560.cmd`. Richiede le dipendenze locali del progetto,
usa un profilo dedicato e avvia una sessione nuova in pausa con V3, Monza e 16
auto. Non importa il salvataggio dell'utente: caricando quello storico,
l'app conserva le sue regole `progress-3`; la copia sperimentale sopra indicata
si può caricare manualmente per provare `progress-7`. Questo avvio di sviluppo non è un
installer né sostituisce il portable o la release esistenti.

Sul salvataggio V3/Monza gen. 64, una prova A/B separata, con due generazioni
per braccio, ha riprodotto le 40 traiettorie fino all'arresto originale. La
miglior distanza sicura è passata da 733,862 a 775,837 m in entrambe le
generazioni; nel primo braccio aggiornato una delle auto fatte proseguire ha
poi urtato. Nessun braccio ha completato un giro: il confronto identifica uno
stop prematuro, non dimostra che il problema di apprendimento sia risolto.
Report e verifica: `saved-v3-moving-slow-recovery-2gen-ab-20261026-82` nella
cartella locale `.impeccable/review/learning-ml/`. Il controllo usa una sola
sessione, un circuito e un seed; non dimostra la generalizzazione a V2–V5.

## Coerenza delle prove locali nella revisione di sviluppo

In `progress-7-moving-pace`, uno stato di pratica acquisito durante la
simulazione conserva anche la fase di aggiornamento neurale e l'ultimo comando
in vigore. La prova riprende quindi con la stessa cadenza della vettura reale;
se uno stato non contiene questi dati temporanei, mantiene il precedente
comportamento di ripiego. I campi sono interni alla pratica e non vengono
aggiunti allo schema dei salvataggi.

Nella stessa revisione, una prova locale che termina con un urto, un'uscita
di pista o un progresso non valido non viene promossa come miglioramento,
anche se la sua penalità totale è minore di quella di un'auto ferma. La
normale esplorazione continua: questa regola non impedisce a tutti i figli di
urtare. Le revisioni storiche mantengono il loro criterio precedente e il
salvataggio originale dell'utente non viene modificato.

Un confronto di ricerca sulla RTX 4060, con lo stesso worker V3/Monza e sei
generazioni naturali per braccio, ha osservato una promozione con urto nel
controllo e nessuna nel braccio filtrato. Il miglior progresso sicuro finale
è rimasto 777,875 m in entrambi, con zero giri: correggere la selezione non
ha dimostrato di risolvere l'apprendimento. Il confronto isolava il filtro,
non comprendeva la successiva correzione di fase. Report e verifica sono in
`.impeccable/review/learning-ml/saved-v3-progress7-safe-practice-ab-cuda-20261027-89/`.

Un successivo replay di sei generazioni del sorgente aggiornato, sullo stesso
worker e seed, ha incluso sia il filtro sia l'allineamento della fase. Il
risultato è ancora 777,875 m sicuri e zero giri; 25 valutazioni di pratica
non hanno promosso esiti insicuri. Sono passati 134 test sulle aree modificate.
Il replay resta limitato a V3/Monza e non sostituisce la verifica dell'app
Windows e dei pacchetti da eseguire prima di un'eventuale distribuzione.

Nell'ultima generazione del confronto appaiato, la distanza media delle 31
auto con esito sicuro passa da 157,123 a 179,955 m e quelle arrivate ad almeno
500 m passano da sei a sette. Un'auto passa da 6,726 a 714,527 m; un'altra
urta in entrambi i bracci. Il record individuale e il numero di giri non
cambiano: questi dati su un solo seed non dimostrano un miglioramento stabile.
L'analisi confronta gli esiti terminali registrati, non l'intera traiettoria.

Una prosecuzione di 16 generazioni naturali sulla RTX 4060 ha portato il
worker 0 della copia sperimentale fino alla generazione 80. Il miglior
progresso sicuro misurato è 790,461 m, senza giri completi. È disponibile
una nuova copia condivisibile, separata dall'originale, in
`.impeccable/review/learning-ml/progress7-trained-copy-20261027-93/`.
Include tutti e cinque i worker: solo il primo è stato aggiornato, gli altri
rimangono alle generazioni 67, 65, 65 e 65. Il motore desktop di sviluppo ha
ripristinato la copia in pausa e riesportato gli stessi dati; il controllo
indipendente ha verificato anche la presenza del genoma da 790,461 m nella
popolazione iniziale e nell'archivio. Non è stata eseguita una nuova prova
del portable o dell'installer distribuito su questo file. La successiva prova
dell'interfaccia Windows di sviluppo ha superato 61 controlli, compresa
l'importazione della copia in pausa con tutti e cinque i worker. La release
5.6.0 distribuita non riconosce la revisione sperimentale e rifiuta
correttamente questo file.

La prova dell'interfaccia ha individuato e permesso di correggere una perdita
di campioni non ancora valutati: l'ispezione in pausa poteva propagare un
campione globale e sostituire quelli già salvati nei worker. Ora l'ispezione
di una generazione già vista in pausa non propaga nuovi campioni; in
allenamento un campione ricevuto attende la valutazione di quello precedente.
Un round-trip di cinque worker con codifica, caricamento, ripresa e generazione
forzata ha verificato che i quattro migranti originariamente presenti vengono
conservati e inseriti nella popolazione successiva. La coda interna non cambia
lo schema dei salvataggi: l'eventuale campione globale salvato viene
ritrasmesso alla ripresa.

La suite successiva alla correzione dei campioni ha superato 166 test su
simulazione, worker, salvataggi e modelli. I test e lo smoke GUI verificano
comportamento e conservazione dei dati; non dimostrano che la policy completi
un giro né certificano i pacchetti distribuiti.

Una successiva prosecuzione dalla generazione 80 ha completato altre 12
generazioni naturali sullo stesso worker V3/Monza, con 40 auto e seed 7717.
Le prime due riproducono gli 80 esiti registrati nel riferimento precedente.
Il miglior progresso sicuro è 790,601 m e nessuna auto completa un giro:
il miglioramento rispetto a 790,461 m è di circa 0,14 m e non dimostra una
soluzione al problema di apprendimento. Il run ha registrato 183.698 chiamate
sulla RTX 4060 senza fallback CPU. I risultati e la verifica indipendente sono
in `.impeccable/review/learning-ml/progress7-natural-continue-cuda-20261027-100/`;
il confronto riguarda un solo worker e seed.

La copia separata `SPERIMENTALE-solo-dev-v3-monza-gen92-worker0.malecns-save`
è in `.impeccable/review/learning-ml/progress7-continuation-copy-20261027-101/`.
Solo il primo dei cinque worker è stato aggiornato, fino alla prossima
generazione 92; i quattro rimanenti sono invariati. Il migliore genoma sicuro
è presente sia nell'archivio sia nella popolazione iniziale. La copia usa
ancora `progress-7-moving-pace` ed è apribile soltanto nel sorgente di sviluppo
compatibile, non nella release 5.6.0 distribuita. L'originale dell'utente è
rimasto invariato; un controllo separato ha verificato il ripristino in pausa
e l'ispezione dei suoi cinque worker con `progress-3`. Lo smoke dell'interfaccia
Windows di sviluppo sulla copia gen. 92 ha superato 61 controlli, incluso il
caricamento in pausa e il confronto degli stati dei cinque worker. Il report è
in `.impeccable/review/learning-ml/progress7-continuation-copy-ui-smoke-20261027-103/`.

Un replay del genoma migliore della copia gen. 92 riproduce l'esito fisico
della generazione 89. In questa singola prova l'auto inizia a frenare dopo i
600 m e rallenta fino a fermarsi prima della terminazione per lentezza; il
comando finale è gas zero, freno 0,186. In un confronto diagnostico sulla
stessa traiettoria, rimuovendo soltanto il comando fisico del freno per un
secondo, la velocità al termine di quell'intervallo aumenta di circa 2,82 km/h
rispetto al controllo. È un intervento temporaneo di verifica, non una policy
di guida o una modifica all'app. Conferma l'effetto del freno in quel tratto,
non spiega da solo perché il modello continui a frenare né dimostra che gli
altri modelli abbiano imparato. I report sono nelle cartelle locali
`progress7-gen92-frontier-braking-trace-cuda-20261027-104/` e
`progress7-gen92-brake-effect-cuda-20261027-105/` sotto
`.impeccable/review/learning-ml/`.

### A/B V2/Monaco: recupero da collisioni vicine alla frontiera (31 ottobre 2026)

Confronto a freddo del ranking corrente con una variante di ricerca che consente a V2 di generare figli mutati da rollout con collisione poco oltre la frontiera sicura. Configurazione: Monaco, 16 auto, mutazione 0,16, velocità 30×, otto generazioni; seed 7717 e holdout 7718. I report e le varianti sono locali e ignorati da Git sotto `.impeccable/review/learning-ml/progress138-v2-monaco-riskrepair-ab-cold-7717/` e `progress139-v2-monaco-riskrepair-holdout-7718/`.

| Seed | Fronte sicuro controllo | Riparazione sempre attiva | Urti controllo / variante | Episodi sicuri controllo / variante |
|---|---:|---:|---:|---:|
| 7717 | 17,143 m | 18,358 m | 18 / 22 | 110 / 106 |
| 7718 | 13,341 m | 18,926 m | 16 / 21 | 112 / 107 |

Il progresso sicuro aumenta in entrambi i seed, ma con più urti e meno episodi sicuri; nessun ramo completa un giro. Una variante che attiva la riparazione solo dopo tre generazioni stagnanti non si attiva sul seed 7717 e pareggia il controllo. Sul seed 7718 si attiva nelle gen. 6–8, porta il fronte da 13,341 a 14,522 m e gli urti da 16 a 18, sempre senza giri. Campione breve, due seed e un circuito: il risultato non dimostra un miglioramento robusto e la modifica non viene integrata nell'app.

### Sweep a freddo V3/Monza: intensità di mutazione (1 novembre 2026)

Benchmark headless a freddo con V3 storico (7.721 nodi, 242.486 archi; readout da 64 neuroni e 202 parametri), 16 auto e 12 generazioni per caso. Seed 7717 confronta mutazione 8%, 16% e 32%; holdout seed 7718 confronta 16% e 32%. Ogni caso ha completato 12 aggiornamenti ES, senza warm start.

| Seed | Mutazione | Progresso grezzo massimo | Frontiera sicura massima | Giri |
|---:|---:|---:|---:|---:|
| 7717 | 8% | 695,581 m | 27,928 m | 0 |
| 7717 | 16% | 736,381 m | 158,340 m | 0 |
| 7717 | 32% | 633,581 m | 66,545 m | 0 |
| 7718 | 16% | 757,963 m | 228,866 m | 0 |
| 7718 | 32% | 311,547 m | 68,551 m | 0 |

Il 16% supera la frontiera sicura del 32% in entrambi i seed (+91,795 m e +160,315 m). L’8% è sotto il 16% nel solo seed misurato. È un segnale preliminare su due seed e un circuito, non una prova di convergenza: nessun caso completa un giro. Non viene cambiato il preset e il problema di apprendimento V3/Monza resta aperto.

I cinque report JSON grezzi, inclusi configurazione, progressi per generazione e hash sorgente, sono in [`outputs/research/v3-monza-mutation-sweep-2026-11-01/`](../outputs/research/v3-monza-mutation-sweep-2026-11-01/). Gli hash di `simulation.js` e `neural-learning.js` coincidono fra i report. Verifica già eseguita sul branch `dev`: suite completa 478/478 test, 170,529 s. La prova è headless CPU e non misura il throughput WebGPU della build desktop.

### A/B V3/Monza: readout 128 e popolazione 100 (1 novembre 2026)

Confronti headless a freddo, senza warm start, 12 generazioni, mutazione 16% e due seed appaiati. Il V3 standard usa il readout da 64 neuroni e 202 parametri; la variante sperimentale usa 128 neuroni e 330 parametri, mantenendo i sensori della versione 5.7. Ogni caso è stato eseguito con il runner CPU headless: questi tempi non misurano il percorso WebGPU dell'app desktop. Gli hash di simulation.js, neural-learning.js e model-profiles.js nei report coincidono con i sorgenti verificati su dev.

| Seed | Readout | Progresso sicuro massimo | Progresso grezzo massimo | Tempo CPU |
|---:|---:|---:|---:|---:|
| 7717 | V3 standard, 64 / 202 | 158,340 m | 736,381 m | 128,869 s |
| 7717 | V3 sperimentale, 128 / 330 | 26,116 m | 712,162 m | 112,763 s |
| 7718 | V3 standard, 64 / 202 | 228,866 m | 757,963 m | 123,184 s |
| 7718 | V3 sperimentale, 128 / 330 | 139,972 m | 640,297 m | 123,293 s |

Il readout più ampio resta sotto il V3 standard in entrambi i seed e non completa giri; non viene promosso.

| Seed | Auto | Progresso sicuro massimo | Progresso grezzo massimo | Tempo CPU | Giri |
|---:|---:|---:|---:|---:|---:|
| 7717 | 16 | 158,340 m | 736,381 m | 128,869 s | 0 |
| 7717 | 100 | 287,005 m | 751,952 m | 717,500 s | 0 |
| 7718 | 16 | 228,866 m | 757,963 m | 123,184 s | 0 |
| 7718 | 100 | 737,355 m | 760,553 m | 1.048,171 s | 0 |

Con 100 auto la frontiera sicura cresce in entrambi i seed (+81,3% e +222,2%), ma il tempo CPU è 5,57× e 8,51× quello del confronto a 16 auto. Nessun caso completa un giro. È un segnale preliminare su Monza e due seed, non prova convergenza o generalizzazione; non giustifica un aumento del valore iniziale a 100. L'impostazione di 16 auto e i modelli applicativi restano invariati.

I quattro report JSON completi, con configurazione, risultati per generazione e hash sorgente, sono in [outputs/research/v3-monza-readout-population-ab-2026-11-01/](../outputs/research/v3-monza-readout-population-ab-2026-11-01/). Nessun sorgente applicativo o salvataggio è stato modificato.

### Diagnosi V3 wide/Monza: sterzo debole e pratica locale (2 novembre 2026)

Attribuzione dello sviluppo riferita dall'autore: GPT-6 Luna. Replay CPU-only dal checkpoint V3 wide/Monza gen.83, 16 auto, seed 107720; nessun teacher o percorso prescritto. Le prove non modificano il sorgente applicativo, il salvataggio personale o la portable 5.7.0.

- Screening del bias Monza 0,30 contro 0,02, sei generazioni: progresso sicuro massimo 786,681 m, massimo grezzo 800,896 m, zero giri. Il report originale ha `passed=false` per un controllo che pretendeva 16 generazioni anche dal trattamento da sei; un audit separato verifica hash e protocollo (`correctedAuditPass=true`). `learningSucceeded=false` resta corretto.
- Audit readout alla gen.87: l'auto si ferma a 798,326 m con sterzo 0,00988, gas 0 e freno 0,0823. Sui 25 campioni il logit longitudinale medio è +0,047 mentre il bias longitudinale è −0,147; il bias domina la somma. È un comando della policy, non un guasto comune dell'attuatore.
- Controfattuale con bias longitudinale +0,25 a 780,093 m: il gas previsto sale a 0,156, la vettura raggiunge 800,549 m e urta. Il solo aumento del gas non risolve la curva.
- Pratica combinata: una proposta casuale su quattro fattori non migliora il progresso locale di 18,026 m. Estendendo la ricerca a 32 proposte/128 rollout, una variante sicura arriva a 23,189 m (+5,162 m), zero giri. Inserita nel replay completo allo stesso tick e stato, porta la gen.87 a 803,252 m sicuri, ma la gen.88 torna a 753,876 m e zero giri. Il guadagno locale non generalizza in modo dimostrato; l'overfit al contesto è un'interpretazione compatibile con questa prova, non una causa universale confermata.

Nessun modello è promosso e il problema V3/Monza resta aperto. Versione app 5.7.0 invariata; nessun tag, nuova release, portable o installer sostituito. Il branch remoto `dev` esisteva già ed era allineato al commit `79b28dfa086ae89736bfd9db04ea0d82616fe659`; la presente annotazione viene pubblicata sullo stesso branch.

I report e le tracce completi restano locali e sono esclusi da Git tramite `.impeccable/`:
- Audit integrità p372: `progress372-v3-map-launch-bias-030-ab-6gen-20261102/corrected-audit.json`, SHA-256 `A8B3CB4D1F757CB43700F2F8BBECD5670041E2151E3BA518E850CADE0B17C9C9`.
- Readout p373: `progress373-v3-wide-readout-audit-20261102/report.json`, SHA-256 `D385484F3323024C5F5E661B34B7955A6617DB77A2635CB4052D73BA23A0E12A`.
- Controfattuale bias p375: `progress375-v3-wide-readout-bias-counterfactual-rerun-20261102/report.json`, SHA-256 `D958DD6B5DBD5F2ACCFACE94AD1E11D1C5EDDAE84B0FF21E611D86DDE66F07B6`.
- Ricerca locale p378: `progress378-v3-local-practice-32-proposal-search-20261102/report.json`, SHA-256 `8A3B5ABDF8F9406D5287742F3493F448B18736492B307699CA64868001B83C42`.
- Validazione live p379: `progress379-v3-practice-winner-live-validation-20261102/report.json`, SHA-256 `672F36EC600A46FDB3857CB5CFFA7C5FAFDF254AAD0819C5B24571EABC3E44E4`.

Prossimo test utile: cercare mutazioni del readout che migliorino il settore conservando il comportamento acquisito prima dei 780 m, quindi ripetere il replay completo su seed indipendente prima di toccare l'app.

### Compensazione sensoriale V3 ampliato e replay dalla partenza (17 novembre 2026)

Modello di sviluppo: GPT-6.1 Sol, identificato nei metadati della sessione.

Nel V3 sperimentale con 128 uscite, il decoder conserva la normalizzazione storica `1/sqrt(64)`. La compensazione delle mutazioni sensoriali usava invece `1/sqrt(128)`: modificava involontariamente i comandi nel contesto che avrebbe dovuto conservare. `mutateSensoryBlock` ora usa `normalizationCount`, con precedenza all'eventuale `featureNorm` esplicito. Il cambiamento riguarda i nuovi figli generati dall'allenamento; il formato dei salvataggi e l'inferenza dei genomi esistenti restano compatibili.

La regressione con il vero grafo V3 ampliato fallisce prima della correzione e passa dopo. Un audit su 16 seed porta lo scarto massimo dei due logit nel contesto protetto da `0,0260281684` a `4,16e-17`. I 39 controlli mirati coprono anche mutazioni motorie, decoder ampliato, ricompense e fase della pratica locale. La conservazione di quel contesto non dimostra un miglioramento dei giri.

Separatamente, 96 episodi completi confrontano mutazioni del solo readout dalla griglia di Monza. Il candidato locale p378, che inserito vicino alla curva arrivava a 803 m, dalla partenza si ferma a 23,982 m; il genoma originale arriva a 798,326 m. La migliore mutazione con otto contesti protetti arriva a 798,391 m (+0,065 m). Tutti i 96 episodi terminano senza censura; nessuno completa un giro. Nessun candidato di questa ricerca viene promosso. Si tratta di un solo genoma V3 ampliato, un circuito e una condizione iniziale; non è una misura degli altri modelli.

La compressione NTFS dei due `win-unpacked` recupera 244,10 MiB di spazio fisico: da 829,48 a 585,38 MiB allocati. I 410 SHA-256 restano identici; nessun file viene eliminato. Portable, installer e checkpoint sono conservati. Report locali esclusi da Git: `.impeccable/review/learning-ml/progress380-prefix-replay-20261117/` e `outputs/pulizia-ntfs-20261117/report.json`.

Suite completa: **481/481 controlli superati**, 320,310 s, Node 24.19.0. Il confronto di sei generazioni riparte dal checkpoint gen.83 con 16 auto, mutazione 16%, seed 107720, ricompense `progress-3` e gain sterzo 0,5× comune ai due rami. Il controllo è quello archiviato p361, con sorgente, checkpoint e stato iniziale verificati. Il ramo corretto riproduce lo stesso massimo sicuro, 798,326 m, e zero giri: differenza sicura 0 m. La correzione elimina il difetto di compensazione ma questo campione non dimostra un apprendimento migliore. Versione 5.7.0 invariata; il lavoro per una versione pronta al rilascio resta aperto.

[Riepilogo verificabile, risultati per generazione e SHA-256 delle prove locali](../outputs/research/v3-sensory-compensation-2026-11-17/report.json).

### Osservabilità e mutazioni con protezione della partenza (17 novembre 2026)

Sul replay V3 ampliato da 798,391 m sono state misurate 877 osservazioni: tutte le 128 uscite discendenti variano, meno dello 0,1% dei valori è saturo. Una stima delle componenti principali attribuisce il 99,19% della varianza a due componenti. La rete distingue il rettilineo dal tratto finale di questo episodio; la concentrazione della varianza suggerisce di esplorare anche risposte neurali meno variabili, senza dimostrare da sola la causa dello stallo.

Un decoder residuo sperimentale, attivato esclusivamente dall'attività neurale osservata e dalla sua memoria, non migliora l'incumbent in 72 prove. Restringendo i contesti e riducendo le variazioni, 288 prove raggiungono 800,133 m sicuri, confermati in due replay completi dalla griglia; zero giri. Nessuna posizione, distanza lungo la pista o comando bersaglio entra nel decoder.

Una seconda ricerca bilancia le mutazioni del readout con un sistema regolarizzato dei contesti osservati, preservando sia il contesto dominante sia due risposte effettive della partenza. Il primo confronto usa 32 figli per variante: il candidato con avvio protetto arriva a 799,772 m sicuri. Un aggiornamento preliminare porta il genoma a 804,032 m; viene poi proseguito per cinque aggiornamenti con seed di mutazione diversi, 32 figli ciascuno e quattro worker CPU:

| Aggiornamento | Progresso sicuro selezionato | Giri |
|---:|---:|---:|
| Inizio dei cinque aggiornamenti | 804,032 m | 0 |
| 1 | 804,946 m | 0 |
| 2 | 805,630 m | 0 |
| 3 | 805,630 m | 0 |
| 4 | 806,102 m | 0 |
| 5 | 806,102 m | 0 |

Il risultato finale è riprodotto in due episodi completi. Sono prove del profilo V3 ampliato con gain sterzo diagnostico 0,5×: il genoma privato non è un normale salvataggio importabile nell'app senza gestire esplicitamente questa differenza.

Il confronto separato sul genoma campione V3 standard estratto dal salvataggio gen.64, seed originale 7717, usa gain 1× e 32 figli per ramo. Il genoma sorgente urta a 797,242 m; quella distanza non è progresso sicuro. Con le mutazioni standard 29/32 figli restano sotto 100 m e il miglior figlio sicuro arriva a 32,809 m. Con la strategia condizionata i casi sotto 100 m scendono a 5/32 e il miglior figlio sicuro arriva a 584,594 m, ma nessun figlio sicuro raggiunge il 90% della frontiera precedente. Zero giri in entrambi i rami. Il miglioramento dei tentativi iniziali non giustifica una sostituzione della strategia nell'app.

I sorgenti applicativi, i salvataggi e i pacchetti Windows restano invariati rispetto al commit `57adcbb`. La nuova serie non promuove controller e non dimostra convergenza. L'archivio privato delle osservazioni è stato compresso con NTFS, recuperando altri 1,23 MiB e verificandone identico lo SHA-256. L'obiettivo di completare i giri e preparare la versione pubblicabile resta aperto.

[Risultati, condizioni sperimentali, limiti e SHA-256 delle evidenze](../outputs/research/v3-observability-search-2026-11-17/report.json).

### Punteggio della pratica locale e prova V3 su Monza (17 novembre 2026)

La selezione conserva la velocità effettiva alla fine dell'episodio. Prima leggeva la velocità già azzerata dal parcheggio e poteva interpretare una terminazione in movimento come uno stallo col freno premuto. La pratica locale inizializza anche la distanza osservata alla posizione catturata. In precedenza il primo avanzamento veniva confrontato con la partenza del circuito. Sono due correzioni della valutazione con regressioni dedicate.

La suite passa 483 controlli su 483. La copia Windows avviata da sorgente carica in pausa il checkpoint Monza gen.83, con 16 agenti e V3 a 128 uscite. Un confronto di sei generazioni con 16 agenti, seed 107720, mutazione 16%, ricompense `progress-3` e gain sterzo diagnostico 0,5× riproduce un massimo di 798,326 m sicuri in entrambi i rami. Completati zero giri. La prova dimostra la correzione della valutazione, mentre l'apprendimento misurato in questo confronto resta allo stesso livello.

Una prova fisica separata, da stati effettivamente visitati, esplora brevi manovre. Dalla posa a 800,041 m in movimento arriva a 901,217 m senza urti in 8 s. Dalla posa ferma a 806,102 m, i 120 tentativi con orizzonte 0,5 s trovano al massimo 806,131 m. Le sequenze campionate servono a misurare i margini per manovrare nella chicane.

Un prototipo separato apprende una correzione residua da 80 osservazioni di una manovra esplorata con successo. Durante il replay legge soltanto l'attività discendente MaleCNS. Con la partenza nominale passa da 806,102 a 906,886 m sicuri, risultato riprodotto dalla griglia. Con due spostamenti a sinistra di 25 e 50 cm urta a 844,719 e 847,056 m. Con due spostamenti a destra rimane fermo dopo circa 30 m. Il prototipo resta in ricerca. La verifica riguarda un solo genoma V3 ampliato, con gain diagnostico 0,5×, e nessun giro completo.

Allenare un decoder su tre partenze ha portato tutti e tre i casi di addestramento a 835,796–837,595 m senza urti. Nelle partenze tenute fuori dall’addestramento, a −37,5 e −62,5 cm arriva a 837,415 e 835,197 m sicuri. A −12,5 cm urta a 830,654 m. Usare una manovra condivisa come esperienza per le tre partenze ha prodotto soltanto urti nei 18 replay di addestramento provati.

Il confronto tra revisioni spiega la terminazione anticipata a destra. Con lo stesso genoma e il gain diagnostico 0,5×, `progress-3` termina tre partenze a 30,157–33,425 m mentre l’auto avanza e il freno comanda zero. Con la regola corrente, `progress-8-pace-recovery-margin`, gli stessi episodi arrivano a 804,467–805,701 m senza urti. Il decoder allenato su più partenze raggiunge circa 835 m in due dei tre casi a destra e urta nel terzo. A gain sterzo 1×, il decoder urta in ognuna delle tre partenze verificate. Le prove riguardano Monza e un genoma, con zero giri. I risultati guidano la prossima prova con le impostazioni di sterzo e valutazione dell’app.

[Misure, risultati per generazione, partenza e verifiche](../outputs/research/v3-practice-recovery-2026-11-17/report.json).

### Due giri di Monza con un decoder addestrato offline (17 novembre 2026)

Il precedente recupero locale è stato provato a sterzo standard 1× e con le ricompense correnti. Le 16 varianti a interpolazione locale urtano nelle tre partenze di addestramento. Le manovre esplorate da 800 m arrivano al massimo a 851,796 m sicuri, senza completare giri.

Per raccogliere esempi sull’intero circuito, un controllore di riferimento usa le geometrie di Monza durante la generazione dei dati. Completa due giri senza urti in quattro configurazioni. Tre corse con perturbazioni forniscono 17.801 esempi per l’addestramento; una quarta fornisce 5.929 esempi separati per la validazione del fit. Il decoder addestrato riceve attività di 128 neuroni discendenti, medie di 38 gruppi di neuroni sensoriali e la variazione di questi segnali dal controllo precedente. Il simulatore produce posizione, dinamica e ricompense. Posizione assoluta, tracciato e azioni del riferimento restano fuori dall’inferenza.

Nei primi cinque replay autonomi, tutti arrivano a 11.586 m senza urti e terminano per il limite di due giri. La ripetizione nominale coincide con il primo replay, e tre prove supplementari completano due giri con spostamenti fino a ±1,25 m e con disturbo sui comandi. Azzerando l’attività discendente in ingresso al decoder, il replay nominale si arresta a 784,435 m. Disconnettendo la propagazione sinaptica, urta a 801,121 m. I due interventi misurano quanto il decoder dipende dall’attività MaleCNS in queste prove.

Il trasferimento diretto con gli stessi pesi a Le Mans e Monaco produce zero giri, rispettivamente un urto a 660,152 m e una terminazione per ritmo insufficiente a 210,268 m. I risultati riguardano un genoma V3 ampliato e il simulatore CPU fuori dall’interfaccia. Il decoder resta sperimentale. Serve ancora verificare la sua integrazione Windows e l’addestramento successivo per ricompense prima di preparare una candidata.

[Protocollo, tempi, prove di controllo e SHA-256](../outputs/research/v3-male-cns-imitation-2026-11-17/report.json).

### Prova Windows del V3 addestrato

Nel pannello **Confronto modelli** il pulsante **Prova V3 addestrato · Monza** avvia un episodio isolato con un’auto, uno stato neurale iniziale vuoto e il decoder verificato. Il test usa il grafo V3 ampliato su CPU e registra i due tempi effettivi. Al termine torna alla sessione precedente. Il rapporto JSON include lo SHA-256 del decoder usato. Il confronto V2–V5 continua a partire da zero.

Avviare `Avvia-prova-V3-Monza.cmd` dal checkout Windows con le dipendenze installate. Il lanciatore apre un profilo di prova dedicato e accetta il percorso del bundle come primo argomento. `work/make-v3-imitation-trial.cjs` prepara il bundle a partire dal decoder compresso, dal genoma corrispondente e dal motore di questo checkout. Il modello di ricerca e il genoma sono archivi locali.

Nella verifica dell’app Windows da sorgente, l’episodio ha coperto 11.586 m e due giri in 592,222 s simulati. Il primo giro misura 298,416 s, il secondo 293,806 s. Il test ha controllato tabella, esportazione, interruzione e ripristino byte per byte del progresso della sessione precedente. Il confronto standard separato ha superato 37 verifiche e ha eseguito tutti e quattro i modelli.

Il runner di ricerca e il percorso del worker producono gli stessi tempi se eseguiti nello stesso runtime. Electron 38.8.6 riproduce i tempi dell’app. Node 24.19.0 misura invece 298,415 e 295,084 s. La differenza osservata è riproducibile tra i due runtime provati.

La prova Windows usa pesi fissi su Monza. Rimangono aperte l’evoluzione per ricompense del decoder, le altre piste e la validazione di una candidata distribuibile.

[Rapporto della verifica desktop](../outputs/research/v3-male-cns-imitation-2026-11-17/desktop-report.json).

### Affinamento per ricompense a Monza e prova Windows a Le Mans

L’ottimizzazione successiva al preaddestramento modifica tre coefficienti del decoder V3. Su due aggiornamenti con un élite e tre figli, la selezione privilegia sicurezza, giri completati e punteggio dell’app. La prova nominale nel simulatore CPU scende da 593,499 a 556,269 s per due giri. Due partenze escluse dall’ottimizzazione confermano guadagni di 36,877 e 35,955 s senza urti. Il decoder riceve attività MaleCNS durante la guida. L’aggiornamento dei coefficienti è stato eseguito offline.

A Le Mans e Monaco, il controllore di riferimento ha completato due giri in almeno una prova per pista. Il decoder comune alle tre piste completa due giri in due partenze di Monza su tre. A Le Mans registra un giro prima di urtare in una partenza su tre. Monaco resta a zero giri. Un secondo addestramento usa esempi correttivi raccolti nelle situazioni in cui la policy commette errori. Il decoder specializzato di Le Mans completa 27.252 m senza urti nelle tre prove indipendenti, compresa una con disturbi sui comandi. La specializzazione provata a Monaco ha zero giri.

I lanciatori locali `Avvia-prova-V3-Monza.cmd` e `Avvia-prova-V3-Le-Mans.cmd` aprono profili separati. Nel pannello **Confronto modelli**, la prova del V3 addestrato seleziona la pista del bundle e richiede 30×. Possiede un report JSON separato, con tempi fisici e identificativo del decoder. Il confronto da zero V2–V5 usa le impostazioni della sessione.

La verifica dell’app Windows da sorgente misura a Monza 279,595 e 276,835 s dopo l’affinamento, per un totale di 556,430 s. La prova precedente misura 592,222 s. A Le Mans misura 760,558 e 755,370 s. Su entrambe le piste il worker termina al secondo giro e il pannello mostra i tempi misurati. I controlli verificano anche esportazione, interruzione e ripristino della sessione ordinaria.

Il test Windows riproduce i decoder a pesi fissi. L’aggiornamento per ricompense dentro l’app, un giro autonomo a Monaco e la verifica della candidata distribuibile restano aperti.

[Evidenze per pista e tempi effettivi nell’app](../outputs/research/v3-circuit-adaptation-2026-11-17/report.json).

### Due giri del V3 addestrato su Monaco

Nel confronto a parità di posa, uno dei decoder in prova comanda gas 0,258 in avvicinamento all’urto mentre il riferimento chiede freno 0,650. Un altro si ferma col freno ancora premuto. L’addestramento con soli rami di recupero ha zero giri con entrambi i profili sensoriali.

Un riferimento con obiettivo di 8 m/s completa due giri anche con partenze spostate e disturbi allo sterzo. Il decoder addestrato con quel ritmo e i sensori d’ingombro completa due giri in una prova su quattro. L’affinamento aggiunge osservazioni del secondo giro acquisite dal riferimento e da episodi del decoder precedente. Nelle quattro prove successive il primo giro è sempre completato. La partenza nominale e quella spostata a sinistra di 50 cm completano anche il secondo giro senza urti. Le due partenze a destra urtano nel secondo giro.

Nell’app Windows, la prova nominale misura 394,278 e 394,101 s, per 788,379 s simulati e 6.674 m. Il worker usa i sensori d’ingombro. La verifica copre la tabella dei tempi, l’export, l’interruzione e il ripristino della sessione. Il lanciatore locale `Avvia-prova-V3-Monaco.cmd` apre il profilo dedicato. I lanciatori Monza e Le Mans conservano i rispettivi bundle.

Il decoder apprende da esempi di guida e inferisce i comandi dall’attività MaleCNS. Le prestazioni nel giro veloce, la robustezza delle altre due partenze e l’aggiornamento per ricompense dentro l’app restano da verificare prima della candidata distribuibile.

[Evidenze delle partenze e della prova Windows](../outputs/research/v3-monaco-second-lap-2026-11-17/report.json).

### Affinamento V3 dall’app Windows

Nel pannello **Test modelli**, **Carica decoder V3…** apre un file `.json.gz` compatibile con il motore corrente. Il circuito indicato dal file viene usato per la prova V3. **Affina V3 con ricompense** esegue due generazioni isolate con quattro auto per generazione. Il worker parte dal decoder caricato e varia i coefficienti di sterzo, pedali e accelerazione. Il punteggio della simulazione seleziona fra gli agenti che completano entrambi i giri senza urti o violazioni. L’élite viene riprovata nella seconda generazione. I pesi neurali rimangono fissi e le auto continuano a leggere l’attività MaleCNS.

Su Monza la partenza nominale passa da 592,222 a 556,430 s simulati per due giri, un guadagno di 35,792 s. Tutti gli otto episodi completano due giri senza urti. Dopo la prova si può usare **Salva decoder affinato…**. Un nuovo avvio Windows con il file esportato riproduce gli stessi tempi al giro, 279,595 e 276,835 s. Al termine e dopo l’interruzione, l’app ripristina la sessione ordinaria.

La verifica dell’affinamento dall’app riguarda un genoma V3 e la partenza nominale di Monza. Servono ancora prove su altre partenze e la verifica dei pacchetti Windows della candidata.

[Risultati delle due generazioni e verifica del file esportato](../outputs/research/v3-actuator-training-desktop-2026-11-18/report.json).
