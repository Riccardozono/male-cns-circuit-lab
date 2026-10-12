# Verifica della sorgente — 5.5.0

Prove su Windows, Ryzen 5 5600G (6 core / 12 thread) e RTX 4060,
Node 24.19.0, Electron 38.8.6. Profili temporanei separati dai progressi
dell'utente. Il backend neurale CPU forzato non disattiva il renderer WebGL 2.
Queste prove non sono un benchmark dell'apprendimento o degli FPS.

## Risultati effettivi

- **340/340 test automatici** (`npm test` e ripetizione con report su file), inclusi dieci nuovi controlli per
  strutture, impronte, fonti, stime, distanze dei cartelli, LOD e smaltimento
  indipendente delle risorse e reset Home. Rimangono i test di fisica, sensori, ricompense,
  salvataggi, dati anatomici e separazione gas/freno.
- **82/82 controlli nativi con acquisizioni di conferma**: quattro circuiti, 100 agenti,
  dieci immagini di tribune, box, panoramica, atlante affiancato, desktop,
  1280 px e mobile; nessun errore di console. Le inquadrature usano il menu
  dell'app e non spostano auto, strutture o stato neurale per le immagini.
  Includono la selezione dei box con End, focus da tastiera, ripristino dei
  Dettagli nascosti scegliendo una struttura e Home da tribuna e box su tutte
  le piste: camera e selettore tornano insieme al circuito completo, senza
  avanzare i progressi in pausa.
- **71/71 controlli nativi con backend neurale predefinito**, senza acquisizioni,
  con le stesse piste, 100 agenti e prove funzionali della correzione Home.
  Risulta WebGPU attivo, un worker, adattatore dichiarato «nvidia lovelace» e
  32.768 slot attivi del profilo V5. Non è una misura di throughput della GPU.
- **49/49 controlli nativi dei progressi**: V2–V5, file di 100 agenti, ripristino,
  checksum e rifiuto di una versione o policy non compatibile.
- **28/28 controlli di conservazione** rispetto al commit della 5.4.0:
  fisica, terreno, rete, dati anatomici, circuiti/cordoli, ricompense,
  apprendimento, formato progressi, engine/worker, Porsche, alberi/case e loro
  provenienza, CSS, identità visiva, sidecar e due vecchi eseguibili. Sorgenti
  testuali confrontati normalizzando LF/CRLF; asset e vecchi EXE per byte.

L'export dei progressi, posizioni, comandi e fitness restano invariati durante
orbit, zoom, scelta delle strutture e Dettagli in pausa. È stato provato anche
il movimento fisico con 100 auto, valori finiti e gas/freno separati. La prova
non dimostra giri appresi o un'accelerazione dell'apprendimento.

## Quantità nel renderer nativo

| Circuito | Tribune | Sedili schematici | Edificio box | Cabine | Cartelli |
| --- | ---: | ---: | ---: | ---: | ---: |
| Laboratorio | 1 | 640 | 1 | 2 | 0 |
| Monza | 6 | 7.016 | 1 | 3 | 11 |
| Monaco | 6 | 4.030 | 1 | 3 | 12 |
| Le Mans | 7 | 8.172 | 1 | 4 | 18 |

Un portale di partenza è presente su ciascuna pista. Il cartello 100 m della
Parabolica a Monza viene omesso perché non trova un'impronta libera: la strada
e le strutture già collocate non vengono spostate per forzarlo. Il numero di
sedili **non è la capienza ufficiale**. Dimensioni, architettura e raccordo
alle mappe sono stime dichiarate nella [guida](TRIBUNE-v550.md).

## Portata grafica e limiti

Le strutture condividono una geometria e al massimo tre batch di disegno;
nelle panoramiche le sedute singole non sono inviate alla GPU. Le fondazioni
seguono la superficie disegnata e gli spazi riservati sono esclusi dalla
distribuzione di alberi e case. I controlli nativi verificano anche che tutta
la scena, comprese 100 auto, resti sotto il limite di 150 chiamate di disegno.
Nessun confronto prima/dopo di FPS o velocità di simulazione è stato eseguito.

Il layout esistente non è stato ridisegnato. Il controllo Impeccable rileva
avvisi ereditati dal CSS su testi piccoli, spaziatura, gerarchia e token:
questa aggiunta non è una revisione completa dell'accessibilità. Non si
aggiungono pit lane, collisioni con i dettagli, sensori o comandi per l'IA.
Le mappe ufficiali documentano le zone, non CAD o posizioni misurate.

I salvataggi nuovi richiedono esattamente **5.5.0**; i file precedenti e le
relative app vengono preservati. Nessun profilo di prova è un progresso
dell'utente e nessun file di prova viene distribuito nei pacchetti.

Questo rapporto riguarda la sorgente. Le verifiche successive dei pacchetti,
portable, payload installer, firma, architettura, checksum, commit e download
pubblico sono riportate nelle note della [release 5.5.0](https://github.com/Riccardozono/male-cns-circuit-lab/releases/tag/v5.5.0).
Non si dichiara una prova interattiva dell'installer su Windows pulito.
