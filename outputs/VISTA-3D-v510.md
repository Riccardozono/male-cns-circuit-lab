# Circuito e Porsche in 3D - app 5.1.0

Premere **Vista 3D** nel riquadro del circuito. Il selettore **Camera del
circuito** offre **Segui auto** (inseguimento) e **Panoramica**.
L'inseguimento è la vista iniziale. La mappa 2D e l'atlante neurale sono ancora
disponibili, anche affiancati. **Vedi da vicino** inquadra l'auto selezionata.

Trascinare per orbitare; Maiusc + trascinamento per spostare; rotella/pizzico
per zoom. Le frecce orbitano, `+`/`-` zoomano e Home centra. Un clic su un'auto
la seleziona; la selezione manuale interrompe la scelta automatica della migliore.
Cambiare visuale o camera non esegue passi di fisica o di apprendimento.

La strada 3D è triangolata dagli stessi poligoni esterno/interno usati da
collisioni e sensori, con le medesime dimensioni metriche e larghezze variabili
già presenti nel simulatore. I sensori sono disegnati con le distanze ai veri
bordi. I cordoli derivano dalle zone documentate nel catalogo esistente.
Terreno piano e altezze dei bordi sono schematici: non sono un rilievo 3D
ufficiale. Non vengono inventate tribune, edifici o altimetrie.

Il modello `porsche-992-gt3-r-lod.glb` deriva dallo ZIP fornito dall'utente,
con le texture incorporate. Il livello dettagliato ha 192.273 triangoli
esterni, quello intermedio 16.832, quello lontano 5.548. La versione sorgente
integrale ha 489.304 triangoli e resta nel progetto come riferimento; il
pacchetto include il derivato ottimizzato.

La correzione texture mantiene la versione app **5.1.0**. La livrea gialla/nera
numero 91 proviene da `textures/decals.png` dello ZIP, prima non collegata al
materiale della carrozzeria. L'immagine originale 4096 x 4096 è incorporata una
sola volta nel GLB e condivisa fra tutti i livelli di dettaglio e le auto.
Non cambia la geometria, la fisica o l'apprendimento; i salvataggi 5.1.0
restano compatibili. Dettagli: [TEXTURE-v510.md](TEXTURE-v510.md).

Viene mostrato al massimo un livello dettagliato per l'auto inquadrata e
12 auto intermedie; le altre usano il livello lontano. Geometrie, texture e
materiali sono condivisi. Alla partenza gli agenti indipendenti occupano lo
stesso punto: il corpo selezionato rappresenta le superfici sovrapposte,
evitando lo sfarfallio. Tutti gli agenti restano in simulazione e selezionabili.
Le auto continuano a non collidere tra loro.

Ruote anteriori, rotazione, beccheggio/rollio e luci posteriori osservano la
telemetria e i comandi fisici correnti. La normalizzazione visiva alla sagoma
4,619 x 2,050 m non cambia il modello dinamico o i punti del passo delle ruote
nel solver. Non si dichiara il modello come CAD ufficiale Porsche.

Rendering tramite [Three.js](https://threejs.org/docs/) 0.186.1 incluso
localmente con licenza MIT. Il lettore glTF e tutte le dipendenze sono locali;
non viene scaricato nulla durante l'uso. Il disegno è limitato a 30 aggiornamenti
al secondo e DPR 1,5. Questi sono limiti del disegno, non del passo fisso della
simulazione. Se il contesto 3D non è disponibile o viene perso, la mappa 2D
rimane utilizzabile. Il calcolo neurale mantiene il proprio backend CPU/WebGPU.

Crediti, licenza del modello e trasformazioni:
[PORSCHE-3D-CREDITS.md](assets/PORSCHE-3D-CREDITS.md) e
[provenienza e SHA-256](assets/porsche-992-gt3-r-provenance.json).
Verifiche della correzione: [TEXTURE-v510.md](TEXTURE-v510.md).
Verifiche della prima distribuzione 5.1.0: [VERIFICA-v510.md](VERIFICA-v510.md).
