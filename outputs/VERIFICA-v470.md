# Verifica 4.7.0 — circuiti metrici e larghezze variabili

Data: 30 settembre 2026. La nuova carreggiata è una ricostruzione con larghezze
locali **stimate**, non un rilievo. Lunghezze ufficiali e scelte del modello
sono separate in [CIRCUITI.md](CIRCUITI.md) e nel catalogo.

## Prove completate sui sorgenti

- **210/210 test passati**, zero fallimenti o test saltati:
  [suite completa](test-results-v470.tap). Sedici test specifici verificano
  scala metrica, conservazione di ogni punto originario, profilo periodico
  completo, variazione effettiva dei raggi, bordi reali, uscita di pista,
  sezioni larghe non terminate dalla vecchia soglia e dati non validi.
- **3.486 pose verificate** con l’ingombro Porsche completo: Monza 1.398,
  Monaco 1.278, Le Mans 810. Poligoni validi, un’unica fascia chiusa con un
  foro interno, nessun incrocio dei bordi e nessuna collisione della vettura
  allineata al segmento successivo. Lunghezza geometrica entro 0,00001 m
  dal valore di calibrazione: è tolleranza numerica, non precisione del rilievo.
  [Report del generatore](metric-geometry-v470.json).
- **61 ancoraggi** con coordinate sulla mezzeria, larghezza stimata e
  intervalli che coprono ogni segmento e la chiusura del giro. Unione di
  segmenti rastremati e raccordi, nessuno spline che tagli la mezzeria.
  I test indipendenti del runtime verificano tutti i bordi, i raggi e il
  perimetro orientato dell’auto, non soltanto la validità Shapely.
- **67 controlli nativi passati** nella matrice V2/V3/V4 × Monza/Monaco/Le Mans,
  ogni caso con **100 auto**: movimento reale, sensori/comandi/forze finiti,
  acceleratore e freno non sovrapposti, campione neurale completo A-100,
  scala fisica e poligoni render coincidenti, fonte e stime visibili,
  scelta del tratto e invariabilità dello stato in pausa con i controlli mappa.
  V4 ha usato WebGPU, V2/V3 il proprio backend CPU.
  [Report Windows sorgente](metric-source-v470/pass-4/metric-smoke.json).
- **54 controlli della mappa**: laboratorio e tre piste, zoom/pan/tastiera,
  selezione delle curve, dettagli, bordi, evenodd, 19 zone di cordoli
  documentati, stato neurale/fisico invariato dai comandi grafici e cache.
  [Report mappa](metric-source-v470/pass-4/map-review/track-smoke.json).
- Un’unica ispezione visiva di panoramiche/dettagli dei tre circuiti,
  1540×980, layout stretto 390×844 e vista affiancata con atlante 3D.
  Misure leggibili, nessun overflow rilevato; nessuna correzione estetica
  aggiuntiva necessaria. Le mappe non sono allargate per farle risaltare.
- **21 file core identici alla 4.6.3** e **51 verifiche di funzioni/parametri
  identici**: dati anatomici, decoder, apprendimento, worker/kernel GPU,
  leggi della Porsche, algoritmi dei sensori, coefficienti e selezione evolutiva.
  [Confronto core](metric-core-verification-v470.json). Intenzionalmente
  cambiano scala del mondo, carreggiata, misure sensoriali conseguenti e
  appartenenza al poligono per l’uscita di pista. Non si dichiara apprendimento
  identico fra geometrie diverse o un miglioramento della convergenza.

## App Windows prodotta

Portable e installer NSIS x64 sono in `dist-metric-v470/`. Il controllo
post-build avvia la **portable effettiva** in profili temporanei separati
GPU e CPU fallback, ripetendo i nove casi con 100 agenti. Esegue anche la
regressione dei file progressi con il vero motore. Esiti, conteggi, hash
SHA-256, versioni e firma sono raccolti nel
[report post-build](release-verification-v470.json) da
`work/verify-release-v470.cjs`, soltanto dopo le prove del pacchetto.

I picker diagnostici dei file ricevono risposte simulate solo sotto
`--progress-smoke`; non si afferma una verifica manuale del loro aspetto.
La portable e l’installer non vengono installati al posto di versioni aperte;
le vecchie release e i file dell’utente restano intatti.

## Limiti espliciti

L’intervallo globale Monza 10–12 m è pubblicato, non la sua distribuzione
locale. Monaco 7–11 m e Le Mans 8–12 m sono scelte stimate del modello.
Non posso confermare le larghezze reali pezzo per pezzo dalle fonti consultate.
Il passaggio a una sola unità metrica rimuove, fra l’altro, la vecchia fascia
di Le Mans larga circa 35,94 m del [precedente audit](track-dimension-audit-v463.json).

Restano mezzerie cartografiche datate 2023/2025, non dati GPS/laser, raggi
certificati, altimetria o barriere rilevate. Curve e larghezze stimate non
certificano fedeltà a un simulatore professionale. I test provano funzionamento
e coerenza, **non giri appresi, convergenza, FPS sostenuti o velocità effettiva
30x**. Nessuna traiettoria è imposta alle auto e non ci sono collisioni fra loro.

Salvataggi **4.7.0 solo con 4.7.0** e circuiti reali alla revisione 2. Non si
migrano automaticamente i progressi 4.6.3; per aprirli usa la versione 4.6.3
conservata in `dist-selection-v463/`.
