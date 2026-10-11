# Circuit Lab 4.6.1 — modello visivo Porsche

Richiesta: migliorare il modello visivo dell'auto. Modifica solo di presentazione:
sprite dall'alto, materiali degli agenti, anteprima e camera ravvicinata. Nessuna
nuova guida, fisica, penalità, circuito o struttura neurale. Risultati 4.6.0
conservati; non è una nuova prova di apprendimento.

## Grafica e provenienza

- [Sprite RGBA](assets/porsche-992-gt3r-top-v1.png): 1.881 × 836 pixel,
  2.001.643 byte. Illustrazione generata con lo strumento integrato image_gen;
  nessuna CLI/API aggiuntiva, nessuna foto ufficiale copiata nella sprite.
- [Prompt completo e provenienza](assets/car-visual-provenance-v1.json):
  vista ortografica, muso verso destra, nessun testo/sponsor, alpha reale.
  Riferimento visivo: [Porsche 911 GT3 R 2026](https://racing.porsche.com/en-US/cars/911-gt3-r-2026),
  consultato il 30 settembre 2026. Non è un modello 3D ufficiale/CAD.
- Cache: 8 colori × 3 livelli (64, 256, 512), più base neutra;
  5.195.776 byte di pixel preparati (4,96 MiB). Il limite non include decodifica
  sorgente, altri canvas, backbuffer, driver o RAM totale dell'app.
- Mappa: sotto 8 pixel si disegnano solo punti; scala fisica e pose indipendenti
  restano quelle originali. Sterzo e frenata sono letture, non nuovi comandi.
- Anteprima: canvas di 120px, aggiornato solo per variazioni visive; “Vedi da vicino”
  usa il Segui auto già presente. Se l'immagine fallisce resta la sagoma di riserva.

## Prove riproducibili

1. **151/151 test**, zero falliti o saltati. [TAP](test-results-v461.tap).
   `node work/run-tests-v461.cjs`. I 12 nuovi test coprono alpha/LOD/cache,
   fallback, sterzo/freno reale, dimensioni, DPR e assenza di mutazioni.
2. **23 file identici per SHA-256** al pacchetto 4.6.0 conservato, inclusi engine,
   worker, GPU, fisica, policy, grafi, mappe e precedente storico V2.
   [Hash e metadati della sprite](car-core-verification-v461.json).
   `node work/verify-car-core.cjs`. Namespace `v46-992-gt3r-si-1` conservato.
3. Diagnostico nativo con 100 agenti su Monza: **15 controlli**, protocollo offline,
   alpha reale, A-100 corretto, 400 disegni senza nuove cache, controlli grafici
   che lasciano intatti fisica/attività/punteggio/ottimizzatore in pausa.
   [Sorgente e schermate](car-visual-source-v461/car-visual-smoke.json),
   [portable GPU](car-visual-portable-v461/car-visual-smoke.json),
   [portable CPU fallback](car-visual-cpu-v461/car-visual-smoke.json).
4. Regressione runtime V2/V3/V4, 100 auto: **26 controlli** per modalità motoria,
   pausa, selezione, pedali e backend. [Portable](performance-portable-v461/performance-smoke.json).
   È una prova funzionale breve, non un benchmark di FPS, convergenza o 30x reali.
5. [Verifica finale del pacchetto](release-verification-v461.json): hash dei file
   inclusi, versioni, test/diagnostici, portable/setup e stato Authenticode.

Revisione grafica Impeccable: un unico lotto di quattro schermate (mappa/atlante
e anteprima, desktop 1540×980 e stretto 390×844), nessun overflow misurato,
contrasto testo graphite 8,14:1 e muted 5,48:1 sul pannello. Nessun secondo
giro di ritocchi cosmetici. [Anteprima](car-visual-source-v461/narrow-car.png).

## Windows e limiti

Pacchetti x64 `dist-car-visual-v461/`: portable e NSIS. Usare l'eseguibile
4.6.1; non si aggiorna una vecchia finestra già aperta. Installer costruito
ma non installato automaticamente; pacchetti senza firma Authenticode.
Le verifiche usano finestre nascoste e profili temporanei separati, non i
salvataggi o l'app aperta dell'utente. Versioni precedenti conservate.

Non sono aggiunti un mesh interattivo, camera di guida 3D, asset Porsche
autorizzato, danni o cinematica completa. Forma/superfici raster illustrative;
grafica migliore non dimostra un miglioramento dell'apprendimento.
