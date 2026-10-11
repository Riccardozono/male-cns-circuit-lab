# Apprendimento da policy casuale — 4.4.0

Report generato: 2026-09-29T22:03:00.175Z. **3 abbinamenti misurati, 1 con giri completi, 2 con miglioramento parziale senza giro; 9 abbinamenti non misurati.**

La 4.3 aveva una guida assistita programmata: il suo 12/12 è in [benchmark-assisted-v43.md](benchmark-assisted-v43.md), non è il risultato di questa policy.

| Modello | Pista | Backend | Auto | Generazioni | Progresso iniziale → massimo (px) | Giro confermato |
| --- | --- | --- | ---: | ---: | --- | --- |
| V2 | Laboratorio | CPU headless | 32 | 61 | 201.60 → 4265.24 | Due giri; gen. 61; miglior giro 72.83 s |
| V3 | Laboratorio | CPU headless | 32 | 24 | 180.01 → 1363.76 | Non completato nella finestra misurata |
| V4 | Laboratorio | App WebGPU | 16 | 20 | 170.85 → 734.44 | Non completato nella finestra misurata |

Tutti partono da policy casuali, senza guida-insegnante. Una evolution strategy apprende 190 parametri su sinapsi e neuroni reali. Le generazioni terminano naturalmente; gli script hanno solo guardrail diagnostici.

Il progresso prima del primo giro misura quanto l’auto è avanzata lungo il circuito; la mezzeria serve alla valutazione, non alla policy. I sensori e la fisica sono liberi. I tempi sono simulati, non tempi reali di attesa. Non si confronta il throughput CPU/GPU da prove con popolazioni/protocolli diversi.

- V2: [dati grezzi](benchmark-rl-v44-v2-lab-7717.json), 1952 episodi. Hash del codice catturati al caricamento e identici ai sorgenti finali.
- V3: [dati grezzi](benchmark-rl-v44-v3-lab-7717.json), 768 episodi. Hash del codice catturati al caricamento e identici ai sorgenti finali.
- V4: [dati grezzi](learning-rl-v44-v4-gpu.json), 320 episodi. Prova nell’app Electron di sviluppo, non nel pacchetto finale; controllo runtime del pacchetto separato.

## Abbinamenti ancora da verificare

- V2: Monza, Monaco, Le Mans — nessun giro confermato da un banco corrente di apprendimento da zero.
- V3: Monza, Monaco, Le Mans — nessun giro confermato da un banco corrente di apprendimento da zero.
- V4: Monza, Monaco, Le Mans — nessun giro confermato da un banco corrente di apprendimento da zero.

Non posso confermare che tutti i modelli completino tutte le piste. Le prove V3/V4 mostrano miglioramento parziale; non garantiscono convergenza futura o miglioramento a ogni generazione.

**65 test superati, zero fallimenti**: [registro TAP](test-results-v44.tap). [Report completo](benchmark-all-results.json), [protocollo e limiti](VERIFICA.md), [architettura](README.md).
