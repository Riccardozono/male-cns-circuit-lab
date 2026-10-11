# Ricompense 4.8.0 — episodic-2

Fonte eseguibile: [rewards.js](rewards.js). Coefficienti progettati per questa
simulazione; non sono misure biologiche, regolamenti di gara o tempi ufficiali.
L'apprendimento resta un'evolution strategy diagonale basata sulla graduatoria
di interi episodi, con [decoder ricorrente MaleCNS](neural-learning.js).

## Quale punteggio viene ottimizzato

`fitness = somma premi − somma penalità`. Questo numero determina prima di
tutto l'ordine passato all'ottimizzatore, gli élite e i genitori locali. Giri,
tempo migliore e progresso risolvono solo punteggi esattamente uguali. Il
leader grezzo della distanza è una misura diagnostica, non un élite obbligatorio.

`baseFitness = fitness + penalità di regressione`. È il punteggio stabile del
record storico, dell'archivio e del campione globale fra worker: comprende ogni
costo reale, escludendo solo il riferimento che cambia ad ogni generazione.
Non viene usato al posto del netto per aggiornare l'ottimizzatore. Un campione
immigrato occupa al massimo lo slot già previsto, poi corre e viene valutato
di nuovo con le regole attuali. I punti di release diverse non sono confrontabili.

## Premi e costi

Sia L la lunghezza della pista, Tref la durata di riferimento e t il giro
misurato. Tref deriva dalla lunghezza e dalla taratura già presente: velocità
medie di riferimento 35 m/s Lab, 45 Monza, 32 Monaco, 53 Le Mans. Non è un
record reale né un limitatore di velocità. Il cervello non riceve questi valori.

| Voce | Formula in punti |
|---|---|
| Progresso nuovo | 5.000 × incremento del massimo progresso valido / L |
| Checkpoint | 500 / 32 per checkpoint nuovo, in ordine |
| Giro valido | +8.000 |
| Bonus ritmo | 2.000 × clamp(Tref/t − 1, 0, 1) |
| Tempo trascorso | −3.000 × secondi simulati / Tref |
| Giro lento | −4.000 × clamp(t/Tref − 1, 0, 2) |
| Retromarcia | −9.000 × metri di regresso / L |
| Nessun giro | −2.000 − 1.000 × frazione mancante del primo giro |
| Regressione | −min(3.000, 4.000 × max(0, t/Tprec − 1)), per ciascun giro |
| Urto | −900 − 900 × clamp(velocità / 70 m/s, 0, 1) |
| Fuori pista | −1.400 − 900 × clamp(velocità / 70 m/s, 0, 1) |
| Stallo / ritmo inefficace | −1.400 più il costo di nessun giro, se dovuto |
| Progresso non valido persistente | −1.200 più il costo di nessun giro, se dovuto |

Rischio fisico: sopra 5 m/s, −36 pt/s × quota della distanza di arresto non
coperta dal raggio frontale reale. Distanza stimata: lunghezza auto + v²/(2 ×
g × 1,3), stessa scala metrica. Non usa sterzo ideale o punto futuro della
mezzeria. Slip: sopra 5 m/s, −60 pt/s × clamp((|slip| − 0,22 rad)/0,5, 0, 1).
Nessun costo arbitrario per G elevati, frenata forte, sterzo o cambio corretto.

Tprec è il miglior giro valido della generazione precedente del **medesimo
worker e circuito**. Se manca, la regressione è zero. Si confronta ogni giro,
non soltanto il migliore, per non nascondere un secondo giro lento. I premi
per il ritmo sono fissi; non si premia un miglioramento relativo che potrebbe
far crescere artificialmente il record cambiando il riferimento.

## Validità e sfruttamenti bloccati

Si premiano solo incrementi del massimo progresso mai raggiunto nell'episodio:
tornare indietro e ripercorrere strada non guadagna di nuovo. Il regresso e il
tempo costano comunque. Nessun premio per sola velocità, gas o sopravvivenza.
Massimo due giri per auto. Si percorrono 32 soglie di avanzamento ordinate per
giro; partire dal traguardo o attraversarlo al contrario non genera un giro.

Lo spostamento deve rispettare il limite numerico fisico 120 m/s e la variazione
di ascissa deve essere compatibile con lo spostamento reale (massimo 2× più
0,02 m). Un salto di proiezione vicino a un tornante non viene riancorato alla
nuova ascissa; deve recuperare o terminare dopo tre passi non validi. Nessun
avanzamento/giro per il passo che urta o lascia il poligono di pista. La
contabilizzazione non proietta o sposta la macchina. I checkpoint sono soglie
di punteggio, non un nuovo sensore, una traiettoria ideale o portali rilevati.

Dopo 8 secondi senza almeno 1 m di nuovo progresso l'auto termina. Inoltre,
dopo 16 secondi di avvio, le finestre consecutive di 8 secondi devono mostrare
progresso nuovo medio ad almeno il 5% della velocità di riferimento; altrimenti
termina per ritmo inefficace. Non è una durata massima dell'episodio o della
simulazione: un agente produttivo può continuare fino ai due giri, qualunque
sia il tempo totale. Anche “Evolvi ora” finalizza gli episodi parziali.

## Trasparenza e salvataggi

I premi e i costi sono registrati per categoria sul worker. Il renderer legge
solo il dettaglio dell'auto osservata; cambiare vista non altera premi o stato
neurale. Ogni voce dello storico conserva netto, somma premi/costi, dettaglio,
record stabile della generazione e riferimento precedente. La validazione dei
file controlla revisione e coerenza dei totali oltre ai controlli esistenti.

Versione applicazione **4.8.0**; schema progressi 1 con revisione `episodic-2`.
I file 4.7.0 sono rifiutati da questa versione, non convertiti o cancellati.
Si riparte in pausa dalla partenza della generazione, non da metà giro.
Gli episodi parziali ripartono con ledger a zero e il riferimento corretto.

Testi/algoritmo: [simulation.js](simulation.js), [progress-save.js](progress-save.js).
Prove: [rewards.test.cjs](tests/rewards.test.cjs),
[verifica della release](VERIFICA-v480.md). I test di giri sintetici verificano
il conteggio, non dimostrano che un agente neurale abbia imparato una pista.
