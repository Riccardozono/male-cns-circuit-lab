# PPO con esperienze indipendenti · prova privata V3 / Monza

Il protocollo usa quattro processi Node numerici reali e il backend CUDA
qualificato, senza modificare l'app Windows o la release 5.6.0. Ogni ambiente
raggiunge fisicamente il proprio stato protetto; non si inventano esperienze
né si forniscono traiettorie o azioni ideali alla policy.

## Cosa cambia

- Quattro stream casuali: 161026, 265755, 370484, 475213.
- Ogni aggiornamento raccoglie 256 passi per ambiente, 1.024 in totale.
- I vantaggi GAE vengono calcolati separatamente sui quattro segmenti.
  Non si propaga il ritorno di un ambiente all'altro.
- La normalizzazione dei vantaggi usa poi il batch completo; minibatch 256,
  fino a quattro epoche e arresto delle epoche alla soglia KL già utilizzata.
- Rete 520 → 64 tanh → 2, 33.474 coefficienti della policy. Il grafo MaleCNS
  V3 resta di 7.721 neuroni/242.486 connessioni, con dinamica artificiale.
- Memoria corretta a gate zero; encoder e decoder precedenti congelati.
- Fisica, premi R5 ufficiali e criteri di promozione pulita invariati.

La selezione dell'eventuale policy migliore richiede valutazioni fisiche
complete; la sola modifica dei coefficienti non dimostra apprendimento.
Gli episodi di pratica includono la parte iniziale protetta e non sono nuovi
giri indipendenti né generazioni dell'app.

## Verifiche del nuovo raccoglitore

`neuronal-ppo-parallel4-memory-smoke` conclude realmente 4.096 transizioni,
quattro aggiornamenti e 22 episodi di pratica. La verifica numerica riproduce
perdite, KL, deviazioni standard e pesi finali. Le quattro partenze di pratica
con policy zero coincidono con il campione; una prova completa dal traguardo
è eseguita nel primo ambiente. Tutti e quattro i processi eseguono CUDA.

`seed-verification.json` riconcilia le prime azioni effettive con quattro
stream diversi del generatore autorevole Node. Il primo tentativo di tale
audit è conservato: confrontava erroneamente i decimali .12/.08 anziché i
valori Float64 ottenuti dall'esponenziale dei loro logaritmi, come fa Torch.
L'audit corretto usa le scale effettive; nessun dato o risultato fisico è
stato modificato per far passare il controllo.

I due test matematici di `neural_ppo_parallel_test.py` verificano il calcolo
per ambiente e l'assenza di ritorni che attraversano i confini dei segmenti.
Sono fixture numeriche, non esempi di guida usati per l'allenamento.

## Studi estesi

`neuronal-ppo-parallel4-memory-long` pianifica 64 aggiornamenti e 65.536
transizioni. I primi quattro aggiornamenti ripetono quelli dello smoke:
4.096 transizioni ricalcolate non sono esperienza informativamente nuova.
L'esito vale soltanto dopo il report terminale e la verifica indipendente.

Questo primo studio esteso è ora concluso e verificato: 65.536 transizioni,
64 aggiornamenti, 247 episodi di pratica, nessun miglioramento pulito nelle
otto valutazioni. L'ultima arriva a 6.506,389040 m e termina troppo lenta,
con un giro ereditato. Non viene installata. Il rapporto ha SHA-256
`a02d43d1168c0e9b5639a230ddcd5579168aacd6d24510cd8db4d0b543b500ae`.

Il confronto `train_neural_ppo_brake_exploration.py` mantiene lo stesso
protocollo e amplia soltanto la deviazione standard longitudinale iniziale
da .08 a .3. Lo sterzo resta .12. Anche questo è un esperimento, non una
modifica installata nel controllore Windows o un risultato già dimostrato.

Anche il confronto con esplorazione longitudinale .3 è ora terminato e
verificato: 65.536 transizioni, 64 aggiornamenti, 176 episodi di pratica,
114.432 chiamate GPU senza ripieghi CPU. Nessuna valutazione migliora il
campione pulito. Ultima: 6.235,973825 m, 3.757,116661 punti, troppo lenta.
Un'altra arriva a 6.590,959358 m ma urta: non viene promossa per i soli metri.
SHA-256 rapporto:
`fb62cbc678ae18cbaa29a5d58535039e57aa53ebc9ba0a73071100e1006a8d04`.

## Penalità aggiuntiva che conserva il segnale dell'urto

Un audit delle prime 16.384 transizioni del confronto parallelo osserva 82
episodi terminati: 74 urti, cinque stalli e tre terminazioni per lentezza.
Le ricompense terminali fisiche scalate erano circa −32/−34 per gli urti e
−14 per gli stalli, ma il limite sperimentale `min(raw, -40)` le portava tutte
a −40. Questo riguarda il singolo passo terminale: non significa che i ritorni
interi delle prove fossero uguali. Il punteggio fisico R5 non veniva modificato.

La variante distinta `neural-ppo-additive-failure-cost.cjs` usa invece
`raw - 40` per gli episodi incompleti, conservando la differenza originaria.
Due test unitari verificano questa proprietà e l'assenza di penalità extra
per un completamento effettivo dei due giri. Trainer, ambiente e verificatore
hanno nomi e identità nuovi; una prova allenata è necessaria prima di affermare
che la modifica migliori la guida. Non è installata nella copia Windows.

Il confronto additivo è effettivamente avviato in una cartella distinta:
`neuronal-ppo-parallel4-additive-failure`. Il controllo del primo batch
verifica 1.024 transizioni fisiche identiche al confronto .3: stesse
osservazioni, azioni, ricompense grezze, stati successivi ed episodi. Cambiano
soltanto tre ricompense terminali e le rispettive penalità aggiuntive.
Questa è una verifica della modifica isolata, non un esito positivo già
ottenuto nell'allenamento. Prima della promozione servono esito terminale,
riconciliazione numerica e prove native del candidato eventualmente migliore.

Il verificatore della variante controlla la penalità extra dichiarata
esattamente a 40, non la ricostruisce invertendo due sottrazioni Float64:
quest'ultima operazione può differire di un arrotondamento. Il valore della
ricompensa resta controllato esattamente contro `raw - 40`.

Il confronto additivo è ora concluso e verificato su tutti i 64 aggiornamenti:
65.536 transizioni, 171 episodi di pratica, 115.096 chiamate GPU e nessun
ripiego CPU. Nessuna delle otto valutazioni migliora il campione pulito.
L'ultima raggiunge 6.598,214235 m ma urta, con 2.191,504160 punti: non viene
promossa contro il riferimento pulito di 6.590,791630 m/4.057,077503 punti.
SHA-256 rapporto:
`62607d86eeb54aaf349c4f78b3ee2e13a1487973d59e7b59516ed3e59cea0733`.

I due studi successivi hanno avuto una sovrapposizione parziale sul PC;
i tempi trascorsi non sono usati come benchmark di prestazioni. Tutti gli
esiti di guida citati sono della simulazione a passo fisso, non del tempo reale.

## Componente pronto per un confronto successivo, non ancora allenato

`neural-readout-coherent-search.cjs` usa CMA sullo strato finale della rete:
130 coefficienti, 16 candidati, campione protetto realmente rivalutato e
limiti applicati agli stessi vettori poi passati all'ottimizzatore. Ogni
candidato manterrà una policy coerente durante la prova, senza nuovo rumore
sui comandi a ogni controllo. I restanti 33.344 coefficienti rimangono congelati.
Non sono nuovi neuroni biologici e non è ancora un nuovo campione di guida.

I due test unitari verificano isolamento dello strato e identità dei vettori
valutati/proiettati. Una fixture quadratica a 130 dimensioni verifica inoltre
che l'ottimizzatore esistente abbia costo gestibile sul PC; tali fitness
sintetiche non sono dati di guida e non entrano in un allenamento delle auto.
Prima di affermare un risultato servono prove fisiche reali e verifiche native.

## Controllo dell'autorità e dell'esplorazione sul freno

Il decoder reale già somma e limita direttamente i comandi nello spazio
motore: con gate 1 può invertire qualunque comando parentale limitato.
Non è necessaria una correzione della sua formula per permettere il freno.

L'audit `ppo-normalized-direct-motor-exploration-first` verifica la formula
effettiva in 120 casi, poi ricostruisce numericamente il comando parentale
dalle feature normalizzate delle 65.536 transizioni dello studio precedente.
Su 35.786 righe con comando parentale positivo, in 29.253 la soglia teorica
di frenata supera quattro deviazioni standard del rumore allora usato,
persino ipotizzando gate 1. È un limite delle azioni esplorate, non telemetria
del freno reale né prova che spieghi da solo il mancato apprendimento.

Un primo audit aveva applicato una formula ipotetica nello spazio logit, che
NON è quella del decoder qualificato. È conservato con
`ppo-normalized-longitudinal-authority-first/APPLICABILITY.json` impostato a
`applicableToCurrentDecoder: false`. I suoi conteggi di inversioni impossibili
non sono un difetto dimostrato del controllore: non usarli come risultato.
