# MAL-E CNS / Circuit Lab — versione 4.2 desktop ibrida

Simulatore locale di auto a fisica libera. La versione 4 carica il **grafo annotato completo MaleCNS v1.0**: 166.700 neuroni e 6.242.118 connessioni dirette con almeno 5 sinapsi anatomiche, per 89.860.280 sinapsi conteggiate. Il collegamento a sensori e comandi, la dinamica neurale a tassi e l’evoluzione restano modelli artificiali dichiarati, non una simulazione biologica validata.

Sono disponibili **Monza, Monaco, Le Mans** e il circuito Laboratorio. L’atlante 3D campiona 23.817 punti per mantenere fluido il rendering, mentre il calcolo può attivare qualunque neurone del grafo completo. I profili dei circuiti derivano da mappe ufficiali datate, con proporzioni degli assi preservate. La telemetria fisica alimenta l’adattatore evolvibile insieme a undici raggi geometrici. Dettagli, fonti e limiti dei tracciati in [CIRCUITI.md](CIRCUITI.md).

Il selettore **Circuito** si trova sopra la pista. **Vista → Segui auto selezionata** ingrandisce l’auto scelta nell’ispettore; **Intero circuito** mostra il profilo completo e piccoli marcatori per le auto. Cambiare circuito azzera la prova corrente e lo storico, non i salvataggi: ogni pista ha il proprio campione. Per riutilizzarlo premere **Riprendi campione salvato**. Sono salvati i migliori delle generazioni concluse, non ogni istante della prova corrente. Popolazione, mutazione, velocità e pausa si mantengono durante il cambio pista. Il vecchio salvataggio del Laboratorio rimane compatibile.

## App Windows desktop

La versione corrente include una vera app Windows basata su Electron. La finestra usa il protocollo locale `male-cns:` e non dipende dal server `127.0.0.1:5173`. Il processo principale verifica il bundle, crea un `SharedArrayBuffer` del connectoma e sceglie il profilo in base al modello: **V4 completo parte con 1 worker ibrido GPU+CPU**, perché esegue due passaggi sparsi su un budget di 8.192 neuroni; V2 e V3, più leggeri, partono con **5 worker CPU su 12 thread logici**. Ogni worker esegue una popolazione indipendente; la finestra mostra il worker principale e raccoglie il migliore globale. Il comando `setWorkerCount` resta disponibile per prove manuali, ma il default lascia margine al thread UI, al ponte Electron e alla GPU.

Il desktop usa ora una pipeline **ibrida CPU + GPU**. Se Chromium/Electron espone un adapter WebGPU, il worker principale invia alla GPU i drive sensoriali e riceve lo stato sparso delle attività; la CPU continua a gestire sensori geometrici, fisica, G-force, ricompense, penalità, evoluzione genetica e rendering. Gli altri worker restano CPU per mantenere popolazioni indipendenti senza duplicare il connectoma nello stesso device. Se WebGPU non è disponibile, il worker torna automaticamente al solver CPU completo: l’app non dichiara la GPU attiva finché non ha completato una richiesta neurale reale.

La simulazione parte a **1×** per garantire l’avvio anche con il fallback CPU; il controllo resta regolabile da **0,5× a 30×**. Il moltiplicatore cambia solo la quantità di tempo simulato per secondo reale e non modifica i passi fisici o la logica dell’evoluzione. Per una prova più rapida si può portare il cursore a 4× o oltre quando il carico del computer lo consente.

Da una shell nella cartella principale del progetto:

```powershell
npm install
npm start
```

Per creare i pacchetti Windows (`portable` e installer NSIS):

```powershell
npm run dist
```

Gli artefatti vengono scritti in `dist/`. L’installer/portable contiene già il runtime Electron e il bundle MaleCNS: sul PC di destinazione non servono Node.js, Python, R, token o un server locale. La simulazione continua a usare il solver sparso dichiarato sotto; “desktop” significa che il calcolo è tolto dal thread della pagina, con il passaggio neurale instradato su WebGPU quando disponibile e con fallback CPU verificabile. Non è una simulazione biologica validata.

## Versione browser per sviluppo

L’app è disponibile sul server locale [127.0.0.1:5173](http://127.0.0.1:5173/). Ricaricare la scheda dopo un aggiornamento dei file.

Il server locale è necessario perché il browser carica il grafo binario da 54,4 MB tramite `fetch`; l’apertura diretta con `file://` non è supportata. Non occorrono installazioni R, token, Internet o CDN durante l’esecuzione. I salvataggi appartengono all’origine localhost del browser.

Per riavviare il server, dalla cartella principale del progetto:

```powershell
node work/serve.mjs
```

## Prestazioni e separazione dell’IA

Il grafo completo è memorizzato in array binari tipizzati invece che in un JSON da centinaia di megabyte. Ogni agente usa un solver sparso event-driven: tutti i 166.700 neuroni e i 6.242.118 archi sono disponibili, ma a ogni passo vengono mantenuti fino a 8.192 neuroni con attività rilevante e vengono eseguite due propagazioni ricorrenti per aggiornamento. Il nucleo di guida verificato da 7.721 neuroni ha priorità quando il budget è pieno, così l’espansione non espelle i percorsi già noti fra relay sensoriali e DNa01/DNa02. Questa è un’approssimazione computazionale dichiarata, non attività simultanea di tutti i neuroni.

Il rendering resta separato dal solver: pista statica in cache, atlante limitato a 23.817 punti visibili e massimo 3.600 contributi disegnati. Nel controllo browser del 17 settembre 2026, con 8 auto e velocità 1×, **3,016 secondi reali hanno prodotto 3 secondi simulati**; le quattro uscite DNa erano attive e la console non riportava errori o avvisi. Il selettore arriva ancora a 30×, ma il valore è un moltiplicatore richiesto al passo fisso: non è garantito che corrisponda a 30 secondi simulati per secondo reale, perché il throughput dipende dal carico del solver e dall’hardware disponibile.

Nel percorso ibrido la GPU mantiene il CSR completo e due buffer di attività dense per il worker principale; il trasferimento verso la CPU contiene solo fino a 8.192 indici e valori attivi per auto. La propagazione usa soglia `0,001`, contributo minimo `0,000001`, due passaggi e il medesimo budget dichiarato dal solver. La fisica non viene eseguita sul device GPU, quindi le regole di collisione con i bordi, le auto fantasma e le penalità restano identiche fra GPU attiva e fallback CPU.

I worker mantengono popolazioni indipendenti per sfruttare i core disponibili, ma il miglior genoma globale viene ora inviato agli altri worker come immigrato per la generazione successiva. L’interfaccia continua a mostrare le auto del worker principale e indica separatamente il record globale, così un miglioramento trovato da un worker secondario non rimane invisibile.

Lo smoke test Electron con accelerazione disponibile ha verificato `protocol: male-cns:`, dataset V4 completo, stato `IN CORSO`, 8 auto, **1 worker WebGPU**, adapter WebGPU identificato come `nvidia lovelace`, **8.192 neuroni attivi** e movimento non nullo. Lo stesso test con `MALE_CNS_FORCE_CPU_FALLBACK=1` ha verificato **1 worker CPU**, il percorso `CPU fallback`, 8.192 neuroni attivi, movimento non nullo e nessun errore bloccante. Questi sono test di disponibilità e correttezza del percorso, non una promessa di un fattore di velocità universale: il vantaggio dipende dall’adapter, dai driver e dal carico del computer.

La smoke test diagnostica `--learning-test` porta V4 a 30× e attende almeno due generazioni concluse. Sul PC di verifica ha raggiunto la generazione 3 con WebGPU attivo: il record è salito da **−1.176,561** a **−804,872 pt**, il progresso massimo da **253,1** a **650,8 px**, con 8.192 neuroni attivi e nessuna sovrapposizione fra acceleratore e freno. È una finestra breve di apprendimento, non una previsione del tempo necessario per ottimizzare tutte le piste.

## Problemi corretti

- Le auto hanno coordinate `x/y`, orientamento e velocità propri. Non vengono più riposizionate sulla mezzeria della pista.
- La vettura usa velocità longitudinale e laterale, velocità d’imbardata, forze degli pneumatici con limite d’aderenza, resistenza al rotolamento, resistenza aerodinamica, motore e freno: sterzare non ruota più istantaneamente la traiettoria.
- Per ogni auto vengono calcolati accelerazione longitudinale/laterale, G longitudinale, G laterale, G totale, angolo di slip e trasferimento di carico. La conversione dichiarata è **10 px = 1 m** e `g = 98,1 px/s²`; sono grandezze del modello, non misure fisiche di una vettura reale.
- La stessa telemetria viene esposta come undici ingressi aggiuntivi normalizzati: velocità, G longitudinale, G laterale, G totale, slip, imbardata, trasferimento di carico e quattro relay di barriere reali (bilanciamento strada, curva in arrivo, spazio frontale e larghezza osservata). Sono visibili come barre nell’ispettore dell’agente selezionato; i quattro relay di strada partono neutrali e vengono appresi per mutazione.
- Sterzo, acceleratore e freno sono gli unici comandi che producono movimento. Le due uscite neurali longitudinali vengono trattate come logit antagonisti: la loro differenza, amplificata dal guadagno dichiarato `0,35`, decide quale pedale è attivo; il bias di lancio è `0,18` nel Laboratorio e `0,02` sulle mappe strette, così l’adapter può esplorare la frenata prima della prima curva senza ricevere un comando di percorso. Se il cervello è realmente inattivo, il comando resta esattamente nullo. All’attuatore non vengono mai applicati acceleratore e freno insieme. Non esiste una correzione nascosta basata su curvatura, posizione lungo il circuito o distanza laterale.
- Undici sensori misurano intersezioni geometriche con i muri effettivamente disegnati; quattro relay aggiuntivi condensano asimmetria laterale, curva in arrivo, spazio frontale e larghezza osservata. La mezzeria è usata soltanto per la partenza e il punteggio, mai come input del controller.
- Sulle mappe derivate, larghe 8 px nel profilo vettoriale, la fisica applica un limite di 82 px/s coerente con la scala dell’auto (`vehicleScale: 0,22`) e una penalità progressiva quando la distanza frontale è inferiore allo spazio di frenata stimato. Sono vincoli di dinamica basati sulle barriere reali, non comandi di traiettoria; il Laboratorio mantiene il limite generale di 155 px/s.
- Collisioni con i bordi, arresto per mancanza di progresso, passo fisico fisso di 1/60 s e aggiornamento del controller a 20 Hz.
- Tutte le auto partono dalla stessa posa e ferme. Sono auto fantasma: la collisione viene verificata solo contro i bordi del circuito; non esistono collisioni, spinte o scie aerodinamiche tra le auto.
- Generazioni con massimo **2 giri per auto** e senza tempo massimo: ogni auto viene fermata dopo il secondo giro; la generazione termina quando tutte sono ferme/incidentate o hanno raggiunto il limite, oppure quando si preme **Evolvi ora**. Il punteggio netto somma progresso e bonus del giro, applica un costo di **5 pt/s** finché l’auto è attiva e sottrae retromarcia, approccio in sovravelocità, urti, uscita dal bordo e stallo. I punti sono un’unità artificiale del simulatore, non metri o km/h reali.
- Ogni giro completato registra il tempo in secondi; il bonus del giro usa un riferimento proporzionale alla lunghezza del circuito e diminuisce per giri più lenti. Oltre il riferimento, un giro lento riceve una penalità aggiuntiva crescente di **90 pt/s**. A fine generazione, un’auto senza nemmeno un giro riceve **1.000 pt** di penalità; se ha completato un giro ma il suo miglior tempo è più lento del miglior tempo della generazione precedente, perde altri **120 pt per ogni secondo di differenza**. Nell’assetto severo corrente: retromarcia **0,75 pt/unità**, urto **400 pt**, uscita pista **500 pt**, stallo **240 pt**. L’ultimo giro e il giro migliore sono visibili nell’ispettore dell’auto; lo storico indica quante auto sono rimaste senza giro e quante sono state più lente.
- Selezione dei migliori, conservazione di un elite di progresso quando la fitness ristagna, migrazione del miglior genoma globale fra i worker e mutazione dell’adattatore. Dopo più generazioni senza progresso entrano crossover tra i migliori, mutazione adattiva e pochi immigrati casuali; con mutazione 0% restano copie esatte senza crossover né mutazione nascosta.
- Pausa, reset deterministico, accelerazione 0.5–30× coerente con la fisica, selettore auto, attività dei neuroni, ricompense/penalità e salvataggio locale del campione.
- Lo slider della velocità invia il valore ai worker desktop senza farsi sovrascrivere da snapshot arretrati, aggiorna il valore mostrato durante il trascinamento e salva la scelta nell’origine locale, così un riavvio o una nuova build non la riporta automaticamente a `1×`.
- Dati mancanti/non validi bloccano l’app con un messaggio: nessun ritorno silenzioso al vecchio controller sintetico.

## Cosa significa “cervello” in questa versione

### Dati effettivi

Il repository [natverse/malecns](https://github.com/natverse/malecns) è un pacchetto R per accedere ai dati, non un simulatore neurale eseguibile. La copia di riferimento nel progetto è al commit `daf8e2a9849cc77695b14bb6b9d4c02456cd3b3c`. Questa app non installa né esegue il package R.

Ho scaricato invece l’[esportazione ufficiale MaleCNS](https://male-cns.janelia.org/download/), lo stesso snapshot `male-cns:v1.0` utilizzato dal package. L’export pubblico non richiede token. I due file originali (annotazioni e connettività) sono conservati in `work/source-data`; il grafo originale occupa circa 1,05 GB.

Il runtime V4 in `data/connectome-full.bin`, descritto e verificabile tramite `data/connectome-full.json`, contiene:

- **166.700 neuroni annotati**, con body ID, classe, lato e `somaLocation` quando presente;
- **6.242.118 connessioni dirette** con almeno 5 sinapsi, pari a **89.860.280 sinapsi anatomiche conteggiate**;
- **139.662 coordinate somatiche ufficiali** e 27.038 neuroni senza `somaLocation` nell’export usato;
- **1.200 neuroni reali di proiezione visiva** conservati come ingressi sensoriali;
- **4 neuroni discendenti** per la decodifica dei comandi: DNa02 R (10360), DNa01 L (10442), DNa01 R (10760), DNa02 L (523769).

L’adattatore runtime usa **22 canali**: undici raggi visivi reali, sette sensori fisici artificiali — velocità normalizzata, G longitudinale, G laterale, G totale, angolo di slip, velocità d’imbardata e trasferimento di carico — e quattro relay di strada calcolati dalle barriere reali — bilanciamento laterale, curva in arrivo, spazio frontale e larghezza osservata. Gli ingressi del connectoma restano 1.200 nodi reali e continuano tutti a ricevere i raggi visivi; gli ultimi 112 ricevono inoltre i sette canali fisici e i quattro relay di strada con un guadagno ridotto, così i nuovi segnali non cancellano l’apprendimento visivo esistente. I relay di strada sono additivi, partono con peso e bias nulli e vengono scoperti dall’evoluzione; non usano il centrolinea o il progresso. Il relay fisico usa guadagno **0,35** sul Laboratorio e **0,8** sui tre profili map-derived, una taratura dichiarata per la diversa scala dei circuiti. Questi relay sono un adattatore del simulatore, non nuove annotazioni biologiche; l’encoder evoluto ha 44 parametri, due per canale (peso e bias). I vecchi campioni con encoder a 14, 28 o 36 parametri vengono caricati mantenendo i canali disponibili e inizializzando a zero quelli nuovi.

Il bundle completo viene rigenerato con `work/build-full-connectome.py` direttamente dalle annotazioni Feather ufficiali e dalla cache degli archi forti creata durante la scansione del Feather da 1,05 GB. Il file binario misura **54.437.864 byte** e ha SHA-256 `eec3fe23c3395caeba64e08751fd587a546be6edd86d3662e1676e3a4a0b14d9`. Il precedente nucleo V3 da 7.721 neuroni resta come fixture verificata in `data/connectome.json`; `data/source-verification.json` documenta il confronto indipendente di quel nucleo contro i Feather originali.

Non viene più eliminato alcun neurone annotato in base alla distanza dalle uscite: il binario include l’intero insieme di 166.700 neuroni e tutti gli archi forti fra essi. Le connessioni sono organizzate in CSR per sorgente e i pesi runtime sono normalizzati sulla somma postsinaptica, come nel modello V3. Tutti i 1.200 ingressi mantengono gli undici raggi visivi; gli ultimi 112 ricevono anche i sette segnali fisici con guadagno ridotto. Il limite di 8.192 riguarda l’attività conservata per agente e passo, non i dati caricati: un neurone esterno al nucleo può attivarsi e influenzare il nucleo attraverso gli archi reali.

### Assunzioni artificiali, non proprietà biologiche verificate

È il grafo **annotato e filtrato a ≥5 sinapsi** del sistema nervoso centrale MaleCNS usato dal progetto, non ogni segmento o sinapsi grezza e non un’emulazione biologica validata. Il connectoma fornisce collegamenti anatomici, non da solo tutte le dinamiche necessarie per simulare il sistema nervoso.

La rete usa un modello ricorrente sparso a tassi con `tanh`, perdita e pesi normalizzati per neurone postsinaptico. I pesi anatomici sono mantenuti positivi: **non vengono simulati neurotrasmettitori, segni eccitatori/inibitori biologici, spike, tempi o recettori reali**. Le attività sono numeri del modello, non frequenze biologiche misurate. Due iterazioni sparse per aggiornamento propagano il segnale nel tempo; la soglia è 0,001 e il budget è 8.192 neuroni attivi per agente.

L’assegnazione dei raggi e dei sette segnali fisici ai relay, il guadagno e la decodifica da DNa01/DNa02 a sterzo/acceleratore/freno sono adattatori matematici artificiali. Non si afferma che questi neuroni sappiano guidare un’automobile o che la loro funzione biologica sia uguale ai comandi dell’app. L’evoluzione modifica gli adattatori; **non inventa o muta le connessioni anatomiche**. Non c’è un percorso sensori→motori che salti il grafo.

## Profili MaleCNS nel selettore

Il menu **Controller / prove di verifica** ora cambia davvero il grafo usato dalla simulazione, non soltanto l’etichetta:

- **MaleCNS V4 completo**: 166.700 neuroni e 6.242.118 connessioni; usa il bundle binario e può usare il percorso ibrido RTX 4060 + CPU.
- **MaleCNS V3 storico**: 7.721 neuroni e 242.486 connessioni; è il nucleo ridotto verificato che precedeva il bundle completo e gira sul percorso CPU.
- **MaleCNS V2 compatto ricostruito**: 1.121 neuroni, 32.351 connessioni e 790 relay; è una riduzione deterministica del V3. Il file storico V2 originale non è presente nel workspace, quindi non viene dichiarata una replica byte-per-byte.

Ogni profilo ha campioni evoluti separati per circuito e modello. I test di verifica senza cervello e sterzo zero restano disponibili sotto il gruppo **Prove di verifica**.

## Provarlo personalmente

Nel menu **Controller / prove di verifica**:

1. **MaleCNS V4 completo**: normale apprendimento sul grafo completo. All’inizio molte auto non si muovono o sbattono; i controller vengono selezionati fra generazioni.
2. **MaleCNS V3 storico** o **V2 compatto ricostruito**: confronto CPU con meno neuroni e caricamento più leggero; la fisica e le penalità restano le stesse.
3. **Test: cervello spento**: tutti i comandi sono zero e le auto rimangono alla partenza; dopo 8 secondi simulati la prova si mette in pausa.
4. **Test: sterzo zero**: acceleratore al 70%; l’auto segue una retta, urta il bordo e si ferma. Non riesce a seguire automaticamente il circuito.

Cambiare modalità ricomincia la prova. **Reset** ricomincia dalla stessa popolazione casuale (seed 7717) e conserva l’eventuale campione salvato. **Evolvi ora** conclude anticipatamente la generazione: il risultato non sarà quello del benchmark a finestre complete. **Riprendi campione salvato** riutilizza l’apprendimento del browser e applica nuove mutazioni agli altri agenti.

## Verifica ripetibile

Dalla cartella principale del progetto, con Node.js:

```powershell
node --test outputs/tests/simulation.test.cjs outputs/tests/circuits.test.cjs outputs/tests/full-connectome.test.cjs outputs/tests/legacy-models.test.cjs
```

Esito corrente: **56 test, 56 superati, 0 falliti, 0 saltati**. La suite include controlli dedicati al bundle completo: conteggi esatti, dimensione, SHA-256, struttura CSR, 7.721 neuroni prioritari, limite dell’attività sparsa, attività reale delle uscite DNa e blocco su dati corrotti. Conserva inoltre i test fisici, evolutivi, dei circuiti, della fixture V3 e dei profili storici V3/V2, compresi i controlli che separano acceleratore e freno all’attuatore, conservano un leader di progresso, verificano il crossover dell’adattatore, avviano una popolazione fresca, verificano i relay delle barriere reali e importano un campione fra generazioni.

Il benchmark deterministico storico della fixture V3 da 7.721 neuroni, seed 7717 e 18 auto, aveva raggiunto **5.707,527 pt** alla generazione 12 con 2 giri completati prima dell’ultima espansione dei sensori e della mutazione. La riesecuzione corrente del 19 settembre 2026, con lo stesso seed, popolazione, mutazione e 3.600 tick per generazione, parte da **−602,053 pt** e arriva a **5.512,677 pt** alla generazione 12, mantenendo **2 giri completati**. Il risultato è una misura riproducibile del percorso evolutivo V3, non una garanzia per ogni seed o circuito e **non è un benchmark del solver completo V4**.

Un banco separato aggiornato sul profilo V2 compatto ricostruito, con lo stesso seed, popolazione e 3.600 tick per generazione, passa da **208,585 pt** alla prima generazione a **4.306,555 pt** alla dodicesima e completa **2 giri**. È una verifica diagnostica del percorso evolutivo V2 eseguita sul motore reale; non modifica il grafo V3 da cui il profilo V2 viene ricostruito.

La selezione aggiornata conserva il vincitore netto, il leader di progresso e il leader di giro, mantiene una hall of fame di quattro genomi, allarga il bacino dei genitori, usa crossover più frequente e varia la mutazione per figlio: esplorazione, ipermutazione sui plateau, mutazione ordinaria e mutazione calma sui progressi. Dopo una stagnazione inserisce immigrati casuali controllati; il genoma globale arrivato dagli altri worker resta comunque in uno slot separato. La fitness mostrata continua a includere tutte le penalità severe: il progresso viene esposto anche separatamente perché un’auto può migliorare di centinaia di pixel e restare sotto zero prima di completare il primo giro. Il timeout di stallo per singola auto è ora di 5 secondi senza progresso, mentre non esiste un limite globale di tempo simulato. Con mutazione impostata a 0%, il percorso resta deterministico e usa copie esatte senza crossover.

### Benchmark completo modelli × circuiti

Il banco `work/benchmark-all-models.cjs` valuta V2, V3 e V4 su Laboratorio, Monza, Monaco e Le Mans e si ferma solo quando lo storico dimostra che almeno un agente ha completato un giro. Il report corrente è in [`benchmark-all-results.md`](benchmark-all-results.md) e nel JSON machine-readable [`benchmark-all-results.json`](benchmark-all-results.json). Dopo le correzioni, la matrice cumulativa contiene **9 casi misurati su 12**: V2/Laboratorio chiude alla generazione 8 e V3/Laboratorio alla generazione 4; nessuna delle sei combinazioni V2/V3 sulle mappe chiude entro 20 generazioni. V3/Monaco arriva a **3.135 px** e V3/Monza a **927 px**, ma non vengono contati come giri; V3/Le Mans resta a **272 px**. V4/Laboratorio è stato misurato sul percorso headless CPU per 4 generazioni e non ha chiuso un giro; i tre casi V4 sulle mappe non sono inclusi in questa matrice cumulativa. Lo smoke test separato della build Electron conferma comunque WebGPU attivo sulla RTX 4060, movimento e 8.192 neuroni attivi.

Il V4 usa ora **2 propagazioni sparse** per aggiornamento e un budget di **8.192 neuroni attivi per agente**. Il grafo completo resta invariato: cambiano soltanto il numero di passaggi del solver e la quantità di attività conservata. Il costo può ridurre il throughput rispetto al profilo precedente, quindi il valore 30× resta un moltiplicatore richiesto e non una garanzia di tempo reale.

### Benchmark Monza

Il banco `node work/benchmark-monza.cjs` usa ancora la fixture V3 per restare riproducibile in tempi ragionevoli. Con seed **7717**, 18 auto, mutazione **12%** e 24 generazioni, il migliore passava da **−677,375 pt** a **−126,926 pt**, ma completava **0 giri**. È un risultato negativo storico e non misura il V4 completo. Il limite temporale automatico dell’app resta rimosso.

L’app e i test usano lo stesso `simulation.js`. Nel browser `window.circuitLab.sim` espone lo stato effettivo per il debug.

### Riprodurre l’estrazione

Gli script sono `work/download-connectome.mjs`, `work/extract-connectome.py` e `work/build-full-connectome.py`. L’ultimo costruisce il bundle V4 completo e il relativo manifest. Richiedono Python con PyArrow e NumPy; in questo ambiente le dipendenze sono isolate in `work/python-deps`. Non sono necessarie per avviare l’app. L’estrazione ha esaminato 151.856.684 archi del file originale e conservato i 6.242.118 archi con entrambi gli estremi annotati e almeno 5 sinapsi.

## Attribuzione

Dati del **MaleCNS consortium — FlyEM (HHMI Janelia), University of Cambridge, MRC Laboratory of Molecular Biology e Google Research**. Fonte: [MaleCNS download](https://male-cns.janelia.org/download/). Licenza dati: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modifiche: filtro dichiarato a ≥5 sinapsi, conversione in formato binario CSR, normalizzazione dei pesi e dinamica sparsa artificiale; non è implicata l’approvazione del consorzio.

Il codice della repository esterna `natverse/malecns` è GPL-3; non è incluso né eseguito nel bundle browser. [AI Learns To Drive](https://store.steampowered.com/app/3312030/AI_Learns_To_Drive/) è il riferimento funzionale richiesto, non la fonte del codice o degli asset dell’app.
