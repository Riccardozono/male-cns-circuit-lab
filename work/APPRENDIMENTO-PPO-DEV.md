# Politica neurale PPO: esperimento privato, non installato

## Perché una prova diversa

I confronti di correzioni costanti e finestre neurali più lunghe non hanno
risolto il secondo giro. La copia Windows allena solo due coefficienti finali;
non è una prova dell'apprendimento di tutti i parametri. Il nuovo esperimento
confronta una politica dipendente dallo stato con aggiornamenti PPO, separata
dal modello e dal formato dei salvataggi della copia Windows.

Riferimento metodologico: [Proximal Policy Optimization Algorithms,
Schulman et al., 2017](https://arxiv.org/abs/1707.06347). Questa implementazione
specifica del progetto non è una riproduzione dei risultati del paper.

## Cosa entra nel controller

La rete anatomica V3 e il controller già verificato eseguono sensori, neuroni
e memoria. Il nuovo attore osserva tredici valori:

- nove valori della proiezione neurale già preparata, inclusa la costante;
- sterzo e comando longitudinale effettivi del decoder genitore;
- i due residui prodotti al controllo precedente, limitati con tanh.

Una matrice di 26 pesi produce le medie di due azioni gaussiane latenti.
Durante la valutazione si usano soltanto le medie, senza esplorazione.
Nessun ingresso contiene posizione, tempo, numero del giro, premio, velocità
obiettivo o azioni consigliate. Il premio è usato dall'ottimizzatore, non
come sensore dell'attore. Il critico usa gli stessi tredici valori.

I nuovi residui passano attraverso il compositore di motori esistente:
comandi limitati e acceleratore/freno mutuamente esclusivi. Resta il controllo
che impedisce di guidare senza attività neurale. Non cambia la fisica.

## Prova di identità e raccolta reale

Il genitore è il campione di ricerca da 6.590,792 m, non quello compatibile
con la finestra Windows da 6.584,839 m. Prima dell'apprendimento, la politica
nulla deve riprodurre metriche e intera traccia del genitore:

1. episodio completo dal traguardo;
2. suffisso da uno stato precedentemente raggiunto davvero, unito al suo
   prefisso reale.

Solo il primo è un nuovo episodio fisico completo dal via. Ripristinare
il suffisso non equivale a completare un giro o una generazione dell'app.
Lo stato comprende vettura, neuroni e tutte le memorie dei controller.

Ogni rollout conserva osservazioni, medie effettivamente calcolate da Node,
azioni campionate, premi, terminazioni e osservazioni successive. I dati
vengono raccolti dalla fisica, non costruiti a mano o da un pilota insegnante.
Ogni batch viene raccolto con la politica corrente e usato per le epoche PPO
prima di raccogliere il successivo. Interruzioni per valutare una politica
non sono contate come episodi completati.

## Precisione e criteri di promozione

Node 24.19.0 esegue sempre l'inferenza che guida la vettura, anche durante
l'allenamento. Torch CPU float64 calcola gradienti di questa piccola politica
e del critico, con un thread. Non è una prova di accelerazione GPU.
Le medie Torch vengono confrontate con le medie Node sulle osservazioni
effettive, con tolleranza 1e-12. Le valutazioni fisiche deterministiche usano
Node, non l'inferenza Torch come sostituto presunto equivalente.

Premi e penalità rimangono invariati. Una politica più lontana che urta non
è un campione valido. Progresso, giri e punteggio non devono regredire.
Un miglioramento nel suffisso deve poi passare due prove complete dal via,
esportazione dati con identità propria e caricamenti nativi indipendenti.
Il semplice aggiornamento dei pesi non prova un apprendimento utile.

`latest-policy.json` è uno snapshot **research-unverified**, non un
salvataggio dell'app e non un modello distribuibile. Non rinominarlo per
caricarlo nei vecchi formati. Nessuna promozione automatica è implementata.

## File e risultati verificabili

- `neural-ppo-policy.cjs`: attore e composizione dei comandi;
- `neural-ppo-env.cjs`: transizioni e valutazioni fisiche reali;
- `train_neural_ppo.py`: raccolta e aggiornamenti PPO;
- `verify_neural_ppo.py`: riconciliazione numerica dei batch e dei pesi;
- `neural-ppo-policy.test.cjs`: test unitari, non episodi di guida.

Lo studio iniziale è `neuronal-ppo-feedback-6590-first`, sotto
`.impeccable/review/neural-sacl/`. `state.json` descrive una fase, ma da solo
non dimostra che il processo sia ancora vivo: servono handle o controllo OS.
Solo `report.json` concluso descrive l'esito e `verification.json` attesta
la successiva riconciliazione. Un fallimento conserva `failure.json`.

Questa prova riguarda V3/Monza con avvio già allenato. Non dimostra due giri,
apprendimento da zero, convergenza generale o risultati sugli altri circuiti.
Versione, release, app aperte e salvataggio originale restano invariati.

## Primo esito effettivo

`neuronal-ppo-feedback-6590-first` è concluso: 8.192 transizioni reali,
32 aggiornamenti e 16 episodi di pratica terminati. Tutti i 26 pesi cambiano,
ma nessuna delle quattro valutazioni deterministiche supera il genitore.
L'ultima raggiunge 6.266,653 m, punteggio 3.783,596, un giro e arresto
per ritmo insufficiente. Il tempo del primo giro resta quello del prefisso
protetto; non è una prova di un nuovo giro imparato da zero.

La riconciliazione `verification.json` passa: riproduce ogni aggiornamento
Torch dai batch reali, tutti i pesi e le statistiche. Il rapporto sorgente ha
SHA-256 `c77cab98e11f7a50ee073fe16233d5696c09713e5d5c95d9cfff69e648b5544f`.
Nessun candidato è idoneo alla successiva prova nativa di promozione.

L'audit `feature-audit.json` trova rango centrato 12 su 13 ingressi, con
tolleranza relativa 1e-6: il tredicesimo è la costante intenzionale. Non è
quindi sostenuta l'ipotesi che tutti gli ingressi siano costanti in questi
8.192 campioni. Non dimostra però qualità informativa o causalità.

## Confronto dell'orizzonte di credito

Un secondo studio separato, `neuronal-ppo-feedback-6590-long-credit`, mantiene
identici modello, seed, premi, ingressi, fisica, inizializzazione, numero di
transizioni richieste e calendario delle valutazioni. Cambiano soltanto
gamma/lambda del calcolo GAE: da 0,995/0,95 a 0,999/0,995.
Il peso diretto di una conseguenza a 100 controlli passa matematicamente
da `(0,995 × 0,95)^100` a `(0,999 × 0,995)^100`. Questa è una proprietà
della formula, non una prova che il nuovo orizzonte migliori la vettura.

I file `train_neural_ppo_long.py` e `verify_neural_ppo_long.py` sono separati:
le sorgenti e le prove del primo studio non vengono riscritte. Quattro test
matematici verificano taglio alle terminazioni, bootstrap a fine rollout,
orizzonte del credito e rapporto unitario per una politica invariata.
Sono fixture matematiche, non esempi fittizi usati per allenare la guida.
Anche il secondo `report.json` è terminale: 8.192 transizioni reali,
32 aggiornamenti, 19 episodi di pratica terminati, nessun miglioramento
idoneo alla prova nativa. L'ultima valutazione raggiunge 6.303,939 m,
punteggio 1.925,919 e termina con urto. Le altre valutazioni sono a
6.361,796 m (urto), 6.498,822 m (urto) e 6.107,789 m (ritmo insufficiente).
Anche la riconciliazione separata passa, riproducendo tutti gli aggiornamenti.
SHA-256 del rapporto:
`c7735a60c725cd762d798b628cbb42e71094e6d31cbff971e61235bd022160c5`.

In questi due studi non c'è quindi evidenza di beneficio aumentando soltanto
l'orizzonte GAE di questa politica a 26 pesi. Non equivale a dimostrare che
PPO in generale non funzioni o che una durata di allenamento diversa non
possa cambiare l'esito. Non sono stati confrontati altri seed, circuiti,
modelli, politiche neurali più ampie o addestramento dall'inizio.

## Audit sensoriale e politica con storia neurale completa

Il controllo `audit-neural-sensory-coverage.cjs` esegue il genitore nativo
dal traguardo e conserva quattro stati raggiunti davvero, ai controlli
0, 500, 4000 e 8000. Su copie di ciascun cervello perturba uno dei 28 sensori,
tenendo la vettura ferma per uno o quattro controlli neurali. Sono sonde
controfattuali, non traiettorie alternative o esempi da allenare.

In tutti gli otto confronti, tutti i 28 canali influenzano almeno un neurone
del readout attuale da 128 discendenti. Il readout completo dei 251 discendenti
raggiungibili non recupera canali totalmente assenti dal primo. L'episodio
fisico effettivo resta identico al genitore: 8.495 controlli, stesse metriche
e intera traccia `3e3658c1543fe43791dd21db1410e0e58213691a2d6569fc2d34146f45651244`.

La verifica `audit_neural_sensory_rank.py` controlla sorgenti, modello, metriche,
sonde e derivate. Le risposte locali hanno rango 28 sia su 128 sia su 251
discendenti, con tolleranza relativa 1e-6. La trasformazione lineare delle
otto componenti PCA, applicata al solo fotogramma neurale più recente e
tenendo fissi gli altri ingressi, ha rango 8. Non dimostra che le direzioni
scartate servano a guidare o che la PCA causi il blocco; motiva un confronto
senza tale riduzione nel nuovo attore. Non è una prova generale di osservabilità.

Evidenze sotto `neuronal-sensory-coverage-6590/`: `report.json` e
`rank-verification.json`. I dati delle sonde non entrano nell'ottimizzatore.

La politica successiva è separata in `neural-ppo-wide-policy.cjs` e
`neural-ppo-wide-env.cjs`, con trainer `train_neural_ppo_wide.py`:

- 516 valori effettivi del controller: quattro fotogrammi di 128 neuroni
  discendenti, due valori di memoria e due comandi del decoder di base;
- altri quattro valori: due comandi effettivi del genitore e due residui
  precedenti, per **520 ingressi** complessivi;
- rete artificiale 520 → 64 tanh → 2, con **33.474 parametri** allenabili;
- matrice di uscita inizialmente nulla: il nuovo correttore parte come
  identità esatta, mentre gli strati nascosti hanno inizializzazione numerica;
- stesso cervello anatomico V3 da 7.721 neuroni, non 33.474 neuroni biologici
  aggiunti. Il genitore conserva le sue correzioni precedenti, inclusa la PCA;
  soltanto il nuovo attore osserva la storia senza quella riduzione.

Tre fixture numeriche verificano uscita nulla esatta in Node/Torch, layout e
precisione dei parametri anche con uscita non nulla, e propagazione del
gradiente nello strato nascosto. Non sono esempi di guida. Il preflight fisico
completo e quello da prefisso effettivamente raggiunto sono passati prima
dell'allenamento: metriche e traccia del genitore coincidono.

Lo studio `neuronal-ppo-full-history-6590-first` richiede 64 aggiornamenti da
256 transizioni, il doppio del budget dei due piccoli studi precedenti. Cambiano
anche capacità e rappresentazione: non è un confronto controllato di una
sola variabile né permette di attribuire un eventuale beneficio alla sola PCA.
I risultati conclusivi richiedono `report.json` e `verification.json` di quello
studio. Non è installato nell'app. Il checkpoint Torch privato conserva stato
di attore, critico, ottimizzatore e RNG; non è un salvataggio della vettura o
un file da caricare nell'app e non promette ripresa fisica a metà episodio.

### Esito effettivo del modello più ampio

Lo studio è concluso e riconciliato: **16.384 transizioni, 64 aggiornamenti,
60 episodi di pratica terminati**, tutti i 33.474 parametri cambiati. Nessuna
delle otto valutazioni supera il genitore. L'ultima raggiunge 6.086,505 m,
punteggio 3.634,902 e termina per ritmo insufficiente. Rimangono un giro
ereditato dal prefisso e nessuna dimostrazione di due giri appresi.

`verification.json` ricostruisce esattamente pesi, perdite, KL e scale da tutti
i batch reali. SHA-256 del rapporto:
`8d9c932ecd74662b316dcf38c8d072927052a25c8b2f0b3e6746237dd1fe02fe`.
La rappresentazione più ampia non è risultata sufficiente in questa prova;
non è una dimostrazione generale contro questa architettura o contro PPO.

### Confronto di una penalità aggiuntiva per il mancato secondo giro

Nei 60 episodi del modello ampio, il reward del passo terminale ha queste
mediane: circa -32,808 per 19 urti, -14,000 per 22 arresti per ritmo
insufficiente e -14,000 per 19 arresti per stallo. Sono variazioni terminali
del punteggio divise per 100, non il punteggio dell'intero episodio. La
differenza nei costi è osservata; da sola non prova la causa dell'apprendimento.

`neuronal-ppo-full-history-failure40` mantiene modello, seed, rappresentazione,
fisica, 64 aggiornamenti e calendario di valutazione. Cambia soltanto il
reward usato per allenare: se l'episodio termina prima di due giri,
`rewardAllenamento = min(rewardR5 / 100, -40)`. La differenza è registrata
come penalità aggiuntiva non negativa. Non ammorbidisce gli urti e non altera
le transizioni non terminali o il risultato di due giri completati. Due test
matematici verificano queste proprietà. È un obiettivo di allenamento
**distinto**, non una trasformazione dichiarata invariante dell'ottimo R5.

La fisica e le valutazioni deterministiche continuano a usare l'obiettivo R5
originale; nessun parametro della penalità viene passato come sensore o comando.
Il modello è promosso solo contro quel punteggio originale, non contro quello
ausiliario. Non cambia il formato dei salvataggi o l'app distribuita.

Anche questa prova è conclusa e riconciliata: **16.384 transizioni, 64
aggiornamenti e 37 episodi di pratica terminati**. Nessuna valutazione supera
il genitore; l'ultima arriva a 6.512,311 m, punteggio 2.088,447 e termina con
urto. SHA-256 del rapporto:
`f0f31d3ff303e46a2c5f4a33ef7a8f8357cb7b378e6d97e3cb2da9be10b75e06`.
La maggiore severità non viene presentata come soluzione e non è installata.

### Copertura effettiva dell'esplorazione di sterzo

`motor-coverage-audit.json` riconcilia i 16.384 campioni effettivi dello
studio con penalità aggiuntiva. In 3.928 campioni il comando di sterzo del
genitore ha valore assoluto superiore a 0,8. Nessuna azione campionata avrebbe
potuto invertirne il segno, anche assumendo gate massimo 1: la massima
correzione osservata `abs(2*tanh(0,2*azioneLatente))` è 0,226912.

Questo limita **l'esplorazione osservata**, non il massimo teorico della rete;
non etichetta invertire lo sterzo come azione corretta e non dimostra che
servisse farlo in quei punti. L'audit non genera target o esempi di guida.
Motiva una prova con scala latente simmetrica dei due motori, senza il fattore
0,2 sul nuovo residuo di sterzo. Non cambia angolo massimo delle ruote,
inerzia, pneumatici, sensori o fisica.

La prova è preparata nei file `neural-ppo-steering-policy.cjs`,
`neural-ppo-steering-env.cjs`, `train_neural_ppo_steering.py` e
`verify_neural_ppo_steering.py`. Due test unitari passano: identità del residuo
nullo/gate nullo, invariati comandi longitudinali, motori limitati ed esclusivi.
La prova `neuronal-ppo-symmetric-steering-first` è conclusa: **16.384
transizioni reali, 64 aggiornamenti e 85 episodi di pratica terminati**.
Preflight completo e da prefisso reale passano; tutti i parametri cambiano.
Nessuna delle otto valutazioni supera il campione. L'ultima raggiunge
6.583,732 m, punteggio 2.200,682 e termina con urto. Un'altra valutazione
senza urto raggiunge 6.481,290 m, punteggio 3.957,475, poi si ferma: non
domina il genitore da 6.590,792 m e punteggio 4.057,078.

La riconciliazione numerica separata passa su tutti i batch, pesi e statistiche.
SHA-256 del rapporto:
`03adb75f3bba51f88b84afecbddc0495653b0fdc27a46e0d82ef2304d7f8c221`.
Il processo e il verificatore sono terminati. Anche correggere questa scala
non è sufficiente in questa prova; niente viene promosso o installato.

I tre studi con rete ampia sommano 49.152 transizioni e 192 aggiornamenti,
ma non dimostrano due giri o miglioramento del campione. Non vanno sommati
come se fossero un solo allenamento continuato: ciascuno riparte dalla propria
inizializzazione e conserva un'identità distinta. Restano da verificare
condizionamento/normalizzazione degli ingressi neurali, durata e generalità
dell'apprendimento; non si dichiarano cause o soluzioni da soli conteggi.

## Confronto con normalizzazione dei 520 ingressi

`prepare_neural_ppo_normalization.py` ricostruisce medie e deviazioni standard
dai soli vettori `x` effettivi dello studio a sterzo simmetrico: 16.384 righe
con 520 valori neurali e di contesto del controller. Non seleziona colonne
di premio, fitness, posizione, giro o azione desiderata. Mantiene tutte le
dimensioni e applica `tanh((x-media)/scala)`, con scala minima 0,05, scelta
numerica dichiarata. Le statistiche restano fisse durante il confronto.

Nel campione originale, 53 ingressi hanno media assoluta superiore a due
deviazioni standard; tre hanno deviazione inferiore a 0,05. La deviazione
mediana passa da 0,2511 a circa 0,6503 nella trasformazione diagnostica NumPy.
Non è la prova di una causa del blocco. `verify_neural_ppo_normalization.py`
ricostruisce esattamente le statistiche dai file originali e ne verifica le
identità. SHA-256 della normalizzazione:
`3ca0d075420abb5cd742999223c4883ef2f60a6851d960d799ce030988ec0bca`.

Il confronto `neuronal-ppo-normalized520-first` mantiene rete, seed, premi,
penalità ausiliarie, decoder, fisica e budget dello studio a sterzo simmetrico.
Cambiano gli ingressi normalizzati, anche del critico. Il correttore nullo
riproduce episodio completo e prefisso/suffisso del genitore. Due test
verificano medie centrate a zero, nessuna perdita di dimensioni, proprietà
privata delle statistiche e rifiuto di dati/provenienza incompatibili.

Lo studio conclude **16.384 transizioni reali, 64 aggiornamenti e 71 episodi
di pratica terminati**, senza miglioramento valido nelle otto valutazioni.
L'ultima arriva a 6.178,364 m, punteggio 3.716,280 e si ferma per stallo.
Non è idoneo a prove native di promozione e non viene installato. Il controllo
separato riproduce esattamente batch, perdite, KL, scale e pesi finali.
SHA-256 del rapporto:
`3850d3eb6f8296aebae814c35afbd600179affedc63b52584cf2a8c077c75ba1`.

Anche questa singola modifica è dunque insufficiente nel budget e nella
partenza già allenata provati. Non si trasforma l'esito in un'affermazione
generale contro normalizzazione/PPO o in una dimostrazione di due giri.

## Estensione CUDA a 256 aggiornamenti e trasferimento della memoria

`neuronal-ppo-normalized520-cuda-long` conclude 65.536 transizioni fisiche,
256 aggiornamenti e 251 episodi di pratica. I primi 64 aggiornamenti
riproducono esattamente le 16.384 transizioni del confronto CPU precedente;
le successive 49.152 estendono lo studio. La propagazione del connettoma usa
CUDA, l'ottimizzazione della piccola rete usa Torch CPU. Contatori effettivi:
97.376 controlli neurali GPU, 389.504 kernel, nessun ripiego CPU.

Nessuna delle 32 valutazioni deterministiche migliora il campione pulito.
Ultima: 6.588,989394 m, 2.152,333601 punti, un giro ereditato, urto. La
verifica indipendente riproduce tutti i 256 aggiornamenti e i pesi finali.
Non viene promossa o installata alcuna di queste policy nell'app Windows.
SHA-256 rapporto:
`04561fa9b4dd45e1a58f3da3cd5a72c8032403dd5df1f458b60720d34dbb371c`.

Un ulteriore controllo scopre una discrepanza effettiva tra pratica e partenza
completa del modello allenato a 64 aggiornamenti. La memoria conservava una
proposta anche quando il gate neurale non la applicava ai motori. Una nuova
copia distinta azzera questa memoria soltanto a gate zero; il protocollo
precedente e i suoi risultati restano conservati. Tre esecuzioni fisiche
complete/pratica/native del modello corretto coincidono esattamente, ma
restano ferme a 6.178 m: è una correzione del trasferimento, non una prova di
apprendimento migliore. Dettagli in `PPO-TRASFERIMENTO-MEMORIA-DEV.md`.
