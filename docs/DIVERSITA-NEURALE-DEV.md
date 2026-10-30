# Diversità nella ricerca neurale — copia Windows 5.6.0

## Modello esportato e verificato

Apri **`Avvia-neurale-diversita-dev.cmd`** dalla cartella completa del progetto.
La copia parte in pausa, con una sola auto V3 su Monza, profilo separato
`.impeccable/development-context-diversity-profile`, Electron e runtime
Node 24.19.0. Mantiene mappa 2D/3D, camere e interfaccia già approvata.

Il modello esportato arriva a **2982,192214727352 m**, punteggio
**−1382,7101018799126**, **zero giri**, e termina per lentezza dopo
344,43333333333334 secondi simulati. Il precedente campione era a
2006,2274624276079 m: l'incremento di progresso è circa 976 m.

Il risultato è confermato in due episodi completi nel training, in due
episodi del runtime dati-only e in una vera finestra Windows, poi nuovamente
nella stessa finestra dopo i controlli finali del parser. La verifica Windows
supera **16 controlli funzionali**, senza nuove catture grafiche o nuove
affermazioni sulla visualizzazione dell'atlante in primo piano.

**La finestra è solo inferenza.** Non aggiorna pesi o generazioni mentre la
guardi. L'addestramento gira nei programmi sperimentali separati, su quattro
processi CPU. Questa copia richiede il progetto completo: non è un nuovo
portable, installer o release. Non importare il suo JSON come `.malecns-save`.
Il numero dell'app resta 5.6.0; salvataggio originale e distribuzioni restano
intatti. Il vecchio launcher della frontiera da 2006 m rimane disponibile.

## Che cosa è cambiato nell'apprendimento

La nuova ricerca conserva un archivio di alternative, invece di perdere
tutti i candidati che superano il campione ma poi urtano. È una variante
specifica del progetto ispirata agli archivi di
[MAP-Elites, Mouret e Clune](https://arxiv.org/abs/1504.04909), non una
riproduzione dichiarata dell'algoritmo del paper.

- Le celle distinguono fasce di progresso da 25 m e risultati con/senza urto.
- Un candidato che urta può essere un **genitore di esplorazione**, ma non
  viene promosso come **campione sicuro**.
- Un campione sicuro nuovo deve migliorare il punteggio senza diminuire
  progresso o giri. Prima di accettarlo si ripetono due partenze complete.
- Un membro della popolazione conserva il campione già appreso.
- Mutazioni e combinazioni cambiano soltanto coefficienti numerici appresi,
  non posizioni, comandi di un esperto o traiettorie imposte.
- Prove censurate, pedali sovrapposti e progresso non valido non vengono
  riutilizzati come genitori validi.

Il primo confronto valuta **1920 candidati nuovi**, in **40 iterazioni di
ricerca**, con popolazione 48 e quattro processi CPU. I 385 semi provengono
da precedenti prove fisiche del progetto; non sono esempi inventati. Alla
fine l'archivio contiene 45 celle. Queste iterazioni non vengono chiamate
generazioni completate nell'app né giri.

**Fisica, circuito, penalità e anatomia non sono stati allentati.** Il grafo
V3 rimane a 7721 neuroni / 242486 connessioni. I dieci coefficienti agiscono
su quattro proiezioni matematiche della storia di 128 discendenti reali;
il precedente controller appreso e il contesto neurale restano parte
dell'esecuzione. Le proiezioni non sono nuovi neuroni biologici.

Le coordinate, il progresso e il motivo della terminazione servono soltanto
alla valutazione e alla scelta dei genitori. Non sono ingressi del controller.
L'attivazione del correttore dipende dall'attività neurale osservata, con
memoria azzerata al Reset, non da un timer o una soglia di metri.

## Verifiche del punteggio e del movimento

Il confronto fisico precedente trovava il campione a 2006 m con punteggio
−2300,101 e l'esploratore a 2083 m con urto e punteggio −4144,851. La differenza
è circa 1844,750 punti. La sola differenza dei costi di urto e stallo vale
1800 punti: convertirla in circa 1604 metri aggiuntivi è una **stima pre-giro**,
non una misura della causa unica del problema o un nuovo obiettivo di guida.

Il ritorno non scontato degli episodi coincide con la differenza di punteggio.
Nel confronto con gamma 0,999 il campione resta migliore della fermata
anticipata: non è stata adottata una correzione arbitraria del discount
sulla base dell'ipotesi iniziale.

La diagnostica del nuovo export osserva tutti i **20666 tick fisici** senza
cambiare i comandi: spostamento nel mondo 3003,558 m, distanza integrata dal
veicolo 3003,612 m, progresso proiettato 2982,192 m, progresso inverso zero.
Le tre distanze sono metriche diverse, non vengono fatte coincidere.

Sono registrate 31 eccezioni locali della proiezione su segmenti adiacenti;
la maggiore accredita 0,868 m su un singolo tick. Sono rese visibili nel
rapporto, non nascoste o chiamate distanza fisica misurata. Questa diagnostica
non modifica il punteggio e non dimostra ancora un giro completo.

## Correzione della diagnosi sugli ingressi

Il conteggio dei sette canali in `graph.inputChannels` riguarda il ramo legacy.
Nel ramo usato dalle policy apprese, `sensorDrive` chiama `Learning.drive`,
che usa `k % 28`. La prova sui profili **V2, V3, V4 e V5** conferma che tutti
i 28 canali, compresi gli 11 raggi, raggiungono l'iniezione neurale delle
policy iniziali. Nessuna modifica alla mappatura è stata effettuata in base
al conteggio legacy.

Sono sonde numeriche standalone, mai comandi di veicolo o esempi di training.
Il risultato non prova la sensibilità di tutti i discendenti, l'importanza
di ogni canale in uno specifico salvataggio o l'apprendimento dei quattro
modelli su un circuito.

## Continuazione recuperabile

`recover-diversity-optimizer.cjs` ricostruisce lo stato del generatore casuale
controllando **tutti i 1920 vettori proposti** e l'intero archivio finale
contro il registro fisico precedente. Non riproduce azioni di guida, non
ricrea ricompense e non ripristina posizioni di veicoli.

È stata avviata una continuazione di 100 iterazioni con lo stesso archivio e
lo stesso stato casuale recuperato. `neural-diversity-resume-40/progress.json`
e `verified-champion.json` contengono risultati intermedi: non sono il report
finale e non cambiano automaticamente il modello congelato del launcher,
che resta a 2982 m. Verificare processo/sessione reale prima di riprendere:
non lanciare una seconda copia perché il file di avanzamento è fermo.

## Evidenze locali

Sotto `.impeccable/review/neural-sacl`:

- `ranking-audit/report.json`: ritorni, punteggi e candidati realmente ripetuti.
- `neural-diversity-first/report.json`: 1920 candidati, archivio, campioni,
  due ripetizioni complete e punteggi distinti dal progresso.
- `neural-diversity-first/optimizer-recovery.json`: ricostruzione esatta
  dei parametri e dello stato casuale.
- `diversity-native-model/model.malecns-neural-diversity.json`: export privato,
  SHA-256 `eeb141b90ad35cb9a8a5ab9cb0104c81589d47a0a5312a2e45624ceff338225e`.
- `diversity-native-model/verification.json`: due episodi dati-only completi.
- `context-native-3-diversity-functional/verification.json`: finestra Windows
  e worker effettivi, 16 controlli, risultato 2982 m.
- `diversity-physical-audit/report.json`: distanze fisiche e proiezioni separate.
- `policy-sensor-routing/report.json`: iniezione corretta sui quattro profili,
  con il limite di verifica descritto sopra.
- `frontier-preservation.json`: originali, due binari distribuiti locali,
  numero 5.6.0 e riferimento locale del tag invariati.

Comandi di verifica:

```text
node --test work/neural-diversity.test.cjs work/neural-projected-model.test.cjs
node work/verify-diversity-native.cjs
node work/run-context-native.cjs --stage=3 --diversity --functional-only
node work/verify-frontier-preservation.cjs
```

**Lavoro ancora aperto:** zero giri nel modello esportato; nessuna prova di
due giri, convergenza da zero o addestramento di tutti i modelli su tutti i
circuiti. L'archivio non è ancora il motore di training della normale app
distribuita. L'obiettivo complessivo non viene dichiarato raggiunto.
