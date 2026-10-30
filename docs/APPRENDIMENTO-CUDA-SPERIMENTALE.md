# V3 / Monza: apprendimento CUDA sperimentale

Verifica del 14 ottobre 2026. Questo lavoro rimane separato dalla release
Windows 5.6.0 e dal salvataggio originale. **Zero giri completati:** il problema
complessivo di guida/apprendimento non è ancora risolto.

Aggiornamento successivo: i contesti neurali appresi
portano il campione a **1990,413 m**, verificati anche nella copia Windows di
sola inferenza. Vedi [CONTESTI-NEURALI-DEV.md](CONTESTI-NEURALI-DEV.md) per avvio,
confronti e problema numerico fra runtime. I risultati a 1212 m sotto sono
la fase precedente, conservata come evidenza, non il nuovo massimo.

## Risultato verificato, non solo aggiornamenti dei pesi

Il controller sperimentale con attore neurale e nuove uscite motorie apprese
percorre **1.212,314 m** partendo dal traguardo. La prova completa è stata
ripetuta con identico risultato su CUDA. Termina per fermata senza progresso,
non per urto. Il risultato precedente a 961,783 m resta conservato.
Non sono assegnati spostamenti, posizioni o giri; i comandi sono predetti
dalle osservazioni neurali. La sequenza stocastica usata per allenarlo aveva
raggiunto 910,781 m: non è usata come programma di guida.

Il risultato è su V3/Monza, con una copia derivata dal salvataggio già allenato
gen64. Non dimostra cold-start, generalizzazione ad altri circuiti/modelli,
un giro completo o due giri. Il punteggio del nuovo candidato è −3147,297
nell'obiettivo sperimentale corretto: distanza e ricompensa restano due misure
diverse. Non è stato promesso o verificato un aumento di FPS nell'app.

Evidenza attuale: `.impeccable/review/neural-sacl/bilateral-readout-cma/report.json`,
campi `champion`, `independentChampionRepeat` e `independentExplorerRepeat`.
Il risultato originale del consolidamento resta in
`.impeccable/review/neural-sacl/self-experience-first/report.json`.

## Autorità dei comandi e apprendimento del nuovo readout

Nel decoder precedente l'autorità dell'attore era proporzionale alla memoria
motoria. La telemetria del candidato a 961 m mostra un attore che richiede una
correzione longitudinale positiva mentre il guadagno scende a circa 0,0044:
il comando fisico resta un freno. Evidenza:
`.impeccable/review/neural-sacl/longitudinal-bias-search/baseline-telemetry.json`.
Questo riguarda il decoder sperimentale, non dimostra un guasto dell'attuatore
freno della normale app.

Riscalare indiscriminatamente i vecchi output peggiora la guida: conservato
il rapporto `authority-comparison/report.json`. La nuova famiglia mantiene
la scala dell'attore già appreso e aggiunge due uscite indipendenti per sterzo
e longitudinale. Le nuove uscite conservano l'autorità attivata nell'episodio;
prima dell'attivazione o con anatomia silenziosa non producono movimento.
Reset reale azzera memoria e autorità. Non sono nuovi neuroni biologici.

Il readout aggiuntivo è una funzione gaussiana delle due memorie neurali,
con coefficienti appresi, e del precedente output longitudinale neurale.
CMA-ES riceve soltanto punteggi di episodi fisici completi; non vede pista,
posizioni o comandi desiderati. Quattro processi CPU valutano candidati
indipendenti. L'inferenza dell'attore congelato usa CUDA; gli aggiornamenti
CMA dei quattro coefficienti avvengono su CPU. Non viene descritto questo
ultimo stadio come backpropagation dell'intero cervello sulla GPU.

| Candidato, stesso obiettivo sperimentale corretto | Progresso | Punteggio | Fine episodio |
| --- | ---: | ---: | --- |
| Attore con bias longitudinale ottimizzato | 987,799 m | −3387,791 | Fermata |
| Nuova uscita longitudinale, miglior reward | 1158,590 m | −3203,565 | Fermata |
| Readout con sterzo e longitudinale appresi | 1212,314 m | −3147,297 | Fermata |
| Esploratore più lontano, non campione per reward | 1366,800 m | −4972,729 | Urto |

Tutti hanno **zero giri**. Il candidato che urta non sostituisce quello con
punteggio migliore. Evidenze: `longitudinal-bias-search/report.json`,
`neural-memory-feature-verified/report.json`, `bilateral-readout-cma/report.json`
e `memory-readout-shape-verified/report.json`, sotto la stessa cartella di review.

La prima ricerca bilaterale ha valutato 96 candidati in 12 generazioni CMA.
La continuazione ripristina media, covarianza e RNG dell'ottimizzatore e valuta
altri 128 candidati nelle generazioni CMA 13–28. Non migliora il campione a
1212,314 m; trova un altro esploratore a 1351,756 m che urta e non viene promosso.
Entrambi i risultati della continuazione sono ripetuti esattamente da traguardo.
Evidenza: `bilateral-readout-resume/report.json`. Sono generazioni di ricerca
del readout, **non** generazioni completate o due giri nell'app.

### Ripetibilità numerica

Su 104 osservazioni reali, l'attore CUDA calcolato con una riga e con batch di
quattro differisce al massimo di 2,384185791015625e−7; 47 campioni non sono
bit-identici. La verifica da traguardo dell'esploratore varia di 0,004416 m,
senza cambiare l'urto o il numero di giri. La ricerca con nuova modalità usa
sempre inferenza a una riga, anche mentre quattro processi simulano in parallelo.
La prova fallita a precisione variabile non è stata riscritta come riuscita.
Evidenze: `inference-shape-audit/report.json` e
`memory-readout-shape-verified/report.json`.

### Port del readout, non ancora integrazione Windows

Esportati solo coefficienti numerici in
`native-neural-head/learned-head.malecns-neural-exp.json`: schema e checksum
dedicati, nessun pickle eseguibile o sequenza di comandi registrata. Il parser
rifiuta formato, versione, decoder, dimensioni, coefficienti e identità
dell'ambiente non compatibili. Non è un normale salvataggio `.malecns-save`.

Il port JavaScript esegue due episodi fisici interi con predizioni proprie:
**1212,313848 m**, zero giri, fermata, zero sovrapposizioni gas/freno. Ripetizione
JavaScript esatta; differenza dal riferimento CUDA **0,000026420 m**. La somma
nei layer è Float64 e le uscite Float32: non viene dichiarata identità bit-a-bit
con CUDA. Evidenza: `native-neural-head/verification.json`.

Questa verifica è su Node, **non sull'interfaccia o sull'eseguibile Electron**.
Il runner usa ancora i moduli sperimentali locali e la verifica di provenienza
del salvataggio originale. Il JSON non è ancora importabile nella normale app
né una distribuzione autonoma pronta per un altro PC.

## Struttura e hardware realmente usati

Il grafo V3 resta di 7.721 neuroni e 242.486 connessioni. Sono disponibili
251 discendenti reali; il nuovo esperimento ne legge 128 anziché 64. La
selezione aggiuntiva usa varianza osservata in una guida reale e conserva
i body ID dei dati. Non sono creati nuovi neuroni biologici.

Gli ingressi dell'attore comprendono quattro frame di attività di quei
128 neuroni, due memorie del decoder e due output della precedente policy
neurale: 516 valori. Posizione, centerline, tempo e comandi desiderati non
sono ingressi. Posizione/progresso compaiono soltanto in ricompensa e diagnosi.
Le reti artificiali aggiuntive non sono una simulazione di fisiologia della mosca.

Ambiente locale isolato `.impeccable/rl-venv`: Python 3.12.14, Torch
2.11.0+cu128, Stable Baselines3 2.9.0, Gymnasium 1.4.0, NumPy 2.5.4.
La RTX 4060 è stata verificata tramite un gradiente matriciale finito e attore /
critico effettivamente su `cuda:0`. Quattro processi CPU indipendenti eseguono
fisica e grafo V3; la GPU aggiorna il learner. Non sono modificati driver o
installazioni globali.

Il confronto usa [SAC di Stable Baselines3](https://stable-baselines3.readthedocs.io/en/master/modules/sac.html),
con esplorazione iniziale contenuta e un membro che conserva la precedente
policy realmente appresa. È una variante sperimentale, non la configurazione
standard né una garanzia di convergenza. Installazione CUDA secondo il
[metodo ufficiale PyTorch](https://pytorch.org/get-started/locally/).

## Esiti negativi da non nascondere

- Primo SAC: 10.000 passi, 2.250 aggiornamenti, attore finale circa 818 m.
- SAC con prior conservato: 100.000 passi, 24.750 aggiornamenti; attore finale
  circa 809 m. Il modello iniziale a 884,343 m viene conservato.
- Consolidamento delle esperienze proprie: attore stabile a 961,783 m.
- Ulteriore training solo longitudinale: 50.000 passi, non migliora il modello
  stabile. Sterzo congelato significa funzione neurale congelata, non sterzo
  prescritto o traiettoria riprodotta.

Le azioni usate per il consolidamento sono state davvero prodotte dal learner
ed eseguite nel simulatore. Il replay degli episodi ha verificato le stesse
osservazioni neurali. Non sono dati inventati né comandi di un esperto.
Loss più bassa e pratica stocastica più lunga non vengono presentate come
successo del controller: serve una verifica indipendente dal traguardo.

## Correzione dimostrata del punteggio

La precedente ricompensa assegnava una penalità base di 900 agli urti e
1.400 alle fermate. Nel confronto reale premiava un urto prima di una fermata
senza urti dopo più strada.

| Stessa policy, stessa guida fisica | Obiettivo precedente | Copia corretta |
| --- | ---: | ---: |
| Urto a 884,343 m | −3004,698 | −5320,235 |
| Fermata senza urti a 961,783 m | −3412,062 | −3412,062 |

Punteggio maggiore significa migliore: nella copia corretta l'ordine è coerente.
Comandi, attività neurale, traiettorie e regole di arresto sono identici.

La copia `.impeccable/experimental-penalty5` dichiara esplicitamente la revisione
incompatibile `progress-5-crash-safety-experiment`: urto/fuori pista 3.200,
impatto 500, progresso invalido 3.600. Lentezza, zero giri e limite di due giri
restano penalizzati. I vecchi punteggi, storici, critic e transizioni con vecchie
ricompense non sono trasferiti nell'allenamento del nuovo obiettivo; vengono
riusati pesi neurali come punto di partenza e ricostruiti stati fisici reali.
Il confronto normalizzato usa soltanto le osservazioni del replay precedente
per calcolare media e deviazione degli ingressi, non le sue ricompense.

Evidenza: `.impeccable/review/neural-sacl/reward-ranking/report.json`.
Correggere l'ordine dei punteggi **non prova** che il modello abbia imparato un giro.

## Uso e compatibilità

Questi modelli sono artefatti privati di ricerca, non normali `.malecns-save`.
Non caricare pickle/ZIP sconosciuti: gli script accettano soltanto i file propri
generati dal lavoro locale. Non distribuirli come salvataggi della release.

La normale app e la copia Windows CPU DEV non includono ancora questi learner.
Versione dell'app, originale gen64, portable, installer e tag pubblicato restano
conservati. Non è stata pubblicata una nuova versione.

Verifiche riproducibili:

- `node --test work/neural-rl-bridge.test.cjs`
- `node --test work/neural-rl-bridge5.test.cjs`
- `.impeccable/rl-venv/Scripts/python.exe work/verify_reward_ranking.py`
- `.impeccable/rl-venv/Scripts/python.exe -m unittest work.neural_sac_test`
- `.impeccable/rl-venv/Scripts/python.exe work/neural_normalization_test.py`
- `node --test work/neural-rl-bilateral.test.cjs`
- `.impeccable/rl-venv/Scripts/python.exe work/bilateral_readout_test.py`
- `node --test work/neural-json-head.test.cjs`
- `node work/verify-native-neural-head.cjs`

La normalizzazione degli ingressi è un ulteriore confronto separato:
statistiche fisse dalle osservazioni neurali reali e due output della propria
rete congelata, nessun nuovo ingresso geometrico. Il suo rapporto viene
prodotto in `.impeccable/review/neural-sacl/penalty5-normalized/report.json` al
termine effettivo della prova. Il confronto è terminato: 50.000 passi e
12.250 aggiornamenti, senza migliorare il modello stabile a 961,783 m.
L'attore finale regredisce a circa 798 m e non viene adottato. Una pratica
stocastica a 987,656 m non viene confusa con la guida verificata del modello.
