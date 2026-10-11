# Benchmark modelli × circuiti

Generato: 2026-09-19T18:40:39.061Z

Ogni caso si ferma quando almeno un agente completa un giro. `maxGenerations` è solo una protezione contro un processo infinito; non è un limite globale di tempo della simulazione.

Configurazione dell’ultima passata: popolazione 16, mutazione 16.0%, budget automatico proporzionale alla pista (target sopravvivenza 34.1 px/s, minimo 60 s simulati), massimo 20 generazioni, seed 7717. Ogni riga conserva i propri parametri effettivi.

Risultato: 2/12 combinazioni hanno raggiunto almeno un giro; 9/12 sono state misurate in questa tabella e 3 non sono ancora state eseguite.

| Modello | Circuito | 1 giro | Generazione | Miglior tempo | Generazioni | Tempo reale |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| V4 | Laboratorio | no | — | — | 4 | 199.741s |
| V2 | Laboratorio | sì | 8 | 52.733 | 8 | 7.412s |
| V2 | Monza | no | — | — | 20 | 50.705s |
| V2 | Monaco | no | — | — | 20 | 37.576s |
| V2 | Le Mans | no | — | — | 20 | 15.622s |
| V3 | Laboratorio | sì | 4 | 32.2 | 4 | 40.685s |
| V3 | Monza | no | — | — | 20 | 313.862s |
| V3 | Monaco | no | — | — | 20 | 428.447s |
| V3 | Le Mans | no | — | — | 20 | 306.198s |

Il benchmark è headless: V4 usa il percorso sparse CPU di `simulation.js`. Non va interpretato come misura del throughput WebGPU della build Electron.
