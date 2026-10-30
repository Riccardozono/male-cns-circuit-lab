# Memoria neurale appresa: esperimenti privati

Versione dell'app invariata a 5.6.0. Nessuno di questi esperimenti modifica
il campione o la compatibilità dei salvataggi della copia Windows.
Il riferimento globale di ricerca resta il modello nativo verificato a
6.599,124811 m e 4.061,327606 punti, un giro in 742,550161 secondi.

## Prima struttura: durata appresa sulle correzioni esistenti

`neural-learned-context-memory.cjs` implementa tre tracce artificiali
alimentate solo dai contesti di osservazioni neurali reali. La durata è
appresa tramite tre coefficienti: `decay = -expm1(-max(0, parametro))`.
Durata zero riproduce bit per bit il comportamento istantaneo. Non è
un tempo del circuito o una posizione usata come ingresso, e non è una
simulazione completa della fisiologia della mosca.

La prima variante apprende sei coefficienti motori e tre durate sostituendo
l'ultimo livello istantaneo del campione. La prova nativa iniziale ha
riprodotto esattamente tutti gli 8.527 controlli della corsa di riferimento.

Esperimento `neuronal-learned-memory256-first`: concluso con 256 candidati,
16 aggiornamenti, 21.843 controlli di suffisso, nessun miglioramento pulito.
153 episodi sono terminati per urto, 67 per arresto e 36 per lentezza.
Il verificatore ha ricostruito esattamente gli ask/tell e gli stati CMA;
SHA-256 del report:
`caccc64b0f85db478db68a5749295ab908b7c220d485804b4f9f245959599284`.
Nessun candidato è stato promosso. Non ripetere automaticamente la prova
da uno `state.json`: il processo è concluso e non risulta più attivo.

## Seconda struttura: memoria aggiuntiva senza alterare il campione

`neural-additive-memory-env.cjs` e `neural-additive-memory-native.cjs`
mantengono congelato TUTTO il controller verificato e aggiungono una
memoria separata con sei pesi motori inizialmente zero e tre durate
apprendibili. In questo modo non si impone la persistenza delle precedenti
correzioni, che possono essere frenanti. La selezione usa solo i punteggi
ufficiali di prove fisiche concluse, senza comandi ideali, traiettoria,
coordinate o tempo come ingressi della politica.

Quattro test numerici passati: equivalenza istantanea a durata zero,
reset/ripristino della sola memoria realmente osservata, comandi limitati
con pedali esclusivi, e conservazione del comando precedente con nuovi
pesi zero anche se la memoria è attiva.

`additive-memory-preflight/independent-native.json`: prova completa nativa,
8.527 controlli, traccia esatta
`3864025ee715905cd9dd4794f4a7db59ff8b3c7c9f31f0c57a642cceeb56614a`,
8.527 chiamate GPU, nessun fallback CPU. La nuova memoria è positiva per
150 controlli, contro otto del contesto istantaneo nel campione. È una
misura di persistenza della rappresentazione, NON un miglioramento di guida.

L'esperimento `neuronal-additive-memory256-first` è stato eseguito separatamente.
Prima di riavviare qualsiasi prova controllare il processo/handle effettivo.
Usare i risultati terminali `report.json`, `verification.json` e l'eventuale
`independent-native.json` nella sua directory per verificarne l'esito.

### Esito terminale della seconda struttura

La prova è conclusa: 256 candidati, 16 aggiornamenti, 20.722 controlli di
suffisso. Nessun candidato pulito supera il riferimento. 146 prove per
urto, 64 per arresto, 46 per lentezza. Il candidato con massima distanza
raggiunge 6.624,102205 m ma termina per urto con 2.209,338272 punti:
non è una soluzione migliore. Il verificatore numerico ha ricostruito
tutti gli aggiornamenti e verificato le identità di sorgenti, CUDA e dati.
SHA-256 del report:
`f72fb8fdc84b85cc095d5c71db24cd7b08931d973f1d29453fbfe736a2708c00`.

Questi due risultati negativi non giustificano installare il modello,
aumentare ulteriormente gli agenti o dichiarare che la memoria da sola
risolve il blocco. Le penalità ufficiali restano invariate.
`verify-additive-memory-transfer.cjs` controlla separatamente il candidato
fallito con massima distanza in una corsa nativa completa, confrontando
comandi e risultato con la prova di allenamento. Il relativo file
`failed-candidate-native-transfer.json` è diagnostico, non una promozione.

Il controllo di trasferimento è passato: un'altra corsa nativa completa di
8.457 controlli coincide esattamente con comandi e risultato del candidato
fallito. La memoria resta attiva per 80 controlli; 8.457 chiamate GPU e
nessun fallback CPU. Traccia:
`afd35c41e59383f0740162d97b6a2d738ffb8bfad3af57025762265b6a7f3682`.
Questo esclude una discrepanza di trasferimento per quel candidato, non
dimostra la correttezza universale del nuovo controller o la causa del crash.

## Verifiche

Con il Python locale `.impeccable/rl-venv/Scripts/python.exe`:

```
work/verify_learned_context_memory.py neuronal-learned-memory256-first
work/verify_learned_context_memory.py neuronal-additive-memory256-first
```

Il verificatore numerico supporta entrambi i protocolli a nove coefficienti:
usa la prova iniziale, i sorgenti e il seme registrati in ciascun esperimento.
Non esegue nuove corse e non dimostra da solo il trasferimento alla fisica
nativa. Un candidato migliore richiede due corse complete di allenamento
e la successiva prova nativa indipendente tramite il Node 24.19 locale:

```
work/verify-additive-memory-native.cjs neuronal-additive-memory256-first
```

I prefissi di allenamento sono realmente raggiunti in quattro processi
separati. Ripristinarli riduce il costo della ricerca ma non crea nuovi
giri completi; soltanto le partenze complete verificano quel risultato.
