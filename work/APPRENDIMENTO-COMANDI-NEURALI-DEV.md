# Comandi neurali: esperimenti privati, non una nuova release

Queste prove sono separate dall'app pubblicata 5.6.0 e dalle finestre Windows
già aperte. Riguardano soltanto V3 / Monza, con avvio da pesi già allenati.
Non dimostrano apprendimento da zero, sugli altri circuiti o sugli altri modelli.
Il salvataggio originale dell'autore e i binari distribuiti restano conservati.

## Un limite reale del nuovo correttore, distinto dal freno fisico

L'audit `command-authority-audit/report.json` ha trovato un limite nel correttore
SAC sperimentale: la correzione era applicata al logit di un'uscita precedente
già molto alta. Su 428 controlli registrati con contesto pienamente attivo,
72 non potevano rilasciare il gas e 93 non potevano raggiungere metà freno,
neppure portando l'uscita del correttore al suo estremo.

Questo **non dimostra che il freno della fisica sia guasto**, né che la copia
Windows `projected18` abbia lo stesso vincolo: il suo spazio di comandi esterno
non presenta quelle esclusioni. Il problema riguarda il nuovo correttore
annidato, non tutti i controller e non la trasmissione della Porsche.

È stata quindi creata una famiglia distinta, `neuronal-command-residual-v1`.
La correzione neurale si applica al comando finale di sterzo e accelerazione
longitudinale, con intervallo completo quando il contesto neurale è attivo.
A correzione zero riproduce esattamente il genitore; senza attività neurale
non produce comandi. Gas e freno restano mutuamente esclusivi. Nessun percorso,
comando-obiettivo o pilota-esempio è introdotto nella guida.

Cinque test coprono identità, raggiungibilità, indipendenza degli assi,
validazione dei formati e guardia sull'attività. Prima di allenare sono stati
eseguiti nuovi replay completo e di pratica e due nuovi replay nativi del
correttore nullo. I formati dei modelli sono distinti: non vanno caricati nelle
vecchie copie Windows fingendo compatibilità.

## Risultati di guida, compresi quelli negativi

| Prova conclusa | Dati/aggiornamenti | Migliore conservato | Esito |
| --- | --- | --- | --- |
| SAC con comandi finali | 20.000 transizioni, 4.750 aggiornamenti, 216 episodi di pratica | 3.803,070 m, punteggio −604,210, zero giri | Nessun miglioramento |
| CMA di due bias neurali | 128 valutazioni fisiche complete di pratica, 16 candidati per iterazione | 3.809,279 m, punteggio −600,884, zero giri | +6,208 m e +3,326 punti |
| CMA di 18 coordinate del readout | 256 valutazioni conservate nei checkpoint, 16 candidati per iterazione | 3.809,279 m, zero giri | Nessun ulteriore miglioramento |

Il miglioramento di 6,208 m è piccolo e **non risolve il blocco**: l'auto termina
ancora per assenza di progresso. È stato però riprodotto in due prove complete
dal traguardo e in due processi nativi indipendenti, con identica sequenza di
comandi. Il modello è `neuronal-command-3803-cma-bias/model.malecns-neuronal-command.json`.

Le 18 coordinate successive sono proiezioni non supervisionate di stati neurali
realmente registrati: non sono 18 neuroni biologici nuovi, non rappresentano
37.698 parametri tutti plastici e non sono apprendimento GPU. Le direzioni sono
materializzate nei normali pesi dell'ultimo strato del decoder.

La prima prova a 18 coordinate ha ricevuto un `MemoryError`. Sono state
conservate 224 valutazioni complete nel checkpoint della quattordicesima
iterazione; i punteggi non consolidati non sono stati importati. Un recupero
distinto ha ripristinato esattamente ottimizzatore e RNG e ha eseguito altre
32 valutazioni con due processi fisici anziché quattro. I 256 record finali
non sono il totale certo di tutti i tentativi fisici del processo interrotto.
Non è stata dimostrata la causa sistemica dell'errore di memoria e nessuna app
dell'autore è stata chiusa per liberare risorse.

Rapporti e verifiche sono nelle cartelle private sotto
`.impeccable/review/neural-sacl/`, in particolare:

- `neuronal-command-3803-sac/`: esito SAC negativo e verifiche native;
- `neuronal-command-3803-cma-bias/`: incremento verificato, tutti i 128 record;
- `neuronal-command-3809-cma-readout/`: prova interrotta, checkpoint conservato;
- `neuronal-command-3809-cma-readout-recovered/`: recupero e riconciliazione di
  tutti i 256 attori, episodi ed esiti, senza guadagno ulteriore.

## Nuova prova: critico informato, guida ancora neurale

La raccolta `neuronal-command-3809-asymmetric-data` contiene 32 episodi completi
e 9.346 transizioni reali. Ogni attore è ricostruito da una valutazione già
eseguita; il nuovo replay riproduce metriche e intera traccia dei comandi.
Ogni riga contiene stato precedente, azione neurale effettiva, premio reale,
terminazione fisica e stato successivo. Le righe sono allineate, finite,
verificate tramite checksum; un episodio interrotto dal watchdog non può
fornire una falsa ricompensa terminale.

Il nuovo profilo TD3 mantiene **521 ingressi neurali/del controller nell'attore**.
Il critico di allenamento riceve inoltre 36 valori fisici e contatori delle
penalità, per 557 ingressi complessivi. I sensori aggiuntivi **non entrano nel
decoder esportato**. I test verificano che modificarli non cambi né l'uscita
dell'attore né i suoi gradienti rispetto a tali colonne.

Prima di aggiornare la guida, il critico viene inizializzato con i ritorni
scontati delle ricompense effettive fino alla vera terminazione. Sono ritorni
dei comportamenti che hanno prodotto quei dati, **non valori perfetti di una
nuova politica**, azioni da imitare o una dimostrazione di guida corretta.
L'attore iniziale resta esattamente il campione da 3.809 m. Gli episodi interi
lasciati fuori servono solo alla verifica di questa inizializzazione; quando
entrano poi nel replay non sono più un insieme indipendente di validazione.

La prova combina TD3, critico asimmetrico, inizializzazione del valore e rumore
temporale più contenuto. Non è un confronto che isola una sola causa. Non
posso confermare che risolva il mancato apprendimento prima dei risultati
fisici completi. La GPU aggiorna realmente attore e critico; grafo anatomico
e fisica restano nel runtime CPU Node 24.19.0 verificato. Il risultato va letto
nel rapporto **concluso**, non dedotto dalla diminuzione di una loss.

Riferimenti metodologici: [TD3 nella documentazione ufficiale SB3](https://stable-baselines3.readthedocs.io/en/master/modules/td3.html)
e [Asymmetric Actor Critic for Image-Based Robot Learning](https://arxiv.org/abs/1710.06542).
I risultati pubblicati in quei lavori non sono risultati di Circuit Lab.

### Deriva misurata e confronto regolarizzato concluso

La prova asimmetrica è conclusa senza migliorare il
campione. Il candidato a 4.000 transizioni si schianta a 3.598,100 m; quelli a
8.000, 12.000 e 16.000 si fermano intorno a 3.585 m. Questo è lo stato parziale
registrato durante il lavoro. Il candidato finale a 20.000 transizioni raggiunge
3.584,990 m e punteggio −829,562, ancora per assenza di progresso. Nessuno dei
cinque candidati completi è stato accettato; il campione resta 3.809,279 m.

Sono stati eseguiti 20.000 aggiornamenti online del critico e 10.000 dell'attore,
oltre ai 2.000 iniziali del solo critico, e 356 episodi di pratica. Il verificatore
ha riscontrato 37.698 coefficienti dell'attore e 170.635 del critico cambiati,
senza giri completati. Questi sono parametri dei decoder artificiali, non nuovi
neuroni biologici. Due replay completi del campione e due ulteriori replay nativi
del modello numerico concordano. Rapporti: `neuronal-command-3809-asymmetric-td3/report.json`
e `verification.json`. Il risultato negativo è conservato e non installato.

L'audit numerico nativo confronta gli attori sugli stessi 9.346 stati reali,
senza applicare nuove azioni o modificare il replay. A 4.000 transizioni la
mediana dello scarto assoluto del residuo sterzo è circa 1,000 e quella del
residuo longitudinale circa 0,979: il decoder tende a uscire verso gli estremi.
A 8.000 il residuo longitudinale cambia invece verso la frenata. Sono misure
delle **uscite del decoder sperimentale**, non una diagnosi di sensibilità
errata dello sterzo fisico né una dimostrazione della causa di ogni fallimento.

È concluso un confronto separato che conserva dati, reti iniziali, preparazione del
critico, fisica, premi, rumore e budget, cambiando soltanto l'obiettivo
dell'attore: aggiunge una penalità per la distanza dalle azioni **effettivamente
eseguite dagli agenti stessi** nel replay. Le azioni passate non sono definite
corrette o ideali; non viene introdotto un pilota esterno. La normalizzazione
del termine Q e la penalità seguono il criterio di
[TD3+BC](https://arxiv.org/abs/2106.06860), ma questa prova raccoglie anche nuovi
dati online e quindi non riproduce il benchmark offline dell'articolo.

Prima della fase che aggiorna la guida sono risultati identici tutti i 36 tensori iniziali e gli stati Adam
del confronto precedente, compresi i momenti ottenuti nella preparazione del
critico. Un test numerico su transizioni reali conferma che, fino al primo
aggiornamento differente dell'attore, il calcolo del critico resta identico.
La prova ha eseguito altre 20.000 transizioni reali, 20.000 aggiornamenti online
del critico e 10.000 dell'attore, oltre ai 2.000 iniziali del solo critico, con
319 episodi di pratica. Il candidato finale, dopo l'ultimo aggiornamento,
raggiunge 3.622,079 m, punteggio −2.638,316, e si schianta. Nessuno dei cinque
candidati intermedi o di quello finale supera il campione; il migliore
conservato resta 3.809,279 m, zero giri. Le verifiche ai checkpoint avvengono
prima dell'aggiornamento associato a quel passo: non si confondono le loro
metriche con quelle della valutazione finale dopo tutti gli aggiornamenti.

Il termine regolarizzante non è un vincolo rigido: lo scarto quadratico medio
misurato sulle azioni del replay ha media 0,11636 e massimo 0,41926. Questo
confronto **non ha risolto il blocco**. Il verificatore riconcilia tutti gli
aggiornamenti, le reti e gli ottimizzatori iniziali identici, 37.698 coefficienti
dell'attore modificati e i due replay completi più due replay nativi del
campione selezionato. Evidenze: `neuronal-command-3809-replay-td3/report.json`,
`verification.json` e `regularization-history.json`. Nessun candidato debole
è stato installato nella copia Windows.

## Ramo più avanzato e correzione neurale locale

L'archivio delle 256 valutazioni CMA contiene un agente arrivato a 4.013,367 m
prima di schiantarsi, con punteggio −2.253,690. È selezionato soltanto come
**ramo di esplorazione**, non come campione pulito. Due nuovi replay, completo
e di pratica, hanno riprodotto le metriche e la traccia di pratica già
registrata. Il replay completo contiene 5.326 controlli realmente eseguiti;
neuroni e comandi sono conservati senza etichette di azioni ideali.

Da questi dati viene ricavato un contesto che legge soltanto i 516 valori
neurali/del controller già esistenti. Per tutti i primi 5.230 stati registrati
il supporto è esattamente zero; la prima attivazione effettiva è al controllo
5.252, 74 controlli prima dell'urto. L'indice e l'ordine servono a scegliere
campioni durante la preparazione, **non sono ingressi dell'attore**: la guida
non legge tempo, distanza o una sequenza di comandi da riprodurre.

Una prova distinta cerca due coefficienti di correzione soltanto in questo
contesto, con 16 candidati e due processi fisici. Il prefisso e tutti i ricordi
neurali devono essere raggiunti e catturati realmente; il residuo nullo deve
riprodurre esattamente sia il replay completo del ramo sia il suo suffisso
restaurato. Le ricompense R5 non vengono cambiate e il vecchio campione pulito
resta il requisito minimo per promuovere un candidato. Anche un miglioramento
in pratica richiede due esecuzioni complete dal traguardo; impacchettamento
numerico indipendente e integrazione Windows rimangono verifiche ulteriori.

Si riusa il principio di tornare a uno stato già raggiunto prima di esplorare,
descritto in [First return, then explore](https://arxiv.org/abs/2004.12919).
Non è una riproduzione completa di Go-Explore, non include la sua fase di
imitazione/robustificazione e non ne eredita i risultati pubblicati.
Evidenze locali: `neuronal-command-4013-branch-prepared/report.json`,
`neuronal-command-4013-repair-context/prepared.json` e il rapporto conclusivo
di `neuronal-command-4013-local-repair` quando sarà disponibile.

### Microbenchmark sul PC dell'autore

Un confronto numerico usa gli stessi pesi congelati e stati reali, un thread
CPU e la RTX 4060, senza passi fisici o aggiornamenti dell'ottimizzatore.
Nel primo confronto completo, mentre il trainer CUDA e le app dell'autore
sono attivi, le medie su 100 ripetizioni sono:

| Operazione numerica | CPU | CUDA |
| --- | ---: | ---: |
| Una previsione dell'attore con ritorno NumPy | 0,294 ms | 9,630 ms |
| Backward del critico, batch 256 | 5,497 ms | 25,395 ms |
| Backward dell'attore, batch 256 | 6,167 ms | 17,425 ms |

È un microbenchmark **con carico concorrente non controllato**, non la velocità
complessiva della simulazione o un risultato di apprendimento. Non giustifica
da solo una conclusione generale su CPU o GPU. Un secondo script rifiuta di
partire finché il trainer noto non risulta concluso e sono presenti altri
trainer neurali del progetto; le altre app dell'autore non vengono chiuse.
Le sorgenti di inferenza già verificate non sono state sostituite in base a
questa misura.

Il secondo controllo è concluso, con il trainer precedente terminato e nessun
altro trainer neurale del progetto rilevato all'avvio. Le app dell'autore sono
rimaste aperte. Il quadro cambia sensibilmente rispetto al primo confronto:

| Operazione numerica | CPU | CUDA |
| --- | ---: | ---: |
| Una previsione dell'attore con ritorno NumPy | 0,173 ms | 0,421 ms |
| Backward del critico, batch 256 | 3,373 ms | 2,264 ms |
| Backward dell'attore, batch 256 | 3,220 ms | 2,325 ms |

Il carico concorrente del primo confronto impediva quindi di usarlo da solo
per scegliere un backend. Anche il secondo è un microbenchmark: non comprende
tutti i costi dell'ottimizzatore o della fisica e non dimostra uno specifico
fattore di accelerazione dell'app. La nuova prova conserva il medesimo backend
ibrido del riferimento: grafo/fisica CPU e aggiornamenti CUDA, cambiando il
solo obiettivo dell'attore. Evidenza: `neuronal-compute-timing-quiet/report.json`.

Evidenza completa: `neuronal-compute-timing-v2/report.json`. La prima versione
del solo script di misura aveva un errore nell'ordine di un meno unario e
`.backward()`; è terminata prima dei dati CUDA, è esclusa dal confronto e
conservata con la sorgente e una nota in `neuronal-compute-timing/`.

## Condizioni che restano aperte

È ora verificato un primo giro fisico completo su Monza, dal modello V3 già
allenato. Servono ancora due giri nello stesso episodio, poi verifiche
sugli altri modelli/circuiti e sugli avvii da zero. Per ogni candidato vengono
considerati separatamente distanza, giri, punteggio e aggiornamenti effettivi.
Un candidato che migliora soltanto la loss, peggiora la distanza o si schianta
non sostituisce automaticamente il migliore pulito verificato.

## Primo giro verificato e selezione globale del migliore — 15 ottobre 2026

Le correzioni neurali locali hanno prodotto un progresso più consistente dei
precedenti tentativi SAC/TD3. Ogni ricerca seguente conserva 128 valutazioni
fisiche effettive, con 16 candidati per iterazione. I checkpoint di pratica
contengono solo stati fisici e neurali realmente raggiunti: **non sono giri o
generazioni dell'app**. Ogni modello selezionato richiede poi due prove complete
dal traguardo e due prove in processi nativi che caricano soltanto il modello
numerico esportato. Metriche e intera traccia dei comandi devono coincidere.

| Ricerca conclusa | Migliore senza urto conservato | Giri | Punteggio | Esito terminale |
| --- | ---: | ---: | ---: | --- |
| `neuronal-chain-4287-search` | 4.568,902 m | 0 | 147,572 | Ferma / senza progresso |
| `neuronal-chain-5615-search` | 6.491,303 m | 1 | 3.956,309 | Ferma / senza progresso |
| `neuronal-chain-6541-search` | **6.584,839 m** | **1** | **4.052,109** | Troppo lenta / senza progresso |
| `neuronal-chain-6541-wide-search` | 6.582,533 m | 1 | 4.050,118 | Troppo lenta / senza progresso |
| `neuronal-chain-6541-early-search` | 6.553,543 m | 1 | 4.017,627 | Troppo lenta / senza progresso |
| `neuronal-chain-6541-multi-search` | 6.554,437 m | 1 | 4.025,717 | Troppo lenta / senza progresso |

Il giro del migliore dura **742,550 secondi simulati**, circa **12 min 22,55 s**:
è un giro molto lento, non una guida competitiva o il completamento dei due
giri richiesti. La prova finisce a 849,483 secondi simulati. Il contesto è ancora
soltanto V3/Monza, con pesi iniziali già allenati, non un successo da zero.

Il decoder migliore contiene quattro correzioni neurali aggiunte; le ricerche
variano soltanto gli ultimi due coefficienti per volta. Questi sono parametri
artificiali, **non neuroni biologici aggiunti**: il grafo V3 rimane di 7.721 nodi
e 242.486 connessioni anatomiche. L'attore riceve gli stati neurali/del
controller; posizione sul giro, coordinate-obiettivo, orologio e comandi ideali
non sono ingressi di guida. R5 e la fisica non vengono ammorbiditi per ottenere
il giro. Le prove non costituiscono una validazione neuroscientifica.

Le ricerche successive sono confrontate anche con il migliore **globale**,
non soltanto con il vecchio riferimento da 3.809 m. Il selettore
`select_neural_clean_champion.py` legge rapporto, verifica indipendente e SHA
del modello, poi richiede punteggio migliore senza regredire in distanza o
giri. Timestamp più nuovo, punteggio da solo o una collisione più lontana non
bastano. Le tre ricerche più recenti non hanno sostituito i 6.584,839 m.

Un audit separato riproduce l'intera traccia del modello a sei coefficienti e
conta le attivazioni effettive: due dei tre nuovi contesti rimangono a zero su
questa traiettoria, mentre il primo contesto utile si attiva al controllo 8.135.
Questo dimostra capacità inutilizzata **in quella prova**, non la causa
universale del mancato apprendimento. Aumentare il numero nominale dei pesi
non aveva quindi aumentato tutti i gradi di libertà effettivamente utilizzati.

Evidenze private, tutte sotto `.impeccable/review/neural-sacl/`:

- `neuronal-clean-champion.json`: selezione globale e SHA dei rapporti;
- `neuronal-chain-6541-search/report.json` e `verification.json`: 128 valutazioni
  e prove complete / native del migliore;
- `neuronal-chain-6541-search/clean.malecns-frontier-chain.json`: modello numerico
  autonomo, SHA-256 `4a752dfb82c2268721f0ae100e550bd174be81a04e96ca7259b3e29814043d80`;
- `neuronal-chain-6541-multi-search/cue-activation-audit.json`: audit effettivo
  delle attivazioni, con traccia completa corrispondente;
- ciascuna delle tre cartelle `wide`, `early`, `multi` della tabella conserva
  anche l'esito inferiore e il suo verificatore. Non sono installazioni migliori.

L'integrazione Windows del campione è una verifica separata: il suo stato e
le istruzioni sono in [APPRENDIMENTO-CAMPIONE-NEURALE-DEV.md](APPRENDIMENTO-CAMPIONE-NEURALE-DEV.md).
