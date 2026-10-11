# Verifica ambiente 3D — 5.2.0

Verifiche locali dell'11 ottobre 2026 su Windows x64, eseguite sull'app Electron
reale con profili temporanei separati dai progressi dell'utente. Hardware rilevato:
AMD Ryzen 5 5600G (6 core / 12 thread), NVIDIA GeForce RTX 4060 e grafica AMD
integrata; Electron 38.8.6, test CLI con Node.js 24.19.0. Questo rapporto
riguarda la sorgente prima dell'impacchettamento: i controlli successivi dei
binari, il commit identificato dal tag e i checksum sono registrati nelle
[note della release 5.2.0](https://github.com/Riccardozono/male-cns-circuit-lab/releases/tag/v5.2.0).

## Test eseguiti

- `npm test`: **299/299** test superati, zero fallimenti e zero test saltati.
- Geometrie circuito/ambiente: **18/18**, inclusi poligoni reali della strada,
  maschera visuale equivalente alla classificazione fisica, triangoli delle
  nuove superfici fuori dalla strada, assenza di incroci fra pannelli delle
  barriere, terreno che non può occludere asfalto/vie di fuga, valori finiti,
  disposal e invarianza degli input.
- App nativa, GPU disponibile: **48/48** controlli, zero errori di console.
  Coperti Laboratorio, Monza, Monaco, Le Mans, 100 agenti, LOD Porsche con texture,
  viste Segui auto/Panoramica, 2D/atlante, accesso test modelli, Dettagli in pausa,
  invarianti dei progressi durante le operazioni di camera e breve movimento
  del solver reale con acceleratore/freno esclusivi.
  Le tre viste ravvicinate usano le voci registrate del selettore Inquadra,
  con stato della camera e hash invariati dei progressi in pausa.
- App nativa con `MALE_CNS_FORCE_CPU_FALLBACK=1`: **30/30** controlli, zero
  errori di console. Il percorso CPU mantiene l'accesso alle viste e ai comandi.
- File di progresso: **49/49** controlli, zero errori di console: round trip
  V2–V5, più worker, parametri/storico reali, popolazione 100 per i profili
  completi, ripresa in pausa, checksum, rifiuto di versione diversa e policy
  incompatibile. Le generazioni anticipate del test non provano apprendimento.

Comandi riproducibili da sorgente, con profili di prova propri:

```powershell
npm test
node_modules\electron\dist\electron.exe . --ui-smoke --circuit-3d-smoke --capture --ui-output-dir=work/qa-v520 --user-data-dir=C:/Temp/malecns-v520-ui
node_modules\electron\dist\electron.exe . --progress-smoke --progress-output-dir=work/qa-save-v520 --user-data-dir=C:/Temp/malecns-v520-save
```

Gli screenshot sono acquisizioni della normale app in pausa, senza spostare
auto o sostituire telemetria; i dettagli delle vie di fuga usano soltanto la
camera. Non sono dimostrazioni di giri appresi. Il rilevatore UI ha segnalato
18 avvisi relativi alla presentazione esistente, fra cui caratteri piccoli,
spaziatura e token: non si è cambiata l'identità dell'interfaccia per questa
estensione locale. La revisione visiva viene svolta separatamente dai test.

## Costo geometrico misurato

Valori della sorgente nel controllo panoramico a 100 agenti, non benchmark FPS:

| Circuito | Nuovi oggetti per materiale | Triangoli della scenografia | Draw call complessive della scena |
| --- | ---: | ---: | ---: |
| Laboratorio | 4 | 87.892 | 57 |
| Monza | 8 | 100.802 | 61 |
| Monaco | 5 | 32.490 | 58 |
| Le Mans | 8 | 259.540 | 61 |

Ogni circuito ha al massimo nove nuovi oggetti raggruppati per materiale,
anziché un oggetto per pannello. Le recinzioni sono nascoste in Panoramica.
Il limite di disegno precedente rimane 30 aggiornamenti/s con DPR massimo 1,5.
Questi numeri **non dimostrano** 30 FPS, 30x effettivi o apprendimento più rapido.

## Conservazione

Confronto SHA-256 con lo stato iniziale: **19/19 file identici**. Fra essi:
simulazione, Porsche fisica, ricompense, apprendimento, profili neurali, loader
e dati del connectome completo, circuiti JSON/JS, cordoli, engine desktop,
formato dei progressi e stato desktop. Anche DESIGN.md, il relativo sidecar
e i due eseguibili 5.1.0 risultano identici. Le modifiche sono nel renderer,
nel catalogo visuale, negli indicatori della versione e nella documentazione.

Le superfici di fuga non diventano strada; barriere e recinzioni non vengono
inviate a sensori o collisioni. Non sono aggiunte collisioni fra auto, varchi o
accessi di servizio. Per mostrare il vero limite di simulazione resta disponibile
**Mostra bordi fisici**.

## Limiti e salvataggi

- Copertura delle vie di fuga parziale: sei zone Monza, tre Monaco, nove Le Mans.
  Posizione delle protezioni, materiali, distanze, altezze ed estensioni sono
  stime grafiche. I riferimenti contestuali sono mappe 2025, non rilievi 2026.
  **Non posso confermare** la corrispondenza esatta alle protezioni reali.
- Terreno piano: nessuna altimetria misurata, ricostruzione di edifici, meteo
  o nuove interazioni fisiche con gli elementi scenografici.
- I raccordi del perimetro sono uniti prima della triangolazione. Alcuni pannelli
  troppo vicini alla strada sono omessi a salvaguardia della lettura, non
  presentati come varchi reali: 24 segmenti Monaco e 20 Le Mans nel controllo.
- Nessuna misura nuova di convergenza ai due giri o miglioramento dei modelli:
  controller, allenamento e ricompense sono invariati.
- File `.malecns-save` vincolati esattamente a **5.2.0**. I file 5.1.0 restano
  utilizzabili soltanto con 5.1.0; non vengono migrati o cancellati.
- Nuove build in `dist-scenery-v520/`, separate dalle precedenti. La firma
  Authenticode va verificata sui binari; lo stato è riportato nella release.

Fonti implementative: [guida e mappe](AMBIENTE-3D-v520.md),
[catalogo stimato](data/scenery.mjs), [geometrie](track-scenery.mjs),
[test geometrici](tests/track-scenery.test.cjs),
[QA nativa](../desktop/circuit-3d-smoke.cjs) e
[QA salvataggi](../desktop/progress-smoke.cjs).
