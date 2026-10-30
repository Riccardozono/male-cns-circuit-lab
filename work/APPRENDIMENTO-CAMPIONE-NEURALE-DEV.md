# Campione neurale: copia Windows privata 5.6.0

La copia separata richiesta dall'autore parte **in pausa con 16 auto**, dal
campione V3/Monza verificato senza urto della famiglia compatibile con questa
copia. Il massimo rimane **100 auto**.
Non sostituisce portable, installer, vecchie copie di sviluppo o salvataggi.
Non è una nuova release: versione e tag pubblicati restano invariati.

La scelta «in pausa dal migliore verificato» è confermata. Il controllo
aggiuntivo `neural-chain-startup-contract.test.cjs` verifica il costruttore:
16 auto predefinite, nessun episodio o aggiornamento inventato, campione
coerente con il registro, possibilità di 100 auto e rifiuto di 101.
Non avvia finestre o episodi fisici e non sostituisce le prove UI sotto citate.

## Avvio

Aprire dalla cartella del progetto **Avvia-campione-neurale-dev.cmd**.
Richiede questa cartella completa con Electron e il runtime numerico locale
Node 24.19.0 già presenti. Non è un portable autonomo distribuibile.
Il profilo locale è `.impeccable/development-chain-training-profile`.

All'apertura viene controllato `neuronal-clean-champion.json`: modello,
rapporti, verifiche e runtime devono corrispondere ai rispettivi SHA-256.
Viene scelto il migliore verificato di questa famiglia, **non l'esperimento più
recente**. I decoder di ricerca incompatibili sono classificati separatamente
in `neuronal-verified-model-catalog.json`: non sostituiscono questa copia.
Una volta aperta, la prova conserva il proprio modello: un altro esperimento
non sostituisce in silenzio i pesi della finestra corrente.

Il modello iniziale attuale ha percorso 6.584,839 m e completato **un** giro
in 742,550 secondi simulati, circa 12 min 22,55 s. Si ferma poi per ritmo
insufficiente. Non ha ancora completato i due giri richiesti e non dimostra
apprendimento da zero o sugli altri modelli/circuiti.

## Cosa viene allenato realmente

- V3 conserva 7.721 nodi e 242.486 connessioni anatomiche MaleCNS; la dinamica
  neurale è artificiale, non una simulazione fisiologica completa.
- 28 sensori alimentano la rete; il decoder osserva 128 discendenti reali
  nel tempo. Quattro correzioni neurali sono aggiunte al decoder precedente.
- In questa copia vengono variati **due coefficienti nell'ultima correzione**.
  Encoder, guadagni sinaptici, decoder e correzioni precedenti restano congelati.
  Non sono due neuroni biologici aggiunti e non è l'allenamento di tutti i
  parametri della mosca.
- Ogni auto esegue dal traguardo i propri neuroni, ricordi e fisica; solo
  topologia e dati immutabili sono condivisi. Nessuna collisione tra auto.
- Soltanto la conclusione fisica di **tutta la popolazione** permette selezione,
  mutazione e registrazione della generazione. Ripartenze e prove interrotte
  non valgono come generazioni o episodi conclusi.
- Si separano punteggio, metri, giri validi e aggiornamenti. Un'auto schiantata
  più lontano può essere esplorazione, ma non sostituisce il campione senza urto.
- Nessuna traiettoria ideale, coordinata-obiettivo, cronometro o contatore dei
  giri entra come istruzione di guida. Il freno e il gas sono esclusivi.

Quattro processi CPU eseguono grafo e fisica nel runtime verificato. La RTX
può disegnare il 3D, ma **questa ricerca evolutiva non è un nuovo trainer CUDA**.
Non si promette un fattore di accelerazione non misurato. La velocità richiesta
0,5×–30× non cambia il passo fisico; quella ottenuta dipende dal carico del PC.

## Salvataggio condivisibile, ma incompatibile con gli altri formati

**Salva apprendimento…** crea un file **.malecns-chain-dev** con decoder
numerico completo, coefficienti, archivio, RNG e storico. Può essere condiviso
con la **stessa copia sperimentale e le stesse sorgenti/runtime**. Il solo
numero 5.6.0 non garantisce compatibilità.

**Carica apprendimento…** controlla formato, checksum e identità del motore,
che include dipendenze neurali e fisiche, modello della vettura, terreno,
runtime e interfaccia. Una ripetizione fisica completa verifica anche il
modello incorporato: può richiedere circa un minuto. Solo dopo la verifica e
la conferma viene interrotta la prova corrente, senza valutarla. Si riparte
**in pausa dal traguardo della generazione salvata**, non a metà giro.

I file `.malecns-save`, `.malecns-learning-dev`, `.malecns-grown-dev` e gli
altri protocolli restano separati. Non rinominare l'estensione per aggirare i
controlli. Un checksum rileva alterazioni, non autentica l'autore del file.

## Verifiche concluse — 15 ottobre 2026

Passati cinque test del nuovo adattatore e del formato: scelta del campione,
salvataggio/ripristino dei dati, rifiuti, mutazione/RNG e 100 auto indipendenti.
La verifica Windows ha completato **due generazioni effettive da 16 auto**,
per **32 episodi e due aggiornamenti**. La prima ripete il campione; la seconda
valuta 16 coppie di coefficienti distinte, realmente proposte dalla mutazione.
Il campione protetto riproduce l'intera traccia nativa indipendente, non solo
gli stessi metri o lo stesso punteggio.

La seconda generazione non ha migliorato il campione senza urto: conserva
6.584,839 m, punteggio 4.052,109 e un giro. La maggiore distanza della popolazione,
6.595,292 m, termina con un urto e **non** viene promossa a campione. Nessun
agente ha completato due giri. Gli aggiornamenti sono reali, ma questi due
aggiornamenti non dimostrano migliore guida o convergenza.

Il primo tentativo ha superato 16 controlli, compresa la generazione completa,
poi il solo test si è fermato dopo 45 secondi di attesa del caricamento. Il
nuovo caricamento esegue volutamente un replay fisico completo. Rapporto,
sorgente del test e salvataggio effettivo sono conservati in
`chain-training-ui-first`; **quel tentativo non è etichettato come riuscito**.

Un ingresso diagnostico separato sostituisce solo il test, non sorgenti di app,
fisica, decoder, UI o validazione dei file. Con attesa coerente con il replay
completo recupera il salvataggio reale, esegue la seconda generazione e supera
18 controlli. I due caricamenti durano rispettivamente **46,71 e 50,94 secondi**.
Pesi, archivio, RNG e storico ritornano esatti. Un file con checksum valido ma
motore incompatibile viene rifiutato prima di interrompere la prova corrente.
Reset, annullamento dei dialoghi in pausa e nuove popolazioni non inventano
episodi conclusi. Non sono stati sostituiti i controlli di compatibilità.

La verifica visiva conclusiva supera altri sette controlli: tema chiaro, scuro,
prima persona/atlante, finestre 1500, 980 e 740 px, nessun overflow di pagina,
nessun errore del renderer e nessun passo fisico durante i cambi di vista.
Le prime catture del test di recupero mostravano fotogrammi precedenti e non
sono usate per provare il tema o la camera. La conferma attende stato DOM e
fotogrammi del compositore, conservando anche le catture precedenti. Il modello
Porsche resta asincrono: la prima cattura a freddo può mostrare il modello
geometrico di attesa, non una sostituzione dell'asset originale.

Evidenze private, sotto `.impeccable/review/neural-sacl/`:

- `chain-training-ui-first/failed.json` e `smoke-source-at-timeout.cjs`:
  tentativo parziale conservato, prima generazione effettiva;
- `chain-training-ui-recovered/verification.json`: rapporto concluso positivo,
  18 controlli e risultati individuali della seconda generazione;
- `chain-training-ui-recovered/roundtrip-generation3.malecns-chain-dev`:
  file effettivo con 32 episodi, non un salvataggio standard;
- `chain-training-ui-visual-confirmation/verification.json` e quattro PNG:
  stato DOM delle viste, capture reali e controllo della pausa;
- `neuronal-clean-champion.json`: migliore iniziale verificato e sue prove.

I dialoghi nativi sono verificati attraverso i veri handler e file, sostituendo
solo i risultati del selettore/conferma dentro il test. Non è una verifica
visiva del selettore file di Windows. Le verifiche non sostituiscono quelle
di apprendimento ancora necessarie sugli altri modelli/circuiti e da zero.

Il design approvato, i temi, l'atlante e le camere 2D/3D, inseguimento,
panoramica e prima persona sono riutilizzati. Impeccable è usato per rendere
chiare le sole etichette del nuovo protocollo, non per un altro redesign.

## Limite attuale e prossimo correttore, non ancora installato

Questa copia allena solo gli ultimi due coefficienti: la parte precedente del
controller è già allenata e resta congelata. Le auto possono quindi coincidere
per gran parte del primo giro, fino all'attivazione della correzione tardiva.
Non vengono riprodotti comandi registrati: ognuna esegue sensori, rete e fisica.
Non equivale però a riaddestrare tutto il cervello dal via.

Un'altra famiglia sperimentale aggiunge una correzione dipendente dall'attività
neurale corrente, con otto proiezioni non supervisionate di 256 stati reali e
18 coefficienti. Non usa colonne di azione, progresso, tempo o premi come
ingressi della proiezione. Quattro test e una verifica fisica del correttore
nullo sono passati: prefisso realmente raggiunto, suffisso ripristinato,
episodio completo e caricamento nativo separato riproducono il genitore.
Rapporto: `neuronal-clean-6584-statehead-preflight/report.json`.
Successivamente sono stati allenati: una ricerca da **256 candidati reali**
ha prodotto **6.590,792 m e punteggio 4.057,078**, cioè **+5,953 m** rispetto al
campione compatibile con questa finestra. I 18 coefficienti sono cambiati;
due prove complete e due caricamenti nativi indipendenti riproducono l'intera
traccia dei comandi. Rimangono **un solo giro**, 742,550 secondi simulati, e
arresto per ritmo insufficiente. Non è una soluzione dei due giri.

Un altro esperimento da256candidati, con finestra neurale anticipata e1024stati
anziché256, non migliora nemmeno il genitore da6.584,839m. Il catalogo protegge
il risultato da6.590,792m e non lo sostituisce con questo esito più recente.

**Questa famiglia rimane separata e non è installata nella finestra Windows
già aperta.** Il suo modello numerico non è un file di progresso
`.malecns-chain-dev` e non deve essere rinominato per aggirare i controlli.
Dettagli, prove e limiti: [APPRENDIMENTO-STATO-NEURALE-DEV.md](APPRENDIMENTO-STATO-NEURALE-DEV.md).
