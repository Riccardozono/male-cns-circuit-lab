# Confronto dei modelli nell’interfaccia — app 5.0.0

Aggiornamento esclusivamente di presentazione, 1 ottobre 2026. Sotto il
selettore **Modello / prove di verifica**, aprire **Differenze V2 · V3 · V4 · V5**.
La sezione è chiusa all’avvio e conserva il proprio stato quando si cambia
modello. Due tabelle evidenziano il modello effettivamente selezionato; anche
il caricamento di un file di progresso aggiorna l’indicazione.

## Valori e provenienza locale

| Modello | Neuroni anatomici | Connessioni dirette | Slot massimi per passo | Passaggi per comando | Neuroni nel decoder | Gruppi appresi | Parametri apprendibili |
|---|---:|---:|---:|---:|---:|---:|---:|
| V2 | 1.121 | 32.351 | Denso | 2 | 64 | 16 | 202 |
| V3 | 7.721 | 242.486 | Denso | 4 | 64 | 16 | 202 |
| V4 | 166.700 | 6.242.118 | 8.192 | 2 | 64 | 16 | 202 |
| V5 | 166.700 | 6.242.118 | 32.768 | 4 | 128 | 32 | 346 |

Fonti verificabili nel progetto:

- `legacy-models.js` e `data/connectome.json`: V2 ricostruito dal sottoinsieme
  V3, nucleo storico V3. Il V2 non è il file storico originale.
- `data/connectome-full.json` e relativo `.bin`: anatomia completa V4/V5.
- `model-profiles.js`: profilo V5, 32.768 slot, quattro passaggi, 128 letture
  discendenti reali, 32 gruppi di guadagno sinaptico.
- `simulation.js`: compilazione dei grafi, due passaggi V2 e quattro V3,
  28 sensori e massimo 100 auto; `neural-learning.js`: decoder e dimensioni
  dei parametri appresi, frequenza di comando neurale 10 Hz.
- `desktop/engine.cjs` e `desktop-runtime.js`: backend Windows CPU per V2/V3,
  ibrido GPU/CPU per V4/V5 con fallback CPU.

Il catalogo di presentazione `model-comparison.js` è verificato automaticamente
contro i grafi realmente compilati e i decoder di tutti i modelli nel test
`tests/model-comparison.test.cjs`. Il confronto non carica grafi aggiuntivi:
crea otto righe una volta e cambia soltanto testo e stato selezionato nel DOM.
Non riceve una simulazione né accede a optimizer, RNG, motori o worker.

Gli slot sono un limite di elaborazione sparsa per agente e passo: **non sono
neuroni biologici aggiunti e non tutti devono avere attività non nulla**.
I parametri apprendibili non coincidono con tutte le connessioni anatomiche.
Più capacità e più calcolo **non garantiscono** apprendimento più rapido.
Le differenze qui mostrate sono configurazioni, non misure comparative di
convergenza o prestazioni del PC. Il benchmark della precedente 5.0.0 rimane
documentato separatamente in `VERIFICA-v500.md`.

## Prove completate sul sorgente

- **250/250 test**, zero errori o test saltati:
  `test-results-model-ui-v500.tap` (245 precedenti + 5 per il confronto).
- **25 file fondamentali identici byte per byte** alla 5.0.0 già consegnata:
  anatomia, solver neurale, optimizer, fisica, ricompense, geometria,
  rendering, atlante, trasporto CPU/GPU e sistema dei progressi.
  `app.js` aggiunge soltanto la chiamata di presentazione nel riepilogo del modello.
  I precedenti portable e installer risultano intatti tramite SHA-256.
  Rapporto: `model-ui-core-verification-v500.json`.
- I file di progresso realmente prodotti dalla precedente 5.0.0 per V2,
  V3, V4 e V5 superano decodifica e validazione contro i grafi attuali,
  inclusi 100 agenti V4/V5 e due worker V2. Non sono file dell’utente.
- **33 verifiche native** in `model-comparison-finish-v500/model-comparison-smoke.json`:
  ogni modello, esattezza dei valori, selezione, nessuna duplicazione,
  mappa/zoom/atlante, tastiera e invariabilità dello stato fisico e di allenamento
  durante l’ispezione in pausa. Nessun errore di console.
- Una sola ispezione visiva combinata a **1540×980, 390×844 e mappa/atlante
  affiancati** nella cartella precedente: otto righe, nessun overflow né della
  pagina né delle tabelle, testo di spiegazione 12 px, dati 11,5 px, spazio
  interno 12 px. Nessuna correzione cosmetica necessaria.

Le prime prove hanno corretto esclusivamente il diagnostico: attesa del vero
avvio asincrono GPU e invio del tasto Invio con il carattere corrispondente.
Una finestra nascosta non può essere trattata come finestra OS in primo piano:
la prova usa il debugger Chromium dell’app senza mostrarla o sottrarre il focus.
Riferimenti API: [input Electron](https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent)
e [debugger Electron](https://www.electronjs.org/docs/latest/api/debugger).
Nessuna modifica al comportamento di apprendimento è stata necessaria.

## Pacchetto Windows e salvataggi

Nuovi portable e installer: `dist-model-ui-v500/`. Gli eseguibili precedenti
in `dist-model-v500/` restano disponibili. La versione dell’app e dei file resta
**5.0.0**, perché non cambia alcuna configurazione scientifica o formato di
progresso. Non viene reinstallata o chiusa l’app già aperta dall’utente.

Il rapporto conclusivo `model-ui-release-verification-v500.json` registra
separatamente i risultati ottenuti sul **portable finale**: confronto con GPU,
con fallback CPU, file di progresso tramite il livello nativo e importazione
dei file della precedente 5.0.0, corrispondenza SHA-256 sorgente/pacchetto,
firme Windows e integrità delle build precedenti. Per queste prove si usano
profili temporanei separati, non i progressi dell’utente.

L’installer è prodotto ma non installato automaticamente. Firma e stato dei
test finali devono essere letti nel rapporto conclusivo; la sola compilazione
del pacchetto non dimostra il funzionamento del suo eseguibile.
