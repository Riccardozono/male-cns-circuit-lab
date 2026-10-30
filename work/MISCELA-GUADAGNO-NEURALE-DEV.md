# Guadagno apprendibile del feedback neurale

Esperimento privato sul motore nativo; la copia Windows utilizzabile e i suoi
salvataggi restano invariati. Versione 5.6.0, nessun tag o release nuovi.

## Modifica implementata

Il genotipo contiene i 18 coefficienti del feedback corrente e un diciannovesimo
coefficiente che apprende la miscela tra evidenza neurale decadente e il picco
di evidenza già osservato. Il picco si aggiorna solo da memoria neurale reale,
non da posizione, tempo, traiettoria o azioni ideali. La correzione continua a
leggere otto valori correnti di neuroni discendenti: non è un comando motore
costante mantenuto nel tempo. Il controllo nativo del segnale neurale e i limiti
con pedali esclusivi restano quelli del motore precedente.

La miscela è limitata all'intervallo [0,1]. A zero restituisce esattamente il
vecchio gate; a uno usa il picco osservato. Il nuovo stato di picco ha reset,
cattura e ripristino propri in entrambi i percorsi, allenamento e fisica nativa.
Non si cambia la fisica né si riducono le penalità ufficiali.

Il punto di partenza NON è un vecchio modello più facile: sono i 18 pesi del
candidato verificato a 6.599,861744 m e 4.061,705194 punti, più miscela zero.
Il caricatore controlla report, verificatore, prova nativa e hash dei sorgenti
del riferimento. Non è un nuovo formato di salvataggio già supportato dall'app.

## Verifiche iniziali

Due test numerici passati su identità a miscela zero, stato/reset e limiti.
`learned-mixture-feedback-preflight/independent-native.json` conferma la corsa
completa di 8.531 controlli con esattamente la stessa traccia del riferimento:
`a6304cc3c1c7c71582699b61cccc6207182a463f2520deec7d573769c4357d4d`.
8.531 chiamate GPU e nessun fallback CPU. La miscela zero termina con gate
0,2825989382, come previsto per il controller precedente: questa verifica
non dimostra ancora il beneficio della miscela attiva.

## Allenamento e prove richieste

`neuronal-mixture-feedback256-first` confronta 256 candidati in 16 iterazioni.
Quattro processi fisici raggiungono ciascuno il prefisso, poi verificano il
riferimento da partenza completa e dalle quattro ripartenze brevi. Solo prove
concluse e punteggi ufficiali reali entrano nella selezione; nessuna previsione
o posizione ripristinata viene presentata come un nuovo giro completo.

Un candidato pulito più forte richiede due partenze complete e una prova
nativa indipendente prima di una promozione. In aggiunta, un controllo separato
sceglie il candidato più lontano con miscela POSITIVA e ripete l'intera corsa:
verifica che il mantenimento del picco sia stato effettivamente usato e che
il comportamento non dipenda da un errore di ripristino dello stato.

Comandi con Python e Node locali fissati nel progetto:

```
work/train_mixture_neuronal_feedback.py --tag neuronal-mixture-feedback256-first --generations 16
work/verify_mixture_neuronal_feedback.py neuronal-mixture-feedback256-first
work/verify-mixture-feedback-native.cjs neuronal-mixture-feedback256-first
work/verify-mixture-feedback-transfer.cjs
```

L'allenamento è già avviato: prima di ripeterlo controllare l'handle/processo
effettivo, non soltanto `state.json`. Consultare `report.json`,
`verification.json`, `independent-native.json` ed eventuale
`positive-mixture-native-transfer.json` per gli esiti terminali.
I test di funzionamento non dimostrano convergenza o due giri completati.

## Esiti terminali

`neuronal-mixture-feedback256-first`: 256 valutazioni, 16 aggiornamenti CMA,
20.452 controlli di suffisso, nessun miglioramento pulito. 146 prove per urto,
66 per arresto e 44 per lentezza. La ricostruzione indipendente dei sorgenti,
delle proposte e degli aggiornamenti è passata; report SHA-256:
`e03d125d8607453f9cbe759a4f3cf78038d0cbb49a3b79d60d65ebb57f87f344`.

Il controllo nativo con miscela positiva ha riprodotto esattamente il candidato
a 6.618,772821 m e 2.188,138409 punti, terminato per urto. Parametro miscela
1,435397375, limitato effettivamente a 1. Il guadagno mantenuto è stato usato
in 73 controlli. Tutti gli 8.450 controlli coincidono con l'allenamento, traccia
`3e8e284dc49cd551dcc4ebb0098ad748b7c3242a6738ac559e4343d275a65006`;
8.450 chiamate GPU e nessun fallback CPU. Non è una promozione o una prova
universale di trasferimento: riguarda quel candidato realmente eseguito.

Un ulteriore confronto nativo mantiene tutti i 18 coefficienti del campione
e cambia solo la miscela a 1: 6.588,572834 m, 2.204,525444 punti, urto.
La ritenzione è stata usata in 52 controlli; il gate finale è effettivamente 1.
File `mixture-single-axis-full-native.json`. Quindi mantenere l'autorità
senza apprendere una strategia migliore non risolve il blocco.

### Griglia di bias a miscela mantenuta

`neuronal-mixture-bias-grid81-first` confronta 81 coppie dei due coefficienti
di bias, con delta `[-4,-2,-1,-0.5,0,0.5,1,2,4]` e miscela fissa a 1.
Le altre componenti del readout restano quelle del campione. Sono parametri
del readout, non azioni di sterzo/gas/freno imposte alla macchina.
Sono state eseguite 81 prove fisiche corte e 3.627 controlli di suffisso;
52 prove per urto e 29 per arresto, nessun miglioramento pulito.
Il riferimento nativo completo esistente è stato riusato, dopo verifica
dei sorgenti; quattro nuovi processi hanno raggiunto fisicamente i prefissi
e riprodotto la corsa del campione nelle quattro ripartenze. La cella centrale
coincide esattamente col confronto nativo della sola miscela descritto sopra.

Il verificatore ha ricostruito tutte le 81 combinazioni e riconciliato i record:
report SHA-256 `e0899bdcd2ee7b6b6254ae03d26f21e768f0126375badb9550aaa80a7e75db1d`.
Massima distanza 6.626,593784 m con urto, non un campione migliore. Non sono
81 giri completi e il verificatore non esegue altre 81 corse.

Il riferimento globale resta 6.599,861744 m e 4.061,705194 punti, un solo giro.
La nuova miscela funziona e il trasferimento controllato coincide, ma questi
esperimenti non hanno dimostrato una strategia migliore. Non installare la
variante o dichiarare risolto il secondo giro dai soli controlli tecnici.
