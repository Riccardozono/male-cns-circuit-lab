# Verifica del bosco e della fascia di Le Mans a 2 km

12 ottobre 2026. Sorgente locale **5.5.0**, ramo `codex/landscape-1km`.
Questo rapporto riguarda i test realmente eseguiti sullo sviluppo; non è
una nuova release pubblicata.

## Risultati

- `npm test`: **359/359**, zero fallimenti. Comprende conservazione di
  fisica, sensori, reward, policy, renderer, save e sei test dei nuovi boschi.
- Controllo dei componenti fisici/dati/asset/versione e binari distribuiti:
  **33/33** con `node work/landscape/verify-preservation.cjs`.
- Verifica indipendente degli HGT NASA: **1500 campioni**, 500 per circuito,
  hash ZIP/HGT/Float32 e CRC corrispondenti. Massimo errore numerico Float32
  circa `0,000018 m`: è errore della conversione, non accuratezza del DEM.
- Test nativo Electron Windows con profili separati e 100 agenti:
  prima matrice completa **104/104**, conferma finale **104/104**,
  zero errori in console. Quindici catture per matrice, inclusi bosco,
  paesaggio, inseguimento, quartieri, atlante affiancato e larghezze
  finestra 1540, 1280 e 390. WebGL 2 per il disegno; WebGPU neurale attivo
  su adattatore identificato come `nvidia lovelace`, un worker, 32.768 slot.
- Controlli di stato in pausa: Inquadra, Home/Centra, zoom, rotazione,
  Bosco e Dettagli conservano progressi e stato fisico degli agenti.
- Modelli Sketchfab caricati dal GLTFLoader dell'app, texture incorporate.
  Sette PNG del nuovo pack conservati per byte; i GLB originali e le
  vecchie texture non sono modificati.

## Numeri effettivi nella scena nativa

| Circuito | Fascia | Alberi totali | Nuovi alberi nelle aree OSM | Edifici OSM collocati |
| --- | ---: | ---: | ---: | ---: |
| Monza | 1 km | 10.626 | 9.270 | 500 |
| Le Mans | 2 km | 25.075 | 24.000 | 1.970 |

Sono conteggi della scena generata, non quantità misurate sui circuiti
reali. Le Mans importa 2.000 impronte candidate; 30 sono escluse dai
controlli visivi di interferenza/fondazione. Monza e Monaco conservano
il ritaglio NASA precedente; Le Mans passa a **312 × 227** campioni.

Alberi: massimo 23 lotti riservati di istanze fra tutti i materiali/LOD;
terreno: 2 lotti; edifici OSM: massimo 4. Nella verifica con 100 auto il
disegno completo rimane sotto 150 chiamate. Il terreno di Le Mans usa
136.308 triangoli, senza modificare geometria stradale e collisioni.

Una misura di 25 invii di rendering in pausa registra mediana **2,3 ms**
e massimo **3,2 ms**. È tempo CPU di invio, non durata GPU, FPS sostenuti,
throughput neurale o velocità di apprendimento.

## Problemi trovati e corretti

Un controllo preliminare segnalava come presenti gli asset aggiuntivi
anche nel Laboratorio, con zero istanze. Ora quei lotti sono creati solo
quando esiste un bosco. Una prova della fascia estesa mostrava gli edifici
concentrati entro circa 1,2 km: il budget è stato distribuito su quattro
anelli fino a 2 km, ed è stato verificato l'uso reale della nuova fascia.

La prima ispezione visiva ha portato a una sola correzione in blocco:
vista Paesaggio orientata sull'asse dominante e focus Bosco su un gruppo
denso anziché una pianta isolata. La matrice di conferma conserva tutte
le 104 verifiche, le texture e i controlli esistenti.

## Ambito e limiti

Gli asset sono attribuiti in [WOODLAND-CREDITS.md](assets/WOODLAND-CREDITS.md).
Quote NASA 2000, registrazione stimata, palette dei poligoni OSM e singole
posizioni illustrative sono dichiarate in [BOSCHI-PAESAGGIO.md](BOSCHI-PAESAGGIO.md)
e [PAESAGGIO-SRTM.md](PAESAGGIO-SRTM.md). Non è una ricostruzione laser/CAD.
Il pack distante usa sagome alpha incrociate; i dati OSM comprendono i
poligoni chiusi disponibili e non ogni relazione o singola pianta.

La superficie fisica stimata, i parametri neurali e i salvataggi della
5.5.0 restano intatti. Non sono stati alterati tag, release o eseguibili
già distribuiti. Profili di test separati dai progressi dell'autore.
Questi controlli non dimostrano giri appresi o convergenza migliore.
