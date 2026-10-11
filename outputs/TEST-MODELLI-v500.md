# Test dei modelli: due giri e una generazione

App/save 5.0.0, funzione aggiunta il 9 ottobre 2026. Non è un nuovo modello.

Premi **Apri test modelli** nella barra superiore: apre **Test modelli ·
obiettivo 2 giri**, sopra la mappa, e porta il focus al pulsante di avvio.
Scegli circuito, popolazione, mutazione e velocità con i controlli normali;
quindi premi **Avvia V2 · V3 · V4 · V5**. Aprire il pannello non avvia il test.
Se è già in corso, il pulsante superiore ti riporta al comando di interruzione.
V2, V3, V4 e V5 partono da zero, in quest’ordine, con seed 7717 e un worker
ciascuno. Sono prove successive, non quattro popolazioni concorrenti. Le
impostazioni vengono bloccate durante il confronto; mappa e atlante restano
interattivi e mostrano il modello corrente.

Il test termina con successo per un modello solo quando **la stessa auto**
completa due giri validi con i checkpoint ordinati della simulazione e poi
**tutte le auto della sua generazione** diventano naturalmente inattive.
Una generazione conclusa per urti, stallo o zero giri non è un successo:
l’evoluzione ordinaria continua senza un comando “Evolvi ora”.

## Come leggere i risultati

- **Reale test**: secondi sul PC dal comando di avvio del modello fino al
  completamento, al limite o all’interruzione. Il caricamento del grafo è
  escluso; inizializzazione GPU e lavoro dell’interfaccia possono concorrere.
- **Simulato test**: somma dei tick fisici da 1/60 s, compresi i tentativi falliti.
  Non è ricavata moltiplicando il tempo reale per la velocità richiesta.
- **Generazioni concluse**: conteggio indipendente dallo storico limitato a 100
  righe. Il rapporto identifica anche la generazione del primo agente riuscito.
- **Giri max**: massimo di un singolo agente, non somma dei giri di più auto.
- **2 giri simulati**: somma dei due tempi sul giro dell’auto riuscita. Nel JSON
  sono presenti anche tempo reale al secondo giro e durata della sua generazione.

Il limite iniziale è **10 minuti reali per modello**. Imposta **0** per non
avere un limite, oppure interrompi manualmente. “Limite reale raggiunto” è
un risultato censurato, non un completamento né prova che il modello non
potrà imparare. Non aggiunge un limite alle normali generazioni simulate.

L’addestramento normale e i suoi buffer GPU restano separati e in pausa in
memoria. Alla fine vengono ripristinati e riprendono solo se erano già in corso.
Il test non carica campioni salvati, non scrive campioni automatici, non modifica
le preferenze e non consente interventi manuali sulla dinamica dell’auto.
I suoi risultati sono un rapporto JSON, **non** un file progressi.

V2/V3 usano la CPU; V4/V5 usano il backend ibrido esistente, con fallback CPU
se necessario. Il rapporto registra il backend effettivo. Una prova con un solo
seed e un solo circuito non è un confronto statistico della convergenza e non
garantisce che ogni modello raggiunga l’obiettivo. Fisica, ricompense, sinapsi,
ottimizzatore e regole dei salvataggi restano quelli dell’app 5.0.0.

Fonti verificabili dell’implementazione: `model-test.js`, il punto di osservazione
in `simulation.js`, `desktop/worker.cjs` e `tests/model-test.test.cjs`. Le misure
dell’app reale e le verifiche sono in `model-test-verification-v500` nel progetto;
non sono presentate come benchmark fino alla convergenza di tutti i modelli.

L’aggiornamento di accesso al test è distribuito in `dist-test-access-v500/`.
Il vecchio riquadro “Campione automatico e regole” è stato rimosso dalla UI,
insieme al solo comando “Riprendi campione”. L’autosalvataggio locale rimane
attivo; “Salva file…” e “Carica file…” restano i comandi per i file
condivisibili. Non sono stati cancellati campioni locali o file di salvataggio.
