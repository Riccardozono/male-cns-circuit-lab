# MAL-E CNS Circuit Lab

Laboratorio locale per Windows in cui una popolazione di auto da gara prova a imparare un circuito attraverso una policy ricorrente costruita sul connectome **MaleCNS**.

L'app unisce simulazione fisica, apprendimento evolutivo, circuiti in scala metrica, mappa 2D interattiva, visualizzazione 3D e strumenti per confrontare i modelli V2, V3, V4 e V5.

> **Stato:** versione `5.1.0` · Windows x64 · Electron · simulazione CPU/WebGPU ibrida

> **Metodo di sviluppo:** progetto realizzato in modalità **vibe coding**, con iterazioni guidate in linguaggio naturale, assistenza di OpenAI Codex e verifiche automatiche sul repository.

## Scarica l'app per Windows

La release contiene due pacchetti già compilati:

| Pacchetto | Uso |
| --- | --- |
| [Portable x64 — download diretto](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.1.0/MAL-E-CNS-Circuit-Lab-portable-5.1.0-x64.exe) | Avvia l'app senza installazione. È utile per una prova rapida o per portare l'app su un altro PC. |
| [Installer x64 — download diretto](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.1.0/MAL-E-CNS-Circuit-Lab-setup-5.1.0-x64.exe) | Installa l'app in Windows e crea i collegamenti nel menu Start e sul desktop. |

Per vedere note, documentazione e checksum, apri la [release MAL-E CNS Circuit Lab v5.1.0](https://github.com/Riccardozono/male-cns-circuit-lab/releases/tag/v5.1.0).

> I file Windows non sono firmati Authenticode: al primo avvio Windows SmartScreen potrebbe mostrare un avviso. La portable non richiede Node.js.

## In breve

Il laboratorio simula auto indipendenti che ricevono osservazioni sensoriali, elaborano l'attività della rete MaleCNS e producono sterzo e azione longitudinale. La generazione viene valutata con giri completati, tempo, progresso, ricompense e penalità.

Il progetto non usa una traiettoria memorizzata, un pilota guida o una regola nascosta per far seguire alle auto il circuito. Il percorso viene valutato dalla simulazione e il comportamento viene cercato dall'ottimizzatore.

```text
sensori fisici → policy ricorrente MaleCNS → neuroni discendenti → sterzo e pedali
```

## Modelli OpenAI usati nello sviluppo

Questo progetto è stato realizzato in modalità **vibe coding** con assistenza di OpenAI Codex.

| Modello OpenAI | Ambiente |
| --- | --- |
| **GPT-6 Astra** | **OpenAI Codex** |
| **GPT-6 Luna** | **OpenAI Codex** |
| **GPT-6.1 Sol** | **OpenAI Codex** |
| **GPT-5.6 Luna** | **OpenAI Codex** |

Questi sono i modelli OpenAI utilizzati dall'autore durante lo sviluppo in vibe coding. Il repository non conserva un registro per commit che permetta di attribuire ogni singola modifica a un modello specifico; la tabella documenta quindi l'insieme dei modelli usati nel progetto, non una suddivisione artificiale del lavoro tra loro.

## Modelli usati dall'app

| Categoria | Modello o componente | Funzione |
| --- | --- | --- |
| Rete neurale | **MaleCNS V2** | Profilo compatto ricostruito per prove rapide e confronto di base. |
| Rete neurale | **MaleCNS V3** | Profilo intermedio ricostruito con capacità superiore a V2. |
| Rete neurale | **MaleCNS V4** | Profilo completo usato come riferimento principale del connectome. |
| Rete neurale | **MaleCNS V5** | Profilo esteso con maggiore capacità elaborata, più passaggi ricorrenti e decoder più ampio. |
| Veicolo 3D/fisico | **Porsche 992 GT3 R** | Vettura simulata, con modello 3D, texture locali, fisica, cambio, pneumatici e telemetria. |

Il runtime della simulazione usa i profili MaleCNS locali e gli asset inclusi nel progetto; non invia le decisioni di guida a un servizio AI cloud. I modelli OpenAI assistono lo sviluppo, mentre V2, V3, V4 e V5 sono i modelli neurali eseguiti dall'app.

## Funzionalità principali

- **Mappa 2D interattiva** con zoom, pan, auto selezionabile e raggi dei sensori.
- **Vista 3D panoramica** dell'intero circuito.
- **Telecamera 3D in inseguimento** dell'auto osservata o dell'auto migliore.
- **Porsche 992 GT3 R** con modello 3D, texture locali, livrea, ruote animate e luci di frenata.
- **Fisica con inerzia e forze**: velocità del corpo, imbardata, trasferimento di carico, pneumatici, aerodinamica, temperature, usura, pressione, carburante e cambio sequenziale a sei rapporti.
- **Sensori fisici** per bordi, velocità, RPM, marcia, slip delle ruote, temperature e freni.
- **Ricompense e penalità episodiche** per progresso, checkpoint, giri validi, ritmo, stallo, uscita, urto sul bordo, retromarcia, slip, nessun giro e regressione.
- **Due giri per episodio**: ogni auto termina dopo due giri oppure quando conclude, urta, esce dalla pista o raggiunge lo stallo.
- **Fino a 100 agenti per generazione** e velocità richiesta fino a `30×`, compatibilmente con il carico del PC.
- **Modalità test** per confrontare i modelli partendo da zero con le stesse impostazioni.
- **Salvataggi condivisibili**, vincolati alla versione dell'app che li ha creati.

## Origine del cervello MaleCNS

Il riferimento anatomico del progetto è la repository ufficiale del progetto MaleCNS:

- **Repository upstream:** [natverse/malecns](https://github.com/natverse/malecns)
- **Collegamento nel progetto:** [submodule `work/malecns`](https://github.com/Riccardozono/male-cns-circuit-lab/tree/main/work/malecns)
- **Export offline utilizzati dall'app:** [`outputs/data/`](https://github.com/Riccardozono/male-cns-circuit-lab/tree/main/outputs/data/)
- **Manifest e provenienza locale:** [`outputs/data/provenance.json`](https://github.com/Riccardozono/male-cns-circuit-lab/blob/main/outputs/data/provenance.json)

Il codice e i dati upstream vengono mantenuti separati dalla dinamica artificiale del simulatore. L'app usa export offline con manifest e checksum; non esegue direttamente il pacchetto R `natverse/malecns` durante la simulazione.

Il connectome caricato e le annotazioni anatomiche sono una base scientifica di riferimento, ma la normalizzazione, i tassi di attività, gli ingressi sensoriali, il decoder motorio e l'apprendimento sono scelte del simulatore. Per questo il progetto **non va interpretato come una simulazione biologica validata del cervello di una mosca**.

Per fonti, licenze, checksum e limiti, consulta la [documentazione tecnica della distribuzione](outputs/README.md) e la [provenienza dei dati](outputs/data/provenance.json).

## Dettaglio dei modelli neurali MaleCNS

| Modello | Profilo | Dimensione indicativa |
| --- | --- | ---: |
| **V2** | Profilo compatto ricostruito per prove rapide e confronto di base. | 1.121 neuroni · 32.351 archi |
| **V3** | Profilo intermedio ricostruito con capacità superiore a V2. | 7.721 neuroni · 242.486 archi |
| **V4** | Profilo completo usato come riferimento principale. | 166.700 neuroni · 6.242.118 archi |
| **V5** | Profilo esteso con più capacità elaborata, passaggi ricorrenti e decoder più ampio. | stessa anatomia di V4 |

V4 e V5 condividono lo stesso dataset anatomico annotato. V5 aumenta la capacità computazionale del profilo, non inventa neuroni o connessioni biologiche aggiuntive. Inoltre, il solver sparso non aggiorna simultaneamente tutti i 166.700 neuroni a ogni tick: il dataset completo viene caricato, mentre l'attività elaborata segue il budget del modello.

> **Nota sull'apprendimento:** più neuroni o più capacità non garantiscono automaticamente un apprendimento più veloce. V4 e V5 richiedono più calcolo e possono avere bisogno di più generazioni per produrre un miglioramento misurabile.

## Circuiti

| Circuito | Lunghezza usata dal simulatore |
| --- | ---: |
| Monza | 5.793 m |
| Monaco | 3.337 m |
| Le Mans | 13.626 m |
| Laboratorio | circuito di prova incluso nell'app |

Monza, Monaco e Le Mans mantengono forme e proporzioni derivate dalle mappe di riferimento. La larghezza locale, i cordoli, i raggi e i bordi sono approssimazioni documentate del simulatore: non sono una scansione laser, non includono un rilievo altimetrico completo e non rappresentano una certificazione tecnica dei circuiti reali.

La stessa geometria di carreggiata viene usata da disegno, sensori, controllo dei bordi e uscita di pista, così la mappa osservata dall'utente corrisponde alla superficie valutata dalla simulazione.

## Come funzionano fisica e apprendimento

La vettura usa unità SI e un modello discreto con inerzia, velocità, imbardata, trasferimento di carico e quattro patch di contatto. Sono presenti cambio sequenziale, limitatore, retromarcia, protezione dalla scalata fuori giri, ABS e controllo di trazione come componenti stimati del simulatore.

Gli agenti non si scontrano tra loro: ogni auto viene valutata indipendentemente. Gli urti contro il bordo della pista e le uscite dalla carreggiata possono invece terminare l'episodio.

La selezione evolutiva usa il saldo tra ricompense e penalità, con giri, tempo e progresso come informazioni di valutazione. Le auto possono quindi peggiorare temporaneamente o rimanere immobili nelle prime generazioni: non esiste una promessa di convergenza dopo pochi episodi.

## Avvio rapido da Windows

1. Scarica la [portable](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.1.0/MAL-E-CNS-Circuit-Lab-portable-5.1.0-x64.exe) oppure l'[installer](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.1.0/MAL-E-CNS-Circuit-Lab-setup-5.1.0-x64.exe).
2. Avvia l'app e scegli circuito, modello e numero di agenti.
3. Premi **Avvia** per iniziare le generazioni.
4. Usa **Panoramica 3D** per vedere tutto il tracciato oppure **Segui auto** per osservare un agente.
5. Controlla generazione, giri completati, tempo sul giro, progresso e saldo ricompense/penalità.
6. Salva i progressi prima di chiudere l'app se vuoi riprendere l'addestramento.

I salvataggi `.malecns-save` creati dalla versione `5.1.0` richiedono esattamente la versione `5.1.0`; non vengono migrati automaticamente tra versioni diverse.

## Avvio da sorgente

Richiede Node.js e npm.

```powershell
git clone --recurse-submodules https://github.com/Riccardozono/male-cns-circuit-lab.git
cd male-cns-circuit-lab
npm install
npm start
```

Se il repository è stato clonato senza submodule:

```powershell
git submodule update --init --recursive
```

## Test, benchmark e build

```powershell
# Test automatici
npm test

# Benchmark di tutti i modelli/piste secondo il protocollo del progetto
npm run benchmark:all

# Genera portable e installer Windows x64
npm run dist
```

`npm run dist` produce gli artefatti nella cartella `dist-textures-v510/`. Le cartelle `dist-*` e `node_modules/` sono generate localmente e non fanno parte del sorgente versionato. Gli eseguibili contengono file singoli oltre il limite di 100 MB di GitHub, quindi vengono pubblicati nella pagina Releases e non nella cronologia del codice.

## Struttura del progetto

| Cartella/file | Contenuto |
| --- | --- |
| `desktop/` | Shell Electron e runtime Windows. |
| `outputs/` | Interfaccia, simulazione, apprendimento, veicolo, circuiti, renderer 2D/3D, connectome e documentazione. |
| `outputs/data/` | Export offline, circuiti, manifest e checksum del dataset usato dall'app. |
| `outputs/assets/` | Modello Porsche, texture e documentazione di provenienza degli asset. |
| `work/` | Submodule MaleCNS, benchmark e strumenti riproducibili. |
| `package.json` | Script di sviluppo, test e distribuzione. |

## Limiti dichiarati

- Non vengono simulate collisioni tra auto, danni deformabili, meteo o scia aerodinamica.
- I cordoli non sono un modello completo di elevazione e sospensione.
- I coefficienti di pneumatici, aerodinamica, motore e trasmissione sono tarature del simulatore, non dati certificati da Porsche o Michelin.
- La GPU viene usata tramite WebGPU quando disponibile; il fallback CPU non equivale a CUDA.
- Le misure di performance e i risultati di apprendimento dipendono da modello, popolazione, circuito, seed e hardware.

## Documentazione tecnica

- [Documentazione della distribuzione 5.1.0](outputs/README.md)
- [Verifica della versione 5.1.0](outputs/VERIFICA-v510.md)
- [Modello V5 e limiti](outputs/MODELLO-V5.md)
- [Circuiti e provenienza delle geometrie](outputs/CIRCUITI.md)
- [Vista 3D](outputs/VISTA-3D-v510.md)
- [Correzione delle texture](outputs/TEXTURE-v510.md)
- [Crediti del modello Porsche](outputs/assets/PORSCHE-3D-CREDITS.md)

## Attribuzioni

- Connectome MaleCNS e riferimenti anatomici: [natverse/malecns](https://github.com/natverse/malecns).
- Export, manifest e checksum utilizzati dall'app: [`outputs/data/`](outputs/data/).
- Modello 3D Porsche e relative fonti: [documentazione degli asset](outputs/assets/PORSCHE-3D-CREDITS.md).
- Il progetto è un laboratorio sperimentale ispirato al riferimento funzionale indicato dall'utente; non riusa codice o asset del gioco Steam citato come esempio.
