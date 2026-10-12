# Paesaggio dei circuiti — sorgente di sviluppo

Questa modifica resta sulla sorgente **5.5.0**. Non è una nuova release e non
sostituisce il portable o l'installer distribuiti. Il formato dei progressi,
la fisica, i sensori, le ricompense e l'apprendimento non cambiano.

## Come esplorarlo

In **Vista 3D**, scegliere **Paesaggio** dal menu **Inquadra**: fascia **1 km**
su Monza e Monaco, **2 km** su Le Mans. **Bosco · alberi Sketchfab** apre una
zona densa di vegetazione; **Edifici OSM · dettagli schematici** apre
un dettaglio vicino alla pista. La normale **Panoramica** continua a
inquadrare il circuito. **Centra** o **Home** ritorna all'intero circuito;
**Segui auto**, la mappa 2D e il cervello restano disponibili. **Dettagli**
nasconde edifici, tribune e vegetazione, non il terreno. La camera funziona
anche in pausa e non impartisce comandi agli agenti.

## Quote originali NASA, importazione offline

Fonte richiesta dall'autore: [NASA Earthdata Search](https://search.earthdata.nasa.gov/search/granules?p=C2763266360-LPCLOUD),
raccolta **NASA Shuttle Radar Topography Mission Global 1 arc second V003**,
**SRTMGL1.003**, [DOI](https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1.003).
Tre ZIP originali sono stati scaricati dopo l'accesso effettuato dall'autore:

| Circuito | Cella NASA | Granulo CMR |
|---|---|---|
| Monza | N45E009.SRTMGL1.hgt | G2821081631-LPCLOUD |
| Monaco | N43E007.SRTMGL1.hgt | G2821078201-LPCLOUD |
| Le Mans | N47E000.SRTMGL1.hgt | G2821079900-LPCLOUD |

Ogni HGT ha 3601 × 3601 campioni interi signed big-endian, righe da nord a sud.
La risoluzione nominale è 1 secondo d'arco, circa 30 m, non precisione
centimetrica. Quote ortometriche EGM96, coordinate geografiche WGS84:
[guida ufficiale del prodotto](https://lpdaac.usgs.gov/documents/179/SRTM_User_Guide_V3.pdf).
I dati si riferiscono alla missione dell'11–21 febbraio **2000**, non a un
rilievo 2026. La versione 3 può contenere riempimenti da altri DEM: senza il
prodotto NUM non si identifica la fonte radar di ogni singolo pixel. Vegetazione,
edifici, aree ripide e modifiche successive possono limitarne la corrispondenza
con il suolo attuale. Non si presenta SRTM come un laser scan dei circuiti.

Lo script [import-world.py](../work/landscape/import-world.py) decodifica gli
originali, verifica la dimensione e il CRC dello ZIP, rifiuta i campioni void,
applica la georegistrazione stimata e ricampiona bilinearmente a passo 32 m.
La mesh usa celle di circa 24 m a Monza/Monaco e 32 m a Le Mans: l'interpolazione non aumenta
la risoluzione o l'accuratezza del dato NASA. I ritagli Float32 sono locali;
durante l'uso dell'app non occorrono rete, token o login Earthdata.

[manifest.json](data/landscape/manifest.json) conserva DOI, ID del granulo, URL,
periodo, SHA-256 degli ZIP/HGT originali e dei ritagli, dimensioni e trasformazioni.
Il loader verifica il checksum dei ritagli prima di disegnarli. Gli originali
rimangono nei Download dell'autore; credenziali e cookie non sono nel progetto.

## Raccordo dichiarato stimato

Le mappe dell'app non sono georeferenziate. Le relazioni OpenStreetMap
[Monza 284565](https://www.openstreetmap.org/relation/284565),
[Monaco 148194](https://www.openstreetmap.org/relation/148194) e
[Le Mans 2126739](https://www.openstreetmap.org/relation/2126739) forniscono un
riferimento geografico. Il fit confronta 512 campioni a distanza uniforme lungo
le due curve chiuse e cerca scala uniforme, orientamento e traslazione; non
sposta la pista dell'app e non consegna una traiettoria all'IA.

| Circuito | Residuo RMS del fit | Residuo massimo |
|---|---:|---:|
| Monza | 2,64 m | 5,34 m |
| Monaco | 7,69 m | 17,67 m |
| Le Mans | 34,06 m | 73,41 m |

Sono residui fra le curve digitalizzate, **non accuratezza certificata** del DEM
o degli edifici. Il raccordo della relazione Monaco contiene piccoli segmenti
stimati fra estremi non connessi; distanze e ID sono registrati nel manifest.
La quota di riferimento è traslata per raccordarsi alla partenza già modellata.
Entro 120 m dai bordi stradali resta il terreno illustrativo preesistente;
fra 120 e 300 m una transizione continua unisce i due profili. Oltre 300 m e
fino a 1000 m a Monza/Monaco o 2000 m a Le Mans si usa SRTM, con scala verticale **1:1**. Fuori dalla fascia
richiesta il margine viene raccordato allo sfondo. La tintura delle aree costiere
quasi a quota zero a Monaco è un'inferenza visiva, non una carta nautica.

La superficie fisica della pista rimane quella stimata della 5.5.0. Cambiare
la scenografia non cambia salite, frenata, carichi, input neurali o progressi.

## Edifici e vegetazione

Più case Sketchfab testurizzate vicino alla pista, con gli asset e crediti già
presenti. Inoltre, le impronte di edifici OpenStreetMap generano quartieri con
facciate, tetti e finestre vicine alla camera, anche a Monza. Gli edifici che
intersecano strada, vie di fuga o strutture preesistenti sono omessi, non
deformati per farli entrare. Le fondazioni si appoggiano ai triangoli del terreno
effettivamente disegnato. Edifici su dislivelli incompatibili vengono omessi.

Impronte derivate da OSM con raccordo stimato; architettura e materiali
schematici. Dove esiste un tag `height`, si conserva il valore mappato,
limitato al budget visivo. Altrimenti l'altezza deriva dai piani mappati o da una
stima dichiarata: non è una misura rilevata dall'app. Gli alberi aggiuntivi
occupano aree verdi/forestali mappate, ma le singole posizioni sono illustrative,
non un censimento delle piante. Gli asset forniti e le loro texture restano
invariati; niente collisioni fra auto o nuove collisioni ambientali.

**© OpenStreetMap contributors.** Il database derivato `*-places.json` è
disponibile sotto [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/),
con [attribuzione e informazioni OSM](https://www.openstreetmap.org/copyright).
Le quote provengono da **NASA JPL SRTMGL1 v003 / LP DAAC**, come identificato dal DOI.
Le trasformazioni e il ricampionamento sono adattamenti di questa applicazione,
non approvati o certificati da NASA, ACO, ACM o Autodromo di Monza.

## Prestazioni e limiti

Terreno in due lotti statici; quartieri in tre lotti, con finestre istanziate
solo vicino alla camera e tetto di 14.000 elementi. Texture condivise e LOD
degli asset esistenti; generazione solo al cambio pista/caricamento, non nei
tick dell'IA. La distanza ai bordi del circuito usa un BVH esatto per non
confondere la query del paesaggio con il sampler fisico locale. Questo non
dimostra da solo un FPS minimo o un'accelerazione dell'addestramento.

Il bosco aggiuntivo usa i modelli Sketchfab di Fabio Rinaldo Roloff e riskris
Design, con texture locali, istanze e dettaglio distante. Colori delle aree
di bosco, prati, campi e acqua derivano dai poligoni disponibili OSM; palette,
singole piante e architettura rimangono rappresentazioni illustrative.
Sono usati i poligoni chiusi disponibili, non si rivendica una copertura
completa di tutte le relazioni OSM. [Guida al bosco](BOSCHI-PAESAGGIO.md) ·
[Crediti Sketchfab](assets/WOODLAND-CREDITS.md).

Verifiche riproducibili: `npm test`, `node work/landscape/verify-preservation.cjs`
e `python work/landscape/verify-srtm.py --srtm-dir <directory degli ZIP>`.
Il secondo controllo confronta fisica, dataset, salvataggi e asset con il
sorgente della release 5.5.0 e preserva i binari esistenti quando presenti.
L'ultimo confronta 500 campioni per circuito direttamente con gli HGT originali.
Non viene affermata una maggiore convergenza degli agenti da questa modifica.
