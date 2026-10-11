# Verifica della modalità Test modelli

9 ottobre 2026. App e salvataggi restano alla versione **5.0.0**. Nuovo portable
e installer: `dist-test-mode-v500`. Il precedente rilascio in
`dist-model-ui-v500` è conservato, senza sostituire l’app dell’utente in esecuzione.

## Verificato

- **267/267 test** del progetto, inclusi 17 test nuovi su obiettivo, contatori,
  assenza di completamenti falsi, timeout, stop, esecuzione sequenziale e
  indipendenza delle misure da uno storico limitato a 100 generazioni.
- Simulazione reale V2 con e senza l’osservatore: 900 tick con fisica, ricompense,
  genomi, ottimizzatore, evoluzione e stato RNG identici.
- **34 controlli** nell’app sorgente GPU, inclusa la vista larga e stretta;
  **32** con fallback CPU.
- **32 controlli** sul portable compilato con GPU e **32** con fallback CPU:
  quattro motori reali, stesso seed e impostazioni, clock/tick fisici misurati,
  budget e stop senza completamenti inventati, isolamento della sessione
  normale, mappa/atlante, esportazione JSON e ripristino della prova precedente.
- **57 controlli** di progressi, con caricamento tramite UI di quattro file reali
  del precedente rilascio 5.0.0. Modello e stato dei worker conservati esattamente.
- **114 file progressi precedenti** e i due vecchi eseguibili protetti tramite
  SHA-256. Quattordici file fondamentali di apprendimento, fisica, ricompense,
  dati e salvataggio identici al rilascio ripulito precedente.
- Pacchetto con elenco esplicito di **59 file applicativi**, corrispondenti alle
  sorgenti verificate. Nessun test unitario, salvataggio, cache o report storico
  aggiunto al pacchetto. I diagnostici nativi supportati restano disponibili.

## Limiti dell’evidenza

Le prove native usano un budget breve di **2 secondi reali per modello** per
verificare meccanica, clock, isolamento e censura. Tutti i modelli sono stati
effettivamente eseguiti; nessuno ha raggiunto due giri in quel budget. Questo
**non** è un benchmark di convergenza, né prova che non possano imparare.
Il test dell’utente parte con 10 minuti per modello, configurabili fino a
24 ore, oppure 0 senza limite. Non ci sono policy importate o generazioni forzate.

V4/V5 usano il backend ibrido verificato, V2/V3 la CPU. Tempi di GPU e CPU,
carico dell’interfaccia e altri programmi influenzano il tempo reale: un singolo
seed non costituisce una classifica statistica dell’apprendimento.

L’ispezione UI segue il flusso Impeccable con review/documenter sostitutivi
in-thread, poiché qui non è disponibile un agente separato. Esito **ship** per
il nuovo pannello; nessun nuovo asset o cambiamento d’identità. Le segnalazioni
sulle parti incumbent non sono presentate come un audit superato dell’intera UI.

## Evidenza e riproduzione

Rapporto misurato: `model-test-verification-v500/verification.json`, TAP completo,
rapporti nativi GPU/CPU/progressi e `review.md`. Screenshot finali:
`source-final-gpu/desktop.png` e `source-final-gpu/mobile.png`.

`npm test` esegue la suite; `node work/run-model-test-smoke.cjs` verifica la
modalità nella sorgente, `--cpu` forza il fallback. Passare il percorso del
portable come primo argomento verifica l’eseguibile. `--progress` esegue i
controlli di salvataggio/importazione in un profilo temporaneo distinto.
`node work/verify-model-test-v500.cjs dist-test-mode-v500 --final` verifica
sorgenti, grafi, progressi ed eseguibili rispetto all’audit del pacchetto.
