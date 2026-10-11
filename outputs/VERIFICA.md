# Verifica 4.4.0 — policy ricorrente appresa

Correzione del 29 settembre 2026. I risultati precedenti sono in [VERIFICA-v43-assisted.md](VERIFICA-v43-assisted.md): quella versione aveva una guida assistita programmata. Il suo 12/12 non viene attribuito alla nuova policy.

## Controlli della guida

- Nessuna traiettoria, mezzeria, coordinata, azione-insegnante o velocità-obiettivo nel decoder.
- I sensori entrano nei nodi di ingresso; le sinapsi anatomiche propagano l'attività.
- La lettura motoria riceve attività ricorrente di 64 veri neuroni discendenti, non sensori ricostruiti per una legge di guida.
- Stato neurale zero significa comando zero anche con bias appresi nonzero.
- Cancellare le sinapsi con stato iniziale zero impedisce azioni motrici.
- Gas/freno sono antagonisti. Cervello spento significa azioni zero; un'auto già in moto conserva l'inerzia fisica.
- Topologia e dati anatomici non cambiano. Guadagni appresi modificano i pesi effettivi senza aggiungere archi.

Test: [learning.test.cjs](tests/learning.test.cjs). Coprono anche aggiornamento dell'ottimizzatore, restore, rifiuto 4.3 e mutazione zero. La suite completa verifica fisica, muri/raggi, geometria, penalità e due giri: **65 test superati, zero fallimenti**, [registro](test-results-v44.tap).

Un test V2 esegue 12 generazioni naturali: 32 auto, seed 7717, zero giri alla prima generazione, progresso 201,60 → 724,93 px, 384 episodi/12 aggiornamenti. Non forza `evolve()`; il guardrail fa fallire il test se una generazione non termina.

## Risultati di apprendimento

Tabella/storici: [benchmark-all-results.md](benchmark-all-results.md), [JSON](benchmark-all-results.json). Gli abbinamenti non misurati sono marcati tali, non riusciti.

V2 completa due giri sul Laboratorio alla generazione 61, 32 auto, 1.952 episodi, policy iniziale casuale e nessun campione caricato. Miglior giro 72,8333 s simulati: [storico](benchmark-rl-v44-v2-lab-7717.json). Non si deduce throughput da prove concorrenti o backend diversi.

V3/V4 migliorano il progresso ma non chiudono un giro nelle finestre documentate. V3 ripetuto sul codice finale registra hash al caricamento: [JSON](benchmark-rl-v44-v3-lab-7717.json). La precedente prova a 60 generazioni è separata: [sviluppo preliminare](benchmark-rl-v44-v3-lab-7717-preliminary.json); gli hash di quest'ultima erano calcolati a fine prova, non attestano da soli identità col bundle finale.

V4 è stato provato per 20 generazioni nell'app Electron WebGPU: 16 auto, un worker, richiesta 30×, adapter `nvidia lovelace`, 190 parametri, 20 aggiornamenti/320 episodi. Massimo progresso 170,85 → 734,44 px, senza giro: [dati grezzi](learning-rl-v44-v4-gpu.json). Lo smoke del pacchetto è una verifica runtime distinta, non una seconda prova a 20 generazioni.

**Non posso confermare che ogni modello/seed chiuda tutte le piste o migliori a ogni generazione.** Solver sparso/arithmetic GPU possono variare leggermente fra prove; non è dichiarata equivalenza deterministica CPU/GPU.

## Algoritmo e limiti

Evolution strategy con media/varianze diagonali aggiornate dal rango delle ricompense episodiche. Valutazione: giri, tempo; prima del primo giro progresso, punti netti secondari. È risultato fisico del rollout, non traiettoria-insegnante. Restano severe le penalità per zero giri, urto, giro lento e regressione temporale.

190 parametri: 44 ingressi/bias, 16 guadagni condivisi di sinapsi reali, 128 letture su 64 neuroni discendenti e 2 bias. Non si addestrano singolarmente 6.242.118 archi né si simula plasticità biologica.

V4 carica 166.700 nodi e 6.242.118 archi forti; solver sparso due passaggi, massimo 8.192 slot/auto, nucleo 7.721 prioritario. Slot riservato non significa attività nonzero. Binario invariato: SHA-256 `eec3fe23c3395caeba64e08751fd587a546be6edd86d3662e1676e3a4a0b14d9`.

Struttura MaleCNS, ma attività a tassi, input, output e apprendimento sono artificiali; spike/neurotrasmettitori/recettori non simulati. Mappe derivate da fonti datate dichiarate, non rilievi metrici.

## Orologio e ripristino

Ricorrenza/azioni 10 Hz, fisica 60 Hz. L'accumulatore conta le attese GPU; 30× richiesto non garantito. UUID del worker ed epoca della prova impediscono l'applicazione di risposte arretrate dopo Reset, pausa, cambio pista/popolazione. Stato completo per auto ispezionata; gli altri trasferiscono 64 neuroni per la policy.

Nuovi checkpoint separati per versione RL, modello e pista. Vecchi `fastMotor` rifiutati. Policy malformate non diventano silenziosamente legacy; validazione prima di sostituire auto/media dell'ottimizzatore.

## App Windows

Portable/installer in `dist-learning-v44/`. Evidenze effettive: [identità bundle](package-verification-v44.json), [smoke GPU](desktop-package-smoke-v44.json), [fallback CPU](desktop-package-cpu-smoke-v44.json). Consultare i JSON: un documento di protocollo non conferma da solo una prova.

La portable ha superato entrambe le prove con exit code zero: WebGPU attivo e fallback CPU forzato. In entrambi i casi movimento verificato, policy 2/190 parametri da popolazione casuale, nessun overlap gas/freno, agente A-02 ispezionato con 8.192 slot e attività nonzero. Il mancato adapter nella prova CPU è intenzionale. Queste sono prove di avvio/movimento, non di convergenza: l'ottimizzatore risulta ancora a zero aggiornamenti nello smoke iniziale.

Il verificatore confronta 13 file di codice/dati fra sorgenti e bundle tramite SHA-256: tutti identici. Conserva gli hash di portable/installer nel report. L'installer è costruito ma non installato automaticamente. Le evidenze finali sono file del workspace prodotti dopo la build; non sono tutte incorporate nell'eseguibile. Timeout diagnostici non reintroducono limiti globali di simulazione.

`Get-AuthenticodeSignature` sui due eseguibili ha restituito `NotSigned`: portable e installer non sono firmati digitalmente.
