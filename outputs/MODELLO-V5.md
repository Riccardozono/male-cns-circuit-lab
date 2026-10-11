# Modello V5 — app Windows 5.0.0

La maggiore capacità è operativa nel selettore **Modello / prove di verifica →
MaleCNS V5 esteso**. V2/V3/V4 rimangono disponibili. Un profilo nuovo parte con
V5; se avevi scelto un modello diverso, quella preferenza viene rispettata.

## Che cosa aumenta

| Voce | V4 | V5 |
|---|---:|---:|
| Neuroni anatomici nel dataset | 166.700 | 166.700 |
| Connessioni anatomiche dirette, almeno 5 sinapsi | 6.242.118 | 6.242.118 |
| Capacità del solver per agente e passo | 8.192 slot | 32.768 slot |
| Passaggi ricorrenti per aggiornamento neurale | 2 | 4 |
| Soglia minima di attività | 0,001 | 0,0005 |
| Soglia minima di contributo sinaptico | 0,000001 | 0,0000005 |
| Neuroni discendenti letti dal decoder | 64 | 128 |
| Gruppi di guadagno sinaptico apprendibili | 16 | 32 |
| Parametri della policy | 202 | 346 |
| Canali sensoriali effettivi | 28 | 28 |
| Frequenza dei comandi neurali | 10 Hz | 10 Hz |

Il V4 conteneva già tutti i neuroni annotati del bundle ufficiale installato.
Non è stato creato un numero fittizio maggiore di neuroni della mosca: V5
allarga la porzione ammessa al calcolo e il decoder apprendibile. Gli slot sono
un massimo, non una promessa che ogni slot contenga attività non nulla.

Il decoder conserva gli stessi 64 neuroni discendenti del V4 e ne aggiunge 64
reali, raggiungibili dagli ingressi lungo le connessioni anatomiche, fuori dal
nucleo storico. CPU e GPU proteggono tali letture dall'evizione del solver.
Non legge direttamente le coordinate della pista o una traiettoria ideale.
I gruppi sinaptici applicano guadagni appresi a connessioni già esistenti.

La policy passa da revisione 3 a 5 per distinguerne i tensori. L'ES mantiene
l'algoritmo corrente e apprende i 346 parametri dai punteggi netti della prova;
nessun insegnante, campione preaddestrato o azione di un pilota automatico.

## Hardware e costo

Nel percorso Windows ibrido la ricorrenza usa WebGPU quando disponibile; fisica,
sensori, ricompense e ottimizzazione usano i worker CPU. V5 continua a supportare
100 agenti. La scelta predefinita resta un worker per il grafo completo e
16 auto, così non vengono avviate diverse popolazioni complete in parallelo.
Il fallback CPU mantiene la stessa capacità V5, senza ridurre neuroni/passaggi
per nascondere la differenza, ma è più lento.

L'intervallo 0,5×–30× resta disponibile. Il fattore richiesto è distinto dal
rapporto reale tempo simulato/tempo trascorso: V5 esegue più lavoro, quindi
non è garantito il 30× effettivo con 100 auto. Neppure maggiore capacità o
maggiore progresso in una singola prova dimostrano apprendimento migliore in
generale. I risultati brevi sono separati in [VERIFICA-v500.md](VERIFICA-v500.md).

## Integrità e salvataggi

Il profilo `model-profiles.js` riusa il bundle `data/connectome-full.json/bin`
senza riscriverlo. DesktopEngine condivide lo stesso SharedArrayBuffer di
54.437.864 byte fra V4/V5. Ogni profilo ha solver e policy separati.
Il file condivisibile include revisione del profilo, forma dei parametri,
32 gruppi, 128 identità di lettura e configurazione del solver, oltre a
modello/circuito/ottimizzatore/storico. V4/V5 incompatibili sono rifiutati prima
di sostituire la prova. Si riparte in pausa dalla partenza della generazione,
non a metà giro. Vale il vincolo di versione esatta dell'app richiesto in
precedenza: 4.8.0 con 4.8.0; 5.0.0 con 5.0.0.

## Fonti e confini

Dati installati, conteggi, SHA-256 e selezione: [metadata originale](data/connectome-full.json).
Origine: [download ufficiale MaleCNS](https://male-cns.janelia.org/download/).
Configurazione realmente eseguita: [model-profiles.js](model-profiles.js) e
[neural-learning.js](neural-learning.js). Verifica anatomica: test
`tests/full-connectome.test.cjs` e `tests/model-v5.test.cjs`.

Si tratta di dinamica artificiale a tassi normalizzati, non di una validata
emulazione biologica completa. Neurotrasmettitori, potenziali di membrana e
ritardi sinaptici non sono simulati. Soglie, gruppi, frequenze, encoder/decoder
sono scelte implementative; il bundle include connessioni con almeno cinque
sinapsi, non ogni singola connessione dell'export ufficiale.
