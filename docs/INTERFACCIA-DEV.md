# Interfaccia di sviluppo — app 5.6.0

## Aggiornamento corrente: pannelli allineati e prima persona — 13 ottobre 2026

Nella vista **Affiancati**, sopra 1190px di larghezza, circuito e atlante del
cervello condividono bordo superiore, bordo inferiore e origine dei titoli.
Il canvas reale del circuito occupa lo spazio residuo; strumenti, legenda e
ricerca dell'atlante restano accessibili. Alle larghezze più strette si
conserva l'impilamento, senza una scrollbar interna aggiunta per pareggiarli.

In **Camera del circuito** scegliere **Prima persona · auto selezionata**.
Se si parte dalla mappa 2D il comando apre la vista 3D. La camera usa la
posizione e la direzione dell'auto selezionata, lo stesso riferimento del
terreno e le inclinazioni della carrozzeria. Cambiando agente la camera
passa alla nuova auto, senza modificare la sua guida. Trascinamento o frecce
muovono lo sguardo; rotella e tasti zoom variano il campo visivo fra 40° e
95°; **Centra** ripristina sguardo frontale e 70° senza uscire dall'abitacolo.
Questi controlli non aggiungono guida manuale. Nome e descrizioni accessibili
del canvas indicano l'auto osservata e i comandi effettivi della modalità;
la nota sul posto guida schematico è associata anche al canvas. Passando
alla camera esterna o alla mappa 2D le istruzioni originarie sono ripristinate.

Il punto occhi è una scelta stimata e la plancia/il volante sono geometrie
schematiche originali: non sono l'abitacolo Porsche originale o dati CAD
del produttore. La nota è visibile nella configurazione. Il modello GLB e
le texture fornite restano identici. In prima persona la carrozzeria
selezionata e gli esterni che racchiudono il punto occhi vengono omessi
soltanto dal disegno. Anche anello di selezione e raggi/marker visivi sono
nascosti in questa camera: agenti, sensori fisici e ingressi della rete
non vengono rimossi; le altre viste conservano i relativi overlay.

Il launcher `Avvia-interfaccia-dev.cmd` / `.ps1` apre ora
`dist-first-person-dev-560/win-unpacked`, con il profilo separato già usato
per le prove `.impeccable/development-ui-profile`. Chiudere la precedente
copia dell'app prima di riaprire il launcher: non la chiudiamo automaticamente.
Le copie di sviluppo precedenti sono conservate. La versione resta 5.6.0;
nessun tag, commit, release, portable o installer pubblicato è stato cambiato.

Verifiche correnti dopo la correzione della review: **381/381 test automatici**,
**52/52 controlli nativi**
della sorgente con acquisizioni e misure a 2234, 1440 e 1280px;
**49/49 controlli nativi della copia Windows**, senza errori di console;
**50/50 controlli di preservazione/completamento del pacchetto**. Nei test
in pausa, passaggio di camera, sguardo e selezione conservano lo stato
fisico/neurale/apprendimento; la popolazione reale da 100 auto resta presente.
Non sono test di convergenza, benchmark FPS o certificazione del posto guida.

Rapporti in `.impeccable/review/first-person/`: `unit-tests-final.log`,
`source-final/ui-redesign-smoke.json` e relative otto immagini,
`package-final/ui-redesign-smoke.json`, `preservation.json` e
`layout-assessment.md`. La prima acquisizione `source/user-2234.png` aveva
il buffer WebGL dell'atlante nero dopo il resize: è conservata come evidenza
non valida, non usata per la review. Il batch `source-valid/` attende il
layout e richiede un ridisegno dell'atlante soltanto nel diagnostico; tutti
gli otto file sono stati aperti e controllati. Il sorgente dell'atlante
non è stato modificato per riparare la cattura. `source-final/` è il batch
successivo alla correzione delle istruzioni accessibili richiesta dalla
review: acquisizioni ricontrollate, con sette nuove verifiche di descrizioni
per ingresso, reset, cambio agente e ritorno alle altre modalità. Le prime
prove `source-valid/` 45/45 e `package/` 42/42 restano evidenze storiche.

La preservazione distingue i tre renderer visuali modificati per la camera
(`circuit-3d.mjs`, `car-3d.mjs`, `supplied-car-3d.mjs`) dal motore neurale,
fisica, ricompense, dati e vincoli dei progressi, confrontati con `a30d70c`
e con la precedente copia d'apprendimento. Tutti i tre artefatti distribuiti
5.6.0 conservano gli SHA-256. Riproduzione: `node work/verify-ui-redesign.cjs`.
Test e immagini usano profili isolati, non i progressi personali dell'autore.

La review indipendente ha confermato l'allineamento e il comportamento della
camera, richiedendo un solo fix alle istruzioni accessibili del canvas.
Il successivo Verdict Pass ha giudicato il **fix 1 resolved** e restituito
**disposition: ship**, limitata a quella correzione: `finish-review.md` e
`verdict-fix.md` conservano evidenze e perimetro. Il revisore non ha eseguito
test o certificato il pacchetto; le verifiche Windows e i 381 test finali
citati sopra sono stati eseguiti separatamente dal parent.

Il documenter ha completato un merge minimo di PRODUCT.md, DESIGN.md e
sidecar, con evidenze in `documenter.md`: frontmatter, 58 colori, 9 componenti
e storia precedente conservati. Il parent ha poi ricontrollato YAML/JSON,
ordine delle otto sezioni canoniche e riferimenti dei componenti. Non è un
nuovo redesign; il brief storico del tema non è stato riparato fuori scope.

## Modalità scura precedente e relative verifiche

Il comando **Scuro**, con icona luna nella barra superiore, attiva/disattiva
il nuovo tema. Il layout, le funzioni e i renderer del circuito/cervello
rimangono quelli approvati. Campi nativi, tabelle, link, focus, selezione del
testo, barre e grafico usano colori adatti al tema scelto; il paesaggio 3D
non viene artificialmente oscurato o ricalcolato.

La preferenza è salvata soltanto nella chiave locale `malecns-ui-theme` e
applicata prima del caricamento degli stili. Al primo uso resta il tema chiaro.
Se lo storage non è disponibile il comando continua a funzionare, senza
promettere la conservazione della scelta dopo la chiusura. Nessuna preferenza
di tema entra nei file condivisibili dei progressi.

Il launcher di questa fase apriva la nuova copia separata
`dist-ui-theme-dev-560/win-unpacked`, con lo stesso profilo di sviluppo isolato
`.impeccable/development-ui-profile`. La precedente copia
`dist-ui-redesign-dev-560` è conservata; portable, installer e tag pubblicati
rimangono invariati. La versione dell'app e il vincolo dei progressi sono 5.6.0.

Verifiche di quella fase: 374/374 test automatici, inclusi 8 nuovi test di tema;
31/31 controlli nativi della sorgente, con ripristino dopo ricaricamento reale,
stato fisico/neurale/apprendimento invariato in pausa e simulazione che resta
in esecuzione durante il cambio di tema; 46/46 controlli di preservazione e
completezza del nuovo pacchetto; anche il controllo nativo della copia Windows
finale passa 31/31 verifiche, senza errori di console. Nessuna convergenza o velocità di training
migliore viene rivendicata da questo cambio visuale.

Contrasti dei token testo misurati nel renderer: in tema scuro testo principale
14,16:1, supporto 9,76:1, metadati 7,71:1 sul pannello; nessun overflow dei
controlli nelle viste misurate a 1440, 1280 e 390px. Sono misure di quei token
e di quelle viste, non una certificazione universale di accessibilità.

Evidenze di quella fase in `.impeccable/review/ui-theme/`: `unit-result.json`,
`source/ui-redesign-smoke.json` con PNG, `preservation.json` e
`package/ui-redesign-smoke.json`. Test e catture usano profili separati,
mai i file personali dei progressi. Gli esiti precedenti sotto sono storici.

La finish review indipendente del tema ha restituito `ship`, senza material
fix per questa modifica o regressioni evidenziate. Tutte le otto acquisizioni
richieste sono state controllate. Il revisore non ha rieseguito i test e non
certifica i controlli di pacchetto svolti separatamente dal parent; dettaglio in
`finish-review.md`. I warning statici ereditati non sono stati nascosti tramite
una seconda scansione o una riscrittura del layout già approvato.
Il documenter ha aggiornato DESIGN.md, il relativo sidecar e PRODUCT.md per
la variante autorizzata. Token e riferimenti dei componenti sono stati
ricontrollati: YAML/JSON validi, colori presenti nel CSS e sezioni canoniche
conservate. Il tema è completato e documentato; rapporto in `documenter.md`.

## Redesign chiaro precedente e relative verifiche

Redesign richiesto dall'autore e basato sull'immagine di sessione da lui scelta
il 13 ottobre 2026. Tema chiaro, intestazioni navy e azioni rosse; configurazione
a sinistra, grande campo interattivo e telemetria/storico sotto. Test modelli,
cervello e vista affiancata hanno accessi diretti. Le spiegazioni e i crediti
rimangono nelle sezioni espandibili. Le misure e la tabella sono reali: lo stato
vuoto non inventa giri o apprendimento.

Il paesaggio fotorealistico e la Porsche prospettica dell'anteprima sono
illustrativi. Il redesign conserva i renderer 2D/3D e la vettura già presenti
nell'app; non inserisce quell'immagine come fondo statico o falsa telemetria.
Il confronto automatico pixel alla risoluzione dell'anteprima misura 57,8%
(soglia 72%); il controllo desktop a 1440px misura 54,1% (soglia 65%). Sono
due confronti numerici falliti, non identità pixel per pixel. L'autore ha poi
approvato: «Approvo questa UI reale; l’immagine resta un riferimento visivo».
L'override del workflow è registrato con questa decisione; il risultato
numerico fallito rimane visibile, non è trasformato in un pass. Le catture
desktop/mobile verificate e la UI reale approvata sono l'evidenza di layout;
la comp è un riferimento visivo, non una soglia sostitutiva di quei controlli.

La revisione visiva indipendente ha giudicato risolte le sette correzioni
richieste su configurazione, fascia auto, stato, chrome del campo, leggibilità,
fondo e tabella vuota. È un verdict limitato a quei fix, non una nuova
certificazione dell'intera app. Il restante punto riguardava documentazione e
chiusura del workflow. DESIGN.md e il sidecar ora descrivono i token effettivi;
il documenter delegato ha raggiunto il limite disponibile ed è stato sostituito
con il ruolo inline di fallback, dichiarato nel rapporto locale. Lo stesso
revisore ha poi giudicato risolta la chiusura del punto 8, con disposition
`ship` limitata a quel punto. Il workflow è chiuso, senza ulteriori modifiche
visive o una nuova revisione completa.

## Avvio locale

Aprire `Avvia-interfaccia-dev.cmd` nella radice del progetto, oppure eseguire
`Avvia-interfaccia-dev.ps1`. Entrambi usano la copia separata
`dist-first-person-dev-560/win-unpacked` e il profilo di prova
`.impeccable/development-ui-profile`. Il profilo è separato: per riprendere
un addestramento esistente usare Salva file / Carica file con app 5.6.0.
Non è stata creata una release, un installer o una nuova versione. Portable,
installer e tag pubblicati restano invariati.

La cartella win-unpacked deve restare completa: il file EXE non è un portable
autosufficiente. Il launcher avvia la copia locale di prova, non quella
installata né il portable pubblicato.

## Evidenze storiche del redesign chiaro

- 366 test automatici passati, nessun fallimento.
- 24 verifiche native della copia Windows finale passate: navigazione, test
  aperto senza avvio, mappe/atlante, auto precedente/successiva, controlli,
  stato in pausa invariato, popolazione numerica inoltrata al worker effettivo
  e blocco durante operazioni protette.
- Acquisizioni desktop, narrow, mobile, cervello, affiancata e test dalla stessa
  UI sorgente; 22 controlli nel batch di acquisizione, senza overflow orizzontale
  alle larghezze misurate. Il diagnostico finale aggiunge i due controlli del
  campo popolazione, senza nuove immagini.
- 49 controlli Salva/Carica della copia Windows passati, senza errori di console.
- Avvio della copia impacchettata con GPU+CPU WebGPU, movimento reale e pedali
  senza sovrapposizione verificati dal diagnostico nativo.
- 45 controlli di preservazione e completezza del pacchetto finale passati,
  dopo l'ultima compilazione e le correzioni funzionali di presentazione.

I rapporti locali si trovano in `.impeccable/review/ui-redesign/`:

- `unit-tests-final.log`: 366/366 test.
- `package-final/ui-redesign-smoke.json`: 24/24 controlli sul pacchetto finale.
- `reviewer-fix-final/ui-redesign-smoke.json` e PNG: acquisizioni e 22 check.
- `progress-package/progress-smoke.json`: 49/49 controlli Salva/Carica.
- `package-smoke/stdout.log`: diagnostico GPU+CPU.
- `preservation.json`: 45/45 controlli di conservazione/completamento.
- `verdict-1.md`: sette fix visivi risolti; richiesta di chiusura documentale.
- `verdict-closure.md`: chiusura del punto 8 giudicata risolta dal revisore,
  senza altri interventi ai sorgenti UI.
- `author-approval.md`: approvazione umana e perimetro del riferimento.
- `documenter-fallback.md`: documentazione eseguita direttamente.

Non sono salvataggi dell'autore. Le acquisizioni e i test usano profili
usa-e-getta, non il suo addestramento reale.

Motore neurale, anatomia, fisica, ricompense, circuiti e schema dei salvataggi
sono confrontati con il sorgente di sviluppo `a30d70c` e, ove presente, con la
copia Windows di apprendimento precedente. Per il confronto Git dei testi si
normalizzano soltanto CRLF/LF; il confronto con il pacchetto precedente resta
byte per byte. I tre artefatti distribuiti 5.6.0 conservano i loro SHA-256.
Verifica riproducibile: `node work/verify-ui-redesign.cjs`.

Eseguibile locale della fase chiara:
`dist-ui-redesign-dev-560/win-unpacked/MAL-E CNS Circuit Lab.exe`.
SHA-256 dell'eseguibile, non dell'intero pacchetto:
`516E5117BCEE220F33CED3745E69D7C6BBCA541617EAA6F4811D5D47FD1E3FF0`.

Questi controlli non dimostrano una convergenza migliore né maggiore velocità
di apprendimento. La modifica è di presentazione, non dell'IA. Salva/Carica
sono round trip di progressi di prova; non è stata eseguita l'importazione dei
file personali dell'autore. Lo schema e il vincolo di versione rimangono
identici, senza migrazioni o elusione dei controlli.

Font locali Tajawal Bold e Sintony Bold, senza richieste di rete durante l'uso;
copyright, sorgenti e licenze OFL in `outputs/assets/fonts/`.
