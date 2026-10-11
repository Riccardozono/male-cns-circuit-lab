# Verifica 4.6.3 — selezione automatica dell’auto migliore

Data: 30 settembre 2026. La modifica riguarda soltanto l’osservazione delle
auto; non introduce un pilota automatico o un nuovo metodo di apprendimento.

## Prove completate sui sorgenti

- **194/194 test passati**, zero errori e test saltati,
  [test-results-v463.tap](test-results-v463.tap). Dodici test dedicati coprono
  default, cambio leader, auto inattive, giri/tempi/progresso, parità, selezione
  manuale, cambio popolazione e assenza di modifiche allo stato della simulazione.
- **43 controlli nativi passati**,
  [selection-source-v463/attempt-4/selection-smoke.json](selection-source-v463/attempt-4/selection-smoke.json).
  V2, V3 e V4 con 100 agenti: leader selezionato automaticamente, dati fisici
  finiti, pedali esclusivi, selezione manuale A-100 e campione neurale completo
  dell’agente corretto. V4 usa WebGPU sul backend NVIDIA Lovelace rilevato.
- In pausa, passare dalla scelta manuale a quella automatica e tornare alla
  stessa auto non modifica posizioni, comandi, sensori, ricompense, tempo,
  generazione, storico o metriche dell’apprendimento. I campioni neurali
  riletti nella prova sorgente restano gli stessi per tutti e tre i modelli.
  Se la pausa invalida un calcolo GPU in corso, il runtime conserva l’attesa
  esplicita finché non viene ripresa la simulazione: nessun passo neurale
  nascosto viene effettuato per completare l’atlante.
- Cambio leader, arresto della migliore, graduatoria di giri/tempi, fallback
  quando sono tutte inattive, scelta manuale non sovrascritta, camera Segui
  e parità senza richieste ripetute verificati con campi di graduatoria
  **diagnostici solo nella copia del renderer**. Non vengono modificati i
  worker e questi casi non costituiscono giri reali completati o apprendimento.
  Il selettore invia soltanto `inspectAgent`, mai comandi motori/reset/evoluzione.
- **28 file core identici** alla 4.6.2 conservata: fisica, policy, ricompense,
  mappe/cordoli, dati anatomici, renderer/asset, motore e worker, backend GPU,
  formato e lettura/scrittura dei progressi.
  [selection-core-verification-v463.json](selection-core-verification-v463.json).
- Un’unica ispezione visiva larga/stretta, 1540×980 e 390×844: tre immagini
  di pannello Auto e mappa/atlante affiancati. Comando e testo leggibili,
  nessun overflow o ID duplicato, controllo alto 38px. Nessuna ulteriore
  correzione estetica necessaria. Immagini nella cartella del report sorgente.

## Eseguibile Windows

Portable e installer NSIS x64 sono nella cartella `dist-selection-v463`.
Il controllo post-build avvia **la portable prodotta**, non solo i sorgenti,
con profili temporanei GPU e CPU fallback separati. Versioni, conteggi reali,
hash SHA-256 dei file/eseguibili e stato della firma sono registrati in
[release-verification-v463.json](release-verification-v463.json), generato da
`work/verify-release-v463.cjs` soltanto dopo le prove del nuovo pacchetto.

Protocolli: `desktop/selection-smoke.cjs` per selezione/lettura e 100 agenti
su ogni modello; `desktop/progress-smoke.cjs` per regressione di Salva/Carica,
conferme, rifiuto dei file invalidi e ripresa del vero motore. I selettori file
diagnostici ricevono risposte simulate soltanto con `--progress-smoke`: non
sono una verifica manuale dell’aspetto delle finestre Windows. Le vecchie
release rimangono conservate e l’installer non viene installato automaticamente.

## Uso e limiti

**Auto: migliore** parte attivo e considera la popolazione mostrata, non il
campione storico o tutte le isole CPU. Prima le auto ancora attive; se sono
tutte inattive, la migliore finale. Stessa graduatoria della simulazione:
giri, tempo; prima del primo giro, progresso/punteggio. Scegliere un’auto
dal menu o sulla mappa disattiva l’automatismo, finché non premi nuovamente
il comando. La camera segue solo se è già impostata su Segui auto.

La compatibilità dei progressi resta **esatta per versione**: un file 4.6.2
si apre con 4.6.2, un file 4.6.3 con 4.6.3. Non vengono cancellati o migrati
i vecchi file/campioni. [Formato e limiti introdotti nella 4.6.2](SALVATAGGI-v462.md).

Questi controlli non provano apprendimento più veloce, convergenza su ogni
pista, 30x effettivi sostenuti o una traiettoria GPU futura bit-identica.
Fisica e dinamica artificiale del cervello restano quelle già dichiarate.
