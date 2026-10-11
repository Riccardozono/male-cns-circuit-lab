# MAL-E CNS Circuit Lab

Simulatore locale per Windows/Electron in cui una popolazione di auto da gara
impara a percorrere circuiti attraverso una policy costruita sul connectome
MaleCNS. Il progetto mantiene la mappa 2D interattiva, le viste 3D del circuito,
la visuale che segue l'auto, la fisica della Porsche 992 GT3 R, sensori fisici,
ricompense episodiche e i profili MaleCNS V2, V3, V4 e V5.

Il progetto è alla versione **5.1.0**. La documentazione tecnica e la
provenienza degli asset sono in [`outputs/README.md`](outputs/README.md).

## Avvio locale

Richiede Node.js e npm:

```powershell
npm install
npm start
```

Per ottenere anche il checkout del repository MaleCNS collegato:

```powershell
git clone --recurse-submodules https://github.com/Riccardozono/male-cns-circuit-lab.git
cd male-cns-circuit-lab
```

Se il progetto è già stato clonato senza submodule:

```powershell
git submodule update --init --recursive
```

Test automatici:

```powershell
npm test
```

Build Windows portable + installer:

```powershell
npm run dist
```

## Contenuti principali

- `desktop/` — shell Electron e runtime Windows;
- `outputs/` — interfaccia, simulazione, apprendimento, veicolo, circuiti,
  connectome, asset 3D e documentazione;
- `work/` — benchmark e strumenti riproducibili;
- `package.json` — comandi di sviluppo, test e distribuzione.

## Build escluse dal repository

Le cartelle `dist-*` e `node_modules/` sono escluse perché sono generate
localmente. Gli installer e i portable già prodotti contengono file singoli
oltre 100 MB; il sorgente resta completo e gli eseguibili si possono ricreare
con `npm run dist`.

## Confine del modello

Il progetto usa export offline del dataset MaleCNS con manifest e checksum
presenti in `outputs/data/`. Il caricamento del connectome e la dinamica della
rete sono componenti del simulatore: non sono una simulazione biologica
validata del cervello di una mosca. Le fonti, le approssimazioni e i limiti
sono descritti nella documentazione dentro `outputs/`.
