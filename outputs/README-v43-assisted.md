# MAL-E CNS / Circuit Lab — 4.3.0 Windows ibrida

Simulatore locale con auto a fisica libera, circuiti Laboratorio, Monza, Monaco e Le Mans, mappa interattiva e controller derivati da dati MaleCNS. Le auto sono fantasma fra loro: urtano solo i bordi reali del circuito. Non dipende da un server localhost, da Internet, da R o da token durante l'esecuzione.

## Correzione dell'apprendimento — 29 settembre 2026

La versione 4.3 modifica esplicitamente l'adattatore e il metodo di selezione:

- Prima vengono confrontati i giri completati, poi il tempo migliore; prima del primo giro viene confrontato il progresso. Il punteggio netto resta visibile e conserva tutte le penalità. Un giro lento non può più perdere contro un incidente precoce soltanto perché costa più punti.
- Gli elite e la hall of fame sono deduplicati. Con quattro auto restano almeno due posti per nuovi figli quando la mutazione è attiva.
- Un ramo sensoriale rapido passa attraverso connessioni CSR realmente presenti nel grafo. Un decoder lineare viene calibrato su 768 vettori sensoriali generici e verificato su altri 64: non riceve coordinate della pista, waypoint, curvatura o una traiettoria di riferimento.
- La prima popolazione ha parametri motori prudenti e piccole variazioni. L'evoluzione modifica da uno a tre degli otto parametri motori per figlio, invece di perturbare quasi tutto l'adattatore a ogni generazione.
- Il ramo rapido aggiorna il comando a 60 Hz. La dinamica ricorrente completa viene aggiornata a 5 Hz, con due propagazioni per aggiornamento; il vecchio adattatore, quando usato per diagnostica o checkpoint legacy, mantiene 20 Hz. Questa è una modifica dichiarata del modello, non una mera ottimizzazione del rendering.
- Il tempo trascorso in attesa della GPU viene conteggiato dall'orologio. I batch di calcolo sono limitati a circa 40 ms, gli snapshot riutilizzano i buffer dell'ispettore e l'attività completa viene trasferita attraverso il ponte Electron soltanto per l'auto selezionata.
- Sulla GPU tutti i 7.721 nodi del nucleo e i quattro slot DNa hanno priorità sul contesto esterno; il budget resta 8.192 slot per auto.

**È un avvio calibrato, non apprendimento da zero.** Il giro della prima generazione verifica che la base sensoriale funzioni; il miglioramento nelle generazioni successive viene verificato separatamente. Il ramo rapido usa 94 neuroni nel V2, 114 nel V3 e 111 nel V4; la ricorrenza continua sul rispettivo grafo. Non significa che tutti i 166.700 neuroni determinino ogni comando, né che il cervello biologico della mosca sappia guidare.

Il comando passa dai sensori agli ingressi reali, lungo sinapsi reali, al decoder artificiale e ai motori. Spengere la rete o azzerare tutti i pesi CSR produce comandi esattamente nulli. Le connessioni anatomiche non vengono mutate. Sensori e collisioni utilizzano gli stessi bordi disegnati. La mezzeria serve alla partenza e al punteggio, non alla guida.

## Verifiche e risultati

Il registro automatico corrente è [test-results-v43.tap](test-results-v43.tap): **61 test, 61 superati, zero fallimenti**. Include i test di ablazione del ramo rapido, la selezione di giri lenti contro incidenti, diversità genetica delle piccole popolazioni, checkpoint, circuiti, fisica, sensori, limiti di due giri, bundle e SHA-256.

La prova deterministica di 12 generazioni, V2/Laboratorio, seed 7717, quattro auto e mutazione 16%, mantiene due giri completi in tutte le generazioni e riduce il miglior tempo da **78,083333 a 71,866667 secondi**. Non è una promessa per ogni seed o circuito.

La matrice nell'app Electron è documentata in [benchmark-all-results.md](benchmark-all-results.md) e [benchmark-all-results.json](benchmark-all-results.json). Valuta V2, V3 e V4 su tutte e quattro le piste, con 16 auto, mutazione 16%, un worker per confronto e richiesta 30×. Si ferma al primo giro effettivo, anche durante una generazione; `generationsEvaluated: 0` indica che il primo giro è stato osservato prima della conclusione della generazione 1. Il limite reale per singolo caso è una protezione del benchmark, non un limite di tempo della simulazione. I dati riportano backend e tempo reale: **30× richiesto non garantisce 30× effettivo**.

Il precedente esito di due casi riusciti su dodici, con nove misurati, è conservato in [benchmark-before-learning.md](benchmark-before-learning.md) e nel relativo JSON. I due banchi hanno adattatori e protocolli diversi: non sono un confronto controllato del throughput o di apprendimento da zero.

Dettagli di verifica e limiti: [VERIFICA.md](VERIFICA.md). Le note precedenti, con risultati datati non applicabili alla 4.3, sono conservate in [README-v42-historical.md](README-v42-historical.md) e [VERIFICA-v42-historical.md](VERIFICA-v42-historical.md).

## Avviare l'app Windows

I pacchetti 4.3.0 sono in `dist-learning-v43/`: portable e installer NSIS x64. Contengono Electron, dati e codice; non serve installare Node.js sul PC di destinazione.

Per lo sviluppo dalla cartella del progetto:

```powershell
npm install
npm start
npm test
```

Per costruire i pacchetti:

```powershell
npm exec -- electron-builder --win portable nsis --config.directories.output=dist-learning-v43 --publish never
```

V4 parte con un worker ibrido GPU/CPU. V2 e V3 partono con cinque popolazioni CPU indipendenti sul profilo di questo PC; i campioni migliori possono migrare fra worker. Il benchmark usa invece un worker per caso. Il motore richiede l'adapter ad alte prestazioni; la GPU viene dichiarata attiva soltanto dopo un calcolo reale. Se WebGPU fallisce, resta il fallback CPU.

GPU: propagazione ricorrente del grafo V4. CPU: ramo sensoriale rapido, sensori, fisica, punteggio ed evoluzione. UI: rendering e ispettore. Non è un porting CUDA né l'esecuzione simultanea del cervello biologico completo.

## Controlli

- Circuito: cambia pista e storico della prova; i campioni restano separati per modello e circuito.
- Controller: V4 completo, V3 storico, V2 compatto ricostruito e prove di verifica.
- Auto, clic sulla mappa e Segui migliore: cambiano l'agente ispezionato. Vista intero circuito e segui auto mantengono la mappa interattiva; l'atlante 3D mostra l'attività dell'auto selezionata.
- Velocità: da 0,5× a 30×; il valore richiesto è salvato e non viene sovrascritto da snapshot arretrati.
- Reset: riparte dalla base calibrata deterministica, seed 7717. Evolvi ora conclude anticipatamente la generazione.
- Riprendi campione salvato: usa un checkpoint compatibile per quel grafo e circuito. Un vecchio checkpoint privo del ramo rapido resta un adattatore legacy; per usare la nuova base premere Reset.
- Test cervello spento: comandi zero, auto ferme. Test sterzo zero: acceleratore 70%, retta e urto; nessuna guida automatica lungo la pista.

Ogni auto viene fermata dopo due giri. La generazione termina quando tutte hanno finito o si sono fermate; non esiste un tempo globale massimo. Restano i controlli di stallo per singola auto.

## Fisica e penalità

Inerzia longitudinale e laterale, imbardata, aderenza degli pneumatici, resistenza aerodinamica e al rotolamento, freni, slip, trasferimento di carico e forze G sono un modello artificiale a passo fisso di 1/60 s. La scala dichiarata è 10 px = 1 m, g = 98,1 px/s². Le mappe mantengono `halfWidth: 8`, `vehicleScale: 0,22` e limite 82 px/s; il Laboratorio usa il limite 155 px/s. Le mappe sono profili derivati, non rilievi metrici: fonti e limiti in [CIRCUITI.md](CIRCUITI.md).

Restano: costo 5 pt/s; giro oltre il riferimento 90 pt/s aggiuntivi; nessun giro 1.000 pt; giro più lento del migliore della generazione precedente 120 pt per secondo di differenza; urto 400 pt; uscita 500 pt; stallo 240 pt. I punti restano un indicatore secondario della selezione, non la priorità rispetto al completamento. Acceleratore e freno sono antagonisti e non vengono applicati insieme.

## Dati MaleCNS e confine scientifico

V4 carica 166.700 neuroni annotati e 6.242.118 connessioni dirette con almeno cinque sinapsi, pari a 89.860.280 sinapsi anatomiche conteggiate. Il binario da 54.437.864 byte ha SHA-256 `eec3fe23c3395caeba64e08751fd587a546be6edd86d3662e1676e3a4a0b14d9`. Manifest: [connectome-full.json](data/connectome-full.json). V3: 7.721 nodi / 242.486 archi. V2: 1.121 / 32.351, riduzione deterministica ricostruita, non copia byte-per-byte dell'originale storico.

Il pacchetto R di riferimento non viene eseguito dall'app: sono usati export offline, con provenienza in [provenance.json](data/provenance.json) e confronto della fixture in [source-verification.json](data/source-verification.json). Le fonti datate sono indicate nei manifest e nei documenti dei dati.

La dinamica a tassi, la normalizzazione dei pesi, i relay sensoriali, la calibrazione e la decodifica motoria sono artificiali. Non sono simulati neurotrasmettitori, spike, recettori o fisiologia verificata. Il solver ricorrente è approssimato: soglia 0,001, due passaggi e budget 8.192. I nodi del nucleo sono riservati anche se a bassa attività: il numero di slot occupati non implica altrettanti neuroni simultaneamente non nulli.

Il ramo rapido in `neural-learning.js` proietta 22 canali su neuroni non d'ingresso mediante archi del CSR corrente. Il decoder ricostruisce quattro segnali: bilanciamento laterale, anticipazione osservata dalle barriere, spazio frontale e velocità. Otto parametri motori evolvono sterzo, velocità e miscela ricorrente. La base prudente usa miscela ricorrente zero: quindi il grafo ricorrente completo non è indispensabile a ogni comando iniziale, mentre il ramo sinaptico rapido lo è. Questo limite è deliberato e visibile, non una pretesa di utilizzare tutta la potenza biologica del connectoma.

## Riprodurre i banchi

```powershell
npm exec -- electron . --benchmark-all --benchmark-timeout-ms=180000 --user-data-dir=work/benchmark-clean
npm exec -- electron . --learning-test --user-data-dir=work/learning-clean
node work/benchmark-all-models.cjs --model v2 --circuit monza --population 16
```

Il benchmark Electron scrive il JSON in `%TEMP%/male-cns-all-benchmark.json`; lo smoke test in `%TEMP%/male-cns-circuit-lab-smoke.json`. Usare un profilo diagnostico separato per non toccare i propri campioni. Il banco headless usa il solver CPU anche per V4 e non ne misura la GPU. `--legacy-adapter` riattiva il precedente adattatore soltanto nel banco headless.

Per sviluppo browser, `node work/serve.mjs` serve `http://127.0.0.1:5173/`. L'apertura diretta `file://` non è supportata; i checkpoint browser sono separati da quelli desktop.

## Attribuzione

Dati MaleCNS v1.0, CC-BY-4.0; crediti e URL delle sorgenti in [provenance.json](data/provenance.json). Il gioco Steam citato dall'utente è un riferimento funzionale, non una fonte di codice o asset copiati. L'app non è un'emulazione biologicamente validata.
