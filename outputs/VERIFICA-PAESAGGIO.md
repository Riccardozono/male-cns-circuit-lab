# Verifica del paesaggio NASA — sviluppo sulla 5.5.0

12 ottobre 2026. Sorgente di sviluppo, **non nuova versione o release**.
Le verifiche non certificano rilievo CAD, precisione altimetrica assoluta,
territorio attuale, FPS costante o maggiore convergenza degli agenti.

## Esito realmente osservato

- Suite completa `npm test`: **353/353**, compresi 13 nuovi controlli del
  paesaggio e i test preesistenti di fisica, apprendimento, salvataggi, sensori,
  indipendenza delle auto e carreggiata condivisa.
- App Electron, profilo temporaneo, 100 agenti: **97/97** nella conferma isolata
  con fallback CPU e vista WebGL 2 disponibile. In questa modalità il flag
  `disable-gpu` è attivo: non si presenta la prova come rendering hardware GPU.
  Pausa, cambi pista,
  inquadratura Paesaggio, dettagli degli edifici, Home/Centra, Dettagli,
  panoramica, inseguimento, 2D e atlante affiancato verificati.
- App Electron con WebGPU: **81/81**; backend attivo, adapter riportato
  `nvidia lovelace`, 32.768 slot V5. Questo verifica il funzionamento, non
  rappresenta un benchmark di apprendimento o un riconoscimento del modello
  esatto della scheda video dal nome dell'architettura.
- **33/33** controlli di conservazione: fisica, sampler fisico, anatomia, sensori,
  ricompense, ottimizzatore, salvataggi, mappe/cordoli, asset 3D e texture,
  CSS/design system, numero 5.5.0 e portable/setup esistenti sono invariati.
- Salvataggi nella vera app Electron: **49/49**, versione 5.5.0, tutti i profili
  V2–V5, compreso il salvataggio di 100 agenti. Le prove usano file e profili
  temporanei, non i progressi personali dell'autore.
- **500 campioni per circuito**, 1.500 totali, confrontati direttamente con
  gli HGT NASA originali. Hash ZIP/HGT/ritagli corrispondenti, CRC valido;
  massimo errore numerico Float32 inferiore a 0,00005 m. È l'errore della
  conversione numerica, **non l'accuratezza** dei rilievi SRTM.

Un tentativo CPU, svolto mentre erano attivi altri controlli, è scaduto nella
prova di avanzamento. **Non è riportato come superato.** La conferma isolata
successiva è passata dopo aver reso espliciti nel test l'attesa del circuito
e il comando di avvio al backend. Il codice del motore e dell'apprendimento
non è stato modificato; non si attribuisce al timeout una causa non verificata.

## Densità e geometria misurate

| Circuito | Edifici OSM disegnati | Triangoli del terreno | Lotti terreno |
|---|---:|---:|---:|
| Monza | 500 | 58.446 | 2 |
| Monaco | 1.032 | 37.224 | 2 |
| Le Mans | 978 | 138.224 | 2 |

Gli edifici OSM si aggiungono alle case Sketchfab vicine alla pista; queste
ultime hanno budget 140 a Monaco e 100 a Le Mans, non un numero garantito di
collocazioni. Quartieri in tre lotti statici più finestre istanziate vicine,
con capacità massima 14.000. Non sono modelli ufficiali delle architetture reali.
Il Laboratorio mantiene il terreno sintetico e non riceve falsi dati NASA.

L'intero paesaggio resta fuori dalla policy: caricamento, camere e toggle
sono stati confrontati con hash di stato/progressi in pausa. La vista non
aggiunge collisioni tra auto o contro le nuove strutture.

## Campione di rendering, limiti dell'evidenza

25 invii di rendering in pausa su Monza con 100 agenti, conferma isolata:
mediana **3,0 ms**, massimo **5,8 ms**. È il tempo CPU di invio del disegno,
non il tempo GPU completo, non FPS sostenuti e non velocità dell'IA.
La prova GPU condotta sotto altro carico ha misurato una mediana di 5,9 ms
e un massimo di 78,1 ms: non viene usata per promettere un FPS minimo.
Il tetto 30× resta quello richiesto, non una promessa di 30× effettivi.

13 catture native finali: le tre fasce 1 km, panoramica e inseguimento Monza,
tribuna e quartiere Monaco, quartiere Le Mans, desktop, affiancata, larghezza
utente 1280, mobile e apertura mobile. I profili di prova sono separati dai
progressi dell'autore. Non sono state preparate traiettorie, posizioni delle
auto o una finta curva di apprendimento per le immagini.

La revisione visuale indipendente Impeccable ha restituito **`ship`** per la
sorgente locale e le 13 catture fornite, senza correzioni materiali dovute.
Non è una certificazione dell'accuratezza geografica o della distribuzione.

## Riproduzione e fonti

`npm test`; `node work/landscape/verify-preservation.cjs`;
`python work/landscape/verify-srtm.py --srtm-dir <ZIP NASA>`.
Il renderer si verifica con Electron e `--ui-smoke --circuit-3d-smoke --capture`,
sempre con un `--user-data-dir` temporaneo e una cartella di report distinta.
Per un'anteprima interattiva isolata: [preview.cmd](../work/landscape/preview.cmd).

Fonti, DOI, limiti di risoluzione, licenze, georegistrazione e raccordo sono
descritti in [PAESAGGIO-SRTM.md](PAESAGGIO-SRTM.md) e nel
[manifest](data/landscape/manifest.json). I report tecnici e le catture restano
nella cartella privata `.impeccable/review/landscape`, esclusa dai commit.

Portable, installer e tag `v5.5.0` del sorgente distribuito restano invariati;
nessun eseguibile nuovo è stato compilato o pubblicato durante questa modifica.
