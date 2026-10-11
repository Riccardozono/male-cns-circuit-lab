# Circuiti: modelli visivi 4.4.2

La versione 4.4.2 migliora la rappresentazione dall'alto di Laboratorio, Monza, Monaco e Le Mans. Non introduce una pista 3D, altimetria o geometria rilevata sul posto.

## Cosa cambia

- Asfalto più leggibile, texture leggera e cordoli schematici nelle zone con curvatura; fasce esterne distinguibili e non percorribili.
- Scacchiera di partenza/arrivo e griglia dipinta, sempre ritagliate dentro i veri poligoni della simulazione.
- Nessuna linea centrale decorativa che possa essere interpretata come un percorso assegnato alle auto.
- Zoom con pulsanti, rotella e pizzico; spostamento tramite trascinamento e frecce; `Home` / **Centra** ripristinano l'intero circuito.
- **Inquadra** mostra la partenza o una delle curve nominate nel catalogo. I nomi sulla mappa sono cliccabili; il selettore rende accessibili anche quelli nascosti per mancanza di spazio.
- **Dettagli: no** spegne texture, cordoli, griglia e fascia esterna. **Mostra bordi fisici** evidenzia i bordi realmente usati dai sensori. Queste funzioni cambiano solo il disegno.
- Etichette adattate alla finestra e separate dal nome dell'auto ispezionata. La scala riporta unità della simulazione, non dimensioni reali dell'autodromo.
- Cache multirisoluzione a tasselli: massimo 48 immagini di 388 × 388 pixel RGBA, cioè 28.904.448 byte (circa 27,6 MiB) di pixel conservati, più la piccola texture e le strutture di disegno. Non è un limite della memoria totale dell'app o un benchmark FPS.

## Cosa resta invariato

I contorni e le larghezze arrivano dagli stessi dati delle versioni precedenti. Il riempimento `evenodd` dell'asfalto usa le copie esatte di `track.outer` e `track.inner`. Vernice e cordoli sono ritagliati dentro questi contorni: non creano una seconda pista più larga. Il bordo evidenziato è direttamente il perimetro fisico, non il margine della fascia decorativa.

Non cambiano motori neurali, encoder/decoder, policy, sensori, fisica delle auto, collisioni, ricompense, penalità o salvataggi. Non vengono introdotte collisioni tra auto o una guida lungo il percorso. L'atlante 3D del cervello della 4.4.1 resta disponibile.

I dettagli sono **schematici**, non una ricostruzione delle posizioni reali di cordoli, vie di fuga, griglia, edifici o vegetazione. La forma del circuito conserva la provenienza documentata in [CIRCUITI.md](CIRCUITI.md), con mappe 2023/2025; non viene presentata come un rilievo o una verifica dello stato dei circuiti nel 2026.

## Verifica riproducibile

Risultati verificati il 30 settembre 2026:

- Suite: **89 test passati**, 0 falliti, 0 saltati.
- Portable Windows 4.4.2: **48 controlli dei circuiti** e **31 controlli UI/atlante** passati; nessun errore console, `glError = 0` per l'atlante.
- Ispezione visiva dell'app impacchettata: viste Monza completa e dettaglio, Monaco, Le Mans, Laboratorio affiancato al cervello; anche finestra stretta 390 × 844. Nessuna eccedenza orizzontale nelle dimensioni controllate.
- Runtime del portable: WebGPU attivo sull'adapter segnalato come `nvidia lovelace`, movimento non nullo e verifica attuatori passata. Prova separata con GPU disabilitata: fallback CPU, movimento e attuatori passati.
- SHA-256: **14 file di motore/dati** identici alla 4.4.1, compresi contorni dei circuiti, simulazione, policy, sensori, dati neurali e worker. I nove file UI/diagnostici controllati coincidono tra sorgente e pacchetto.
- Entrambi gli eseguibili risultano `NotSigned` a `Get-AuthenticodeSignature`. È stato avviato e provato il portable; l'installer è stato generato, non installato sul profilo utente.

La suite automatica è `npm test`. Per i risultati di questa release consultare [test-results-v442.tap](test-results-v442.tap), [track-smoke.json](track-verification-v442/track-smoke.json), [ui-smoke.json](ui-verification-v442/ui-smoke.json) e [package-verification-v442.json](package-verification-v442.json).

Il controllo geometrico separato è `node work/check-circuit-geometry.cjs`. Il verificatore del pacchetto è `node work/verify-package-tracks-v442.cjs`, da eseguire dopo i test sull'eseguibile.

L'eseguibile supporta `--track-smoke --track-output-dir=<cartella>`, `--ui-smoke --ui-output-dir=<cartella>` e `--smoke-test`, da lanciare con un profilo di test separato (`--user-data-dir=<cartella temporanea>`). Le prove controllano grafica, stato invariato in pausa, runtime CPU/GPU e movimento; **non misurano la convergenza dell'apprendimento**. Le verifiche automatiche di input coprono pulsanti, rotella, selettori e tastiera; il gesto multi-touch è implementato ma non è stato provato su un touchscreen fisico.

## Avvio Windows

Pacchetti separati in `dist-tracks-v442`, senza sovrascrivere le release precedenti:

- `MAL-E-CNS-Circuit-Lab-portable-4.4.2-x64.exe`: avvio senza installazione.
- `MAL-E-CNS-Circuit-Lab-setup-4.4.2-x64.exe`: installazione Windows.

Il numero mostrato in alto è **4.4.2**. Non vengono eliminati i campioni dell'utente. I pacchetti non sono firmati con un certificato Authenticode; Windows può mostrare un avviso di attendibilità. Una verifica del runtime non equivale a una garanzia che un modello impari un giro o che la grafica migliori la velocità di addestramento.
