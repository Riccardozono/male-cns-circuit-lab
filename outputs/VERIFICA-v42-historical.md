# Verifica della correzione — 16–17 settembre 2026

## App Windows desktop — verifica corrente

La versione 4.2 aggiunge una pipeline Electron ibrida CPU + WebGPU. Il processo principale serve i file tramite il protocollo `male-cns:` senza usare `localhost`, verifica il binario completo con SHA-256, condivide i 54.437.864 byte del connectoma fra i worker e applica un profilo differenziato: **V4 completo parte con 1 worker ibrido GPU+CPU**; V2 e V3, più leggeri, usano il default di **5 worker CPU su 12 thread logici**. Su Windows l’app richiede esplicitamente WebGPU e preferisce l’adapter ad alte prestazioni, cioè la RTX 4060 su questo PC; se l’API o il driver non sono disponibili, resta attivo il fallback CPU. La scelta V4 evita che due passaggi su 8.192 neuroni attivi per auto rendano non responsivi la UI e il ponte grafico; fisica, sensori, ricompense, penalità ed evoluzione restano sul lato CPU.

Smoke test eseguito con:

```powershell
$env:MALE_CNS_FORCE_CPU_FALLBACK='1'
$profile='C:\Users\utente\AppData\Local\Temp\male-cns-smoke-v4-cpu-20260919'
npm exec -- electron . --smoke-test --user-data-dir=$profile
Remove-Item Env:MALE_CNS_FORCE_CPU_FALLBACK
```

Risultato osservato con `MALE_CNS_FORCE_CPU_FALLBACK=1` e un profilo Electron pulito: `protocol: male-cns:`, `male-cns:v1.0 · 166.700 neuroni · 6.242.118 connessioni · APP WINDOWS · 1 worker CPU · CPU fallback`, stato `IN CORSO`, 8 automobili, **8.192 neuroni attivi**, quattro uscite DNa finite e movimento non nullo. Il profilo V4 riduce il sovraccarico dei thread SMT senza togliere il fallback CPU.

Smoke test ibrido eseguito con avvio normale:

```powershell
$profile='C:\Users\utente\AppData\Local\Temp\male-cns-smoke-v4-20260919'
npm exec -- electron . --smoke-test --user-data-dir=$profile
```

Risultato osservato: `GPU+CPU WebGPU`, **1 worker GPU**, adapter `nvidia lovelace` e **8.192 neuroni attivi** nella finestra di verifica; il test ha restituito `ready: true` con movimento non nullo. La prova separata con `MALE_CNS_FORCE_CPU_FALLBACK=1` ha restituito `CPU fallback`, 1 worker CPU, 8.192 neuroni attivi, movimento non nullo e `Nessun adapter WebGPU disponibile.` come motivo esplicito del fallback. Non viene dichiarato un aumento di velocità in × perché non è stato misurato un confronto controllato GPU/CPU sulla stessa finestra di carico.

Il pacchetto Windows rigenerato in `dist-learning/` è stato avviato anche dal binario unpacked `MAL-E CNS Circuit Lab.exe` con un profilo pulito: il probe ha restituito `ready: true`, protocollo `male-cns:`, V4 completo, 1 worker, adapter `nvidia lovelace`, 8.192 neuroni attivi, velocità massima non nulla e sovrapposizione acceleratore/freno pari a zero. Portable e installer NSIS sono stati prodotti dalla stessa build 4.2.0.

Test di apprendimento V4 eseguito con:

```powershell
npm exec -- electron . --learning-test --user-data-dir=C:\Users\utente\AppData\Local\Temp\male-cns-learning-v4-20260919
```

Il probe ha portato il worker a 30× e ha raggiunto la generazione 3 con GPU WebGPU attiva. Nelle due generazioni concluse il migliore è passato da `−1.176,561` a `−804,872 pt`, il progresso da `253,1` a `650,8 px`, con **8.192 neuroni attivi** e `maxThrottleBrakeOverlap: 0`. È un controllo di direzione dell’apprendimento su una finestra breve; non viene usato per dichiarare un tempo di convergenza generale.

Correzione del movimento: il solver GPU usa due buffer di stato alternati. Prima della correzione, con una sola iterazione per tick il risultato veniva scritto nel buffer B ma il tick successivo rileggeva sempre il buffer A azzerato; le auto ricevevano quindi `[0,0,0]` pur mostrando WebGPU attivo. Il backend conserva ora la direzione del buffer tra i tick e il smoke test controlla anche velocità, spostamento e uscite non nulle. Nel test corrente il percorso ibrido riporta 8.192 neuroni attivi, uscite DNa finite e velocità massima non nulla; il fallback CPU deve riportare lo stesso comportamento di movimento.

La scelta di lasciare margine alla UI è intenzionale: evita che la finestra diventi non interattiva mentre gli altri worker saturano il processore. Il motore espone anche il comando `setWorkerCount` per un eventuale pannello di taratura; il default seleziona 1 worker per V4 e stima i core fisici come metà dei thread logici usando un worker in meno per V2/V3, quindi sul Ryzen 5 5600G seleziona 5 worker per i profili legacy.

### Verifica dei comandi longitudinali

La verifica Electron ha mostrato che il connectoma produceva due canali distinti, ma senza un vincolo all’attuatore potevano essere entrambi positivi nello stesso tick: per esempio, nell’osservazione iniziale l’auto A-02 riportava acceleratore `0,0636` e freno `0,1145`. Non era una copia dei canali; era una richiesta fisicamente ambigua, perché le due forze venivano poi sottratte nella stessa equazione longitudinale.

Il runtime ora applica un arbitraggio esplicito e verificabile dopo la decodifica neurale e anche all’ingresso della fisica: conserva la differenza netta fra i due canali e azzera quello antagonista. Per esempio, `0,8` gas e `0,2` freno diventano `0,6` gas; `0,2` gas e `0,8` freno diventano `0,6` freno. Nel percorso MaleCNS le due uscite sono prima trattate come logit antagonisti, con guadagno `0,35`; il bias di lancio è `0,18` nel Laboratorio e `0,02` sulle mappe strette, così una popolazione nuova può esplorare la frenata senza entrare subito nella prima curva a velocità massima. Un grafo realmente inattivo continua a produrre `[0,0,0]`. In questo modo la forza longitudinale resta coerente (`engine − brake`), l’output esposto all’ispettore è quello effettivamente applicato alla vettura e non contiene due comandi simultanei. Lo smoke test richiede inoltre `maxThrottleBrakeOverlap <= 1e-9`, così un’app che ricrei una sovrapposizione non passa come funzionante.

Sul PC di verifica, `nvidia-smi` durante lo smoke test ha mostrato la RTX 4060 tra **11% e 35% di utilizzo GPU** e circa **4,8–5,1 GB di VRAM** impegnata dal processo/app e dal buffer del connectoma. È una fotografia del carico di avvio, non una promessa di throughput costante: la percentuale varia con circuito, popolazione, velocità e driver.

## Aggiornamento corrente — grafo MaleCNS completo V4 e circuiti

Aggiunti Monza, Monaco e Le Mans al circuito Laboratorio. Fonti datate, metodi di estrazione e limiti sono documentati in [CIRCUITI.md](CIRCUITI.md); catalogo completo in `data/circuits.json`.

Il runtime V4 carica **166.700 neuroni annotati**, **6.242.118 connessioni dirette con almeno 5 sinapsi** e **89.860.280 sinapsi anatomiche conteggiate** dallo snapshot ufficiale `male-cns:v1.0`. Il bundle binario è lungo 54.437.864 byte e il suo SHA-256 è `eec3fe23c3395caeba64e08751fd587a546be6edd86d3662e1676e3a4a0b14d9`. Sono presenti 139.662 `somaLocation` ufficiali; 27.038 neuroni non hanno coordinate nell’export usato.

Per evitare una falsa promessa di 166.700 neuroni aggiornati densamente per ognuna delle auto, il solver è dichiaratamente sparso: qualunque neurone e connessione del grafo può essere raggiunto, ma a ogni aggiornamento conserva fino a **8.192 neuroni attivi per agente** e svolge due propagazioni ricorrenti. Il nucleo V3 verificato da 7.721 neuroni ha priorità quando il budget è pieno. L’atlante mostra 23.817 punti campionati, pur riportando separatamente il conteggio completo caricato.

Il punteggio evolutivo ora separa ricompense e penalità, registra il tempo di ogni giro e penalizza severamente sia il tempo trascorso sia i giri oltre il riferimento. A fine generazione, un’auto senza giri riceve **1.000 pt** di penalità; un’auto il cui miglior giro è più lento del miglior giro della generazione precedente perde **120 pt per ogni secondo di differenza**. Ogni auto può completare al massimo **2 giri per generazione**; il vecchio limite temporale automatico è rimosso. La velocità selezionabile va da 0,5× a 30×.

La V3.1 sostituisce il movimento cinematico con un modello dinamico a passo fisso: velocità longitudinale e laterale, inerzia d’imbardata, forze degli pneumatici con limite d’aderenza, motore, freno, resistenza al rotolamento e resistenza aerodinamica. L’ispettore mostra G longitudinale, G laterale, G totale e angolo di slip. La scala esplicita è 10 px = 1 m e 98,1 px/s² = 1 G; sono grandezze del modello locale. La collisione resta attiva solo contro i bordi del circuito: le auto non possono urtarsi, spingersi o influenzarsi a vicenda.

Il controller riceve ora 22 canali: 11 raggi visivi, 7 relay fisici normalizzati (velocità, G longitudinale, G laterale, G totale, slip, imbardata e carico) e 4 relay di strada derivati dalle barriere reali (bilanciamento laterale, curva in arrivo, spazio frontale e larghezza osservata). Tutti i 1.200 ingressi del sottoinsieme mantengono il relay visivo; gli ultimi 112 ricevono inoltre, con guadagno ridotto, i sette canali fisici e i quattro relay di strada. I relay nuovi sono additivi e partono con peso e bias nulli: non sostituiscono la mappatura storica V2/V3 e possono essere scoperti dall’evoluzione. Il guadagno del relay è **0,35** sul Laboratorio e **0,8** sui tre profili map-derived, per compensare la diversa scala dei circuiti. Sulle mappe strette il modello fisico limita inoltre la velocità a **82 px/s** e applica una penalità continua se la distanza frontale non copre lo spazio di frenata stimato; il Laboratorio mantiene 155 px/s. Il connectoma non viene modificato: è cambiato soltanto l’adattatore di ingresso evolvibile. I campioni precedenti con 14, 28 o 36 parametri vengono normalizzati compatibilmente nel nuovo encoder a 44 parametri.

Suite estesa eseguita:

```powershell
node --test --test-reporter=tap --test-reporter-destination=outputs/test-results.tap outputs/tests/simulation.test.cjs outputs/tests/circuits.test.cjs outputs/tests/full-connectome.test.cjs outputs/tests/legacy-models.test.cjs
```

**56 test eseguiti, 56 superati, 0 falliti, 0 saltati.** La suite verifica conteggi e SHA-256 del bundle completo, struttura CSR, attività delle uscite DNa, rispetto del nuovo budget sparso e blocco su un binario incompatibile. Restano inoltre i controlli su ricompense, penalità, due giri, fisica, sensori, collisioni, circuiti, fixture V3, profili storici V3/V2, separazione effettiva di acceleratore e freno, selezione del leader di progresso, crossover dell’adattatore, relay delle barriere reali, avvio della popolazione e importazione del campione evoluto.

### Correzione del plateau di apprendimento

La prova headless sul grafo completo, Monza, seed `7717`, mutazione `12%` e popolazione diagnostica di 4 auto ha mostrato il problema prima della correzione: sei generazioni concluse senza un giro, fitness migliore da `−1280,15` a `−1279,99` e ricompensa quasi nulla. Dopo la correzione delle uscite longitudinali, la stessa prova ha raggiunto `−580,39` alla dodicesima generazione; il progresso ricompensato del migliore è cresciuto da circa `60 px` alla prima generazione a circa `890 px` alla dodicesima. Il test diagnostico usa volutamente una popolazione ridotta e non viene presentato come tempo reale GPU o come completamento garantito di un giro: dimostra che la selezione non è più bloccata sulle auto ferme.

I worker desktop restano paralleli, ma il miglior genoma globale viene trasmesso agli altri worker e inserito nella generazione successiva. La UI continua a mostrare la popolazione del worker principale e ora espone anche il record globale, evitando di confondere un worker locale sfortunato con l’andamento dell’intera evoluzione.

### Miglioramento dell’apprendimento evolutivo — 19 settembre 2026

La selezione ora conserva il vincitore per fitness, il leader per avanzamento, il leader di giro e una hall of fame di quattro candidati. Allarga il bacino dei genitori, usa crossover tra adattatori validi, sceglie una mutazione diversa per figlio e, dopo una stagnazione, inserisce immigrati casuali. Il campione globale degli altri worker resta sempre separato. La fitness non è stata addolcita: le penalità per zero giri, giro lento, urto, uscita, stallo e tempo restano attive; lo stallo per singola auto scatta dopo 5 secondi senza progresso. È stato aggiunto il campo `bestProgress` allo storico e la UI lo mostra separatamente dalla fitness netta.

Il banco deterministico corrente della fixture V3, seed `7717`, 18 auto, 12% di mutazione e 3.600 tick per generazione, è passato da `−602,053 pt` alla prima generazione a `5.512,677 pt` alla dodicesima con **2 giri completati**. La suite corrente contiene 56 test superati. Il precedente valore di `5.707,527 pt` è conservato come riferimento storico pre-espansione; questi numeri dimostrano la riproducibilità del percorso evolutivo V3, ma non sono una promessa equivalente per il V4 completo né per Monza, che restano benchmark separati.

Un banco diagnostico aggiornato sul profilo V2 compatto ricostruito, con lo stesso seed, popolazione e durata, è passato da `208,585 pt` alla prima generazione a `4.306,555 pt` alla dodicesima, con **2 giri completati**. Il percorso V2 viene quindi verificato separatamente dal V3 e dal V4; il benchmark non sostituisce la suite automatica e non altera il connectoma.

### Benchmark completo modelli × circuiti — 19 settembre 2026

È stata avviata la matrice V2/V3/V4 × Laboratorio/Monza/Monaco/Le Mans. V2 e V3 usano il percorso headless CPU con popolazione 16, mutazione 16%, seed 7717, budget automatico proporzionale alla pista e guardia di 20 generazioni; V4/Laboratorio è stato misurato sul percorso headless CPU completo per 4 generazioni. Il criterio è `noLapCount < popolazione`, quindi il solo progresso non viene contato come giro.

Il report cumulativo contiene **9 casi misurati su 12** e **2 giri completati**: V2/Laboratorio alla generazione 8 e V3/Laboratorio alla generazione 4. Nessuna delle sei combinazioni V2/V3 sulle mappe ha chiuso entro 20 generazioni; V3/Monaco è arrivata a 3.135 px, V3/Monza a 927 px e V3/Le Mans a 272 px. V4/Laboratorio non ha chiuso entro 4 generazioni; i tre casi V4 sulle mappe non sono inclusi nel report cumulativo corrente e non posso dichiararne un risultato. Il dettaglio machine-readable è in `benchmark-all-results.json` e la tabella leggibile in `benchmark-all-results.md`.

La verifica separata della build Electron con `--smoke-test` ha riportato `WebGPU`, adattatore `nvidia lovelace`, 8.192 neuroni attivi, movimento non nullo e sovrapposizione gas/freno pari a zero. Questo dimostra il funzionamento del percorso GPU sulla RTX 4060, ma non equivale a un benchmark di apprendimento V4 sulle mappe.

Il V4 è stato ricalibrato senza modificare il bundle anatomico: `iterationsPerControlTick` passa da 1 a 2 e `activeNeuronBudget` da 4.096 a 8.192. Il costo computazionale aumenta, ma due passaggi ricorrenti e un budget superiore riducono la probabilità che un percorso sensore–uscita venga perso prima di influenzare i comandi. GPU, CPU, fisica e selezione restano separati.

### Correzione dello slider della velocità

Il controllo `VELOCITÀ SIMULAZIONE` ora mantiene una richiesta locale finché il worker non conferma lo stesso moltiplicatore: uno snapshot ritardato con il vecchio valore non può più far tornare visivamente lo slider a `1×`. Il comando reale è stato verificato sul worker desktop passando da `1×` a `30×`: il worker ha riportato `speedMultiplier: 30` senza errori. La preferenza viene salvata con una chiave stabile, indipendente dal numero della build, e viene ripristinata al riavvio. La barra superiore non espone più il numero di versione variabile; il numero resta soltanto nei nomi degli artefatti Windows.

## Aggiornamento prestazioni — 17 settembre 2026

Il grafo V4 usa CSR e array tipizzati caricati direttamente dal bundle binario; non crea milioni di array JavaScript. Il rendering dell’atlante proietta l’intero spazio delle coordinate ma disegna 23.817 neuroni campionati e al massimo 3.600 contributi attivi. La dinamica sparsa mantiene fino a 8.192 neuroni attivi per agente, esegue due passaggi per aggiornamento e dà priorità al nucleo di guida V3. Gli ingressi visivi restano 1.200; sugli ultimi 112 relay si aggiungono i sette canali fisici e i quattro relay di strada derivati dai bordi reali.

Misura runtime corrente nel browser locale, Monza, 8 auto, mappa 3D attiva e velocità 1×: da `00:06` a `00:09` in **3,016 s reali**, quindi il passo 1× ha mantenuto il tempo reale nella finestra osservata. Le quattro uscite DNa mostravano attività finita e non nulla; il nuovo budget di 8.192 neuroni risultava disponibile per l’agente selezionato; nessun errore o avviso era presente nella console. A 30× il carico completo satura la CPU e il moltiplicatore non costituisce una garanzia di 30× reale: il controllo resta disponibile, ma il throughput dipende dall’hardware.

Confronto CDP nel browser, stesso scenario operativo (32 auto, Monaco, vista di inseguimento, 10×), finestre di 2 secondi a simulazione ferma:

| Metrica | Prima ottimizzazione | Dopo ottimizzazione |
| --- | ---: | ---: |
| `TaskDuration` | 0,24435 s | 0,06213 s |
| `ScriptDuration` | 0,12699 s | 0,00923 s |

La misura è osservazionale e dipende dal computer/browser; non rappresenta una promessa di tempo reale universale. A simulazione attiva il carico dominante resta il ciclo neurale, mentre l’aggiornamento fisico usa lo stesso passo fisso per ogni auto. Nel controllo runtime precedente la pagina ha mostrato Monaco, vista di inseguimento, 32 auto, 10×, canvas aggiornato e console senza errori o avvisi.

Profiling della build con grafo espanso e atlante 3D visibile, raccolto prima dell’aggiornamento dinamico V3.1, con 18 auto e 1×, finestre di 2 secondi: attiva `TaskDuration` **0,69986 s** / `ScriptDuration` **0,58027 s**; in pausa con atlante aggiornato `TaskDuration` **0,07717 s** / `ScriptDuration` **0,01142 s**. La mappa aggiorna solo una selezione dei contributi attivi e non altera i tick della simulazione; questi valori non sostituiscono una nuova misura del modello fisico.

Il benchmark storico del Laboratorio con la fixture V3 da 7.721 neuroni passa da **−1.023,077 pt** alla generazione 1 a **5.065,090 pt** alla 12, con 2 giri completati dal migliore. È mantenuto come controllo di regressione del motore, ma non è una misura del solver completo V4. Non è un benchmark di completamento delle piste nuove.

### Banco Monza — risultato e limite residuo

Riproduzione storica V3 con `node work/benchmark-monza.cjs`: seed **7717**, 18 auto, mutazione **12%**, relay fisico a guadagno **0,8**, 3.600 tick per generazione e 24 generazioni. Il migliore passa da **−677,375 pt** alla generazione 1 a **−126,926 pt** alla 24, con **0 giri** completati. Non è un benchmark V4 e non dimostra ancora l’apprendimento di Monza.

Verifiche UI effettuate su localhost:

- tutti e quattro i circuiti presenti nel menu; le tre nuove forme, titolo e fonte cambiano realmente;
- cambio pista in pausa: generazione 1, progresso 0, stato in pausa mantenuto;
- tempo simulato senza denominatore massimo visibile, nota operativa sul limite di 2 giri e penalità del tempo;
- nota operativa verificata nell’interfaccia: **−1.000 pt se una macchina chiude 0 giri** e **120 pt/s per la differenza** rispetto al miglior giro della generazione precedente;
- selettore della velocità con valore massimo 30,0×;
- ricompense, penalità, punteggio netto e tempi sul giro visibili nell’ispettore dell’auto, con stato `limite 2 giri` al termine dell’episodio;
- ripresa effettiva del vecchio campione Laboratorio da **10.246 px** e, separatamente, di Monaco da **30 px**;
- vista di inseguimento: auto selezionata ingrandita, sensori e bordi effettivi visibili;
- atlante 3D: **166.700 neuroni**, **6.242.118 connessioni**, **139.662 coordinate ufficiali**, 23.817 punti campionati visibili, fino a 8.192 neuroni attivi per agente e 3.600 contributi evidenziati;
- atlante 3D orbitabile verificato con trascinamento (orientamento cambiato) e pulsante **Reimposta vista** funzionante;
- controllo a 390 px: nessuno scorrimento orizzontale della pagina; legenda spostata sotto il canvas per non nascondere la pista;
- console della scheda di test: nessun errore/avviso restituito al controllo.

La verifica del layout è un controllo nel browser con viewport simulato, non un test su telefono fisico. La revisione visiva è stata svolta nello stesso task, non da un revisore indipendente. Interfaccia e sistema visivo preesistenti conservati. Il resoconto qui sotto documenta le correzioni V2/V3 precedenti; il risultato corrente della suite è quello descritto sopra.

## Esito

La versione 2 non sposta più le auto lungo una traiettoria prefissata. La V4 usa dinamica libera con inerzia, forze G e sensori geometrici insieme al grafo annotato MaleCNS completo filtrato a ≥5 sinapsi e a un solver attivo sparso. **Non è un’emulazione biologica completa o validata.**

## Profili storici nel controller — verifica corrente

Il selettore ora avvia realmente tre grafi diversi: V4 completo (**166.700 neuroni / 6.242.118 connessioni**), V3 storico verificato (**7.721 / 242.486**) e V2 compatto ricostruito (**1.121 / 32.351**). La prova headless del worker desktop ha avviato V3 e V2 senza errori, con `gpu: not-used`, e ha ricevuto snapshot con attività dense rispettivamente di 7.721 e 1.121 valori e movimento non nullo. Il file V2 originale non è presente nel workspace: la voce è marcata “ricostruito” e deriva in modo deterministico dal V3.

La suite corrente dopo l’aggiunta dei profili e dell’evoluzione adattiva è composta da **56 test superati, 0 falliti e 0 saltati**. I salvataggi dei campioni includono il modello oltre al circuito, quindi un campione V4 non viene riutilizzato per V3 o V2.

## Dati

Scaricati i due file ufficiali delle annotazioni e del grafo `male-cns:v1.0`. Il secondo contiene 151.856.684 archi originali. Dopo il filtro degli archi con almeno 5 sinapsi risultano 6.242.118 archi fra 166.700 neuroni annotati; questi dati sono tutti presenti nel bundle V4. Il runtime conserva 1.200 ingressi reali del connectoma, 22 canali dell’adattatore (11 visivi + 7 fisici + 4 relay di strada) e 4 uscite DNa. Il budget di 8.192 descrive la dinamica attiva per passo, non una riduzione dei dati caricati.

`work/verify-source.py` ha ricontrollato direttamente tutti gli archi indotti e tutte le annotazioni contro i file Feather originali: corrispondenza esatta, zero elementi aggiunti/mancanti o annotazioni alterate. Esito machine-readable: `data/source-verification.json`.

Non sono stati installati R o `malecns` come package R. Il requisito di accesso ai dati è soddisfatto dall’export ufficiale offline, non dal semplice clone della repository. PyArrow e NumPy sono stati installati in `work/python-deps` soltanto per l’estrazione e la verifica.

## Resoconto storico V2 — test sul motore precedente

Comando eseguito dalla cartella principale:

```powershell
node --test --test-reporter=tap --test-reporter-destination=outputs/test-results.tap outputs/tests/simulation.test.cjs
```

**17 test eseguiti, 17 superati, nessun fallimento o test saltato.** Consultare `test-results.tap` e `tests/simulation.test.cjs` per risultati e asserzioni.

Prove centrali:

| Prova | Risultato verificato |
| --- | --- |
| Tutti i comandi a zero | Posizione e direzione identiche alla partenza |
| Acceleratore 70%, sterzo zero | Traiettoria rettilinea, poi collisione con il bordo |
| Sterzo opposto | Orientamento e coordinate divergenti in direzioni opposte |
| Sensori | Distanze da intersezioni raggio-segmento; variano con posa e ostacoli |
| Tutte le connessioni rimosse, stesso input/genoma | Uscite neurali discendenti e comandi motori nulli |
| Cervello disabilitato dopo attività | Comandi esattamente nulli, attività azzerata |
| Mutazione 0% | Copie indipendenti ma numericamente identiche |
| Velocità 1× rispetto a 4× | Stessa traiettoria e stato a parità di tempo simulato |
| Fotogrammi a 30 Hz rispetto a 60 Hz | Stessi stati fisici |
| Pausa/reset | Stato congelato; ripristino della popolazione deterministica |

Il benchmark riportato in questo resoconto storico V2 misurava soltanto il progresso in pixel con il vecchio sottoinsieme del grafo; non è il banco di prova corrente e non usa le regole di ricompensa, penalità e tempo sul giro descritte sopra.

## Verifiche storiche nell’app V3

Nel browser su `http://127.0.0.1:5173/` sono stati osservati:

- caricamento dichiarato di 7.721 neuroni e 242.486 connessioni, con ID DNa01/DNa02 e attività visibili; il precedente V2 usava 1.121 neuroni e 32.354 connessioni;
- pulsante pausa: stato `IN PAUSA`;
- cervello spento: a 8 secondi simulati, velocità 0.0 px/s, tutte le quattro uscite neurali 0.0000;
- sterzo zero: a circa 2 secondi simulati, stato `urto`, sterzo 0.00 e acceleratore 0.70; traiettoria rettilinea visibile;
- popolazione ridotta a 8: 8 opzioni nel selettore auto; mutazione portata a 0% e mostrata correttamente;
- ripristino a 18 auto e 12%; compatibilità controllata con il campione precedente da 437 px e campioni V3 con il grafo espanso;
- accelerazione impostata a 30,0× e avanzamento con passo fisico fisso; nessun errore o avviso restituito dalla console nel controllo effettuato.

La pagina è lasciata in modalità MaleCNS. I salvataggi del browser non vengono cancellati da Reset. Il controllo 30× è una prova sul browser locale, non una garanzia di 30× in tempo reale su ogni macchina. Non è stato eseguito un test su dispositivi mobili reali.

## Limite scientifico

ID, classificazioni, direzioni degli archi e conteggi sinaptici sono dati originali. Riduzione del grafo, normalizzazione dei pesi, dinamica a tassi, assegnazione dei sensori e decodifica motoria sono scelte artificiali dichiarate. Nessuna simulazione dei neurotrasmettitori o dei potenziali d’azione. Dati e comportamento simulato non vanno confusi.

Fonti: [download ufficiale MaleCNS](https://male-cns.janelia.org/download/), [repository natverse/malecns](https://github.com/natverse/malecns). Attribuzione/licenza e riproducibilità sono descritte in `README.md`.
