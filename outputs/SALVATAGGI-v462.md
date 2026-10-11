# File progressi — app 4.6.2

Estensione: `.malecns-save`. JSON UTF-8, non un programma eseguibile.
Codec condiviso Node/browser: `progress-save.js`. File nativo:
`desktop/progress-files.cjs`; copia reale dello stato: `desktop/worker.cjs`.

## Compatibilità e integrità

Intestazione obbligatoria: `format: male-cns-training-save`, `schema: 1`,
`appVersion: 4.6.2`, `savedAt` ISO, `payload`, `checksum` SHA-256.
La versione deve corrispondere **esattamente** a `app.getVersion()`;
il processo principale ricontrolla il file prima del ripristino. Schema/versione
errati, valori non finiti, dimensioni errate o campi inattesi non vengono caricati.
I contenuti non vengono eseguiti con eval o import dinamico.

SHA-256 calcolato su `JSON.stringify({format,schema,appVersion,savedAt,payload})`.
Gli spazi di impaginazione non contano. Il checksum non autentica il mittente:
chi modifica intenzionalmente JSON e checksum può creare un altro file valido.
Il blocco per versione è una regola di compatibilità, non DRM.

Limiti: 16 MiB per file, 1–32 worker, 4–100 auto per worker, fino a 100 voci
di storico per worker, fino a 4 campioni d’archivio, vettori esatti del modello.
Il file deve usare lo stesso numero di auto, mutazione, velocità e circuito
per tutte le isole; generazioni e stato appreso possono essere diversi.
Il browser accetta una sola isola; non elimina le altre da un file Windows.

## Contenuto

Il payload identifica modello, descriptor del grafo, circuito e revisione del
veicolo. Ogni worker include generazione, impostazioni, genomi di tutta la
popolazione, ottimizzatore (media, sigma, aggiornamenti, episodi), seed/stato RNG,
campione personale, campione esterno adottato, archivio, record e storico.
Il coordinatore conserva anche il campione globale. I tempi senza un giro
completato sono `null` nel JSON e tornano `Infinity` negli archivi interni;
non diventano un falso giro di 0 secondi.

Non contiene il grafo anatomico completo (già nel bundle), attività neurale
temporanea, buffer GPU, usura/carburante/posizione a metà episodio, impostazioni
diagnostiche manuali o tutte le prove locali di altri circuiti. Si salva **questa
prova**, cioè il modello e il circuito attivi con tutte le loro isole.

Il capture è di sola lettura e non consuma RNG né interrompe i tick. Le isole
e i messaggi di migrazione sono asincroni; non è un checkpoint simultaneo
dell’intero sistema distribuito. Al caricamento si conserva l’apprendimento ma
si ricrea l’episodio dalla partenza della generazione salvata, in pausa, senza
riaddestrare/reinizializzare media o sigma. La GPU viene reinizializzata; il
fallback CPU resta disponibile. Non si garantisce la stessa traiettoria futura
su backend/hardware diversi o una riproduzione GPU bit per bit.

## Sicurezza operativa

La finestra nativa sceglie il percorso: il renderer ordinario non ha un’API
per leggere/scrivere percorsi arbitrari. Il processo principale legge un file
limitato da un singolo handle aperto, controlla il checksum e lo schema prima
della conferma, e ricontrolla il file prima del ripristino. Annullamento, versione
diversa o dati corrotti lasciano intatta la prova corrente.

Salva scrive prima un temporaneo esclusivo nella stessa cartella e poi lo rinomina
al percorso scelto. Un errore non lascia un salvataggio parziale al percorso
finale. È una scrittura con sostituzione finale, non una promessa di durabilità
contro spegnimenti durante il flush del filesystem. Prima di sostituire una prova
valida, il motore conserva un backup d’apprendimento in memoria; in caso di
errore di avvio tenta di ripristinarlo, dalla partenza e in pausa. Un guasto
di sistema che impedisce anche il rollback viene segnalato, non mascherato.

I test diagnostici dei dialoghi usano risposte simulate solo nel lancio esplicito
`--progress-smoke` in un profilo usa-e-getta. Esercitano i veri pulsanti, processo
principale, file, worker e GPU/CPU, ma non verificano manualmente il layout delle
finestre di selezione native del sistema operativo.
