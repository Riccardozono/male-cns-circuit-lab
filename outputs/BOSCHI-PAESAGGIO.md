# Boschi e dintorni di Le Mans a 2 km

Aggiornamento locale della sorgente di sviluppo **5.5.0**, 12 ottobre 2026.
La superficie fisica della pista, IA, salvataggi e versione dell'app restano
quelli precedenti. Le release e distribuzioni pubblicate sono conservate.

## Esplorazione

Nel menu **Vista 3D → Inquadra**:

- **Bosco · alberi Sketchfab** inquadra una zona di alberi vicina al circuito.
- **Paesaggio · fascia 1 km (NASA SRTM)** su Monza/Monaco.
- **Paesaggio · fascia 2 km (NASA SRTM)** su Le Mans.
- **Edifici OSM · dettagli schematici** conserva il dettaglio dei quartieri.

La vista del paesaggio orienta l'asse più lungo nello spazio disponibile.
**Home** o **Centra** torna alla pista; le camere e il comando **Dettagli**
funzionano in pausa e conservano lo stato degli agenti.

## Dati e geometria

La fascia è misurata dai bordi stradali fisici, non dal centro del circuito.
Le Mans usa un nuovo ritaglio di **312 × 227** valori Float32 dal granulo
NASA originale **N47E000.SRTMGL1.hgt**, più **15 richieste OSM** di piccole
aree con duplicati eliminati. Gli edifici distribuiti fra la vecchia fascia
e quella nuova evitano di esaurire il budget subito vicino alla pista.

Il paesaggio usa quote NASA SRTMGL1 v003, con acquisizione 2000 e risoluzione
nominale circa 30 m. La registrazione geografica e il raccordo vicino alla
pista restano stimati; [fonte, metodo e limiti](PAESAGGIO-SRTM.md) e
[manifest/hash](data/landscape/manifest.json). La superficie di guida non
viene sostituita dal DEM. Le zone OSM del terreno distinguono boschi, prati,
campi, aree abitate e acqua tramite colori illustrativi. I dati importati
comprendono soltanto poligoni chiusi disponibili, non una mappa completa
di ogni oggetto OSM.

## Vegetazione

I due alberi di 00amza rimangono. Si aggiungono **7 sagome testurizzate** del
Tree Pack di **Fabio Rinaldo Roloff** e **1 quercia volumetrica** di **riskris
Design**, entrambe scaricate da Sketchfab sotto **CC BY 4.0**. Sono dieci
sagome in totale. [Autori, link, licenze e adattamenti](assets/WOODLAND-CREDITS.md)
· [Hash dei GLB e delle texture](assets/woodland-provenance-v1.json).

Le singole posizioni sono decorative e deterministiche nelle aree verdi
mappate, con esclusione di carreggiata, vie di fuga ed edifici. Il bosco
segue la mesh del terreno realmente disegnata. Non è un censimento delle
piante reali. Il pack usa piani alpha incrociati economici; quercia e alberi
originali conservano il volume. Le texture PNG originali del pack sono
incorporate nel GLB e conservate per byte.

Budget degli alberi aggiuntivi: fino a 18.000 a Monza, 280 a Monaco, 24.000
a Le Mans. Il risultato effettivo dipende da poligoni, distanze di sicurezza
e impronte riservate. Il test nativo registra i numeri effettivamente
collocati in [VERIFICA-BOSCHI.md](VERIFICA-BOSCHI.md).

Alberi istanziati in lotti condivisi, nessun lavoro per singolo agente.
LOD e distanza aggiornano soltanto le istanze visibili della scena; terreno
in due lotti statici, quartieri in massimo quattro e finestre limitate a
14.000 elementi. La parte nuova viene calcolata al cambio pista, non nei
tick neurali. Queste scelte non garantiscono un FPS minimo o più velocità
di apprendimento.
