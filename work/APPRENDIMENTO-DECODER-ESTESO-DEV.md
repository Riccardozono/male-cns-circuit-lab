# App Windows privata — decoder neurale esteso

La copia parte **in pausa, con16 auto**, dal miglior modello verificato di questa serie di prove V3/Monza. Avvio locale: `Avvia-crescita-neurale-dev.cmd` nella cartella del progetto. Richiede i file del progetto, Electron locale e il runtime numerico privato Node24.19.0: non è un nuovo portable o installer.

Versione app5.6.0 invariata. Profilo separato `.impeccable/development-grown-training-profile`; launcher e sorgenti separati dalla copia nativa precedente. Non chiude l'app già aperta e non modifica il salvataggio originale.

## Che cosa apprende

Sensori della vettura → attività del grafo MaleCNS → storia di128 neuroni discendenti, memorie artificiali e precedenti uscite neurali → decoder appreso → sterzo e comando longitudinale, separato in gas o freno.

Il grafo resta di7721 nodi biologici e242486 connessioni. Il decoder predefinito ha due strati aggiuntivi di contesto artificiale: **si aggiornano12 coefficienti dell'ultimo strato**, mantenendo congelati quelli precedenti. L'ultimo strato conserva il massimo delle attivazioni di sei contesti neurali già osservati; questa memoria causale viene azzerata a ogni partenza. Non legge posizione o tempo e non impone comandi. La revisione del decoder è dichiarata `grown-neuronal-context-v2`. Non sono nuovi neuroni biologici e non è una simulazione fisiologica completa della mosca. I coefficienti sono selezionati usando ricompense realmente ottenute dalle auto, non seguendo una traiettoria imposta.

La popolazione contiene il campione pulito protetto e mutazioni sia piccole sia ampie. Il cursore modifica l'intensità delle proposte della generazione successiva. Zero mutazione conserva i vettori del campione. La possibilità di esplorare pesi più lontani non dimostra, da sola, convergenza o apprendimento più rapido.

## Controlli

- **Riprendi / Pausa:** avvia o ferma gli effettivi passi fisici e neurali.
- **Popolazione:** da4 a100 vetture con cervello, memoria e fisica indipendenti; nessuna collisione fra auto. Cambiare popolazione interrompe le prove correnti senza premiarle e riparte in pausa.
- **Mutazione:** vale dalla prossima popolazione; non cambia i pesi delle auto già in pista.
- **Velocità richiesta:**0,5×–30×. È una richiesta; la velocità effettiva dipende dal carico del PC. Il passo fisico resta uguale.
- **Riparti al traguardo:** conserva archivio e storico delle generazioni concluse, scarta le prove interrotte senza valutarle e propone nuovi pesi in pausa.

Una generazione viene registrata **solo dopo la conclusione fisica di tutte le vetture**. Due giri terminano la prova di una vettura, ma anche urti, uscita pista o stallo possono terminarla prima: «generazione conclusa» non significa «due giri completati». Non è introdotto un tempo massimo di simulazione nell'app.

Questa copia privata allena soltanto **V3 su Monza** con quattro processi CPU e runtime numerico fissato. Gli altri modelli/circuiti e l'evoluzione manuale sono disabilitati esplicitamente. Mappe2D/3D, prima persona, inseguimento, panoramica, atlante, selezione auto e temi rimangono osservatori della simulazione. Non è un risultato di apprendimento sulla GPU.

## File condivisibile separato

**Salva apprendimento…** produce un `.malecns-grown-dev`: include l'intero modello numerico, pesi della popolazione, archivio, stato RNG e storico. Il motore verifica versione, formato, checksum, dimensioni e identità dei sorgenti. Il caricamento usa il modello contenuto nel file, anche se diverso da quello predefinito ma compatibile con lo stesso motore; il modello viene controllato nel runtime numerico prima di interrompere la prova corrente.

Al caricamento si riparte **in pausa dal traguardo della generazione salvata**. Non è ripristinata la posizione a metà giro. I formati standard `.malecns-save` e precedente `.malecns-learning-dev` vengono rifiutati, non convertiti silenziosamente. Il tuo originale rimane intatto. Condividere il file non rende automaticamente compatibile un'altra versione del motore.

## Risultati realmente verificati

| Prova V3/Monza | Avanzamento | Punteggio netto | Durata simulata | Giri |
| --- | ---: | ---: | ---: | ---: |
| Primo strato aggiunto |3519,668m |−891,625 |464,683s |0 |
| Secondo strato,128 candidati generici |3519,668m |−891,625 |464,683s |0 |
| Secondo strato,96 proposte a singolo coefficiente |3523,566m |−887,587 |464,683s |0 |
| Secondo strato con memoria causale,128 candidati |3652,143m |−768,683 |496,750s |0 |

Il secondo confronto generico è negativo: non ha migliorato il campione. Le proposte coordinate hanno aggiunto circa3,90m. La memoria causale ha poi migliorato di128,58m il risultato coordinato, ma richiede32,07s simulati in più: non è una prova di guida o apprendimento più veloce, e non risolve il blocco. Il nuovo modello è stato riprodotto in **due ulteriori episodi nativi indipendenti dal traguardo**, con gli stessi risultati e nessun passo di gas/freno simultanei. Non posso confermare che riesca a completare un giro o che converga su altri circuiti.

Evidenze locali:

- `.impeccable/review/neural-sacl/growth-3519-stage-2/report.json`:128 candidati, zero censurati, nessun miglioramento.
- `.impeccable/review/neural-sacl/growth-3519-coordinates/report.json`:96 candidati e ripetizioni complete indipendenti.
- `.impeccable/review/neural-sacl/grown-coordinates-native/verification.json`: due episodi nativi completi del campione coordinato precedente, conservato.
- `.impeccable/review/neural-sacl/retained-context-3519-first/report.json`:128 candidati, nessuno censurato, memoria guidata solo dalle osservazioni neurali.
- `.impeccable/review/neural-sacl/retained-native-model/verification.json`: due episodi nativi completi del campione attuale; modello SHA256 `a12950ffeb33132547ebd6d00479ef8f65711ea99aa776e156ee3b3d7d235f7f`.
- `.impeccable/review/neural-sacl/grown-training-ui/verification.json`:23 controlli Windows passati, comprese100 auto effettivamente in movimento, una generazione completa di4 auto, mutazione dei pesi, spiegazione coerente dei coefficienti, esclusione delle prove interrotte e salvataggio/caricamento esatto.
- `.impeccable/review/neural-sacl/grown-training-ui/full-page/verification.json`: acquisizioni integrali della vera app con16 auto in pausa, temi chiaro/scuro, prima persona e larghezze1500/980/740px; nessun overflow di pagina rilevato.

Test locali del modello, file, mutazioni e memoria:8 passati. Test dell'arena del modello con memoria:2 passati, comprese due traiettorie complete bit-per-bit identiche all'agente singolo e100 stati fisici/neurali distinti; anche i due test del modello coordinato precedente sono passati. La regressione dell'app principale è stata rieseguita:395 test passati. I selettori nativi di file usano ritorni sostituiti soltanto nel test automatico: non è verificata l'interazione visuale con quei dialoghi.

`.impeccable/review/neural-sacl/grown-training-ui/integrity.json` riconcilia modello corrente, due replay nativi,23 controlli Windows, sorgenti correnti e file di salvataggio con il motore completo. Verifica inoltre che i sorgenti della copia nativa precedente, il salvataggio originale e i due binari distribuiti abbiano ancora gli hash attesi. Non è una nuova prova di guida né una certificazione di convergenza.

La revisione finale dell'interfaccia e il confronto con il sistema visuale sono conservati nella stessa cartella di verifica; non costituiscono una certificazione dell'apprendimento. Release, tag, portable, installer e sorgenti della copia precedente sono preservati. Nessuna pubblicazione o incremento di versione.
