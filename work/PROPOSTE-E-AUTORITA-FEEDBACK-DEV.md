# Proposte, confronti fisici e autorità del readout sperimentale

App Windows e versione 5.6.0 invariate. Nessuna release, compatibilità di
salvataggi o risultato dei modelli distribuiti viene cambiato da queste prove.

## Predittore dei risultati: non qualificato

Il modello in `neuronal_fitness_surrogate.py` riceve soltanto i 18 coefficienti
e i punteggi ufficiali delle prove concluse; serve a proporre esperimenti,
non a guidare l'auto. Prima della suddivisione, i duplicati del genotipo sono
raggruppati e devono avere punteggio/traccia identici.

I 256 record storici comprendono 241 genotipi unici. Suddivisione per hash:
150 training, 45 validazione per scegliere lunghezza/ridge e 46 test non usati
per quella scelta. Test MAE: 797,515242 punti, contro 829,772278 di una
previsione costante. Non supera il requisito prefissato del 10% di riduzione
dell'errore: nessuna proposta del predittore è stata eseguita o conteggiata
come prova fisica. La ricostruzione indipendente dei risultati è passata.
Prove: `current-feedback-fitness-surrogate-calibration/calibration.json` e
`verification.json` nella directory di ricerca locale.

## Confronti fisici su singoli coefficienti

`neuronal-coordinate-feedback8-first`: otto cicli su 18 coefficienti,
328 valutazioni reali, di cui 288 mutazioni e 40 rivalutazioni del campione.
Ogni mutazione cambia un solo coefficiente in uno dei due versi; l'ampiezza
aumenta dopo un ciclo utile e diminuisce dopo uno senza miglioramento.
Due test verificano accoppiamento dei confronti, limiti ed esclusione di
esiti non sicuri/incompleti dalla promozione.

Due aggiornamenti accettati, 31.116 controlli di suffisso; 328
valutazioni NON sono 328 giri completi. I quattro prefissi sono realmente
raggiunti, poi le prove corte ripartono da stati fisici propri.

Il migliore pulito arriva a 6.599,861744 m e 4.061,705194 punti: circa 2,85 cm
oltre il precedente riferimento. Ancora un giro in 742,550161 s, poi arresto.
Questo guadagno microscopico non risolve il secondo giro o dimostra buona
convergenza. Il verificatore ha ricostruito tutti i confronti, aggiornamenti
e variazioni del passo. Report SHA-256:
`ab1bbc557fd87d180d1fbe1ab6fc01f6b45deea14b58dda3ea3d3310a55c449b`.

Due corse complete e una prova nativa indipendente di 8.531 controlli
coincidono esattamente, traccia:
`a6304cc3c1c7c71582699b61cccc6207182a463f2520deec7d573769c4357d4d`.
La prova nativa usa 8.531 chiamate GPU, nessun fallback CPU. Il candidato
resta un risultato di ricerca, non installato nell'app Windows.

## Limite di autorità misurato

`current-feedback-authority-audit.json` contiene una corsa nativa completa
a nuovi pesi zero del precedente riferimento a 6.599,833256 m. Nessuna azione
è stata sostituita. La traccia è invariata e sono controllati gli stati
effettivamente attraversati. Dopo ogni step viene letta la memoria aggiornata
che ha contribuito al comando appena eseguito, non quella del controllo prima.

Il gate massimo è 1, ma decade. Su 155 controlli attivi, 114 hanno un comando
longitudinale precedente frenante; in 85 di questi persino il limite ottimistico
`comando_precedente + 2 × gate` non diventa positivo. Nell'ultimo controllo:
gate 0,3100935331, comando precedente −0,9857517564, massimo teorico −0,3655646901.
Quindi a QUEGLI stati il nuovo readout, anche con residuo positivo massimo,
non può comandare gas. Non prova che ogni traiettoria alternativa sia impossibile
o che questo sia l'unico motivo dell'arresto. Riguarda questo readout sperimentale,
non tutti i precedenti modelli o una mancata funzionalità fisica del freno.

## Modulo preparato, non ancora integrato

`neural-learned-feedback-gate.cjs` implementa una miscela apprendibile tra
evidenza neurale decadente ed evidenza di picco mantenuta. Miscela zero
conserva bit per bit il gate precedente. La miscela non impone un comando
motore e non legge posizione, tempo, traiettoria o azioni ideali.
Due test passati verificano conservazione/reset/ripristino e il cambiamento
del limite numerico. Mancano integrazione fisica e allenamento: NON dichiararlo
già operativo o una soluzione verificata. Il prossimo esperimento deve partire
dal candidato globale a 6.599,861744 m, preservarlo con miscela zero e lasciare
apprendere la miscela insieme ai coefficienti di feedback.
