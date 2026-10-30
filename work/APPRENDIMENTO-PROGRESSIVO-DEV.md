# Ricerca progressiva privata — V3 / Monza

Questo lavoro continua l'obiettivo di migliorare l'apprendimento. **Non sostituisce la copia Windows aperta**, non cambia versione, salvataggi o distribuzioni e non dichiara risolto l'obiettivo dei due giri.

## Crescita automatica da ricompense reali

`train_progressive_context.py` parte dal modello numerico già verificato a 3652,142531920211 m. Per ciascun tentativo:

1. Ripete realmente l'intera prova del modello precedente e ricava sei nuovi contesti artificiali da 516 valori neurali osservati. Il grafo biologico resta di 7721 nodi / 242486 connessioni.
2. Verifica che tutti i nuovi pesi a zero riproducano **ogni comando, avanzamento e istante simulato** del modello precedente, tramite SHA256 della sequenza completa. Anche il reset di pratica deve coincidere nel risultato fisico con la partenza completa.
3. Allena fino a 16 candidati per ciclo usando quattro processi CPU, piccole e grandi mutazioni e ricompense realmente prodotte. Il campione pulito rimane protetto. Solo i 12 nuovi coefficienti cambiano.
4. Ferma la ricerca locale dopo almeno quattro cicli e tre cicli senza miglioramento, oppure al limite di ricerca richiesto. Questo è un limite dei tentativi di ricerca, **non un tempo massimo della simulazione dell'app**.
5. Prima di congelare e aggiungere il risultato al modello, richiede due replay completi indipendenti e poi due processi nativi indipendenti del file esportato. Devono coincidere anche le intere sequenze di comandi. Prove censurate o con pedali sovrapposti non possono essere promosse.
6. Se non migliora, non esporta uno strato vuoto: conserva il campione e prova un diverso tipo di contesto, prima con memoria e poi a supporto compatto. Dopo due tentativi negativi può allargare la finestra di osservazioni usata per la preparazione. Queste scelte appartengono alla ricerca, non sono comandi di guida basati sul punto della pista.

La preparazione usa l'ordine delle osservazioni per proteggere il prefisso di addestramento. Durante la guida, il decoder legge soltanto attività e memorie neurali: non posizione, tempo, waypoint o azioni di un pilota-esempio. Le ripartenze da un prefisso fisico realmente raggiunto velocizzano la ricerca, ma **non vengono contate come nuove generazioni complete o giri**.

Il file `run.json` conserva ogni ciclo concluso, il modello migliore e gli hash dei rapporti. I checkpoint mantengono archivio, RNG JavaScript e NumPy. La ripresa rifiuta un processo precedente ancora presente e sorgenti incompatibili; un timeout di osservazione non autorizza una nuova esecuzione.

## Recupero tecnico registrato

Il primo avvio ha completato e verificato il ciclo 1, poi si è fermato perché il preparatore emetteva `GROWTH_PREPARED` prima del JSON e il lettore si aspettava JSON puro. È stato corretto il lettore; dopo l'uscita terminale del vecchio processo la ricerca è ripresa dal ciclo 2. `sourceRevisions` registra esplicitamente vecchi e nuovi hash di orchestrazione e trasporto. I modelli, i rapporti conclusi e i sorgenti di inferenza/fisica precedenti non sono stati riscritti.

È stata corretta anche la chiusura dei flussi dei processi Python/Node, verificandola con `ResourceWarning` trattato come errore. Due test verificano ripresa esatta di archivio/RNG, flussi chiusi e riconoscimento di un checkpoint già fermo per ristagno; due ulteriori test verificano le memorie del modello precedente e gli ingressi neurali limitati.

## Diagnostica del freno: che cosa dimostra

- `longitudinal-authority-audit/report.json`: sul modello da 3652 m, negli ultimi dieci secondi i 101 comandi osservati non sono bloccati dal limite teorico del decoder. Con il massimo residuo neurale sarebbe matematicamente raggiungibile un comando longitudinale positivo medio di circa 0,954. Non è una prova di una traiettoria controfattuale o di maggiore accelerazione fisica.
- `residual-saturation/report.json`: sul successivo modello da 3680 m, negli ultimi dieci secondi non risultano residui saturi entro un milionesimo da ±1. Il residuo longitudinale finale è circa −0,764. Non è quindi confermata, in quel tratto, l'ipotesi che la saturazione numerica impedisca di rilasciare il freno.

Questi controlli non provano la causa di ogni errore. Evitano però di dichiarare guasto il freno fisico o aumentare arbitrariamente la forza dei comandi senza evidenza.

## Confronto sperimentale con rappresentazione più variabile

`prepare_projected_frontier.py` prepara otto assi matematici dalle ultime 992 osservazioni neurali reali del modello da 3680 m. Spiegano circa il 98,866% della varianza di quel campione: **non è una percentuale di precisione di guida**, né una verifica su traiettorie nuove, né otto neuroni biologici aggiunti.

Il nuovo decoder sperimentale `projected-neuronal-frontier-v3` mantiene un gate causale neurale che protegge il prefisso, ma condiziona continuamente sterzo e comando longitudinale sulle otto proiezioni correnti. I 18 coefficienti vengono scelti dalle ricompense. Tutti i modelli precedenti restano congelati. Ha un formato numerico privato distinto; non viene importato silenziosamente nella copia Windows o nei salvataggi precedenti.

Tre test del nuovo formato e delle proiezioni sono passati. La ricerca proiettata ha atteso la conclusione della crescita progressiva, per non sommare due gruppi di quattro simulatori contemporaneamente, ed è terminata con due replay nativi identici dell'intera sequenza di comandi. È seguito un confronto con mutazioni a blocchi: metà delle proposte cambia solo i coefficienti longitudinali, altre lo sterzo e altre entrambi, con coppie di perturbazioni opposte. I coefficienti del canale non coinvolto restano quelli del genitore. Sono proposte di pesi, non comandi di frenata/sterzo prestabiliti; le ricompense reali decidono quali conservare. Due test specifici verificano canali invariati, campione protetto, limiti numerici e ripetibilità del RNG.

## Esiti conclusi — 15 ottobre 2026

| Ricerca | Valutazioni di candidati | Avanzamento migliore | Punteggio | Durata simulata | Giri |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sei cicli di crescita a contesti | 464 | 3712,297 m | −713,927 | 504,767 s | 0 |
| Otto proiezioni neurali correnti | 128 | 3772,468 m | −644,058 | 496,750 s | 0 |
| Mutazioni a blocchi, dal campione proiettato | 128 | 3803,070 m | −604,210 | 504,767 s | 0 |

Totale: **720 valutazioni**, nessuna censurata. Le valutazioni comprendono anche campioni protetti riprovati: non sono720 modelli distinti o720 generazioni dell'app. I tentativi negativi dei cicli3,5,6 sono conservati nei rapporti.

Ogni modello finale promosso è stato riprodotto in due processi nativi indipendenti. Il modello proiettato con mutazioni a blocchi ha SHA256 `3ea1e1683c29e0dbcd4673f130f7c05f0675b53519a4c6601708dd974ac31df1`; i due replay hanno lo stesso SHA256 dell'intera sequenza comando/avanzamento/tempo, `02d0cf438e6479b73e262f80ff779ccc57c31f2ed71c0c8f19d58c73f3136136`, e zero comandi di gas/freno sovrapposti.

L'aumento dei metri è verificato, ma **nessun giro è completato**. Non dimostra convergenza, maggiore velocità di apprendimento in generale o validità su altri modelli, piste e seed. La ricerca proiettata e il confronto a blocchi partono da campioni diversi in successione: non sono un esperimento controllato che isoli l'effetto causale della sola mutazione a blocchi.

## File utilizzabile nella copia Windows già esistente

È stato esportato un nuovo file `progressive-native-save/Circuit-Lab-5.6.0-v3-monza-progressive-3712.malecns-grown-dev`, nel formato e fingerprint del motore privato corrente. Comprende il modello a3712m, ancora della famiglia grown supportata. È stato verificato caricandolo in un coordinatore reale separato:16 auto, in pausa al traguardo, generazione1, archivio/RNG/pesi esatti e zero episodi o generazioni della ricerca spacciati per storico dell'app.

Si può scegliere manualmente con «Carica apprendimento…» nella copia «decoder esteso DEV», dopo aver salvato i propri progressi correnti. Non è stato caricato automaticamente nella finestra aperta. La visualizzazione del picker nativo non è stata testata in questa esportazione; sono stati verificati formato, modello incorporato, caricamento del motore e stato fisico iniziale.

Il modello da3803m usa invece il nuovo lettore proiettato e non è compatibile con la copia «decoder esteso DEV». Successivamente è stato integrato in **un'altra copia Windows separata**, avviabile con `Avvia-proiezioni-neurali-dev.cmd`: 16 auto iniziali in pausa, quattro processi CPU, stesso frontend e versione 5.6.0. Non è stato importato nella finestra precedente. Formato, compatibilità ed evidenze sono spiegati in [APPRENDIMENTO-PROIEZIONI-DEV.md](APPRENDIMENTO-PROIEZIONI-DEV.md). Due generazioni reali da16 auto hanno verificato 32 episodi e due aggiornamenti, ma non hanno migliorato il campione pulito né completato un giro. Originale, sorgenti delle copie aperte, portable e installer rimangono preservati.

## Dove controllare gli esiti effettivi

Tutti i percorsi seguenti sono privati, sotto `.impeccable/review/neural-sacl/`:

- `progressive-3652-first/run.json`: stato complessivo, cicli conclusi e miglior modello verificato.
- `progressive-3652-first/stage-XX/report.json`: candidati, esiti negativi, replay completi e verifica nativa del singolo ciclo.
- `projected-frontier-3680/progress.json`: ricerca corrente del confronto proiettato, non risultato finale.
- `projected-frontier-3680/report.json`: esiste solo dopo le verifiche native conclusive; contiene separatamente il campo `improved`.
- `projected-block-3680/report.json`: confronto concluso a blocchi, modello da3803m e due replay nativi.
- `progressive-native-save/verification.json`: file condivisibile compatibile da3712m, ripristino reale di16 auto in pausa e fingerprint.
- `progressive-research-verification/report.json`: riconcilia rapporti immutabili,720 valutazioni, hash dei sorgenti e replay nativi; non è una nuova prova di guida.
- `grown-training-ui/integrity.json`: verifica separata della copia Windows conservata e degli hash del salvataggio originale e dei due binari distribuiti.

Il perimetro ancora aperto comprende giri validi, due giri per prova, apprendimento degli altri modelli/circuiti e convergenza. Nessuno di questi viene sostituito dal solo aumento del punteggio o dei metri percorsi.
