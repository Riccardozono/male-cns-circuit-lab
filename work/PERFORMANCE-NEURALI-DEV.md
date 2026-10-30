# Profilazione e disposizione stabile delle connessioni

Prova privata sul runtime Node 24.19.0, V3/Monza e modello di ricerca
verificato da 6.590,792 m. Non modifica la release 5.6.0, il modello numerico
precedente, i salvataggi o le copie Windows esistenti.

## Profilo effettivo

`profile-neural-native.cjs` esegue un episodio nativo completo dal traguardo
con il campionatore CPU di V8. Metriche e intera traccia dei comandi coincidono
con il modello verificato. Su 38.806 campioni, 24.129 (circa 62,18%) ricadono
nel kernel neurale `exact-coo.cjs:pass`. È una prova strumentata su una
traiettoria, comprensiva di avvio/GC e con un altro learner attivo durante parte
dell'esecuzione: le percentuali non sono tempi esatti o un profilo dell'intera
app, né una prova di accelerazione GPU.

Artefatti sotto `neuronal-native-cpu-profile/`: `identity.json`,
`native-proof.json`, `profile.cpuprofile` e `summary.json`. L'analizzatore
`analyze_neural_cpu_profile.py` verifica sorgenti, modello e prova nativa prima
di contare i campioni. La misura suggerisce dove intervenire, non una vittoria
di prestazioni già dimostrata.

## Kernel alternativo, nessuna approssimazione intenzionale

`exact-incoming-stable.cjs` raggruppa le connessioni per neurone destinatario.
Dentro ciascun gruppo, l'ordine delle addizioni resta quello del COO originale.
Non cambia pesi, guadagni, neuroni, iterazioni, tanh, composizione dei motori o
fisica. Le moltiplicazioni dei pesi invariati sono preparate una volta;
confronti dei byte rilevano modifiche in-place di topologia, pesi e gruppi.
I guadagni correnti vengono controllati a ogni chiamata. Percorsi non
supportati e disabilitazione delle connessioni usano il kernel originale.
Non sono memorizzati comandi di guida o episodi da riprodurre.

Tre test confrontano gli array byte per byte su otto cervelli realmente
raggiunti, con 1/2/4/8 iterazioni e con/senza guadagni. Verificano anche
modifiche in-place e fallback per connessioni disabilitate.

Il motore separato `neural-statehead-incoming-runtime.cjs` dichiara una propria
identità completa. Carica il modello con il suo loader originale e non fa
passare il nuovo motore come quello dei vecchi salvataggi.

## Verifica fisica completa

`verify-neural-incoming-live.cjs` esegue due controller effettivamente valutati
nei due motori, dal traguardo alla vera terminazione. Tutti i **16.912 confronti**
passano: intero cervello, intera vettura, osservazioni neurali, sensori,
comandi, trail, premi/penalità e stato del correttore coincidono a ogni
controllo. I due episodi eseguono 8.495 e 8.415 controlli. Nessun fallback
si verifica in queste prove. È evidenza forte su traiettorie finite, non una
dimostrazione universale su ogni grafo o modello.

Rapporto: `neuronal-incoming-full-state-equivalence/report.json`.
Il tempo di questo verificatore include confronti e checksum pesanti:
non viene usato come misura di velocità del motore.

## Confronto dei tempi separato

`benchmark-neural-incoming-batch.cjs` esegue quattro auto con pesi realmente
valutati in studi precedenti. Il motore originale e quello alternativo sono
eseguiti sequenzialmente, senza altri learner/benchmark dell'agente attivi
all'avvio. Le altre applicazioni e le condizioni termiche/scheduler del PC
non vengono controllate o chiuse. Il confronto non è randomizzato.

Le misure richiedono i rapporti conclusivi di
`neuronal-incoming-four-reference/` e `neuronal-incoming-four-prepared/` e la
riconciliazione `verify_neural_incoming_benchmark.py`. Fino a quel momento non
è dichiarato un miglioramento. Una singola coppia, anche se positiva, non
dimostra FPS dell'app, vantaggi su tutti i circuiti, accelerazione GPU o
convergenza più rapida dell'apprendimento.

### Esiti effettivi, nessuna installazione

La serie è conclusa e riconciliata su **33.815 controlli per esecuzione**,
con gli stessi risultati e intere tracce per ciascuna delle quattro auto.

| Motore | Tempo trascorso | Tempo CPU del processo |
| --- | ---: | ---: |
| COO originale | 199,888 s | 193,202 s |
| Incoming stabile | 210,204 s | 204,453 s |
| COO con preparazione riusata | 198,529 s | 193,031 s |

Il raggruppamento incoming è più lento del 5,16% in tempo trascorso. Non viene
installato. Una seconda variante, `exact-coo-prepared.cjs`, mantiene proprio
l'ordine COO originale e riusa solo pesi/guadagni invariati, controllandone
i byte e il tipo Float32/Float64. I quattro test verificano anche che byte
identici interpretati con tipi diversi non producano un falso riuso.

La variante prepared riduce il tempo trascorso solo dello 0,68% e il CPU
dello 0,09%. Questa singola serie non dimostra un vantaggio utile o ripetibile;
anche questa variante non viene installata. La sua verifica full-state in
lockstep è preparata ma **non eseguita**: non è corretta attribuirle i
16.912 confronti del motore incoming. Per prepared passano i test del kernel
e le quattro tracce fisiche complete, non quella prova aggiuntiva.

Gli analizzatori `verify_neural_incoming_benchmark.py` e
`verify_neural_prepared_benchmark.py` passano. La terza misura riusa il primo
originale come riferimento, non una nuova coppia randomizzata; i due harness
sono distinti e controllati con SHA-256. Brevi comandi unitari/diagnostici sono
stati eseguiti mentre la serie proseguiva. Non si chiudono app dell'autore o
si modificano impostazioni di sistema per rendere più favorevole il confronto.

Artefatti: `neuronal-incoming-four-reference/report.json`,
`neuronal-incoming-four-prepared/report.json` e `verification.json`,
`neuronal-coo-prepared-four/report.json` e `verification.json`.

## Verifica separata della capacità CUDA, non del cervello

Il PC espone effettivamente una RTX 4060, capability 8.9, con Torch
2.11.0+cu128 e NVRTC 12.8 nelle librerie locali già presenti.
`probe_cuda_nvrtc.py` non si limita a verificarne l'installazione: compila
un piccolo kernel, lo carica tramite CUDA Driver API e lo esegue sulla GPU.
I 1.024 risultati Float64 di una fixture numerica moltiplicazione/somma
coincidono byte per byte con il confronto CPU. FMA è disabilitato e le
operazioni hanno arrotondamento separato esplicito. Nessun driver, SDK o
impostazione globale viene installato o cambiato.

È una **fixture numerica sintetica dichiarata**, non dati per allenare,
un episodio di guida o un benchmark. Non testa tanh, riduzioni sinaptiche,
un intero cervello o compatibilità dei salvataggi. Non dimostra un backend
CUDA funzionante dell'app né un suo vantaggio prestazionale. Prima di
qualsiasi integrazione servono verifiche del kernel neurale completo e
traiettorie indipendenti, non solo questo test di disponibilità eseguibile.

Rapporto: `cuda-nvrtc-affine-probe/report.json`.
API consultate: [NVRTC 12.8](https://docs.nvidia.com/cuda/archive/12.8.1/nvrtc/index.html)
e [CUDA Driver execution control 12.8](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-driver-api/group__CUDA__EXEC.html).
