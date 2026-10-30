# Penalità terminali complete: confronto controllato R7

R7 è una revisione privata dell'obiettivo di allenamento, non una release
dell'app. Restano invariati versione 5.6.0, fisica, sensori, terminazione,
punteggi R5 grezzi, salvataggi e campione della copia Windows.

## Correzione del caso locale

La parità R6 riguardava solo la penalità base: collisione 3.200 contro
arresto/lentezza 1.400, compensata aggiungendo 1.800 al termine. Restava
però il costo d'impatto della collisione, fino a 500 punti.
R7 porta il costo terminale di arresto/lentezza al massimo componente
collisione esistente: 3.200 + 500. Il costo aggiuntivo è quindi 2.300,
500 più di R6. Non viene ridotta alcuna penalità di collisione.
La scelta è una regola dell'esperimento, non un parametro fisico misurato.

Due test passati verificano l'ordinamento delle corse osservate e l'assenza
di costi terminali su segmenti non conclusi o due giri completati.
`direct-neuronal-policy-preflight-r7/verification.json` ripete realmente
le due corse, sia nel training sia nel nativo. Tracce e punteggi R5 identici:

| Corsa reale | Punti R5 | Training R6 | Training R7 |
|---|---:|---:|---:|
| 803,478 m, urto | −5.389,358 | −5.389,358 | −5.389,358 |
| 796,185 m, arresto | −3.576,656 | −5.376,656 | −5.876,656 |

R7 corregge l'ordinamento indesiderato di QUESTA coppia senza imporre comandi.
Non è una prova di ottimalità universale della ricompensa o di guida migliorata.
Altre 64 transizioni campionate realmente sono confrontate con il nativo.

## Allenamento controllato e risultato

`direct-neuronal-ppo64-from-line-r7` conserva pesi iniziali, critico, semi,
Gaussiane iniziali [0,02; 0,02], algoritmo e fisica della precedente prova
R6 a rumore ridotto. Cambia soltanto il costo terminale di arresto/lentezza.

`matched-controlled-prefix.json` riconcilia le prime 2.048 transizioni fisiche:
osservazioni, azioni, premi R5, terminali e next state identici. Cambia un solo
premio terminale, di ulteriori 500 punti; le politiche divergono dall'aggiornamento 3.
Le azioni storiche vengono confrontate DOPO la raccolta indipendente, mai usate
come istruzioni da imitare. Gli hash dei due report e dei file sono conservati.

La prova termina con 65.536 transizioni e 112 episodi conclusi nei rollout,
64 aggiornamenti. Il verificatore ricostruisce esattamente ogni aggiornamento
di attore, esplorazione e critico. Report SHA-256:
`1b356f0bf4306fc4e63847690da9da7135ab3e9cee9792cb52c76f3f3d8e926a`.

Nessun candidato migliora il riferimento globale. Il migliore per score di
training resta l'inizializzazione da 803 m; l'ultima politica percorre
704,436828 m e termina per urto, −5.601,546782 punti, zero giri.
`latest-policy-native.json` conferma con un'altra corsa nativa completa
gli stessi 487 controlli, risultato e traccia, senza fallback CPU.
La correzione del premio non ha quindi dimostrato un miglioramento dell'apprendimento.

## Sensibilità neurale vicino alla curva

`direct-neural-observability/jacobian.json` parte dallo stato realmente
raggiunto al controllo 600, 764,415 m. Su COPIE dell'attività neurale, applica
piccole perturbazioni numeriche ai 28 canali di input per uno o tre controlli,
con la dinamica anatomica invariata. Nessuna di queste perturbazioni muove
un'auto o entra nei dati di allenamento. La corsa originale continua e la
sua intera traccia coincide con il riferimento: nessun effetto sull'auto.

`analysis.json` verifica matrici 28×77 finite; il rango numerico locale è 28
alla soglia relativa 1e-6 per entrambi gli orizzonti, nessuna norma di canale
inferiore a 1e-12. In questo punto non risultano canali completamente scollegati
dal readout. Non prova osservabilità globale, informazione sufficiente per
guidare, o che la risposta sia utile all'attore corrente.

Questi dati non giustificano aggiungere sensori alla cieca o dichiarare che
servano solo più aggiornamenti PPO. Restano da valutare la distribuzione
delle azioni, l'esplorazione e la capacità del readout, mantenendo la verifica
finale sulla stessa Monza e contro il riferimento globale a un giro.
