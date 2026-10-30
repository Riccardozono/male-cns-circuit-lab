# V3: decoder 6 sperimentale, copia locale Windows 5.6.0

Esperimento autorizzato dall'autore su una **copia migrata** del salvataggio
V3 / Monza. Non è una release, una nuova versione dell'app o un modello
anatomico V6. La normale V3 e i suoi salvataggi restano separati.

## Avvio

1. Apri `Avvia-decoder6-sperimentale.cmd` nella cartella del progetto.
   Il launcher usa il profilo separato
   `.impeccable/development-decoder6-profile`, senza chiudere l'app normale.
2. La copia parte **in pausa**, su Monza con V3 sperimentale. Premi **Carica
   file…** e scegli
   `.impeccable/review/decoder6/migration/Circuit-Lab-5.6.0-v3-decoder6-monza-gen64.malecns-save`.
3. Verifica la generazione 64 del primo worker, 40 auto per worker, 5 worker,
   mutazione 16% e velocità richiesta 3×, quindi premi **Riprendi**.

L'eseguibile è
`dist-decoder6-dev-560/win-unpacked/MAL-E CNS Circuit Lab - Decoder 6 DEV.exe`.
Mantieni l'intera cartella `win-unpacked`: non è un portable a file singolo.
Il launcher usa il profilo separato dentro il progetto. Anche l'avvio diretto
dell'EXE ha un'identità dedicata (`male-cns-circuit-lab-decoder6-dev`), quindi
non usa il profilo predefinito dell'app normale. Questo segue il comportamento
documentato di [Electron per il percorso userData](https://www.electronjs.org/docs/latest/api/app#appgetpathname).
Non è stata sostituita alcuna distribuzione o app già aperta.

## Modifica tecnica

L'anatomia di V3 rimane **7.721 neuroni e 242.486 connessioni**. Il decoder
legge gli stessi 64 neuroni discendenti reali. Alle 64 caratteristiche
`tanh(8 × attività)` aggiunge 64 caratteristiche
`tanh(32 × (attività − soglia appresa))`. Le nuove caratteristiche e soglie
non sono nuovi neuroni biologici: i parametri appresi passano da 202 a 394.

Nessun ingresso diretto di sensori, posizione, centerline, velocità obiettivo
o comandi di un pilota nel decoder. Le azioni richiedono vera attività del
grafo. Fisica, carreggiata, collisioni coi bordi, ricompense e leggi CPU/GPU
restano invariate; non ci sono collisioni fra auto.

L'esplorazione sperimentale varia anche le soglie in intervalli osservati
nell'attività neurale e compensa il contesto dominante dell'incumbent.
Le proposte sono valutate con simulazioni fisiche e ricompense reali.
L'ispirazione dell'esplorazione sensibile agli output è
[Safe Mutations](https://arxiv.org/abs/1712.06563); non è una replica esatta
dell'algoritmo SM-G del paper. La ricerca per reward non garantisce un giro.

## Trasferimento e compatibilità

Il file originale in Downloads è stato letto e validato, mai sovrascritto.
SHA-256 originale:

```text
29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3
```

Tutti i genomi della popolazione, campioni locali/globali e archivio vengono
trasferiti. Pesi esistenti, media/sigma già apprese, semi/RNG, impostazioni,
frontiera, numero di generazione e contatori di aggiornamenti/episodi restano.
I 192 nuovi parametri partono da zero; i due vecchi bias sono spostati nelle
nuove posizioni. I nuovi sigma usano i valori predefiniti sperimentali.
**Solo gli array dello storico della copia vengono azzerati.**

I 2.400 confronti dei comandi iniziali hanno differenza massima esattamente
zero. Le generazioni conservate sono 64, 67, 65, 65 e 65; gli aggiornamenti
sono 63, 66, 64, 64 e 64. Il caricamento riparte dalla partenza in pausa:
il formato non conserva un preciso stato fisico/neurale a metà giro.

Il vincolo dell'app resta 5.6.0 e il fingerprint richiede esplicitamente
policy 6 / 394 parametri. **La V3 normale rifiuta questi nuovi file e questa
copia rifiuta quelli V3 normali**; i controlli non sono stati aggirati.
I nuovi nomi predefiniti includono `-v3-decoder6-`.
V2, V4 e V5 conservano i rispettivi decoder e le rispettive compatibilità.

## Risultati misurati, non una soluzione dimostrata

Confronto dal primo worker del salvataggio: seed 7717, 40 auto, mutazione
0,16, **tre generazioni naturali 64–66** per caso. Simulazione CPU headless
con i moduli reali, senza scambi futuri di campioni tra worker e senza fine
anticipata imposta alle generazioni.

| Caso | Massimo progresso | Giri completati | Auto oltre 850 m |
| --- | ---: | ---: | ---: |
| Decoder attuale con correzioni compatibili | 800,55 m | 0 | 0 |
| Prima variante del decoder 6 | 800,91 m | 0 | 0 |
| Decoder 6 con esplorazione delle soglie, nella copia Windows | 800,46 m | 0 | 0 |

La prima generazione prima dell'evoluzione ha gli stessi risultati in tutte
le copie: 797,1785507196116 m massimi e 94,799701057882 m medi. Questo conferma
il trasferimento iniziale, **non un miglioramento dell'apprendimento**.

Sono state eseguite anche 160 prove locali preliminari, 400 con tutta
l'esperienza neurale dell'episodio e 400 con variazioni delle soglie. Una
proposta della seconda serie migliorava nella prova locale, ma il suo
episodio intero peggiorava il punteggio: non è stata promossa a campione né
inclusa nel salvataggio migrato consegnato. Le prove locali sono ripartenze
da stati realmente raggiunti, non da punti inventati sulla pista; i loro
metri e giri non vengono regalati alla generazione normale.

Il blocco intorno agli 800 m **non è risolto** nei confronti effettuati.
Non posso confermare un apprendimento più rapido, un giro completato o
convergenza generale. I tempi reali dei diversi prototipi non sono un
benchmark prestazionale controllato. Il cursore 30× è una richiesta,
non una velocità reale garantita.

## Verifiche e riproduzione

- `node --test outputs/tests/*.test.cjs`: 392/392 test dell'app normale.
- `node --test work/decoder6.test.cjs`: 7/7 test del decoder sperimentale,
  inclusi trasferimento, anatomia, soglie, esclusività e limiti dei parametri.
- `node work/verify-decoder6-native.cjs`: copia nativa isolata, importazione
  esatta di tutti i worker, round trip stretto, comandi e GPU reali, 31/31
  controlli e nessun errore di console.
- L'EXE di sviluppo è stato anche eseguito con `--progress-smoke` in un
  profilo temporaneo: picker, scrittura, rilettura e ripristino realmente
  eseguiti su tutti i modelli, 50/50 controlli compresa l'identità dedicata,
  nessun errore di console. Le generazioni anticipate di quel test sono
  **soltanto verifiche di salvataggio**, non prove di convergenza.
- `node work/verify-decoder6-preservation.cjs`: sorgenti del pacchetto,
  anatomia, fisica, renderers, salvataggio originale e distribuzioni,
  50/50 controlli.

Evidenze locali (non pubblicate):

- `.impeccable/review/decoder6/migration/transfer-verification.json`;
- `.impeccable/review/decoder6/initial/comparison.json`;
- `.impeccable/review/decoder6/representation/comparison.json`;
- `.impeccable/review/decoder6/local-search*/report.json`;
- `.impeccable/review/decoder6/native/verification.json`;
- `.impeccable/review/decoder6/packaged-progress/progress-smoke.json`;
- `.impeccable/review/decoder6/preservation.json`.

Le sorgenti complete locali della copia sono in
`.impeccable/experimental-decoder6-app`; il kernel ridotto di prova è in
`.impeccable/experimental-decoder6`, con la prima variante conservata in
`.impeccable/experimental-decoder6-initial`. Gli strumenti di questo
esperimento richiedono queste copie locali. Non sono il normale progetto
di distribuzione GitHub. Nessun commit, tag, release o upload di progressi
è stato effettuato.

La UI conserva il design approvato e entrambi i temi. Impeccable è stato
usato per etichette, avvertenze e reflow; non per modificare la simulazione.
Il detector ha segnalato anche stili ereditati fuori da questo intervento;
i suoi warning non sono una certificazione di accessibilità. Le due viste
native ispezionate leggono dati reali in pausa, non un'anteprima illustrativa.
