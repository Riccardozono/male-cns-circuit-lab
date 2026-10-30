# CUDA Float64 verificata: backend privato V3 e copia Windows separata

Il PC esegue realmente il calcolo neurale sulla RTX 4060 tramite un nuovo
backend Node/CUDA. Il confronto nativo V3/Monza a quattro auto misura un
vantaggio del 21,72% nel tempo trascorso, con intere tracce identiche.
Non è ancora un aggiornamento del portable/installer o della copia Windows
abituale, né una soluzione dell'apprendimento dei due giri.

## Cosa viene calcolato dove

- CPU: fisica, sensori, iniezione dei segnali, decoder già allenato, premi,
  selezione, salvataggi e interfaccia.
- GPU: propagazione ricorrente attraverso le 242.486 connessioni e i 7.721
  neuroni del V3 effettivamente provato, con quattro iterazioni per controllo.
- CPU: ricezione degli stati neurali Float64 e successivi comandi dell'auto.

Il kernel riceve soltanto topologia, pesi normalizzati, attività, iniezione e
guadagni. Non conosce coordinate della pista, percorso, tempo sul giro o
azioni da riprodurre. Non ci sono collisioni tra auto aggiunte da questo lavoro.
Le quantità provate non sono 166.000 neuroni e non sono una simulazione
fisiologica validata della mosca. V2/V4/V5 e altri circuiti restano da qualificare.

## Prima la precisione

Il runtime numerico è Node 24.19.0, V8 13.6.233.17-node.51. La funzione CUDA
standard `tanh` non coincide byte per byte con `Math.tanh`: nel confronto di
160.432 valori differisce su 38.460. Questo conteggio non dimostra da solo
una divergenza di guida, ma non permette di assumere equivalenza numerica.

Sono state recuperate le funzioni `tanh` ed `expm1` della
[stessa versione ufficiale Node/V8](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/v8/src/base/ieee754.cc),
verificando l'header di versione contro il runtime locale. L'adattamento CUDA
mantiene formule e avvisi originali, con arrotondamenti separati, niente FMA
e ordine delle addizioni invariato dentro ogni neurone destinatario.

Permessi Sun/fdlibm e licenza V8 sono conservati nei riferimenti e nel sorgente
generato. Il pacchetto valido è **`cuda-v3-kernel-prepared-r2`**, con PTX,
sorgente e `LICENSE.V8-fdlibm.txt` controllati tramite SHA-256. Il primo tentativo
`cuda-v3-kernel-prepared` è conservato come fallito: confrontava erroneamente
hash di testo LF in memoria e di file CRLF. Il tentativo r2 verifica separatamente
byte dell'artefatto e testo normalizzato; non cambia la matematica.

### Verifiche del componente

1. La funzione adattata coincide su **160.432 valori**, inclusi 123.536 valori
   ricavati da otto stati neurali raggiunti realmente e fixture numeriche
   esplicitamente dichiarate. Le fixture non entrano nell'apprendimento.
2. L'intero passo neurale CUDA coincide su **741.216 valori** di attività,
   buffer successivo e somme, per otto stati reali con 1/2/4/8 iterazioni.
   I passi extra mantengono fissi gli ingressi: non sono episodi fisici nuovi.
3. Gli stessi 741.216 confronti passano anche da **Node → driver → GPU → Node**,
   senza Python nel percorso di inferenza e senza fallback CPU.
4. La variante packed supera anche modifiche in-place di pesi, topologia,
   gruppi e guadagni. Connessioni disabilitate e buffer aliasati usano
   deliberatamente il kernel CPU originale nei test dedicati; nei confronti
   di guida il numero di fallback deve essere zero.

Artefatti sotto `.impeccable/review/neural-sacl/`:

- `cuda-v8-math-reference/reference.json`;
- `cuda-v8-tanh-probe/report.json`;
- `neuronal-cuda-pass-inputs/metadata.json` e riferimenti binari;
- `cuda-neural-pass-probe/report.json`;
- `node-cuda-neural-pass-probe/report.json`;
- `node-cuda-packed-pass-probe/report.json`.

## Collegamento nativo e isolamento

`cuda-exact-v3-pass.cjs` usa le API del driver NVIDIA con Koffi 3.3.3,
installato solo in `.impeccable/cuda-node-runtime/`, con versione e integrità
fissate nel lockfile. Gli script d'installazione sono disabilitati. Il package
principale dell'app non viene modificato. La dipendenza Koffi è MIT e mantiene
licenza/avvisi nel pacchetto installato; una futura distribuzione dovrà includerli.

La GPU ha capability 8.9 e il driver rilevato espone versione API 13040.
Node carica il PTX già compilato tramite le API Driver: non avvia Python o
NVRTC per ogni controllo. NVRTC/Torch già presenti servono alla preparazione
e alle prove, non al ciclo nativo di guida. Non si installano SDK/driver e
non si eseguono reset globali o cambi alle impostazioni della scheda.

Ogni processo possiede il proprio contesto e le proprie allocazioni, liberati
alla chiusura. I pesi/topologia cambiati sono rilevati confrontando i byte;
guadagni, attività e iniezione effettivi vengono trasferiti a ogni controllo.
Il limite di qualificazione rifiuta o conta esplicitamente percorsi non provati:
non viene considerato riuscito un test GPU eseguito in realtà sulla CPU.

`cuda-exact-v3-packed-pass.cjs` mantiene lo stesso kernel ma raggruppa i
quattro vettori di ingresso e i tre di uscita in **una copia per direzione**.
Non riduce precisione, neuroni, iterazioni o stato della vettura. Non è un
batch parallelo di cento auto: l'harness attuale avanza quattro agenti
sequenzialmente, con stati fisici e neurali indipendenti.

## Due controller: identità durante episodi fisici completi

Sia il collegamento iniziale sia quello packed sono confrontati con il motore
CPU a ogni controllo, dal traguardo alla vera terminazione di due controller
distinti. Ciascuna prova supera **16.912 confronti** dell'intero cervello,
intera vettura, osservazioni, sensori, comandi, trail, premi e stato del decoder.

Per la variante packed: 16.910 chiamate effettive GPU, 67.640 kernel, zero
fallback CPU. Gli episodi eseguono 8.495 e 8.415 controlli. Sono due episodi
separati, **ciascuno con un solo giro completato**, non il raggiungimento
dell'obiettivo di due giri nello stesso episodio.

Rapporti: `neuronal-cuda-full-state-equivalence/report.json` e
`neuronal-cuda-packed-full-state-equivalence/report.json`. I tempi dei
verificatori includono confronti/checksum pesanti e non sono benchmark.

## Benchmark nativo: quattro auto complete

Una nuova coppia sequenziale CPU poi CUDA usa quattro vettori di pesi distinti
già valutati fisicamente. Ogni esecuzione conclude **33.815 controlli**, con
risultati e intere tracce comandi/progresso/tempo identici per tutte le auto.

| Misura di questa coppia | CPU originale | CUDA packed |
| --- | ---: | ---: |
| Tempo trascorso | 200,383611 s | 156,856756 s |
| Tempo CPU del processo host | 194,454 s | 93,360 s |

Tempo trascorso ridotto del **21,72%**, throughput circa **1,277×**; tempo CPU
host ridotto del 51,99%. Il tempo CPU host non comprende calcolo o energia
della GPU. Non è corretto chiamarlo riduzione dell'energia totale del PC.
Il report CUDA registra 33.815 passaggi GPU e 135.260 kernel, zero fallback.

`verify_neural_cuda_packed_benchmark.py` controlla i risultati, tutte le tracce,
identità di sorgenti/runtime/PTX/driver/addon e i contatori prima di riportare
le misure. Rapporti:

- `neuronal-cuda-packed-four-reference/report.json`;
- `neuronal-cuda-packed-four/report.json` e `verification.json`.

Limiti: una sola coppia, ordine non randomizzato, altre app/temperatura/cache
e scheduler non controllati. Nessun altro learner/benchmark dell'agente è
attivo all'avvio. Non dimostra FPS dell'intera app, fattore 30× effettivo,
vantaggio su tutti i modelli/circuiti, batch GPU da cento o migliore convergenza.

## Integrazione Windows privata successiva alle prove native

Il launcher CPU precedente non è stato sostituito. È ora presente
`Avvia-campione-neurale-cuda-dev.cmd`, con il design approvato, partenza
in pausa/16 auto, massimo 100, contatori GPU reali e formato separato
`.malecns-chain-cuda-dev`. La guida è `APP-WINDOWS-CUDA-DEV.md`.

La prova nativa chain completa supera 8.495 controlli su GPU con traccia
identica al campione CPU6584m. Il test della finestra Windows conclude con
25 controlli superati: pausa, avvio di 100 auto, generazione di 16 auto,
salvataggio/ricaricamento e assenza di errori renderer. Quella generazione
UI usa deliberatamente pesi uguali, preparati a mutazione zero: verifica
il motore e non dimostra esplorazione. La prova di apprendimento a sedici
coppie distinte è separata (`chain-cuda-diverse-first`).

Il motore ha identità/formato propri: non si aggirano le verifiche dei
salvataggi vecchi fingendo che il sorgente sia rimasto identico.

L'app e le distribuzioni rimangono 5.6.0. Nessun tag/release/commit/pubblicazione
è stato creato e non vengono chiuse finestre dell'autore. L'apprendimento dei
due giri, gli altri modelli/circuiti e l'avvio da zero restano obiettivi aperti.
