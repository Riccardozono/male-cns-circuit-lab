# Vegetazione e dislivello fisico — 5.3.0

I circuiti 3D mostrano alberi, cespugli e un terreno raccordato al profilo della
strada. **Il dislivello influenza la fisica**, come richiesto dall'autore:
gravità lungo la pendenza, risposta di acceleratore e freni, peso normale e
variazioni di carico in corrispondenza di dossi e compressioni.
La vegetazione, invece, è solo visiva e non è un ostacolo per sensori o collisioni.

## Profili e fonti

| Circuito | Dislivello del modello | Confine dell'evidenza |
| --- | ---: | --- |
| Monza | 8 m | Quote numeriche interamente stimate; il riferimento ufficiale è una mappa planimetrica, non un rilievo altimetrico. |
| Monaco | 42 m | F1 descrive la salita da Sainte-Dévote verso Massenet/Casino; le quote e l'interpolazione numerica sono stime. |
| Le Mans | 34 m | ACO riporta Dunlop a 76 m s.l.m. e una salita del 7%; gli altri ancoraggi, la registrazione e i raccordi sono stime. |
| Laboratorio | 0 m | Pista sintetica pianeggiante, mantenuta come riferimento di regressione. |

Fonti primarie consultate: [Monza, tracciato](https://www.monzanet.it/tracciato-pista-monza/),
[F1, guida Monaco 2025](https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2025-monaco-grand-prix.7FbX7r8dNJZQF6jnyLnoJC),
[ACO, luoghi del circuito 2023](https://www.24h-lemans.com/en/news/landmarks-of-the-24-hours-of-le-mans-circuit-57442).
Il profilo modellato di Le Mans ha una pendenza massima circa 7,6%: il riferimento
ACO non è presentato come una validazione metro per metro della curva interpolata.

**Non posso confermare la corrispondenza esatta delle quote locali, della
vegetazione o della configurazione altimetrica 2026.** Non sono stati disponibili
un rilievo laser/GNSS o un profilo ufficiale completo. Le altezze sono interpolazioni
periodiche monotone C1 fra ancoraggi stimati, senza salto al passaggio del traguardo.
La scala verticale è 1:1 rispetto al modello, non amplificata per la vista.

I 5.793 / 3.337 / 13.626 m già calibrati rimangono le lunghezze **planimetriche**.
La lunghezza della superficie modellata risulta leggermente maggiore: circa
5.793,07 / 3.340,22 / 13.626,98 m. Questi sono risultati del modello, non nuovi
valori ufficiali dei circuiti; checkpoint e giri conservano il sistema planimetrico.

## Fisica e apprendimento

La superficie è campionata nella posizione libera XY dell'auto; **non proietta
la macchina sulla linea centrale e non sceglie sterzo, gas o freno**. La componente
della gravità sul piano locale modifica il moto. La componente normale e la
curvatura verticale modificano il carico delle quattro gomme; il trasferimento
di carico considera le forze non gravitazionali. Carrozzeria, ruote, cordoli,
barriere, marcatori e telecamere leggono la stessa altezza del modello.

Restano 11 raggi e 17 canali fisici, con ordine e architettura invariati. Le G
longitudinali/laterali rappresentano le forze non gravitazionali e il canale
dinamico totale include anche la variazione del carico normale rispetto a 1 g.
Quota, profilo, stazioni e linea centrale **non vengono inviati alla policy**.
Gli effetti arrivano attraverso velocità, forze, trasferimento e pneumatici.
Algoritmo di apprendimento, decoder, mutazioni, ricompense e dati anatomici non
cambiano; i risultati possono cambiare perché cambia l'ambiente fisico.

Il modello resta a contatto con la superficie: non simula salti, volo libero,
impatti verticali, sospensioni complete o bump dei cordoli. Il carico normale
non diventa negativo sulle creste. Non è un simulatore certificato Porsche/WEC.
La collisione sui bordi mantiene l'inviluppo XY conservativo precedente;
non vengono aggiunte collisioni fra auto né collisioni con vegetazione/barriere.

## Vegetazione e comandi

Piante procedurali, non fotografie o un censimento degli alberi: fino a 1.800
elementi Monza, 1.450 Le Mans, 100 Monaco e 420 Laboratorio, compresi cespugli.
Monza riprende il contesto del parco documentato dall'
[Autodromo](https://www.monzanet.it/parco-di-monza/); densità, specie visive e
posizioni sono scelte autoriali, non localizzazioni reali verificate.
Le chiome sono controllate fuori dalla carreggiata e le aree di fuga vengono
evitate con fasce conservative. I tronchi poggiano sul terreno del disegno.

Il comando **Dettagli: sì/no** nasconde vegetazione e protezioni, non elimina
la superficie fisica. **Inquadra → Beau Rivage** permette di ispezionare la
salita di Monaco; Segui auto e Panoramica funzionano anche in pausa. Sotto
la mappa compaiono dislivello modellato e quota relativa, esplicitamente stimati.
La disclosure **Gomme, freni e trasmissione** mostra quota, pendenza e carico
normale, quest'ultimo esclusa l'aerodinamica.

Le piante usano tre draw call instanziate al massimo per circuito; geometrie,
materiali e profilo vengono riutilizzati. La rete neurale mantiene il suo budget.
Non si dichiara un aumento degli FPS o della velocità di apprendimento.

Fisica `992-gt3r-si-2`, app/file **5.3.0**. Salvataggi 5.2.0 richiedono la
vecchia app; nessuna migrazione o cancellazione automatica. Le vecchie release
restano conservate. [Verifiche 5.3.0](VERIFICA-v530.md).
