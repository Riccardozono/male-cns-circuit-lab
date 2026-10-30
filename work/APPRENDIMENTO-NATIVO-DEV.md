# Copia Windows di apprendimento nativo — 5.6.0 sperimentale

Per avviarla, fai doppio clic su **Avvia-apprendimento-nativo-dev.cmd** nella radice del progetto. Serve questa cartella completa, inclusi Electron, runtime Node 24.19.0 e modello numerico privato. Non è un nuovo portable o installer e non sostituisce l'app distribuita.

## Che cosa allena

Questo prototipo è limitato a **V3 su Monza**, partendo da un campione già allenato. Non è un confronto da zero fra tutti i modelli. Mantiene il grafo reale di 7.721 neuroni / 242.486 connessioni, fisica, sensori e ricompense della precedente prova privata R5. Il decoder usa attività neurale corrente e memoria causale; non riceve una posizione prescritta, una traiettoria o comandi registrati.

L'allenamento corrente aggiorna **10 coefficienti del decoder aggiuntivo**, sopra i pesi già appresi e mantenuti fissi. Questi coefficienti e le quattro direzioni di lettura artificiale non sono nuovi neuroni biologici. Non viene simulata la fisiologia completa della mosca.

Quattro processi CPU Node 24.19.0 calcolano prove indipendenti, condividendo solo dati del modello e topologia all'interno di ciascun processo. Ogni auto conserva fisica, attività neurale e memoria proprie. Le auto partono dal traguardo, senza collisioni tra auto. La GPU non esegue questo ottimizzatore; la vista 3D è separata dal calcolo dell'apprendimento.

## Comandi

- **Riprendi / Pausa:** avvia o ferma il motore fisico, non una riproduzione di azioni.
- **Popolazione:** da 4 a 100 auto; valore iniziale 16. Cambiarla interrompe le prove correnti senza valutarle, conserva archivio e storico, propone una nuova popolazione e torna in pausa al traguardo.
- **Mutazione:** intensità nella prossima generazione; non modifica i pesi delle auto in corso. A 0% ripropone copie del campione protetto.
- **Velocità:** richiesta da 0,5× a 30×. La velocità effettiva dipende dal carico e dalla popolazione; il passo della fisica resta fisso.
- **Riparti al traguardo:** conserva le generazioni concluse e l'archivio, esclude le prove interrotte, propone nuovi candidati e torna in pausa. Non equivale a cancellare tutto l'apprendimento.
- **Generazione successiva:** automatica, soltanto dopo che tutta la popolazione ha effettivamente concluso per le regole fisiche oppure per due giri validi per auto. La fine di una generazione non dimostra che le auto abbiano completato due giri.

Mappa 2D/3D, prima persona, inseguimento, atlante neurale, selezione automatica e tema chiaro/scuro restano osservatori. Non fanno avanzare una prova in pausa. Modelli, altri circuiti, confronto generale e interventi manuali sulla trasmissione non sono abilitati in questa copia.

## File condivisibile privato

**Salva apprendimento…** crea un `.malecns-learning-dev` con modello numerico, pesi della popolazione, archivio, stato del generatore casuale, impostazioni e storico. **Carica apprendimento…** verifica checksum, runtime, modello e impronta del motore. Richiede la stessa copia sperimentale: non basta che un'altra app mostri `5.6.0`.

Al caricamento le auto **ripartono fisicamente dal traguardo, in pausa**, con i pesi della generazione salvata. Non vengono salvati posizione a metà giro, azioni preregistrate o checkpoint di pratica. Lo storico importato è quello registrato nel file, non una nuova prova.

Il formato `.malecns-save` della release non è compatibile e non viene aggirato. Il file originale `Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save` resta intatto. Un checksum verifica integrità e compatibilità, non autentica chi ha creato o modificato un file.

## Risultati ed evidenze

- [Verifica Windows reale](../.impeccable/review/neural-sacl/native-training-ui/verification.json): 21 controlli passati, fino a 100 auto che eseguono davvero fisica e neuroni; quattro episodi completano una popolazione, producono una generazione registrata e nuovi pesi. Salvataggio/caricamento conserva esattamente pesi, archivio, RNG e storico. Nessun errore del renderer e nessun overflow della pagina a 980 e 740 px. I ritorni dei selettori file sono sostituiti solo nel test: l'interazione visiva con i dialoghi nativi non è verificata.
- `node --test work/neural-native-arena.test.cjs`: due test passati; due auto con topologia condivisa mantengono la traiettoria completa identica alla prova singola, e 100 auto hanno stati indipendenti.
- `node --test work/neural-native-save.test.cjs`: quattro test passati, comprendenti formati errati/manomessi/incompatibili, esclusione di posizioni/azioni e confronto dei tempi senza accumulare artificialmente penalità.
- `npm test`: 395 test della normale app passati il 15 ottobre 2026. Non sono una prova di convergenza dell'apprendimento.

Il campione congelato usato da questa prima copia nativa percorre **2.982,192 m**, con **0 giri**, e termina per ritmo insufficiente. La ricerca separata successiva, ora conclusa, ha verificato due volte un campione da **3.298,280 m**, anch'esso con **0 giri**, dopo altri 4.800 candidati. Quel campione non è ancora il modello caricato da questa copia nativa.

Non posso confermare che il problema dell'apprendimento sia completamente risolto: non ci sono ancora due giri verificati, convergenza da zero, generalizzazione agli altri modelli/circuiti o robustezza a runtime diversi. La nuova copia rende reale e osservabile il ciclo di allenamento; non presenta un replay come apprendimento.

La revisione indipendente della UI non è stata eseguita: il servizio del revisore ha restituito un limite d'uso. Il controllo locale sostitutivo Impeccable ha corretto l'identità DEV e la leggibilità della mutazione, mantenendo il sistema approvato. Rimane una nota visiva a 740 px: il badge privato e il modello iniziale sono nelle impostazioni collassate, non nel primo viewport del corpo pagina. Il [verdetto locale](../.impeccable/review/neural-sacl/native-training-ui/finish-verdict.md) è `fix` su quel punto, non un'approvazione visiva completa.

Nessuna nuova versione, commit, tag o release pubblicata da questo lavoro. Numero `5.6.0`, tag distribuito e portable/installer esistenti sono conservati; l'originale e i due binari sono stati ricontrollati tramite SHA-256.
