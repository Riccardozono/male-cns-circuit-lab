# UI e atlante 3D — Windows 4.4.1

Verifica: 30 settembre 2026, Europe/Rome. Aggiornamento dell’interfaccia e del rendering, non dell’algoritmo di apprendimento. La documentazione di apprendimento 4.4.0 resta valida come descrizione del motore invariato; questo documento descrive l’interfaccia 4.4.1.

## Avvio

Eseguibili nella cartella `dist-ui-v441/` del progetto:

- `MAL-E-CNS-Circuit-Lab-portable-4.4.1-x64.exe`: avvio diretto, senza Node.js o installazione.
- `MAL-E-CNS-Circuit-Lab-setup-4.4.1-x64.exe`: installer NSIS generato; non installato automaticamente.

Entrambi risultano `NotSigned` al controllo PowerShell `Get-AuthenticodeSignature`. Non è stata modificata un’installazione esistente; le versioni precedenti sono conservate. Per utilizzare la nuova UI occorre avviare l’eseguibile 4.4.1, non una vecchia copia già aperta.

## Uso della nuova interfaccia

- **Circuito / Cervello 3D / Affiancati:** scelta diretta dell’area di lavoro. La mappa resta interattiva: clic sull’auto, selettore agente, camera completa o in inseguimento e sensori reali ai bordi.
- **Interfaccia più compatta:** controlli principali e gas/freno/sterzo visibili; spiegazioni, punteggio dettagliato e sensori fisici nei pannelli espandibili. Il numero di neuroni in intestazione segue il modello realmente selezionato.
- **Atlante:** prospettiva, profondità, rotazione, zoom, spostamento e assi del dataset. XY/YZ/XZ sono viste sui piani delle coordinate, non regioni anatomiche inferite.
- **Filtri:** intero atlante, attività non nulla, ingressi sensoriali reali, 64 neuroni di lettura motoria appresa o neuroni annotati come discendenti.
- **Selezione:** clic su un punto oppure ricerca del body ID; il dettaglio mostra ID, tipo se disponibile, classe, lato, attività e XYZ raw reali. Un ID sconosciuto o privo di coordinate produce un messaggio esplicito.
- **Tastiera:** frecce per ruotare, +/− per zoom, Home per centrare, Escape per deselezionare. Maiusc + trascinamento sposta la vista.
- **Congela attività:** conserva il campione dell’atlante senza fermare la simulazione. Cambiare auto osservata aggiorna il campione e disattiva il congelamento.
- **Ricerca e qualità:** 6.000 / 18.000 / 24.000 punti di base, con i punti di lettura richiesti aggiunti; 0–600 contributi, colori per classe o attività. Sono budget grafici, non limiti al cervello o parametri dell’IA.

## Dati e leggerezza

Il renderer separato [brain-atlas.js](brain-atlas.js) usa WebGL 2, dati dei punti in batch e aggiornamento della lettura al massimo ogni 300 ms; ridisegna quando cambiano vista o dati. La modalità senza WebGL usa Canvas 2D e parte dal budget leggero. Non sono aggiunti bloom, ombre di post-processing, librerie 3D esterne o immagini decorative.

V4 contiene 166.700 neuroni. L’atlante trova **139.662 coordinate somatiche valide**; i **27.038 neuroni senza coordinate** non vengono più posizionati artificialmente. Sono esclusi solo dal disegno, non dal grafo. La vista bilanciata mostra 18.055 punti, inclusi i punti di lettura obbligatori. Le connessioni sono un campione entro il filtro dai 256 sorgenti con attività più forte; con un neurone selezionato vengono mostrati soltanto contributi adiacenti.

L’attività a tassi e i contributi visualizzati sono artificiali, non segnali biologici misurati; i punti rappresentano somaLocation, non morfologie cellulari. Lo schermo distingue attività |a| > 0,002 dagli slot del solver. Il solver V4 resta sparso, con budget 8.192: questa release non aggiorna contemporaneamente tutti i 166.700 neuroni.

## Risultato delle verifiche

- **75 test passati, zero fallimenti**, inclusi 10 nuovi test dell’atlante. [TAP completo](test-results-v441.tap).
- **31 controlli UI passati nell’eseguibile portable 4.4.1**, in un profilo diagnostico separato. Preset, filtri, ricerca/errori, qualità, tastiera, congelamento, agente osservato, camera circuito e passaggio V2/V3/V4. [Risultato UI](ui-verification-v441/ui-smoke.json).
- Stato fisico, attività neurale, genomi e statistiche dell’ottimizzatore invariati durante i controlli dell’atlante a simulazione in pausa. Congelare l’atlante non ha fermato l’avanzamento del tempo simulato.
- **WebGL 2 verificato**, errore GL 0, zero errori console nel test UI. **WebGPU NVIDIA Lovelace attivo** nel runtime neurale; avvio verificato anche con fallback CPU forzato. In entrambi gli smoke test le auto hanno movimento non nullo e nessuna sovrapposizione fisica di gas/freno. [GPU](desktop-package-smoke-v441.json), [CPU](desktop-package-cpu-smoke-v441.json).
- Schermate dell’app a **1540×980** e **390×844**: zero overflow orizzontali nei controlli. Contrasto del testo secondario sul pannello: 5,48:1. [Vista cervello](ui-verification-v441/desktop-brain.png), [affiancata](ui-verification-v441/desktop-split.png), [stretta](ui-verification-v441/narrow-brain.png).
- **14 file critici del motore/dati identici alla release 4.4.0**, verificati con SHA-256. Sorgenti UI e copie nel pacchetto identici; il manifest viene ridotto dal builder ai soli campi runtime, con versione 4.4.1 confermata. [Verifica del pacchetto](package-verification-v441.json).

Sono stati verificati gli eseguibili e l’interfaccia, non la procedura interattiva dell’installer. Le schermate sono catture dell’app locale, non mockup. La scheda di anteprima ha avuto timeout dell’automazione nella verifica finale ed è stata chiusa; il controllo funzionale completo è stato eseguito nella portable Windows. Non posso confermare una fluidità costante in quel browser o una percentuale di aumento degli FPS: non è stato eseguito un benchmark FPS comparativo.

**Esito:** UI e atlante consegnabili per l’app Windows. Non è un nuovo benchmark di convergenza dell’apprendimento; non dimostra nuovi giri completati. Fisica, ricompense, policy, worker, dati anatomici e chiavi dei checkpoint non sono stati cambiati.

## Riproduzione

```powershell
npm test
npm exec -- electron . --ui-smoke --user-data-dir=work/ui-profile-isolato --ui-output-dir=work/ui-verifica
node work/verify-package-ui-v441.cjs
```

Il controllo del pacchetto richiede i risultati portable GPU/CPU e UI nelle cartelle documentate. Fonti del comportamento UI: [index.html](index.html), [styles.css](styles.css), [app.js](app.js), [brain-atlas.js](brain-atlas.js). Il motore e i limiti dell’apprendimento sono descritti nel [README della 4.4](README.md) e nel [report di apprendimento](VERIFICA.md).
