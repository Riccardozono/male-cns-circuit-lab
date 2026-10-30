# App Windows privata: contesti neurali verificati

## Avvio e confini

Eseguire `Avvia-contesti-neurali-dev.cmd` dalla cartella del progetto.
Richiede i runtime e le prove locali: non è un portable autonomo.
Si apre in pausa con 16 auto (massimo 100), V3 e Monza, dal modello
qualificato con SHA-256 `0d23973f4f7ef4d590238b38062203db5b1eb773923315d70d02a2f285eef908`.
Usa quattro processi CPU e il backend CUDA esatto sulla RTX 4060.
La velocità 30× è una richiesta, non una promessa di velocità effettiva.
Versione mantenuta a 5.6.0; nessun nuovo tag, release o pacchetto distribuito.
Le copie CPU/CUDA precedenti restano separate.

La rete V3 ha 7.721 cellule e 242.486 connessioni. Questa fase apprende sei
coefficienti di tre contesti neurali istantanei: non aggiunge sei neuroni e
non riaddestra tutta la rete. Encoder e decoder precedenti sono congelati.
Le azioni sono calcolate durante la simulazione, senza riproduzione di una
traiettoria registrata. La dinamica è artificiale, non fisiologia completa.
L'interfaccia approvata è conservata; le diciture distinguono parametri
appresi, neuroni, avvio già allenato e compatibilità dei file.

## Evidenze controllabili

Percorsi relativi alla radice del progetto:

- `.impeccable/review/neural-sacl/instant-desktop-preflight.json`:
  replay indipendente completo, 8.520 controlli CUDA, nessun fallback CPU,
  traccia `7ac5a4f00fad5d0c16ec71493b1bf45514e40ccaf3e4723070b9934060f3818c`.
- `.impeccable/review/neural-sacl/instant-training-ui-first/verification.json`:
  26 verifiche superate, nessun errore renderer; pausa, slider, 100 auto
  effettive, una generazione di 16 candidati distinti, pesi aggiornati,
  campione protetto riprodotto esattamente, salvataggio/ricaricamento di
  archivio, pesi, RNG e storico; camere, temi e larghezze 1500/980/740 px.
  Le finestre di selezione file hanno valori sostituiti soltanto nel test:
  sono verificati handler e file reali, non l'interazione visiva col picker.
- `work/neural-instant-app.test.cjs`: due test su popolazione, separazione
  degli stati delle auto, archivio e rifiuto dei vecchi formati.
- `work/neural-instant-save-io.test.cjs`: due test con veri handle Windows,
  blocco transitorio e persistente, sostituzione atomica e file precedente
  preservato in caso di errore.

Identità del motore verificato:
`2a851cf6146a91a14692c055926815a9335000343dced07aa3c168c9f5c21dcd`.

## Risultato e limiti di apprendimento

Campione: 6.597,375 m, punteggio 4.060,442, un giro in 742,550 s,
poi arresto senza progresso. Il guadagno verificato sul precedente modello
di ricerca è 6,584 m, non due giri e non un primo giro più rapido.
Nella generazione Windows una variante ha raggiunto 6.617,844 m ma è
terminata per urto con punteggio 2.187,483: non supera il campione.
Aggiornare i pesi non dimostra convergenza. Non sono confermati due giri,
convergenza da zero, risultati sugli altri modelli o sugli altri circuiti.

## Salvataggi

Usare i pulsanti Salva/Carica apprendimento. Formato privato
`.malecns-instant-dev`, separato da `.malecns-save`, `.malecns-chain-dev`
e `.malecns-chain-cuda-dev`. È vincolato all'identità del motore e dei
runtime: non è garantito su altri PC o dopo cambiamenti incompatibili.
Il caricamento mantiene pesi, archivio, RNG e storico e riparte in pausa
dal traguardo; non ripristina la posizione a metà giro.
Il salvataggio originale gen64 non viene riscritto.
