# Verifica 4.6.2 — progressi condivisibili per versione

Data: 30 settembre 2026. Questa modifica introduce persistenza della prova
di apprendimento; non cambia l’algoritmo per far guidare meglio le auto.

## Prove completate sui sorgenti

- **182/182 test passati**, zero errori e test saltati, in
  [test-results-v462.tap](test-results-v462.tap).
- **34 controlli nativi passati** nell’app Electron con profilo separato,
  [progress-confirm-v462/progress-smoke.json](progress-confirm-v462/progress-smoke.json).
  Salva/Carica attraverso i veri pulsanti e la vera scrittura/lettura su disco:
  V2 a Monza con due worker, V3 a Monaco, V4 a Le Mans; due aggiornamenti appresi
  e storico presente per modello; recupero esatto di parametri, genomi, archivi,
  impostazioni e RNG, tolto il tempo parziale dell’episodio che viene ricreato.
- File con **100 agenti V4** scritto e ricaricato senza eliminare auto o neuroni;
  ripresa con telemetria finita e pedali esclusivi. Versione diversa, checksum
  errato e policy invalida rifiutati senza modificare la prova. Annullamenti di
  Salva, Apri e conferma verificati senza cambiamenti dello stato in pausa.
- Fisica, policy, dati anatomici, mappe/cordoli, atlante, grafica e asset:
  **21 file identici** alla app 4.6.1 preservata. Tutti i calcoli/buffer del backend
  GPU identici. In simulation.js cambia solo l’accessore allo stato del RNG:
  400.000 valori casuali e una prova fisica/evolutiva CPU V2/V3 a Monza confrontati
  esattamente col vecchio runtime. [progress-core-verification-v462.json](progress-core-verification-v462.json).
  La correzione dello slider inoltra `setMutation` già presente nei worker;
  non modifica il metodo di apprendimento.
- Una sola ispezione visiva larga/stretta, 1540×980 e 390×844, con mappa/atlante
  e salvataggio. Quattro immagini ispezionate: nessun overflow, pulsanti 38px,
  stato live, copia e nomi file leggibili. [Report UI](progress-source-v462/attempt-3/progress-smoke.json).
  Nessuna ulteriore correzione estetica necessaria.

## Nuovo eseguibile Windows

Pacchetti nella cartella `dist-progress-v462`: portable e installer NSIS x64.
Il protocollo avvia **la portable realmente prodotta**, non soltanto la cartella
sorgente, con profili temporanei separati per GPU e CPU fallback. Esiti attuali,
SHA-256 sorgente/pacchetto/eseguibili, versione, firma e conteggi verificati:
[release-verification-v462.json](release-verification-v462.json), generato dal
controllo post-build `work/verify-release-v462.cjs`.

Protocolli: `desktop/progress-smoke.cjs` per file e ripresa; controlli runtime
V2/V3/V4 con 100 auto in `desktop/performance-smoke.cjs`. I selettori/conferme
file diagnostici ricevono risposte simulate solo nel lancio `--progress-smoke`;
usano gli stessi pulsanti e lo stesso codice nativo della release, ma non sono
una verifica manuale dell’aspetto delle finestre di selezione Windows. L’installer
non viene installato e le app/salvataggi precedenti non sono rimossi.

## Limiti

Il salvataggio è della prova modello/circuito corrente con tutte le isole, non
di ogni prova locale. Al caricamento riparte dalla partenza della generazione
salvata e in pausa. I risultati già registrati restano, ma l’episodio a metà giro,
il carburante/usura e l’attività GPU/neurale transitoria non vengono ripristinati.
Le isole sono asincrone, non un checkpoint globale simultaneo. L’integrità SHA-256
non è una firma/autenticazione o un DRM; il blocco esatto della versione è una
regola di compatibilità. [Specifica del formato](SALVATAGGI-v462.md).

Questi test non dimostrano convergenza su tutte le piste, apprendimento più
veloce, un 30x reale sostenuto o una fisica WEC validata. La fisica e la guida
continuano a essere la simulazione ridotta già dichiarata. I file diagnostici
con generazioni anticipate non sono “modelli allenati che completano un giro”.
