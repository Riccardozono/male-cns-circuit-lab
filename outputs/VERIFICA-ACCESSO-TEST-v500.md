# Accesso visibile al test — Windows 5.0.0

Modifica del 9 ottobre 2026. Pacchetto separato in `dist-test-access-v500/`;
i due rilasci precedenti e i file dei progressi non vengono sostituiti.

## Modifica richiesta

Rimosso dalla UI il riquadro “Campione automatico e regole” mostrato dall’utente,
insieme al comando “Riprendi campione” e ai soli stili/eventi rimasti inutilizzati.
L’autosalvataggio locale rimane attivo e versionato; se non disponibile, il
messaggio di errore rimanda al reale comando “Salva file…”. I file progressi
restano accessibili tramite “Salva file…” e “Carica file…”. Nessuna cancellazione
dei campioni locali o dei file dei progressi.

Il nuovo pulsante **Apri test modelli** è nella barra superiore, anche a finestra
stretta. Apre la sezione sopra la mappa, la porta in vista e mette il focus su
Avvia; durante il test porta invece a Interrompi. Aprire il pannello non avvia,
resetta o evolve la simulazione. La chiusura dal summary sincronizza
`aria-expanded`. Il comando rimane disponibile durante il confronto.

## Prove verificabili

Il rapporto finale è `test-access-verification-v500/verification.json`.
I contatori della suite completa sono nel suo `tests.tap`; i cinque nuovi test
sono `tests/test-access-ui.test.cjs` e coprono accesso, focus, assenza di avvio,
rimozione dei riferimenti DOM e autosalvataggio con e senza storage disponibile.

Il controllo nativo usa un profilo temporaneo indipendente, prova i quattro
modelli reali con budget breve, controlla GPU/fallback CPU, stop, export JSON,
map/atlas e ripristino esatto dell’addestramento precedente. Le schermate wide
e narrow sono in `test-access-verification-v500/source-gpu/`: `desktop-entry.png`,
`mobile-entry.png`, `desktop.png`, `mobile.png`. Controlli del portable e import
dei salvataggi precedenti sono nelle cartelle `portable-gpu`, `portable-cpu`,
`progress` dello stesso rapporto. La review Impeccable è documentata in `review.md`
e svolta in questa sessione senza revisore separato.

La baseline protegge 124 file `.malecns-save`, quattro eseguibili già consegnati
e 34 file di runtime/dati non UI. Il verificatore confronta gli hash e verifica
l’allowlist esatta e la corrispondenza tra sorgenti e file inclusi nel pacchetto.
Non modificati sinapsi, modello, fisica, ricompense, ottimizzatore, worker, kernel
GPU, regole dei salvataggi o la versione 5.0.0. Lo smoke nativo è diagnostica,
non un benchmark della velocità o una prova di convergenza dei quattro modelli.

Non posso confermare quale precedente eseguibile fosse aperto nella schermata
dell’utente: il ritaglio non mostra il percorso del processo. Il pannello era
chiuso per impostazione iniziale nel codice; la nuova azione rende l’accesso
esplicito. Per questa modifica va avviato il portable di `dist-test-access-v500/`.

## Riproduzione dei controlli

`node --test --test-reporter=tap outputs/tests/*.test.cjs` per la suite completa;
`node work/run-model-test-smoke.cjs --capture --output=outputs/test-access-verification-v500/source-gpu`
per l’app dal sorgente. Lo stesso runner accetta il percorso del portable,
`--cpu` per forzare il fallback e `--progress` per i salvataggi. Il comando
`node work/verify-test-access-v500.cjs` controlla il pacchetto prima della rimozione
dei temporanei; `--final` ricontrolla gli eseguibili finali e gli hash registrati.
Le copie di compilazione generate per questa modifica possono essere riciclate
solo dopo la verifica; i rilasci precedenti non sono fra i bersagli.
