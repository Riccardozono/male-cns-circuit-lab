# Esperimento ibrido CUDA — V3 / Monza, 15 ottobre 2026

**Esito: la pipeline GPU funziona, ma questa prova non migliora il campione.**
Non è stata inserita nella copia Windows aperta e non costituisce una nuova
release. Versione 5.6.0, modello iniziale della copia proiettata e progressi
dell'autore restano invariati. Non posso confermare un miglioramento della guida
da questa prova: le valutazioni complete lo contraddicono.

## Che cosa è stato eseguito

- PyTorch 2.11.0+cu128, CUDA 12.8, RTX 4060; attore e critico realmente su
  `cuda:0`. Quattro simulatori CPU usano Node 24.19.0, non il runtime numerico
  differente incorporato in Electron.
- SAC con ricompense reali R5, replay buffer e 4.750 aggiornamenti tramite
  gradienti, su 20.000 transizioni fisiche e 165 episodi di pratica. La rete
  biologica V3 rimane di 7.721 nodi e 242.486 archi.
- Nuovo decoder artificiale 521–64–64–2: **37.698 parametri di inferenza**, non
  37.698 neuroni biologici aggiunti. Riceve storia neurale, memorie del
  controller, sue precedenti uscite apprese e attivazione causale del contesto.
  Non riceve posizione, tempo, waypoint o comandi di un pilota-esempio.
- Genitore da 3.803,070 m congelato. Una correzione nulla conserva esattamente
  il genitore, compresi i comandi. Un membro protetto del replay usa quel
  comportamento realmente appreso: non un pilota esterno o un percorso imposto.
- Le partenze di pratica riusano uno stato fisico **realmente raggiunto** e le
  sue memorie neurali. Non sono nuove generazioni complete. Ogni candidato
  viene invece valutato fisicamente dal traguardo, usando l'attore JSON
  esportato e l'aritmetica del motore nativo, non le sole predizioni Torch.
- Nessun tetto di tempo simulato è stato aggiunto. Il vecchio flag diagnostico
  a 2.000 secondi non interrompe gli episodi. Un watchdog di tempo reale marca
  una verifica incompleta come censurata, senza promuoverla.

Normalizzazione e gate provengono soltanto dalle osservazioni effettive del
genitore: 5.048 controlli, 4.038 osservazioni di prefisso protette, prima
attivazione al controllo 4.619 e 429 campioni successivi. Il supporto è stato
controllato su **ogni** osservazione del prefisso, non soltanto sui campioni
usati per scegliere i contesti.

## Risultati completi dal traguardo

| Verifica | Avanzamento | Punteggio | Conclusione | Giri |
| --- | ---: | ---: | --- | ---: |
| Genitore, correzione nulla | 3.803,070 m | −604,210 | troppo lenta / senza progresso | 0 |
| 4.000 passi, 749 aggiornamenti | 3.615,849 m | −2.652,908 | urto | 0 |
| 8.000 passi, 1.749 aggiornamenti | 3.591,431 m | −824,770 | troppo lenta / senza progresso | 0 |
| 12.000 passi, 2.749 aggiornamenti | 3.586,451 m | −828,095 | ferma / senza progresso | 0 |
| 16.000 passi, 3.749 aggiornamenti | 3.586,641 m | −827,898 | ferma / senza progresso | 0 |
| 20.000 passi, 4.749 aggiornamenti | 3.589,270 m | −826,667 | ferma / senza progresso | 0 |
| Finale, 4.750 aggiornamenti | 3.589,362 m | −826,540 | ferma / senza progresso | 0 |

Il controllo periodico avviene prima dell'ultimo aggiornamento di quel blocco,
per questo la riga finale differisce leggermente dal controllo a 20.000 passi.
Nessun candidato è stato accettato. Il miglior avanzamento grezzo osservato in
pratica, circa 3.803,538 m, **non è un miglioramento completo e sicuro verificato**.

37.690 coefficienti finali risultano diversi da quelli iniziali, con distanza
L2 circa 6,047: gli aggiornamenti sono reali, ma **cambiare i pesi non dimostra
che la guida migliori**. La selezione conserva quindi il genitore. Non attribuire
gli urti o gli arresti a un guasto del freno fisico soltanto da questo risultato:
le prove mostrano un comportamento del decoder, non quella causa.

Il modello numerico conservato ha SHA256
`42fef4580fb5cacd9dd7795f23f3707df70e6b9cb47ddab50af402b3334f702c`.
Include il residuo nullo selezionato, non il candidato finale peggiore. Due
processi nativi completi e indipendenti riproducono il suo tracciato di comandi
`02d0cf438e6479b73e262f80ff779ccc57c31f2ed71c0c8f19d58c73f3136136`,
con zero gas/freno simultanei. Un formato numerico diverso non va rinominato
come salvataggio compatibile della copia Windows proiettata18.

## Problemi tecnici trovati e corretti

I primi due avvii si sono fermati per un controllo dei limiti: il polinomio del
nuovo contesto poteva produrre `1.0000000000000002` anziché il massimo
matematico 1. Il secondo avvio ha registrato il valore preciso; un test isolato
lo riproduce. Il **nuovo** gate è ora limitato al suo intervallo matematico [0,1].
Non sono state modificate la rete o la riduzione numerica del genitore, i
contesti delle copie aperte, la fisica o i comandi fisici dei freni.

I due tentativi falliti sono conservati separatamente e non vengono contati
come prove concluse o miglioramenti. L'avvio corretto è terminato normalmente;
il suo rapporto registra dati e hash prima e dopo l'addestramento.

Sono passati quattro test del codec/gate/formato, due test Python di
normalizzazione/selezione e i **395 test generali dell'app**, senza errori o
test saltati. Questi test non dimostrano convergenza dell'apprendimento.

## Evidenze e strumenti locali

Sotto `.impeccable/review/neural-sacl/`:

- `projected-residual-3803-prepared/prepared.json`: contesti, normalizzazione,
  hash e risultato del genitore realmente osservato.
- `projected-residual-3803-sac/state.json` e
  `projected-residual-3803-sac-diagnostic/state.json`: tentativi interrotti,
  esclusi dall'esito concluso.
- `projected-residual-3803-sac-bounded/preflight.json`: identità iniziale,
  pratica equivalente e due replay nativi del residuo nullo.
- `projected-residual-3803-sac-bounded/report.json`: prova conclusa, GPU,
  aggiornamenti, episodi, tutte le verifiche e due replay nativi finali.
- `projected-residual-3803-sac-bounded/verification.json`: riconciliazione
  distinta di sorgenti, parametri modificati, modello ed evidenze.
- `projected-residual-root-tests.xml`: 395 test generali effettivamente eseguiti.

`train_projected_residual_sac.py` rifiuta una cartella di risultato già esistente;
non riparte automaticamente da un timeout o da un file di stato. I checkpoint
Torch e il replay pickle sono **solo file privati prodotti da questa prova**:
non si caricano pickle o modelli eseguibili provenienti da terzi.

Il lavoro aperto riguarda miglioramento reale, giri completati e verifica sugli
altri modelli/piste/seed. Prima di aggiungere altri parametri viene raccolta una
sonda separata dell'informazione sensoriale nel readout neurale: le sue etichette
sono misure dei sensori per un'analisi offline, **non azioni da imitare** o
esempi introdotti nell'addestramento delle auto.

## Sonda sensoriale conclusa: esito misto, non una causa dimostrata

Due ulteriori replay fisici completi hanno riprodotto esattamente i comandi del
genitore e del candidato finale scartato. Sono stati raccolti simultaneamente
storia neurale e sensori reali, senza cambiare la guida. La sonda confronta il
readout corrente di128 neuroni discendenti con tutti i251 neuroni discendenti
già presenti nel grafo: osserva123 cellule in più, **non aggiunge nodi biologici**.

Sono stati deduplicati i campioni identici del prefisso comune:2.379 righe
raccolte,1.455 campioni effettivamente distinti. La ricostruzione offline usa
24 componenti PCA e ridge, adattate soltanto sui blocchi di training. Cinque
blocchi temporali consecutivi vengono lasciati fuori a turno, con margine di
due secondi. Non è uno split casuale di fotogrammi adiacenti.

| Misura del sensore | R², readout128 | R², readout251 |
| --- | ---: | ---: |
| Velocità | 0,826 | 0,846 |
| G longitudinali | 0,693 | 0,728 |
| G laterali | 0,549 | 0,590 |
| Imbardata | 0,849 | 0,840 |
| Bilanciamento rispetto ai bordi | 0,857 | 0,864 |
| Anteprima stradale | 0,943 | 0,940 |
| Distanza libera | 0,915 | 0,911 |

R² misura questa ricostruzione offline, **non la precisione della guida**.
L'estensione migliora alcuni segnali e ne peggiora altri; non conferma che
leggere più neuroni risolva il mancato apprendimento. In questi campioni la
marcia non varia e quindi il relativo R² non è definito; alcune temperature
hanno R² negativi. Nessuno di questi casi viene nascosto come risultato positivo.

Questa è evidenza contro l'ipotesi estrema che il readout corrente non contenga
affatto velocità o informazioni stradali. **Non posso confermare la causa del
fallimento SAC** da questa sola sonda: servono ulteriori confronti di controllo,
ottimizzazione e generalizzazione. I pesi della sonda e i sensori usati come
etichette non sono mai stati introdotti nel controller o nel replay delle auto.

Evidenze: `projected-sensory-information/report.json`, `verification.json` e le
due raccolte allineate `baseline.json` / `sac-final.json`. Una prima raccolta
diagnostica disallineata di un controllo è stata esclusa e spostata, in modo
recuperabile, in `misaligned-v1/`. Il motivo è documentato lì; un test specifico
verifica ora che misure e neuroni vengano copiati prima di mutare la fisica.
Quell'errore diagnostico non riguarda l'addestramento SAC o i suoi esiti.

## Confronto controllato: aggiornamenti più prudenti

È concluso un secondo esperimento, `projected-residual-3803-sac-trust`. Tutti
i32 tensori iniziali di attore, critico e rete target sono stati confrontati
con il checkpoint locale precedente e risultano identici. Anche l'attore JSON,
la preparazione, la fisica, le ricompense, il seed, i20.000 passi massimi e i
quattro simulatori sono gli stessi. Non sono state ritoccate le sorgenti della
prova precedente o delle finestre aperte.

Il solo cambiamento è una riduzione progressiva dell'aggiornamento dell'attore
quando lo spostamento della sua distribuzione gaussiana supera0,001, misurato
su un sottoinsieme deterministico di stati neurali **realmente presenti nel
replay**. Il confronto è con il comportamento prima di quell'aggiornamento,
non con un pilota-esempio, un percorso o comandi-obiettivo. I momenti Adam
restano quelli dell'ottimizzatore: non è un'implementazione di TRPO o PPO.
Il limite misurato non garantisce sicurezza su tutti gli stati della pista.

Su4.750 aggiornamenti,545 sono rimasti interi e4.205 sono stati ridotti; nessuno
è stato annullato. Il massimo scostamento accettato misurato è0,000999887.
Tre test verificano identità, riduzione degli aggiornamenti grandi senza
consumare RNG aggiuntivo e ripristino esatto in caso di valori non finiti.

**Non ha migliorato il campione.** Il candidato finale ha raggiunto3.586,611m,
punteggio−827,929, fermandosi senza progresso. Il migliore conservato resta
3.803,070m/−604,210/zero giri. Sono stati eseguiti267 episodi di pratica e tutte
le cinque verifiche complete dal traguardo. Non vanno contati come267 nuove
generazioni dell'app.

Il risultato negativo è conservato in `report.json`, `verification.json`,
`trust-history.json` e `comparison-verification.json` della cartella della prova.
Le prove iniziali native del residuo nullo sono **riusate esplicitamente** dalla
prova precedente, dopo aver verificato identità di attore e ambiente; il replay
iniziale completo e quello di pratica sono nuovi, come i due replay nativi
finali del modello esportato. Non vengono descritti come nuove esecuzioni dei
vecchi controlli. Questa singola prova non stabilisce la causa generale del
mancato apprendimento.

## Credito delle ricompense su più passi: confronto distinto

È concluso un confronto distinto, non combinato con il limite
precedente: `projected-residual-3803-sac-multistep`. Il backup del critico usa
16 passi di controllo realmente eseguiti, anziché1, con gamma0,999 e sconto
massimo del tratto pari a circa0,984119. Non aumenta il premio reale assegnato
all'auto e non cambia il momento della sua eliminazione.

Tre test sul buffer installato verificano che una sequenza non prenda premi
dall'episodio successivo, non mescoli auto diverse e non trasformi l'ultimo
tratto ancora aperto in una terminazione fisica. Sono fixture isolate di test,
non esempi introdotti nell'addestramento delle auto. La prova ha eseguito
20.000 transizioni, 4.750 aggiornamenti e 244 episodi di pratica, ma non ha
migliorato il campione: il candidato finale raggiunge 3.590,587 m, punteggio
−824,231, zero giri. Il migliore protetto resta 3.803,070 m. Le cinque verifiche
complete dal traguardo e la riconciliazione del buffer sono conservate nel
rapporto concluso e in `comparison-verification.json`; nessun candidato più
debole è stato installato nell'app.

## Precisione scalare dell'attore esportato

`projected-actor-precision/report.json` confronta il calcolo nativo con il
calcolo CUDA sugli stessi stati neurali effettivamente registrati nei due
replay della sonda. Sul residuo nullo i valori coincidono. Sul candidato finale
scartato, in1.027 osservazioni, lo scarto massimo è circa3,58×10⁻⁷; il calcolo
GPU in batch e a riga singola differisce al massimo di circa8,34×10⁻⁷.

Questo è un controllo aritmetico locale, **non una prova di equivalenza di
intere traiettorie**: piccoli scarti possono amplificarsi nella simulazione.
Non è stata modificata l'inferenza, addestrato un modello con dati artificiali
o inserito un controller diagnostico nell'app.

Le prove successive, il limite di autorità trovato nel correttore annidato e
il piccolo miglioramento verificato con comandi neurali finali sono descritti
in [APPRENDIMENTO-COMANDI-NEURALI-DEV.md](APPRENDIMENTO-COMANDI-NEURALI-DEV.md).
