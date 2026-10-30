# Contesti neurali: copie Windows di verifica, app 5.6.0

**Aggiornamento successivo:** il nuovo archivio di esplorazione ha verificato
un campione da **2982,192 m** senza urti, ancora zero giri. Launcher,
confronti, limiti e prove sono in [DIVERSITA-NEURALE-DEV.md](DIVERSITA-NEURALE-DEV.md).
Il campione da 2006 m e la sua copia restano conservati.

## Aggiornamento del 15 ottobre: frontiera neurale

Il nuovo launcher **`Avvia-neurale-frontiera-dev.cmd`** apre una copia Windows
separata, in pausa, con il campione V3 / Monza verificato a
**2006,2274624276079 m**, punteggio **−2300,1008567856443**, **zero giri**.
Termina ancora per lentezza. È un piccolo progresso rispetto ai 1990,413 m
del campione precedente, non l'eliminazione del blocco né una nuova release.

**Riprendi** esegue il modello; **Reset** riparte dal traguardo. Questa finestra
rimane **solo inferenza**: non aumenta i pesi o le generazioni mentre la guardi.
Il training descritto sotto è stato eseguito nei programmi sperimentali, non
nel portable distribuito. Non caricare questo modello come `.malecns-save`.
Il launcher richiede il progetto completo, Electron e il runtime locale;
non è un nuovo installer o portable autonomo.

Il profilo è `.impeccable/development-context-frontier-profile`, distinto
anche dal precedente preview. L'app resta 5.6.0. Salvataggio originale,
versioni distribuite e tag pubblicato non vengono sostituiti.

### Che cosa è cambiato e che cosa è stato verificato

- Corretto un difetto nel ramo di controllo con cervello silenziato: un
  comando precedente poteva restare nella cache. Nelle prove il comando
  diventa `[0, 0, 0]` quando l'attività neurale è assente; il normale episodio
  precedente continua a riprodurre esattamente 1990,413 m.
- La telemetria reale del campione precedente mostra frenate durante il
  tratto finale, ma prima della fermata il freno è zero e il gas è circa
  0,079. Nei campioni immediatamente precedenti la velocità è inferiore
  a 1 km/h. Il corpo è ancora in pista e non urta. Non è corretto attribuire
  quella fermata soltanto al freno o a un'ostruzione della pista.
- Nuovi contesti selezionati dalle ultime osservazioni neurali reali,
  con contributo nullo nei primi **1506 controlli** del prefisso osservato.
  Il prefisso temporale è una selezione dei dati di training: nell'esecuzione
  l'attivazione legge solo la distanza nello stato neurale, non un timer,
  coordinate o una soglia di metri. La sua memoria si azzera al Reset.
- **192 candidati / 12 iterazioni CMA** apprendono due coefficienti motori.
  Il campione da 2006,227 m è confermato in due episodi indipendenti interi,
  poi in due episodi del runtime nativo autosufficiente, senza gas/freno
  simultanei. Il formato dedicato contiene modello precedente, basi e pesi
  numerici con checksum: non usa il salvataggio originale, loader storici
  o sequenze di azioni per guidare l'auto.
- La finestra Windows con il nuovo modello supera **16 controlli funzionali**
  e riproduce esattamente metri, punteggio, motivo della fermata e zero giri.
  Il test è senza nuove catture grafiche: non è un nuovo giudizio visivo
  dell'atlante in primo piano. Rimane il limite grafico descritto più sotto.

Il grafo resta quello V3: **7721 neuroni / 242486 connessioni**. I nuovi
coefficienti, la memoria e le proiezioni sono strumenti artificiali del
decoder, non nuovi neuroni biologici o una fisiologia validata.

### Confronti negativi conservati

| Esperimento | Prova eseguita | Esito del confronto completo |
| --- | --- | --- |
| Memoria aggiunta ai tre stadi | 24 episodi | Nessun miglioramento |
| Residuo SAC ampio, RTX 4060 | 20000 passi / 4750 aggiornamenti | Finale 1723,130 m; campione 1990,413 m conservato |
| Due coefficienti, vecchio contesto d'attivazione | 192 candidati | Nessun miglioramento |
| Readout su quattro proiezioni neurali, nuovo contesto | 384 candidati | Campione 2006,227 m invariato; esploratore 2082,941 m con urto, non promosso |
| SAC su nove ingressi neurali/context, RTX 4060 | 10000 passi / 2250 aggiornamenti | Finale 1988,200 m; campione 2006,227 m conservato |

Le quattro proiezioni sono calcolate solo dalle attività effettive osservate,
senza dati del corpo o azioni esperte come etichette. I nove ingressi SAC
sono queste quattro proiezioni, quattro uscite del precedente readout appreso
e la memoria del contesto. Attore e critico risultano realmente su `cuda:0`.
Gli aggiornamenti dei pesi non sono presentati come un miglioramento della
guida. Nelle nuove verifiche SAC si conserva il campione soltanto se migliorano
il punteggio **e** non diminuisce il progresso, sempre dopo un episodio intero.

### Evidenze dell'aggiornamento

Sotto `.impeccable/review/neural-sacl`:

- `frontier-1990/report.json`, `frontier-geometry/report.json`: telemetria e
  diagnostica della mappa esistente; campi del corpo esclusi dal controller.
- `steering-range-audit/report.json`: escursione raggiungibile dal correttore
  precedente e da quello ampliato. Le stime cinematiche non sono misure
  dinamiche della curva o comandi di un esperto utilizzati nel training.
- `context-memory-first/report.json`, `fullrange-context-residual-sacl/report.json`,
  `retained-context-cma-first/report.json`: prove senza miglioramento.
- `frontier-retained-cma-first/report.json`: campione 2006,227 m, ripetizioni
  complete, punteggi e candidati che urtano distinti dal campione.
- `frontier-linear-cma-first/report.json`, `projected-context-residual-sacl/report.json`:
  confronti successivi senza promuovere i candidati peggiori.
- `frontier-native-model/model.malecns-neural-frontier.json`: export privato
  dati-only, SHA-256 `408dfe9ea237de4f6e97b0fcd1d56cf2b160ef399323a7713dfa10e7854104b6`.
- `context-native-3-frontier-functional/verification.json`: finestra Windows
  effettiva, worker Node 24.19.0, 16 controlli e episodio completo a 2006,227 m.
- `frontier-preservation.json`: controllo attuale degli SHA-256 del salvataggio
  originale e dei due binari distribuiti locali, versione 5.6.0, riferimento
  locale del tag e identità dei sorgenti della verifica Windows. Non è una
  nuova verifica dello stato remoto di GitHub.

Anche la suite generale `node --test outputs/tests/*.test.cjs` è stata
rieseguita: **395 test superati, zero fallimenti**. I sei test dei residui /
memorie e i due test del modello frontiera sono separati da quei 395.
La verifica Windows del precedente preview 1990,413 m è stata ripetuta dopo
l'integrazione opzionale: supera ancora 16 controlli e mantiene il risultato.
Nessuno di questi conteggi significa che un modello abbia completato un giro.

Riproduzione funzionale:

```text
node --test work/neural-frontier-model.test.cjs
node work/run-context-native.cjs --stage=3 --frontier --functional-only
node work/verify-frontier-preservation.cjs
```

**Limiti:** ancora nessun giro o doppio giro; il nuovo risultato riguarda
V3 / Monza con partenza dai pesi appresi nella copia gen64. Non dimostra
convergenza da zero, robustezza su altri stati iniziali, funzionamento di tutti
i modelli o su tutti i circuiti. Le penalità e la fisica della normale app
non sono cambiate in questo aggiornamento sperimentale.

## Campione precedente e sua integrazione

Il controller sperimentale V3 / Monza arriva a **1990,41260481475 m senza urti**.
Termina per lentezza, completa **zero giri**. Non è una soluzione definitiva
né una nuova release. Il numero dell'app resta 5.6.0; la normale app, i suoi
salvataggi, il portable, l'installer e il tag pubblicato non sono sostituiti.

## Aprire la copia Windows

Apri `Avvia-neurale-contesti-dev.cmd` nella cartella del progetto. Il launcher
usa Electron e il runtime Node 24.19.0 copiato dall'installazione locale in
`.impeccable/runtime-node24`, con profilo separato
`.impeccable/development-context-preview-profile`.

La copia parte in pausa, con una sola auto e il campione verificato su Monza.
**Riprendi** esegue le predizioni del modello; **Pausa** ferma i passi fisici;
**Reset** riparte dal traguardo. Mappa 2D, 3D, inseguimento, panoramica, prima
persona e atlante usano gli stessi dati effettivi dell'auto. La modalità scura
resta opzionale e il layout approvato è conservato.

Questa finestra è **solo inferenza**, non un addestramento a generazioni.
Mutazione, cambio modello/circuito, test standard e salvataggi `.malecns-save`
sono disattivati qui e restano disponibili nella normale app. La nota visibile
accanto al modello spiega il limite; non si mostrano falsi aggiornamenti dei
pesi o generazioni concluse. La normale app mantiene l'opzione fino a 100 auto.

Il launcher richiede il progetto completo, non soltanto il file `.cmd`. Non è
un nuovo installer o portable autonomo. Nessuna pubblicazione GitHub eseguita.

## Apprendimento realmente eseguito

Grafo invariato: 7.721 neuroni, 242.486 connessioni; 128 discendenti reali letti
in quattro frame, due memorie artificiali e due uscite della policy neurale:
516 valori. Non sono aggiunti neuroni biologici. Le reti e le memorie del
decoder sono artificiali, non una fisiologia validata della mosca.

Le nuove basi sono contesti di attività **effettivamente osservata** durante
episodi fisici interi. Sono kernel a supporto compatto, con centri/scalature
neurali e due coefficienti motori appresi per centro. Ogni ampliamento aggiunge
sei centri e 12 coefficienti; tre ampliamenti verificati portano a 18 centri /
36 coefficienti. Le uscite dell'attore precedente restano parte del controller.

Le mutazioni sono selezionate da ricompense e penalità reali, senza posizioni,
tempo, centrolinea, azioni di un esperto o comandi di guida prescritti nel
readout. Non si riproduce una sequenza di azioni salvata. L'origine è la copia
del salvataggio V3 / Monza già allenato gen64; non un confronto cold-start.

| Stadio | Progresso verificato | Punteggio | Fine |
| --- | ---: | ---: | --- |
| Readout precedente | 1212,314 m | −3147,297 | Fermata |
| Primo ampliamento | 1608,701 m | −2728,675 | Lentezza |
| Secondo ampliamento | 1713,988 m | −2611,459 | Lentezza |
| Terzo ampliamento | 1990,413 m | −2331,904 | Lentezza |

Tutti hanno zero giri. Ogni stadio ha valutato 144 candidati, 12 generazioni
CMA; sono iterazioni di ricerca, non generazioni concluse nell'app. Quattro
processi CPU eseguono le prove. Questo stadio non è backpropagation dell'intero
cervello sulla GPU: CMA e inferenza esportata sono su CPU, rendering 3D su GPU.
Il precedente training SAC/CUDA è descritto in `APPRENDIMENTO-CUDA-SPERIMENTALE.md`.

Il quarto ampliamento e la prova congiunta di tutti i 36 coefficienti non
migliorano il campione: rispettivamente 144 e 128 candidati, conservati nei
rapporti. Gli esploratori che urtano non sono promossi solo per più metri.

## Accelerazione delle prove senza falsi giri

Le prove locali riusano uno stato raggiunto veramente dal controller prima
dell'attivazione dei nuovi contesti. I contributi nuovi sono esattamente zero
nel prefisso protetto. Il ripristino è interno all'ambiente che ha catturato
quel dato, non accetta posizioni inventate o snapshot di un altro ambiente.

Sono verificati comandi del prefisso identici e identità del risultato tra
pratica e episodio completo anche con coefficienti nonzero. Prima di
accettare un campione, due prove indipendenti partono fisicamente dal traguardo.
Metri/giri di pratica non vengono presentati come generazioni concluse.

## Problema numerico trovato e integrazione corretta

Lo stesso modello e codice, senza interfaccia, producono 1990,413 m senza urto
in Node 24.19.0 e un urto a 1564,729 m nel Node 22.22.0 di Electron 38.8.6.
La prima osservazione neurale differisce già di pochi ultimi bit. La prova non
identifica una singola funzione matematica responsabile e non dimostra da
sola instabilità del grafo o generalizzazione del controller.

La copia Windows esegue quindi il calcolo in un processo Node 24.19.0 separato,
con la stessa versione usata per l'allenamento. Electron mantiene grafica e
controlli. Il runtime esegue il modello esportato e i dati anatomici senza
leggere il salvataggio originale o i checkpoint storici della ricerca.

La verifica Windows supera **16 controlli**: avvio in pausa, anatomia / decoder,
modello effettivo, nessun avanzamento in pausa, slider confermato a 30× richiesti,
movimento reale, pedali finiti/esclusivi, invarianti di tema/camera/dimensione,
nessun overflow a 980 px, episodio completo identico, nessuna generazione
inventata, modello invariato, nessun errore renderer e runtime coerente.
30× resta una richiesta, non una velocità reale sostenuta dimostrata.

Nel test grafico in finestra nascosta il framebuffer dell'atlante risultava
nero dopo il ridimensionamento. Un ridisegno esplicito di sola visualizzazione
mostra 31.945 pixel oltre la soglia di luminosità scelta, con GL error 0 e
stato fisico/neurale immutato. Non è una nuova prova visiva dell'interfaccia
in primo piano; le immagini nere non vengono spacciate per un atlante disegnato.

Una perturbazione diagnostica di 1e−12 in un neurone sensoriale, con sensori
effettivi fissi, si annulla entro 100 passi di controllo. Il massimo osservato
è 1,82e−13: questo caso non prova instabilità neurale e non dimostra stabilità
di tutte le traiettorie. Nessun dato diagnostico entra nel training.

## Evidenze e riproduzione

Sotto `.impeccable/review/neural-sacl`:

- `observed-context-first/report.json`: stadio 1 e ripetizioni complete.
- `observed-context-stack-2/report.json`, `observed-context-stack-3/report.json`:
  stadi successivi, fitness / metri / giri separati.
- `observed-context-stack-4/report.json`, `joint-context-first/report.json`:
  ricerche senza miglioramento, non nascoste.
- `context-live-3/verification.json`: due episodi nel runtime indipendente.
- `runtime-numeric-audit/comparison.json`: confronto Node / Electron.
- `context-native-3/verification.json`: finestra Windows e worker reale.
- `context-native-3/failed.json`: prima prova non coerente conservata.
- `context-atlas-audit/verification.json`: diagnostica framebuffer read-only.
- `neural-stability-audit/report.json`: perturbazione, non un training dataset.

Comandi:

```text
node --test work/neural-context-readout.test.cjs work/neural-context-stack.test.cjs
node work/verify-context-live.cjs --stage=3
node work/run-context-native.cjs --stage=3
```

## Limiti ancora aperti

Nessun giro o doppio giro su Monza; nessuna convergenza cold-start / altri
modelli / altri circuiti. La differenza fra runtime segnala sensibilità che
non viene eliminata matematicamente scegliendo una versione coerente: servono
prove di robustezza e ulteriori miglioramenti del controllo e del training.
Non sostituire questo esperimento alla normale app o ai suoi salvataggi.
