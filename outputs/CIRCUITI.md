# Circuiti — versione 4.7.0, 30 settembre 2026

## Dimensioni attuali e larghezze variabili

| Pista | Lunghezza calibrata | Profilo di larghezza stimato | Ancoraggi nominati |
| --- | --- | --- | --- |
| Monza | 5.793 m | 10–12 m | 19 |
| Monaco | 3.337 m | 7–11 m | 20 |
| Le Mans | 13.626 m | 8–12 m | 22 |

Fonti della lunghezza: [Autodromo di Monza](https://www.monzanet.it/en/circuit/),
[mappa FIA Monaco 2025 rivista](https://www.fia.com/system/files/decision-document/2025_monaco_event_-_circuit_map_-_monaco_2025_-_revised.pdf),
[ACO, la gara di Le Mans](https://www.24h-lemans.com/en/info/the-race).
L’intervallo complessivo 10–12 m di Monza è pubblicato dall’autodromo.
**Non posso confermare la larghezza reale di ogni singolo tratto** delle tre
piste dalle fonti consultate: l’assegnazione locale è un modello stimato,
autorizzato dall’utente, non una misura desunta dal tratto grafico dei PDF.
Gli intervalli di Monaco e Le Mans sono interamente scelte del modello.

Ogni coordinata del mondo vale un metro. Tutti i punti delle mezzerie precedenti
sono preservati mediante scala uniforme; nessuno stiramento degli assi o
arrotondamento artificiale delle chicane. I 61 ancoraggi vengono proiettati sulla
mezzeria della rispettiva mappa e interpolati con raccordi periodici graduali;
si genera una sezione anche su ogni segmento intermedio e sul ritorno alla
partenza. L’interpolazione fra campioni dell’app è lineare; i contorni sono
l’unione di segmenti rastremati e raccordi circolari, con semplificazione
topologica di 0,015 m e griglia numerica di 0,000001 m. Quest’ultima elimina
solo artefatti di area inferiore a un millimetro quadrato, non porzioni di pista.

Rendering, raycast e collisioni leggono i medesimi poligoni; l’uscita di pista
verifica la loro appartenenza, senza una semilarghezza globale. L’auto conserva
l’ingombro Porsche nominale 4,619 × 2,050 m. I profili di larghezza e i nomi dei
tratti sono usati solo nell’osservazione; non sono forniti al controller come
guida. Geometria ancora piana e cartografica, non raggi misurati, laser scan,
dislivelli o barriere reali. Le edizioni delle mappe originali rimangono quelle
riportate nella tabella storica sotto; la fonte della lunghezza è distinta dalla
fonte della forma, non una nuova estrazione nascosta.

In **Inquadra** scegli un tratto per leggerne la larghezza e centrarlo; la
misura sotto il titolo distingue il tratto inquadrato dalla posizione dell’auto.
Le 19 zone di cordoli documentate restano agganciate ai nuovi bordi, con la stessa
copertura parziale e provenienza. Non si simulano altezze di cordolo rilevate.

Catalogo: [geometria e metadati](data/circuits.json). Profili modificabili e
generatori in `work/track-width-profiles.json` e `work/extract-circuits.py`.
[Controlli geometrici](metric-geometry-v470.json) e [verifica della release](VERIFICA-v470.md).
Circuiti reali alla revisione 2; salvataggi isolati per versione esatta.
La vecchia 4.6.3 resta disponibile in `dist-selection-v463/` con i suoi file.

## Note storiche delle versioni precedenti

Le sezioni seguenti descrivono la vecchia geometria convenzionale e i vecchi
risultati. Non indicano le dimensioni o i test della release attuale.

## Aggiornamento fisico 4.6.0, 30 settembre 2026

Il profilo e i poligoni sottostanti non cambiano. La Porsche GT3 R ora ha dimensioni nominali metriche e ogni mappa usa una conversione uniforme sulla lunghezza del giro: [Monza 5.793 m](https://www.monzanet.it/en/circuit/), [Monaco 3.337 m](https://www.formula1.com/en/information/monaco-circuit-de-monaco-monte-carlo.2ZWRtIcSI6ZzVGX1uGRpkJ), [Le Mans 13.626 m](https://www.24h-lemans.com/en/info/the-race). Non sono rilievi di larghezze, raggi, pendenze o altimetria: la fascia convenzionale già esistente resta tale. I tempi diventano espressi nella nuova scala e non sono confrontabili direttamente con la vecchia fisica.

I 19 tratti di cordoli documentati nella 4.5 sono conservati come grafica; non vengono inventate altezze o forze verticali da fotografie. [Provenienza e limiti della fisica](vehicle-992-provenance.json). I checkpoint attuali usano `malecns-circuit-v46-992-gt3r-si-1-…`, con isolamento anche per modello. Le note seguenti descrivono la ricostruzione e le prove storiche, non la nuova versione del motore fisico.

Sono disponibili **Laboratorio, Monza, Monaco e Le Mans**. L’utente ha scelto profili più fedeli alle mappe, anche se più difficili per il controller. Nessuna delle piste reali è stata sostituita da un ovale o deformata separatamente lungo gli assi per adattarla allo schermo.

## Fonti e ricostruzione

| Pista | Fonte | Metodo |
| --- | --- | --- |
| Monza | [Autodromo Nazionale Monza, mappa tribune 2023](https://www.monzanet.it/wp-content/uploads/2023/09/MAPPA_CIRCUITO_2023_tribune.pdf) | Campionamento di 37 curve Bézier del profilo GP vettoriale. Il piccolo vuoto grafico al sovrappasso del vecchio ovale viene chiuso per ripristinare il rettilineo del Serraglio. L’ovale storico non fa parte del percorso. |
| Monaco | [FIA, mappa GP Monaco 2025, pagina 2](https://www.fia.com/system/files/decision-document/2025_monaco_grand_prix_-_race_directors_event_notes_-_circuit_map_pit_lane_map_ers_battery_containment_area_red_zones.pdf) | Mezzeria approssimata mediante le sezioni delle coppie di triangoli della fascia stradale vettoriale: 986 triangoli. Preserva il profilo rappresentato dal disegno ufficiale. |
| Le Mans | [ACO, regolamento supplementare 2025, pagina 151](https://assets.lemans.org/explorer/pdf/courses/2025/24-heures-du-mans/regulations/2025-24-hours-of-le-mans-supplementary-regulations.pdf) | Digitalizzazione manuale sulla mappa raster del Circuit de la Sarthe, comprese le due chicane delle Hunaudières. Non è il circuito Bugatti. |

Queste sono le **edizioni delle mappe usate**, non una certificazione della configurazione fisica degli autodromi nel 2026. I PDF originali non sono asset mostrati nell’app: il bundle contiene la geometria derivata, con attribuzione e collegamento alla fonte.

## Fedeltà e limiti

La scala è uniforme: il lato maggiore di ciascun profilo diventa 2.400 unità del mondo. La mappa è centrata nello schermo senza stirarla; i punti campionati non vengono reinterpretati con una curva che tagli le chicane. Non sono dati GPS, un rilievo topografico o un laser scan. I dettagli di Le Mans sono approssimati dalla risoluzione del disegno; la mezzeria di Monaco può conservare piccole irregolarità del vettoriale.

**Larghezza stradale e dimensioni dei veicoli restano convenzionali**, non misure reali: semilarghezza 8 unità, scala auto 0,22 rispetto al Laboratorio. I bordi sono il contorno di una fascia di distanza costante dalla mezzeria; l’unione geometrica elimina gli incroci spuri degli offset nelle curve strette. Approssimazione dei contorni entro circa 0,04 unità. In pianta il tunnel di Monaco è solo una porzione di strada: niente copertura 3D, dislivelli, box, cordoli o barriere reali.

Anche velocità, accelerazione, freno e sterzo sono quelli del modello sperimentale, non prestazioni di un’auto reale. Punteggi e tempi dei diversi circuiti non sono direttamente confrontabili. Non è verificato che il controller completi giri su tutte e tre le nuove piste; i test ne dimostrano esecuzione, collisioni e avanzamento evolutivo, non padronanza del percorso.

## Uso

1. Scegli una pista in **Circuito**, sopra il riquadro di simulazione.
2. Usa **Intero circuito** per vedere la forma. Le auto molto piccole sono indicate anche da punti: il marcatore non cambia la loro dimensione fisica.
3. Passa a **Segui auto selezionata** per vedere la guida da vicino. L’auto si sceglie in **Ispeziona auto** oppure con **Seleziona la migliore**. Quest’ultimo sceglie la migliore in quel momento, non cambia continuamente bersaglio.
4. Lascia finire le generazioni. Ogni pista salva il proprio miglior adattatore neurale nel browser. **Riprendi campione salvato** ricarica soltanto quello compatibile con la pista corrente.

Il cambio pista riparte dalla generazione 1 e mantiene i controlli e lo stato di pausa. Il salvataggio del Laboratorio usa ancora la vecchia chiave V2; le nuove piste usano chiavi V3 distinte con ID e revisione geometrica. Nessun salvataggio viene cancellato dal cambio pista o dal Reset. L’ultimo circuito scelto viene ricordato, ma il suo campione si riprende esplicitamente.

## Verifica e riproducibilità

- [Catalogo e provenienza](data/circuits.json): coordinate, bordi, metodo, fonte, pagina, SHA-256 del PDF e fattore di scala.
- [Test dei circuiti](tests/circuits.test.cjs) e [risultati della suite completa](test-results.tap): 32/32 superati al controllo di questa versione.
- Zero incroci stretti tra segmenti dei bordi e zero collisioni nei 1.398 punti di mezzeria di Monza, 1.278 di Monaco e 810 di Le Mans, con auto allineata al segmento successivo.
- Su tutte e tre: comandi nulli = posa invariata; sterzo zero e acceleratore 70% = retta fino all’urto. Il tracciato non viene fornito al controller come traiettoria da seguire.

Lo script di ricostruzione è `work/extract-circuits.py`, con PyMuPDF e Shapely installati solo in `work/python-deps`. Queste librerie sono strumenti di preparazione e non servono per eseguire l’app. Il catalogo è disponibile sia come JSON sia come script locale per consentire l’apertura offline diretta di `index.html`.
