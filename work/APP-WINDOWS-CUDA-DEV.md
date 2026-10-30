# Copia Windows CUDA privata · 5.6.0

Avvio: `Avvia-campione-neurale-cuda-dev.cmd` nella cartella del progetto.
Non è un portable autonomo: usa Electron, Node 24.19.0 e la dipendenza
Koffi già presenti localmente. Non sostituisce portable, installer o launcher CPU.

## Impostazione iniziale

- In pausa, 16 auto indipendenti; massimo 100.
- V3 su Monza dal campione compatibile con la famiglia chain verificato:
  SHA-256 `4a752dfb82c2268721f0ae100e550bd174be81a04e96ca7259b3e29814043d80`.
- 7.721 neuroni e 242.486 connessioni anatomiche, dinamica artificiale.
- Quattro processi nativi: fisica e selezione sulla CPU, propagazione neurale
  sulla RTX 4060 tramite CUDA. Non è un batch GPU di 100 auto insieme.
- Apprendimento della coppia finale di coefficienti; encoder, guadagni e
  correzioni precedenti congelati. Non addestra tutti i pesi del connettoma.
- UI approvata, modalità chiara/scura e viste del circuito riutilizzate.

Il campione iniziale ha completato **un giro**, non due: 6.584,838934902363 m,
4.052,108730315078 punti, giro in 742,5501609581744 secondi simulati.
La generazione termina soltanto dopo la conclusione effettiva di tutte le auto;
un episodio concluso non significa che abbia completato due giri.

## Verifiche e confini

`chain-cuda-desktop-preflight-r2.json`, sotto
`.impeccable/review/neural-sacl/`, documenta la prova completa da fermo:
8.495 controlli su GPU, 33.980 kernel, nessun ripiego CPU e stessa traccia
`384601f5a3a8b3c7129c76a58fb4e2b3e43709ad15902ba015088dc0977bb1ac`.
È il nuovo adattatore chain, non soltanto il precedente studio state-head.

La prova automatica della vera finestra Windows usa un profilo separato e
scrive in `chain-cuda-training-ui-first`. Consultare `verification.json`
soltanto se presente e con `passed: true`; `live-progress.json` da solo non
dimostra che la verifica sia terminata. I dialoghi ricevono percorsi predisposti
dal test: questo non verifica l'interazione visiva con il selettore Windows.

La verifica Windows è terminata: **25 controlli superati**, nessun errore
renderer, 100 auto realmente avviate e poi ritorno a 16, una generazione
conclusa, salvataggio e ricaricamento esatti di pesi/archivio/RNG/storico.
Attenzione: la generazione di quel test UI era stata preparata con mutazione
zero per verificare tale comando. Le sedici auto avevano quindi gli stessi
pesi e risultati: non è evidenza di esplorazione o apprendimento migliore.
La prova separata `chain-cuda-diverse-first` parte invece con sedici coppie
distinte e mutazione .16; anche qui vale solo il report terminale verificato.

Anche questa prova distinta è conclusa e riconciliata: 16 coppie iniziali,
16 tracce diverse, 16 episodi fisici completi e un aggiornamento. Tutte le auto
hanno raggiunto un giro, nessuna due; il campione pulito non è migliorato.
Gli urti dei mutanti non sono stati promossi. Il report indipendente è
`chain-cuda-diverse-first/independent-verification.json`. È una verifica dei
record e del salvataggio, non una seconda simulazione di ciascun mutante.
I 189,223 secondi di questa prova non sono un benchmark contro CPU: nella
parte finale era in avvio anche un altro esperimento dell'agente.

Il benchmark nativo distinto è descritto in `CUDA-ESATTA-V3-DEV.md`:
21,72% di tempo in meno in una singola coppia di prove a quattro auto.
Non è una misura degli FPS della finestra né una garanzia per 16/100 auto,
altri modelli, circuiti, apprendimento migliore o completamento dei due giri.

## Salvataggi separati

La nuova estensione è **`.malecns-chain-cuda-dev`**. Include decoder numerico,
pesi, archivio, generatore casuale e storico. Richiede la stessa identità di
motore, sorgenti, kernel, runtime e driver; al caricamento esegue una verifica
fisica completa prima di interrompere la prova corrente. Riparte in pausa
dal traguardo, non da una posizione a metà giro.

I file `.malecns-save` e `.malecns-chain-dev` non vengono fatti passare per
compatibili. Nessuna migrazione automatica dei progressi dell'utente.
Un aggiornamento del driver può richiedere una nuova qualifica del backend.
Il file iniziale dell'utente e la release 5.6.0 restano separati e invariati.

## Provenienza e vecchie prove

La prima qualifica è conservata in `chain-cuda-desktop-preflight.json` con una
fotografia dei sorgenti in `chain-cuda-desktop-initial-source`. La seconda
qualifica include anche i testi UI CUDA e il test Windows; non riutilizza la
prima identità come se i sorgenti fossero gli stessi.

CUDA usa l'implementazione matematica qualificata dal V8 del runtime fissato,
non la `tanh` nativa approssimata. Licenze e fonte upstream sono conservate
nel pacchetto locale `cuda-v3-kernel-prepared-r2`; vedere la guida CUDA.

## Riqualifica con i sorgenti correnti — 2026-10-19

La precedente qualifica era legata a un'identità del motore non più corrente;
il launcher ha quindi rifiutato il vecchio salvataggio di prova invece di
forzare una compatibilità. La nuova qualifica è conservata in
`chain-cuda-desktop-preflight-current.json` e registra l'identità corrente
`2aca899a3d86761b6270759b5e6279c0670cc3d24d115161a2cba3a96486ca7c`.
Il campione globale compatibile è stato ricaricato dal traguardo e ha ripetuto
8.495 controlli, tutti sulla RTX 4060, senza fallback CPU; hash della traccia,
progressi, fitness e tempo del giro coincidono con il campione verificato.
Resta un solo giro completato (742,550160958 s simulati), non due.

La ricerca di mutazioni concentrate sullo sterzo dallo stato V3/Monza gen64
non ha superato la policy di partenza nei due contesti di pratica e non viene
inclusa nel learner. Il salvataggio storico `.malecns-chain-cuda-dev` resta
incompatibile con i sorgenti correnti e conservato; questa riqualifica avvia
una copia pulita dal modello globale, non migra quel salvataggio. `npm test`
passa 396/396; i test mirati CUDA/salvataggio passano 7/7. La qualifica non
dimostra due giri, miglioramento evolutivo, convergenza da zero o altri circuiti.

Con l'identità riqualificata, un test separato dal traguardo ha completato tre
generazioni da 16 auto distinte (48 episodi) a 30× su quattro worker. Il campione
pulito è rimasto identico: 6.584,838934902363 m, 1 giro e 742,550160958 s.
La generazione 2 ha avuto un esploratore a 6.595,291973756102 m, ma senza
migliorare fitness o giri; non è stato promosso. Il report è
`chain-cuda-current-three-generation/report.json`. L'app Windows visibile è
stata ricontrollata dopo la prova: V3/Monza, 16 auto, ancora in pausa; nessun
episodio della prova separata è stato scritto nel suo profilo.

## Copia isolata dal migliore state-head verificato — 2026-10-19

È stata aggiunta una seconda copia DEV, avviabile da
`Avvia-campione-stato-neurale-cuda-dev.cmd`, che seleziona il miglior controller
assoluto V3/Monza del catalogo, non il campione chain congelato per il vecchio
motore. Parte in pausa con 16 auto e mutazione 16%; usa quattro worker Node
24.19.0, RTX 4060 e 18 coefficienti state-head. La versione mostrata resta
5.6.0.

La prova dell'app è in
`.impeccable/review/neural-sacl/statehead-cuda-app-smoke-20261019-03/verification.json`.
Il nuovo archivio è 18-dimensionale e la persistenza ha protocollo e suffisso
`.malecns-statehead-cuda-dev` propri; il formato chain e i salvataggi standard
vengono rifiutati, non migrati. Il modello base è stato verificato sul motore
CUDA completo prima dell'integrazione; entrambi i controller hanno combaciato
nel replay lockstep.

Questa copia non dimostra ancora un nuovo aggiornamento evolutivo, due giri o
convergenza: il campione di ricerca migliore resta a 6.590,792 m, un giro e
742,550 s simulati, con termine per lentezza. La precedente copia chain e il
suo profilo restano aperti e separati. Nessun portable, installer, tag o
release è stato cambiato.
