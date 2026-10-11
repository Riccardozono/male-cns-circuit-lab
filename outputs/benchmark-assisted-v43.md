# Verifica desktop 4.3.0 — modelli × circuiti

Eseguita: 2026-09-29T20:58:39.903Z. **12 casi misurati, 12 con un giro completo, zero mancanti.**

Prova attraverso l’app Electron e i suoi worker, non soltanto chiamate headless. Popolazione 16, mutazione 16%, un worker per caso, velocità richiesta 30×, profilo diagnostico separato. V4 ha usato WebGPU con adapter `nvidia lovelace`; V2/V3 hanno usato CPU. Il tempo reale non include il caricamento iniziale e non è una promessa di throughput 30×.

**Avvio calibrato, non apprendimento da zero:** 768 esempi sensoriali generici, 64 di verifica, nessuna coordinata del circuito. I parametri motori iniziali sono prudenti e poi evolvono. L’attività rapida passa per archi CSR reali; la ricorrenza completa è un contesto separato con miscela iniziale zero.

| Modello | Pista | Giro completo | Generazione del primo giro | Giro simulato (s) | Attesa reale del caso (s) | Ricorrenza |
| --- | --- | --- | --- | --- | --- | --- |
| V2 | Laboratorio | sì | 1 | 77.65 | 3.390 | CPU |
| V2 | Monza | sì | 1 | 281.25 | 28.005 | CPU |
| V2 | Monaco | sì | 1 | 386.80 | 36.832 | CPU |
| V2 | Le Mans | sì | 1 | 285.50 | 17.566 | CPU |
| V3 | Laboratorio | sì | 1 | 77.62 | 19.608 | CPU |
| V3 | Monza | sì | 1 | 280.92 | 84.799 | CPU |
| V3 | Monaco | sì | 1 | 386.28 | 118.143 | CPU |
| V3 | Le Mans | sì | 1 | 285.22 | 77.719 | CPU |
| V4 | Laboratorio | sì | 1 | 77.70 | 7.068 | WebGPU |
| V4 | Monza | sì | 1 | 281.23 | 62.602 | WebGPU |
| V4 | Monaco | sì | 1 | 386.73 | 78.938 | WebGPU |
| V4 | Le Mans | sì | 1 | 285.62 | 35.209 | WebGPU |

Il banco si ferma al primo giro effettivo. Per questo `generationsEvaluated: 0` non indica un caso non eseguito: il giro è osservato mentre la generazione 1 è ancora in corso. La conclusione naturale delle generazioni a due giri è controllata da un banco separato. Il limite di 180 s reali per caso protegge il processo diagnostico, non limita la simulazione nell’app.

Il precedente report (2 casi riusciti su 12, 9 misurati, 3 non eseguiti) è conservato in [benchmark-before-learning.md](benchmark-before-learning.md). Adattatore e protocollo sono cambiati: non si deduce un fattore di accelerazione confrontando i tempi dei due banchi.

Dati grezzi Electron: [benchmark-desktop-v43-raw.json](benchmark-desktop-v43-raw.json). Report completo con hash e limiti: [benchmark-all-results.json](benchmark-all-results.json). I risultati descrivono queste impostazioni e questo profilo; non garantiscono il comportamento di ogni mutazione, checkpoint o seed.

Codice del motore misurato:

- simulation.js: `699fa193fb902648aaee827b0c7acbbb1edc4f496d13b926066b6f246d7ee546`
- neural-learning.js: `ed22216babdad891c4f6b8d3f92b03c64837279b1d80a95e904284d339ae0365`
