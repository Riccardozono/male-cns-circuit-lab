# Windows 4.5.0 - prestazioni, 100 agenti e cordoli

Verifica del 30 settembre 2026. Hardware locale: Ryzen 5 5600G, 6 core / 12 thread; GPU NVIDIA RTX 4060. Nella portable il backend WebGPU restituisce `nvidia / lovelace`. I processi di verifica usano profili temporanei separati: nessuna installazione, nessun campione personale modificato.

## Risultato e confini

La popolazione selezionabile arriva a **100 auto per generazione e worker**, mantenendo 16 come valore iniziale dell'interfaccia. Più worker significano popolazioni indipendenti, non una sola generazione condivisa da 500 auto. Cambiare popolazione riavvia la prova, come prima. Il cursore 0,5-30x è un obiettivo, non una promessa di velocità effettiva a qualsiasi carico.

I cordoli delle piste reali non vengono più generati dalla curvatura su entrambi i bordi. Ci sono **19 zone esplicite**: 7 Monza, 5 Monaco, 7 Le Mans. È una copertura parziale. Esistenza/zona/lato sono documentati; estremi, larghezza e alternanza della vernice sono adattamenti manuali alla mappa esistente, **non un rilievo metrico completo**. Le zone senza osservazioni non vengono dipinte. I colori di Le Mans sono blu/giallo. Nel Laboratorio i cordoli restano dichiaratamente schematici.

L'interfaccia permette di consultare il riferimento e la data, ingrandire la mappa, focalizzare una curva e mostrare i bordi fisici. I cordoli sono solo visuali: non introducono nuove forze, ostacoli, sensori, altimetria o una traiettoria di guida. Il perimetro fisico resta identico. Riferimenti separati in [data/curbs.js](data/curbs.js), renderer in [track-renderer.js](track-renderer.js).

## Fonti dei cordoli

| Pista | Riferimento primario | Registrazione |
| --- | --- | --- |
| Monza | [FIA F2, Event Notes 2025, pp.6-7](https://www.fia.com/system/files/decision-document/2025_monza_event_-_f2_monza_event_notes_2025_v1.pdf) | Zone di Prima Variante, Roggia e uscita Ascari, raccordate al profilo ufficiale 2023 già nell'app |
| Monaco | [FIA F3, Event Notes 2025, p.4, sezione 12](https://www.fia.com/system/files/decision-document/2025_monaco_event_-_f3_monaco_event_notes_2025_v2.pdf), [McLaren, briefing 23 maggio 2025](https://www.mclaren.com/racing/formula-1/2025/monaco-grand-prix/the-monaco-gp-briefing-powered-by-google-cloud/) | Apici registrati sulla mappa FIA numerata 2025; non ricostruite le fasce piatte rimosse |
| Le Mans | [FIA WEC / ACO, Briefing Notes 10 giugno 2025, pp.23 e 33](https://fiawec.alkamelsystems.com/Results_NoticeBoard/13_2025/04_24%20Hours%20of%20Le%20Mans/059_Doc%2059%20-%20BRIEFING%20NOTES.pdf) | Fotografie Dunlop e Ford/Raccordement raccordate alla mappa ACO 2025 già nell'app |

Le date sono quelle dei riferimenti, non una dichiarazione sullo stato dei cordoli nell'evento 2026. Non posso confermare una corrispondenza centimetro per centimetro, né la posizione di tutti i cordoli sull'intero giro. PDF e foto consultati sono conservati nella cartella di ricerca `tmp/pdfs/curb-references`, non distribuiti come immagini del gioco.

## Ottimizzazioni senza cambiare l'IA

- I worker in pausa non simulano e non inviano continuamente lo stesso stato.
- Solo l'auto ispezionata invia la sua attività neurale completa alla UI; tutte le altre mantengono l'intera simulazione nel worker, con telemetria fisica e motoria.
- Il percorso GPU evita di allocare somme e buffer di lavoro del solver CPU per ogni specchio di attività. Non riduce gli agenti o i neuroni realmente calcolati.
- Il trasferimento GPU include lettura motoria di tutte le auto e attività completa dell'auto selezionata. Si usa un invio della coda al posto di tre e un solo buffer di lettura.
- Capacità GPU 32 / 64 / 100 su richiesta; si liberano buffer e device del modello precedente. Non si allocano 100 agenti quando ne sono richiesti 16.
- Il batch GPU riusa i raggi già calcolati sullo stesso stato fisico, senza una seconda intersezione identica. Non salta tick fisici o passaggi neurali.
- L'ispezione di un'altra auto in pausa può leggere il campione completo direttamente dalla GPU, senza inject/reset/passaggi neurali o tick fisici. Le richieste condividono una coda seriale. Se la rete attende un riavvio, la UI dichiara l'attesa e non presenta i soli 64 neuroni motori come atlante completo.
- Cordoli precalcolati in Path2D al cambio pista; restano le tessere LRU con limite di 48 e meno di 30 MiB di soli pixel in cache.

## Misure prima/dopo

Baseline: app 4.4.2 conservata in `dist-tracks-v442`; stesso grafo, popolazioni e seed di prova. Le misure CPU usano un worker e 32 auto; quelle GPU confrontano i due backend nello stesso runtime nativo. Non sono benchmark di apprendimento o di FPS.

| Misura | 4.4.2 | 4.5.0 | Lettura corretta |
| --- | ---: | ---: | --- |
| V2, dimensione JSON di 11 snapshot | 9.014.348 byte | 794.925 byte | -91,18%; proxy di serializzazione, non byte IPC binari misurati |
| V3, dimensione JSON di 9 snapshot | 44.908.538 byte | 2.205.485 byte | -95,09%; stessa distinzione |
| Lettura GPU a capacità 32 | 2.097.280 byte | 82.048 byte | -96,09% per richiesta, tutti i motori ancora inclusi |
| Buffer CPU neurali vs specchio GPU per auto V4 | 4.173.324 byte | 699.568 byte | -83,24% per questi array; non è una misura della RAM totale dell'app |
| Specchio UI con 100 auto V4 | Tutte le auto avevano attività duplicata | 699.568 byte totali | Attività completa solo per l'auto selezionata; solver degli altri agenti invariato |

Nei brevi intervalli CPU in pausa (circa 1,4 s), la 4.4.2 consumava 1.516/1.609 ms CPU e inviava 6 snapshot; la 4.5.0 ne inviava 0 e il consumo misurato del processo benchmark era sotto la risoluzione del contatore. Non significa che tutta l'app Windows consumi zero CPU.

**Tempi GPU non uniformi.** Prima prova in sviluppo: mediane di 12 richieste, 2 passaggi, 16 auto 5,60 -> 4,05 ms; 32 auto 7,60 -> 6,20 ms. Prima prova della portable: 16 auto 4,80 -> 5,80 ms (peggioramento), 32 auto 7,95 -> 7,25 ms (miglioramento). Eseguibile definitivo dopo la correzione dell'ispezione in pausa: 16 auto 5,80 -> 4,90 ms, 32 auto 7,70 -> 7,60 ms. Quest'ultima prova non cancella il peggioramento precedente. Il trasferimento e gli array sono ridotti, ma **non è confermata un'accelerazione uniforme del calcolo neurale**. Non trasformare queste prove brevi in una promessa di 30x o di apprendimento più veloce. Dati grezzi e singoli campioni sono nei report collegati.

## Controlli eseguiti

- **112 test**, 112 passati, 0 falliti: [TAP](test-results-v450.tap).
- **12 confronti CPU deterministici** V2/V3/V4 per Laboratorio/Monza/Monaco/Le Mans: stessi stati dopo 60 tick e stessa evoluzione a pari seed/popolazione. **16 funzioni** fisiche/neurali e **7 kernel GPU** hanno sorgente identica alla baseline; dataset anatomici, learning, geometrie e atlante invariati: [compute-parity-v450.json](compute-parity-v450.json).
- **54 controlli** nella portable definitiva dei circuiti, 0 errori console: bordi esatti, zone/fonti cordoli, zoom/pan/focus, stato fisico/neurale invariante dopo comandi visivi, pixel cache, viste larghe/strette. [track-smoke.json](curb-final-portable-v450/track-smoke.json).
- **32 controlli nella portable definitiva**: V2, V3, V4 a 100 auto, moto non nullo, valori finiti, gas/freno esclusivi, auto A-100 ispezionata, pausa reale, GPU NVIDIA attiva per V4, diagnostica rettilinea/rete spenta e ritorno all'apprendimento. L'assenza di overflow a 100 agenti è stata controllata nel passaggio portable precedente. [performance-smoke.json](performance-final-portable-v450/performance-smoke.json).
- **12 controlli nella portable con GPU disabilitata intenzionalmente**: fallback CPU V4, 100 auto e moto non nullo, pausa e modi diagnostici. Il fallback è molto lento a questo carico, ma non sostituisce il cervello con una rete finta. [CPU fallback](cpu-final-portable-v450/performance-smoke.json).
- **32 controlli UI/atlante** nella portable definitiva: filtri, body ID reali, coordinate mancanti, comandi tastiera, cambio modello, contrasto e cambio auto in pausa con campione completo di 8.192 neuroni e stato fisico/score invariante. [UI e ispezione completa](ui-final-portable-v450/ui-smoke.json).
- **Una revisione visiva batched** di mappe dettagliate Monza/Monaco/Le Mans, schermata larga e stretta, UI/atlante con A-100 e controllo popolazione. Nessuna modifica cosmetica ulteriore richiesta. Metodo Impeccable: mantenuto il laboratorio esistente e la mappa interattiva, intervenendo sui dati trasferiti e non sulla qualità neurale.

Gli apici dei cordoli sono presentazioni visuali, non nuovi ingressi della policy. Il V4 mantiene 166.700 nodi / 6.242.118 connessioni e il precedente budget attivo di 8.192, con priorità al nucleo di guida di 7.721. Non è una simulazione contemporanea di tutti i 166.700 neuroni a ogni tick. La selezione del contesto tramite atomiche GPU presenta variabilità già nella baseline quando il budget si satura: prime 1-2 iterazioni a freddo equivalenti, non promessa di traiettorie bit-esatte dopo saturazione.

Limite del recupero a caldo: gli specchi CPU degli agenti non ispezionati mantengono la lettura motoria, non tutto il contesto GPU. Il fallback avviato a freddo è verificato; non è confermata la continuità numerica di tutti i contesti neurali dopo una perdita del device GPU durante una prova. Non equiparare questa modalità al funzionamento GPU normale.

## Avvio e pacchetti

Nuova release in `dist-performance-v450`: portable x64 e installer NSIS x64 **4.5.0**. La portable è stata effettivamente eseguita per le prove GPU e CPU sopra. L'installer è stato costruito, non installato automaticamente. Entrambi risultano **NotSigned**; Windows può mostrare un avviso SmartScreen. Nessuna versione precedente rimossa.

Aprire la portable, scegliere pista/modello, impostare **Popolazione** fino a 100. Per osservare i cordoli usare **Dettagli: sì**, scegliere una curva nel selettore **Inquadra** e ingrandire. **Mostra bordi fisici** rende visibile il perimetro usato dai sensori.

Report CPU grezzi: [baseline](performance-cpu-baseline-v442.json), [ottimizzato](performance-cpu-v450.json). Prima misura GPU: [sviluppo](performance-verification-v450/performance-smoke.json); prima misura del pacchetto: [portable](performance-portable-v450/performance-smoke.json); [portable definitiva](performance-final-portable-v450/performance-smoke.json).

Il [manifest di verifica della release](release-verification-v450.json) registra SHA-256 degli eseguibili, firma e corrispondenza fra 24 file runtime sorgenti e impacchettati. I cinque campi runtime di `package.json` coincidono; il pacchettizzatore omette script, dipendenze di sviluppo e configurazione di build, quindi il manifest completo non è byte-identico. Questo rapporto esterno è aggiornato dopo le prove dell'eseguibile definitivo: non richiede un'altra compilazione e non cambia il codice distribuito.
