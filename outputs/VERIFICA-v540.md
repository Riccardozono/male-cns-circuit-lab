# Verifica della sorgente — 5.4.0

Eseguita il 12 ottobre 2026 su Windows, Ryzen 5 5600G e RTX 4060, Node 24.19.0,
Electron 38.8.6. Tutte le prove native usano profili temporanei separati dai
progressi dell'utente. Non sono benchmark di apprendimento o di FPS.

## Risultati

- **330/330 test automatici** (`npm test`), inclusi 13 nuovi test per asset,
  provenienza, impronte, non sovrapposizione, LOD e proprietà delle risorse.
- **72/72 controlli nativi** della vista 3D con backend neurale WebGPU disponibile,
  quattro piste, 100 agenti e acquisizioni desktop, 1280 px e mobile.
- **47/47 controlli nativi** con backend neurale CPU forzato, senza acquisizioni.
  Questo non disattiva la GPU del renderer 3D.
- **49/49 controlli nativi dei progressi**: profili V2–V5, file di 100 agenti,
  ripristino, checksum e rifiuto di una versione/policy non compatibile.
- **22/22 controlli di conservazione** rispetto alla 5.3.0: solver, terreno,
  circuiti, dati neurali, learning/rewards, progressi, engine/worker, Porsche,
  identità visiva e due vecchi eseguibili. Per i sorgenti testuali si normalizzano
  le terminazioni Git LF/CRLF; binari, sidecar e vecchi EXE si confrontano per byte.

Il renderer reale carica GLB e texture locali, non geometria mock. Nelle prove
sono presenti entrambi gli alberi; **84 edifici a Monaco e 64 case a Le Mans**;
nessun edificio a Monza o Laboratorio. La texture degli alberi ha SHA-256
`94a5c999fdf57f24f3841cf45197a71ec1367ae15f36fb73e4a5f7354a24c838`, identico
alla voce `textures/Tree.png` fornita. Le altre immagini si verificano nel
[manifest](assets/environment-provenance-v1.json).

Zoom, rotazione, focus e Dettagli non alterano l'export dei progressi in pausa,
né posizione, comandi e fitness delle auto. Dettagli nasconde anche gli edifici.
Provato inoltre il movimento fisico con 100 auto, stato finito e pedali separati;
la presenza dei nuovi asset **non dimostra giri appresi o convergenza migliore**.
La Porsche e la sua livrea rimangono quelle già distribuite nella 5.3.0.

## Portata visiva e prestazioni

Acquisizioni valide di panoramiche, alberi, edifici, vie di fuga, dislivello,
quattro lati della Porsche, atlante affiancato e layout responsivo; nessun errore
inatteso del renderer. I primi piani spostano solo la camera sulle istanze reali,
non posizionano auto o modificano l'apprendimento. Le schermate in pausa non
sono risultati di guida. Restano limitati e dichiarati i budget di istanziazione
e dettaglio; nessun confronto prima/dopo di FPS o accelerazione dell'IA.

Il layout esistente non è stato ridisegnato. Il controllo Impeccable rileva anche
avvisi ereditati su testi piccoli, gerarchia e token non documentati: non si
presenta questa modifica come una revisione completa dell'accessibilità.

## Limiti e pacchetti

Le collocazioni non sono un rilievo dei quartieri reali. Shader lucido di Le Mans
e spessore dei segmenti di Monaco sono adattamenti dichiarati nei
[crediti](assets/ENVIRONMENT-CREDITS.md). Fisica invariata rispetto alla 5.3.0;
non sono aggiunte collisioni. I progressi richiedono 5.4.0 esatta.

Questo rapporto riguarda la sorgente. I controlli effettivi dei pacchetti,
contenuti, versione, firma, architettura, checksum, commit e download pubblico
sono riportati nelle note della [release 5.4.0](https://github.com/Riccardozono/male-cns-circuit-lab/releases/tag/v5.4.0).
Non si dichiara una prova interattiva dell'installer su Windows pulito.
