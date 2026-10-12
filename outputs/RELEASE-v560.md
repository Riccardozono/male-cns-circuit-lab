# MAL-E CNS Circuit Lab 5.6.0 · Boschi e paesaggio NASA

Il circuito ora attraversa un paesaggio più esteso: quote NASA, aree ed
edifici OSM, boschi Sketchfab più densi a Monza e dintorni di Le Mans fino a
2 km. Restano la Porsche con texture locali, le tribune, la vista 2D,
l'inseguimento 3D, la panoramica e l'atlante del cervello.

## Novità

- Fascia Le Mans a 2 km dai bordi pista; Monza e Monaco a 1 km.
- Tree Pack di Fabio Rinaldo Roloff e Oak Tree (LowPoly) di riskris Design,
  con texture locali, instancing, LOD, attribuzione e licenze CC BY 4.0.
- Comandi Bosco e Paesaggio nel menu Inquadra.
- Edifici distribuiti anche nella fascia estesa e colori illustrativi delle
  aree del terreno OSM.
- Pulizia del repository: esclusi 312 file generati, inclusi 174 salvataggi
  di prova. Codice, test, dataset, licenze e strumenti necessari conservati.
- Fisica, sensori, reti, ricompense e apprendimento della 5.5.0 invariati.

## Modelli IA usati

- **GPT-6.1 Sol (`gpt-6.1-sol`)**: sviluppo del paesaggio, boschi, pulizia,
  preparazione e verifiche della release; metadati della sessione.
- **GPT-5.6 Luna (`gpt-5.6-luna`)**: contributo documentale nel ciclo di
  sviluppo, dichiarato dall'autore; uso del modello verificato anche nei
  metadati. Questa aggregazione non riscrive le attribuzioni dei commit passati.

Sono modelli che hanno assistito lo sviluppo, non i controller V2–V5 che
guidano le auto. I log privati delle sessioni non vengono distribuiti.
Tag sorgente: [v5.6.0](https://github.com/Riccardozono/male-cns-circuit-lab/tree/v5.6.0).

## Download Windows x64

- [Portable](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.6.0/MAL-E-CNS-Circuit-Lab-portable-5.6.0-x64.exe)
- [Installer](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.6.0/MAL-E-CNS-Circuit-Lab-setup-5.6.0-x64.exe)
- [Checksum SHA-256](https://github.com/Riccardozono/male-cns-circuit-lab/releases/download/v5.6.0/SHA256SUMS.txt)

## Verifiche

La [verifica sorgente](https://github.com/Riccardozono/male-cns-circuit-lab/blob/v5.6.0/outputs/VERIFICA-v560.md)
riporta le prove eseguite. Le note pubblicate includono anche i risultati
dei controlli sui pacchetti effettivamente caricati e il commit sorgente.
Le prove di rendering non sono benchmark di convergenza o di FPS sostenuti.

## Salvataggi e limiti noti

- I progressi **5.5.0 non si aprono nella 5.6.0**: richiedono la vecchia
  release, che rimane disponibile. I nuovi progressi richiedono 5.6.0.
- Nessuna migrazione automatica o aggiramento della compatibilità esatta.
- Quote NASA SRTM del 2000, risoluzione nominale circa 30 m, registrazione e
  raccordo al circuito stimati. Posizioni, colori e architettura illustrativi,
  non una ricostruzione laser/CAD o un censimento delle piante reali.
- Il pack di alberi distante usa sagome alpha incrociate; quercia e alberi
  originali conservano il volume.
- Installer compilato, non installato sul profilo personale durante la QA.
- Stato della firma e checksum degli eseguibili sono verificati prima della
  pubblicazione e riportati nelle note definitive.
