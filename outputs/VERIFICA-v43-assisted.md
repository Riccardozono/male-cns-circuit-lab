# Verifica 4.3.0 — 29 settembre 2026

Questo documento riguarda la nuova versione Windows ibrida. Il resoconto 4.2 e i risultati di settembre precedenti alla correzione sono conservati in [VERIFICA-v42-historical.md](VERIFICA-v42-historical.md), non sono prove dell'apprendimento corrente.

## Esito misurato

- **61 test automatici eseguiti, 61 superati, zero fallimenti**, zero saltati. Registro completo: [test-results-v43.tap](test-results-v43.tap).
- **12 abbinamenti misurati nell'app Electron, 12 con un giro completo**: V2/V3/V4 × Laboratorio/Monza/Monaco/Le Mans. Tutti hanno chiuso nella generazione 1 con l'avvio calibrato. Dati grezzi: [benchmark-desktop-v43-raw.json](benchmark-desktop-v43-raw.json). Tabella e configurazione: [benchmark-all-results.md](benchmark-all-results.md), [JSON](benchmark-all-results.json).
- **V2, 12 generazioni:** miglior tempo 78,083333 → 71,866667 s, riduzione 7,9616%; i vincitori mantengono due giri completi in tutte le generazioni. Seed 7717, quattro auto, mutazione 16%, Laboratorio. Prova inclusa nella suite e in [learning-v43-results.json](learning-v43-results.json).
- **V3, 12 generazioni:** 78,033333 → 71,816667 s, riduzione 7,9667%; tutti i vincitori chiudono due giri. Stesso seed, popolazione, mutazione e circuito; nessuna generazione conclusa artificialmente. Il grafo rimane invariato. Storico: [learning-v3-v43.json](learning-v3-v43.json).
- **V4, app WebGPU, due generazioni naturali:** 77,483333 → 73,933333 s; due giri in entrambe, poi generazione 3. 16 auto, mutazione 16%, richiesta 30×, un worker, adapter `nvidia lovelace`, nessun overlap gas/freno. Evidenza: [learning-v4-v43.json](learning-v4-v43.json).

Queste prove verificano il miglioramento in quelle finestre del Laboratorio. **Non posso confermare che ogni seed o ogni checkpoint migliori sempre, né che tutti i circuiti siano già ottimizzati.** Il banco di tutte le piste si ferma al primo giro, non misura dodici generazioni per ciascuna pista.

## Perché la prima generazione ora chiude

Non è stata osservata una mosca che impara da zero. L'adattatore ha un warm start esplicito:

1. I 22 segnali del simulatore vengono proiettati tramite archi del CSR reale su 94 neuroni V2, 114 V3, 111 V4, non su una rete sostitutiva casuale.
2. Il decoder viene calibrato su 768 vettori generici dei sensori, senza pose, punti della pista, mezzeria, curvatura o giri dimostrativi. Altri 64 vettori verificano l'errore.
3. Il decoder ricostruisce bilanciamento laterale, anticipo osservato delle barriere, spazio frontale e velocità. Una base prudente di otto parametri motori avvia le auto; piccoli cambiamenti e selezione evolvono la guida.

La calibrazione legge i pesi CSR attuali mediante indici reali, non una copia sintetica fissa. I test verificano che cancellare tutte le connessioni o spengere la rete annulli esattamente i comandi. Il ramo rapido è necessario alla guida calibrata; la ricorrenza completa è calcolata ma parte con miscela motoria zero. Questo limite deve rimanere dichiarato.

La dinamica rapida è feedforward a tassi; la ricorrenza usa il solver originale a 5 Hz e due passaggi. L'encoder DNa legacy continua a 20 Hz quando viene caricato un genoma privo del ramo rapido. La base motoria è artificiale, non fisiologia della mosca.

## Problemi corretti e prove pertinenti

| Problema | Correzione | Evidenza |
| --- | --- | --- |
| Incidenti precoci potevano superare giri lenti con punteggio molto negativo | Selezione per giri, poi tempo; progresso prima del primo giro, punteggio secondario | Test del giro lento contro incidente; campioni migrati e salvati con gli stessi criteri |
| Quattro elite potevano occupare tutte le quattro auto | Deduplicazione dei genomi e due slot lasciati ai figli con mutazione attiva | Test di diversità in popolazione quattro |
| Mutazioni diffuse distruggevano una guida funzionante | Da uno a tre parametri motori per figlio, otto parametri con limiti dichiarati | Miglioramento deterministico V2/V3 e app V4 |
| Il collo di bottiglia delle quattro uscite DNa rendeva difficile decodificare rapidamente le barriere | Ramo neurale rapido sulle sinapsi reali, calibrato indipendentemente dalla pista | Errori held-out, ablazione e dodici casi desktop completati |
| Attese GPU non conteggiate nell'orologio | Tempo caricato una volta per batch completato, compresa l'attesa | App avanza con richiesta 30×; due generazioni concluse naturalmente |
| Trasferimento/ricostruzione eccessiva degli stati | Buffer UI riutilizzati; atlas completo soltanto per l'auto selezionata | Smoke test del pacchetto, selezione auto A-02 |
| Espulsione casuale dei nodi del nucleo sotto budget GPU | Slot prioritari per tutto il nucleo prima del contesto | Solver GPU nel banco V4, budget 8.192 |

La fisica rimane libera: nessun riposizionamento sulla mezzeria, controllo soltanto tramite sterzo e pedali. I sensori geometrici colpiscono i bordi effettivi. Collisioni, due giri massimi, G, slip e penalità severe restano coperti dai test. Le auto non collidono fra loro.

## Regole dei banchi

Il benchmark di primo giro usa l'app reale, profilo diagnostico separato, 16 auto, mutazione 16%, un worker e richiesta 30×. Il tempo reale per caso è misurato dopo la selezione della pista; il caricamento iniziale del modello non è incluso. Non si deduce un throughput esatto dal rapporto fra giro e attesa, poiché il banco avanza anche durante i preparativi e legge snapshot periodici.

Si interrompe alla rilevazione di un giro completato, prima che tutte le auto finiscano due giri. Perciò `generationsEvaluated: 0` significa zero generazioni già concluse, non un caso non eseguito. Il valore `firstLapGeneration: 1` documenta la generazione del giro.

Il limite di 180 secondi reali per caso e i guardrail dei programmi headless proteggono il processo di prova. **Non è stato reintrodotto un limite massimo di tempo della simulazione.** Le generazioni nell'app terminano solo quando tutte le auto sono ferme o hanno finito due giri, oppure per il comando esplicito Evolvi ora.

Il banco multi-generazione V3 non forza `evolve()`: ogni generazione termina naturalmente. La suite V2 ha una protezione di 14.000 tick per generazione, maggiore della durata delle dodici generazioni misurate, che chiudono due giri. Il V4 nell'app attende due generazioni naturali.

## Riproduzione

```powershell
npm test
node work/benchmark-learning.cjs --model v3 --generations 12 --population 4
npm exec -- electron . --benchmark-all --benchmark-timeout-ms=180000 --user-data-dir=work/benchmark-clean
npm exec -- electron . --learning-test --user-data-dir=work/learning-clean
```

L'output Electron temporaneo viene copiato nei file di evidenza indicati, poi `node work/report-learning-verification.cjs` genera i report permanenti. Lo script valida che esistano tutti i dodici casi completi e conserva gli hash SHA-256 di `simulation.js` e `neural-learning.js`.

Il precedente report incompleto è conservato in [benchmark-before-learning.json](benchmark-before-learning.json). L'adattatore e il protocollo sono cambiati: la differenza fra due e dodici casi riusciti non è un confronto controllato di velocità o di apprendimento da zero.

## Pacchetto e limiti

La release è 4.3.0, portable e installer x64 nella cartella `dist-learning-v43/`. Lo smoke test viene eseguito con il binario del pacchetto e un profilo pulito, non soltanto dal sorgente. Il resoconto della prova è [desktop-package-smoke-v43.json](desktop-package-smoke-v43.json); i controlli includono movimento, uscite, gas/freno, WebGPU e cambio dell'auto ispezionata. Per i risultati effettivi consultare il JSON, non una descrizione di sola configurazione.

La portable ha superato la prova GPU e quella con `MALE_CNS_FORCE_CPU_FALLBACK=1`, entrambe con exit code zero. Nella seconda prova il mancato adapter è intenzionale; l'app riporta fallback CPU, movimento, 8.192 slot e nessun overlap dei pedali. Evidenza: [desktop-package-cpu-smoke-v43.json](desktop-package-cpu-smoke-v43.json). [package-verification-v43.json](package-verification-v43.json) verifica la corrispondenza SHA-256 di dodici file di codice/dati tra sorgente e bundle e conserva gli hash di portable e installer. L'installer è stato costruito, non installato automaticamente. `Get-AuthenticodeSignature` ha riportato `NotSigned` per entrambi i pacchetti.

Dati V4 invariati: 166.700 nodi, 6.242.118 archi, binario 54.437.864 byte, SHA-256 `eec3fe23c3395caeba64e08751fd587a546be6edd86d3662e1676e3a4a0b14d9`. Budget ricorrente 8.192 slot per auto, nucleo 7.721 prioritario; gli slot riservati possono contenere attività zero. Il numero di slot non prova che tutti siano neuroni simultaneamente attivi.

30× è la velocità richiesta: sul PC il throughput dipende da modello, pista, popolazione e carico. La prova non garantisce 30× reale. La GPU si occupa della ricorrenza V4; il ramo rapido, la fisica e l'evoluzione restano CPU. Non è un'emulazione biologica validata: neurotrasmettitori, spike, fisiologia e apprendimento biologico non vengono simulati.
