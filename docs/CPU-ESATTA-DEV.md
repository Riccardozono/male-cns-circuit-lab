# Copia Windows CPU DEV — 5.6.0

Questa è una build locale di prova, non una nuova release. Si avvia con
`Avvia-cpu-dev.cmd` nella cartella del progetto e usa un profilo separato.
Portable, installer, tag pubblicati e salvataggio originale non sono sostituiti.

## Cosa cambia

Il calcolo CPU denso di V2 e V3 usa riferimenti locali agli array e precalcola
fattori costanti durante il singolo aggiornamento. Mantiene ordine delle
connessioni, precisione Float64, pesi, dinamica e comandi. Il calcolo GPU di V4 e
V5 non è modificato. Non riduce neuroni o sensori.

I decoder sperimentali con memoria e ricompense `progress-4-guard-experiment`
NON sono inclusi: i loro checkpoint non sono compatibili con la release 5.6.0.
Questa build conserva decoder e ricompense ordinari e i controlli dei file.

## Verifiche effettive del 14 ottobre 2026

- Suite dell'app: **395 test superati**, nessun fallimento.
- Confronto di tre genomi dal salvataggio V3/Monza: comandi, array neurali e stati
  fisici identici tra sorgente precedente e ottimizzato, controllati a ogni
  aggiornamento. Il campione percorre gli stessi 795,680 m prima dell'urto:
  l'ottimizzazione non viene presentata come un miglioramento della guida.
- Benchmark del solo calcolo neurale CPU: 773 osservazioni sensoriali reali,
  27 blocchi confrontati in ordine alternato, rapporto mediano **1,464x**.
  Questo NON misura FPS complessivi, velocità di addestramento o convergenza.
- Verifica della build Windows: **25 controlli superati**, quattro auto
  osservate per ciascun modello. V2/V3 eseguono il nuovo passaggio CPU; V4/V5
  risultano con GPU attiva. Nessun errore nella console del renderer.
- Caricamento e riesportazione del salvataggio: tutti i cinque worker conservati
  esattamente, escluso l'azzeramento già previsto del tempo dell'episodio.
  L'importazione riparte dal traguardo, non a metà giro.

Evidenze locali riproducibili:

- `.impeccable/review/exact-coo/paired-report.json`
- `.impeccable/review/exact-coo/root-replay/verification.json`
- `.impeccable/review/exact-coo/native/verification.json`
- `.impeccable/review/exact-coo/root-tests.xml`
- `node work/verify-root-exact-cpu.cjs`
- `node work/verify-exact-cpu-native.cjs`

Non è ancora dimostrato il completamento di un giro da parte del modello
sperimentale, né un miglioramento generalizzato su tutte le piste.
