# Esplorazione separata dal campione utilizzabile

Esperimento privato a versione 5.6.0 invariata. Non modifica il modello
predefinito dell'app Windows, la fisica o le penalità ufficiali.

## Cambiamento verificabile

I due precedenti esperimenti di memoria hanno valutato 256 candidati
ciascuno senza miglioramento pulito. Il candidato della memoria aggiuntiva
arrivato a 6.624,102205 m è stato scartato come campione perché terminato
per urto con 2.209,338272 punti. Il riferimento pulito resta 6.599,124811 m
e 4.061,327606 punti, un giro completato.

La nuova selezione conserva due categorie separate in intervalli di cinque
metri: esiti puliti ed esiti non sicuri. In ogni categoria/intervallo
mantiene il candidato con migliore punteggio ufficiale. Il campione cambia
solo con un risultato pulito, punteggio superiore e distanza/giri non
inferiori. Le varianti non sicure possono essere genitori di esplorazione,
mai campioni automaticamente. I descrittori servono solo all'ottimizzatore,
non vengono passati al controller dell'auto.

Ogni gruppo contiene 16 prove fisiche: il campione protetto, la rivalutazione
della frontiera e sette coppie di mutazioni opposte su sterzo, longitudinale,
durata della memoria o tutti i parametri. Il caso frontiera è davvero
rieseguito, non riceve un punteggio copiato dallo storico.

L'inferenza è esattamente quella della precedente memoria aggiuntiva:
nove coefficienti appresi da osservazioni neurali, nessuna traiettoria,
tempo, coordinata, azione ideale o pilota nascosto. Questa prova cambia
la selezione, non la dinamica neurale né le penalità.

## Provenienza delle prove

`neuronal-memory-archive256-first` importa 256 record fisici storici da
`neuronal-additive-memory256-first`, dopo controllo del relativo verificatore,
degli hash dei sorgenti e dei file di ciascuna iterazione. Questi record
NON sono nuove valutazioni e non vengono contati come nuovi giri.

La nuova prova deve valutare altri 256 candidati in quattro processi
indipendenti. Ciascuno raggiunge fisicamente il prefisso; le ripartenze
brevi da quel prefisso non costituiscono giri completi indipendenti.
Un eventuale miglioramento deve superare due corse complete dal traguardo
e poi una verifica nativa separata prima di qualsiasi promozione.

## Verifica

Due test numerici passati controllano che i genitori non sicuri non
sostituiscano il campione, che la selezione sia riproducibile e che
le prove incomplete siano rifiutate.

Con il Python locale:

```
work/neuronal_memory_archive_test.py
work/train_memory_archive.py --tag neuronal-memory-archive256-first --generations 16
work/verify_memory_archive.py neuronal-memory-archive256-first
```

Il comando di allenamento è stato già avviato: prima di ripeterlo verificare
il processo/handle effettivo. Il verificatore ricostruisce ogni scelta dei
genitori, mutazione, stato casuale e aggiornamento dell'archivio; controlla
anche che le rivalutazioni di campione/frontiera coincidano con le tracce
precedenti. Non esegue nuove corse né prova la convergenza da zero.

Consultare i file terminali `report.json` e `verification.json` per l'esito,
senza dedurre successo dalla presenza di un processo o da uno stato parziale.

## Esito terminale

L'esperimento è concluso: 256 NUOVE valutazioni e 256 record storici importati,
16 aggiornamenti dell'archivio, 21.447 controlli di suffisso. Il tempo registrato
di 164,938 secondi include prefissi e prove complete finali: non è un benchmark
generale di velocità né una misura dei giri completati da zero.

Migliore pulito: 6.599,833256 m, 4.061,694294 punti, un giro in 742,550161 s,
poi arresto senza progresso. Guadagno sul riferimento globale precedente:
0,708445 m e 0,366689 punti. La frontiera non sicura ha raggiunto 6.634,814070 m,
ma non è stata promossa. Non sono stati completati due giri.

`verification.json` ha ricostruito ogni scelta, mutazione, stato casuale e
archivio e ha riconciliato tutte le rivalutazioni. SHA-256 del report:
`3e4a007714c7f943d885162886db648520b0cb231ab6209d01a66b160c8a4d92`.
Due corse complete di allenamento e un'ulteriore corsa nativa indipendente
di 8.531 controlli coincidono esattamente, traccia
`1b598d56f9d312ecb07e68679a493b388477eb56eeeee4ec2826dc981b48763a`.
La corsa nativa ha usato 8.531 chiamate GPU senza fallback CPU; la memoria
è rimasta attiva per 154 controlli. File `independent-native.json`.

Il candidato è verificato come risultato di ricerca, NON installato nella
copia Windows e NON un formato di salvataggio già compatibile con essa.
Il default utilizzabile resta il modello qualificato precedente.
Questo singolo esperimento, alimentato anche dai record storici, non dimostra
una superiorità generale della nuova selezione sul precedente ottimizzatore.

Rimane da verificare una correzione che utilizzi l'attività neurale corrente
anche fuori dal supporto dei tre contesti: la memoria attuale conserva tre
tracce decadenti, non apprende un nuovo readout completo dello stato corrente.
È una possibile direzione sperimentale, non una causa accertata dell'arresto
o una garanzia di miglioramento. Non sostituire il controller con una traiettoria.
