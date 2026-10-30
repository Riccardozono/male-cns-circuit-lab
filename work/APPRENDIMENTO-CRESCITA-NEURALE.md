# Crescita della lettura neurale — esperimento V3 / Monza

Priorità confermata dall'autore: continuare sull'apprendimento, mantenendo per ora il comportamento della UI a 740 px. Questo lavoro non cambia il sistema visivo, la copia Windows già aperta o una distribuzione esistente.

## Diagnosi osservata

`work/diagnose-diversity-stall.cjs` riproduce dal traguardo esattamente il campione da 3298,280493659503 m. Negli ultimi 10 secondi simulati il comando medio di freno è 0,739734 e quello di gas 0,113741. Non sono simultanei. Nell'ultimo passo il controller comanda 0,888004 di freno e 0 di gas, con velocità fisica 0. È un comportamento osservato del controller, non una prova che il freno fisico sia guasto.

Nel tratto dopo 3200 m una delle quattro caratteristiche proiettate resta sempre a −1, e le altre visitano spesso gli estremi. Questo documenta una rappresentazione molto saturata in quel tratto; non dimostra da solo la causa di ogni errore di guida.

Evidenze: `.impeccable/review/neural-sacl/diversity-stall-3298/report.json` e `actual-trace.json`.

## Modifica sperimentale

Il nuovo decoder aggiunge 6 caratteristiche artificiali a supporto compatto, ricavate da 516 valori effettivamente osservati: storia dei neuroni discendenti, memoria e precedenti uscite neurali. I 12 nuovi coefficienti motori vengono ottimizzati da ricompense realmente prodotte dalla simulazione. Il grafo biologico resta di 7721 nodi / 242486 connessioni; non sono 6 nuovi neuroni biologici.

I nuovi contributi sono esattamente zero nelle 3139 osservazioni iniziali protette, e il primo contesto attivo viene effettivamente raggiunto al controllo 3208. Questi indici servono a preparare e verificare l'esperimento, non diventano un interruttore temporale o una posizione letta dal controller. L'attivazione in esecuzione usa solo distanza fra vettori neurali.

Con tutti i nuovi coefficienti a zero, l'intera prova riproduce esattamente 3298,280493659503 m, punteggio −1069,1686353869754 e 392,4 s. Il prefisso di pratica viene raggiunto fisicamente e può essere riusato per la ricerca; non viene contato come nuova generazione completa o nuovo giro.

## Confronto verificato

| Misura | Campione iniziale | Nuovo decoder |
| --- | ---: | ---: |
| Avanzamento massimo sul circuito | 3298,280 m | 3519,668 m |
| Punteggio netto | −1069,169 | −891,625 |
| Tempo simulato alla fine della prova | 392,400 s | 464,683 s |
| Giri completati | 0 | 0 |
| Fine | Ferma / senza progresso | Troppo lenta / senza progresso |

Sono 128 candidati su 8 cicli di ricerca, con 16 candidati per ciclo e 4 processi CPU. I miglioramenti accettati sono ripetuti dal traguardo su due processi indipendenti. Il modello esportato è poi riprodotto in due ulteriori episodi nativi da zero stato fisico/neuronale, esattamente agli stessi risultati e senza sovrapposizione gas/freno.

Non ci sono candidati censurati nei 128 valutati. L'aiuto di ricerca conserva un limite diagnostico di 500 s per prova: non è il limite della normale app o della copia Windows nativa. Il campione scelto termina realmente prima di quel limite. La verifica nativa non lo usa e accetta solo una terminazione fisica completa.

È un aumento misurato dell'avanzamento e del punteggio, non una prova di migliore velocità, di un giro valido o di convergenza. La durata maggiore impone di non presentarlo come una soluzione completa. Il controller torna comunque a frenare eccessivamente più avanti.

## Modello esportato e compatibilità

File: `.impeccable/review/neural-sacl/grown-native-model/model.malecns-neural-grown.json`.

SHA256: `79e53b324ac7f5710ba6dfbf7c983f917e7fc9d2547447e36018cc117776bafa`.

È un modello numerico autonomo nel formato privato `grown-neuronal-context-v1`, non un salvataggio standard e non un `.malecns-learning-dev` della copia nativa precedente. Non contiene una sequenza di comandi, un percorso imposto, stati fisici ripristinati o esempi inventati. Richiede Node 24.19.0 e il nuovo lettore `work/neural-grown-model.cjs`. Non è stato caricato di nascosto nell'app aperta e non sono stati aggirati controlli di versione.

Per ripetere la verifica: `node work/verify-grown-native.cjs`.

Per verificare il formato: `node --test work/neural-grown-model.test.cjs` (2 test passati).

## Evidenze e limiti

- Ricerca completa: `.impeccable/review/neural-sacl/stall-neuronal-features-first/report.json`.
- Due episodi nativi: `.impeccable/review/neural-sacl/grown-native-model/verification.json`.
- Nessun giro completo, nessun confronto da zero fra modelli/circuiti, nessun risultato GPU o validazione neuroscientifica completa.
- Originale, vecchi modelli, salvataggi, copia Windows aperta, versione 5.6.0, tag, portable e installer conservati. Nessuna pubblicazione o nuovo commit.

## Integrazione successiva, separata —15 ottobre2026

La ricerca è proseguita con128 candidati senza ulteriore miglioramento, poi96 proposte coordinate hanno raggiunto3523,566304810903m, sempre0giri. Due ulteriori episodi nativi indipendenti riproducono il modello esportato. È stata aggiunta **una nuova copia Windows privata**, senza sostituire quella già aperta, che parte in pausa con16 auto ed esegue apprendimento effettivo dell'ultimo strato. Il suo file `.malecns-grown-dev` contiene tutto il modello ed è incompatibile con i formati precedenti.

Avvio, verifiche, esiti negativi e limiti: [APPRENDIMENTO-DECODER-ESTESO-DEV.md](APPRENDIMENTO-DECODER-ESTESO-DEV.md). La versione resta5.6.0; nessuna nuova release. L'obiettivo di completare i giri non è raggiunto.
