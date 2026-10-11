# Verifica 5.3.0 — vegetazione e pendenze

Rapporto della sorgente e dei pacchetti, su Windows x64 con profili diagnostici
separati dai progressi personali. Commit distribuito, conferma dei controlli
sui binari finali e checksum sono nelle
[note della release](https://github.com/Riccardozono/male-cns-circuit-lab/releases/tag/v5.3.0).

## Evidenze eseguite

- **317/317** test automatici, zero fallimenti e zero test saltati.
- **18/18** nuove prove: proiezione analitica della gravità su pendenza 10%,
  rotolamento senza gas, salita/discesa con stessi comandi, frenata e tenuta in
  pendenza, creste/compressioni e carichi, chiusura dei profili, vegetazione
  deterministica/budget/disposal e posa di auto/piante sulla superficie.
- Sei vettori di movimento pianeggiante, misurati dalla 5.2.0 sul commit
  `be0396f`, restano uguali entro 1e-9 dopo 120 passi da 1/60 s. Non si applica
  questa equivalenza alle piste ora inclinate.
- Il test anti-traiettoria confronta ogni posizione/orientamento di `F.drive`
  con `Vehicle.step` sugli stessi comandi e superficie: ricompense e collisioni
  non proiettano o sterzano l'auto. Con pendenza trasversale l'orientamento può
  cambiare per le forze delle gomme, non per un percorso preimpostato.
- Sorgente nativa GPU: **53/53** controlli, zero errori di console. Tutte le piste,
  100 agenti, vegetazione e profilo, texture Porsche/LOD, Dettagli in pausa,
  camera senza avanzamento dei progressi, accesso 2D/atlante/test, finestre
  larghe e strette e breve moto del solver reale con pedali esclusivi.
- Sorgente con fallback CPU: **34/34**, zero errori di console.
- Salvataggi V2–V5: **49/49**, zero errori di console; parametri/storici reali,
  più worker, 100 agenti nei modelli completi, checksum, incompatibilità e
  ripresa in pausa. Generazioni anticipate e brevi prove non dimostrano convergenza.

Comandi principali:

```powershell
npm test
node --test outputs/tests/terrain.test.cjs
node_modules\electron\dist\electron.exe . --ui-smoke --circuit-3d-smoke --capture --ui-output-dir=work/qa-v530 --user-data-dir=C:/Temp/malecns-v530-ui
node_modules\electron\dist\electron.exe . --progress-smoke --progress-output-dir=work/qa-save-v530 --user-data-dir=C:/Temp/malecns-v530-save
```

Le acquisizioni sono della normale app: camera/zoom/focus ordinari, nessuna
auto riposizionata per la foto o risultato di guida inventato. Il dettaglio
Beau Rivage mostra il dislivello e non prova che un agente lo abbia percorso.

## Pacchetti Windows

Sullo stesso PC, AMD Ryzen 5 5600G (6 core/12 thread), NVIDIA RTX 4060 e grafica
AMD integrata, la build 5.3.0 è stata avviata con profili di prova indipendenti:

- App impacchettata: **53/53** controlli con GPU disponibile, **34/34** con
  fallback CPU e **49/49** sui progressi. Zero errori di console.
- Vero portable autoestraente: **34/34**, zero errori di console.
- **88/88** file distribuiti controllati identici alla sorgente; versione
  5.3.0 e fisica `992-gt3r-si-2`. Nessun file di progresso personale, log Codex
  o cache diagnostica inclusi nell'app.
- Installer NSIS: payload x64 estratto senza installare; archivio integro,
  **88/88** file identici alla sorgente, eseguibile runtime identico a quello
  dell'app impacchettata verificata. Il payload è x64; i wrapper NSIS sono x86.
- Portable, installer e app riportano versione 5.3.0 e stato Windows
  **NotSigned**. Il flusso completo dell'installer su Windows pulito non è
  stato provato: non è equivalente alla verifica del payload.

Questi sono controlli funzionali locali, non un benchmark di convergenza,
di FPS sostenuti o di velocità effettiva 30x. Checksum e verifiche di download
pubblico appartengono alle note della release, non a questo documento.

## Costo e conservazione

| Circuito | Alberi | Cespugli | Draw call vegetazione |
| --- | ---: | ---: | ---: |
| Laboratorio | 290 | 130 | 3 |
| Monza | 1.335 | 465 | 3 |
| Monaco | 73 | 27 | 3 |
| Le Mans | 1.060 | 390 | 3 |

Geometrie instanziate/statiche, superficie stradale raffinata senza alterare
poligoni XY. Terreno e piante vengono liberati al cambio circuito; nessuna
riduzione di neuroni, slot, passaggi o frequenza fisica per rendere il disegno
più veloce. Non sono misure di FPS o 30x effettivi.

Cambiano esplicitamente fisica e collegamento della superficie alla simulazione.
Restano invariati anatomia/dataset, policy, solver CPU/WebGPU, sensori e relativo
ordine, decoder, evoluzione e ricompense; geometrie planimetriche/cordoli e GLB
non sono modificati. I salvataggi e le vecchie distribuzioni non sono cancellati.

## Limiti

Profili stimati, non laser/GNSS; riferimenti topografici parziali 2023/2025, non
rilievo ufficiale 2026. Vegetazione sintetica, non censimento. Scala verticale
1:1 del modello. Contatto vincolato, senza salti/sospensioni complete o collisioni
fra auto. Vincolo esatto app/file **5.3.0**, fisica `992-gt3r-si-2`; vecchi file
5.2.0 usabili con 5.2.0. Nessuna promessa di miglioramento dell'apprendimento.

Fonti e dettaglio: [guida](TERRENO-v530.md), [profilo](data/terrain.js),
[campionatore](terrain.js), [fisica](vehicle-992.js),
[prove](tests/terrain.test.cjs) e [QA nativa](../desktop/circuit-3d-smoke.cjs).
