# Ricerca successiva al campione Windows

Esperimento privato, non installato nella copia Windows e non una release.
Mantiene congelato il campione verificato `0d23973f4f7ef4d590238b38062203db5b1eb773923315d70d02a2f285eef908`.
Il confronto deve superare 6.597,375423 m e 4.060,441745 punti senza urti;
non basta superare i precedenti campioni più deboli.

## Modifica sperimentale

Tre contesti istantanei aggiuntivi, sei nuovi coefficienti, ricavati soltanto
dalle osservazioni neurali del campione corrente. Non ricevono coordinate,
tempo, progressione sul circuito o comandi ideali. I centri sono selezionati
durante la preparazione dei dati; gli indici non sono ingressi della politica.
Il contesto si spegne quando l'osservazione esce dal suo supporto.

Preparazione: `.impeccable/review/neural-sacl/next-instant-context192-prepared`.
La corsa originale contiene 8.520 righe di 516 valori prima del comando;
8.328 controlli sono protetti e la prima attivazione osservata è al controllo
8.376. Questa garanzia riguarda la corsa osservata, non stati mai visitati.
Il replay indipendente a coefficienti zero ha riprodotto esattamente tutti
i 4.396.320 valori, le scale, i centri, i raggi e la traccia completa,
con 8.520 chiamate GPU e nessun fallback CPU: `verification.json`.

## Esecuzione e verifica

Usare il Python locale `.impeccable/rl-venv/Scripts/python.exe`:

```
work/train_next_instant_context.py --tag neuronal-next-instant256-first --generations 16
work/verify_next_instant_search.py neuronal-next-instant256-first
```

Il primo comando è già stato avviato. Non riavviarlo sulla base di uno
`state.json` non aggiornato: controllare il processo e il suo handle.
I quattro processi raggiungono autonomamente il prefisso. Le prove accorciate
ripartono da uno stato fisico realmente raggiunto e non sono nuovi giri
completi indipendenti. L'ottimizzatore riceve solo coefficienti e punteggi
ufficiali delle prove concluse. L'élite è realmente rivalutata.

Solo un candidato pulito più forte riceve due prove complete dal traguardo.
Il verificatore ricostruisce ogni ask/tell e l'intero stato dell'ottimizzatore.
Prima di qualsiasi promozione serve inoltre il comando Node locale:

```
work/verify-next-instant-native.cjs neuronal-next-instant256-first
```

Quest'ultima esecuzione usa fisica nativa indipendente, senza il trasporto
di allenamento né ripristino di stati. Un eventuale esito positivo non
garantisce due giri, generalizzazione o convergenza da zero. Per i risultati
consultare i file terminali effettivi `report.json` e `verification.json`
nella directory dell'esperimento, non questo testo.

## Esito terminale verificato

`neuronal-next-instant256-first/report.json`: 256 candidati realmente
valutati, 16 aggiornamenti CMA, 17.148 controlli di suffisso. I circa
139,281 secondi del processo comprendono preparazione dei quattro prefissi,
preflight e due corse complete finali: non sono una misura della velocità
di apprendimento generale né 256 nuovi giri completi.
`verification.json` ricostruisce esattamente tutti gli aggiornamenti;
SHA-256 del report:
`71fee58bbe841f54d8f5280efc70b0d681ea7ac6dd213c1d99d5f074d77cdc44`.

Il migliore pulito raggiunge 6.599,124811 m e 4.061,327606 punti:
guadagno 1,749388 m e 0,885861 punti. Ancora UN giro in 742,550161 s,
poi arresto senza progresso. Le due corse complete del trasporto e una
ulteriore corsa nativa indipendente di 8.527 controlli coincidono:
`independent-native.json`, traccia
`3864025ee715905cd9dd4794f4a7db59ff8b3c7c9f31f0c57a642cceeb56614a`.
La corsa nativa usa 8.527 chiamate GPU e nessun fallback CPU.
Questo candidato NON è stato installato nell'app o dichiarato compatibile
con i salvataggi Windows. Il default utilizzabile resta il precedente
modello qualificato, identità motore e dati invariati.

## Osservazione che cambia la prossima azione

`stall-observation.json` deriva da un'altra corsa nativa completa identica:
solo otto controlli hanno supporto nuovo attivo, uno con gas positivo e
sette con freno positivo. All'ultimo controllo entrambi i gruppi di
contesti istantanei sono spenti, la velocità è zero e il comando è
`[-0.8078340710829438, 0, 1]`: sterzo, gas, freno.
È un'osservazione, NON una dimostrazione della causa dell'arresto o del
fatto che imporre acceleratore migliorerebbe la corsa. I comandi osservati
non vanno trasformati in etichette ideali o sostituzioni manuali.

Prossimo lavoro: verificare una rappresentazione che copra gli stati
neurali realmente raggiunti dopo la prima correzione, o una memoria
neurale appresa e trasferibile, preservando la prova iniziale e i limiti
dei comandi. Non ripetere alla cieca lo stesso fit locale con più agenti:
il nuovo supporto si attiva per soli otto controlli nel candidato finale.
Non promettere convergenza o due giri dal solo aumento dei parametri.
