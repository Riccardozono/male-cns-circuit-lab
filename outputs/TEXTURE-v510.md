# Correzione della livrea Porsche — app 5.1.0

La voce `textures/decals.png` del file `2024-porsche-992-gt3-r.zip` fornito
dall'utente contiene la livrea gialla/nera Manthey/EMA numero 91. Il GLB dello
stesso archivio aveva 34 immagini incorporate, ma `EXT_Carpaint_Inst` non aveva
una texture di colore: la carrozzeria risultava uniforme, mentre alcuni
dettagli avevano già le proprie texture.

Il derivato `assets/porsche-992-gt3-r-lod.glb` incorpora ora anche quell'immagine
originale, senza modificarne i pixel. La texture è collegata al colore della
carrozzeria mediante `TEXCOORD_0`, senza moltiplicarla per il precedente grigio.
Il confronto dei contorni delle UV originali con l'atlante verifica anche
l'inversione verticale necessaria: il campionamento diventa `(u,v) -> (u,2-v)`
mediante `KHR_texture_transform`. Le UV dei vertici non vengono riscritte.
I tre livelli di dettaglio e gli agenti condividono la stessa risorsa.
Le 34 immagini precedenti sono conservate; non servono file o URL esterni.

L'immagine è 4096 x 4096, 3.661.603 byte. SHA-256:
`c3de6a3dc8ea5c3a209bc09bb699767434111a35067192281f10f6ea7fa28d3a`.
Origine, collegamento al materiale, UV, hash e licenza sono riportati nella
[provenienza del modello](assets/porsche-992-gt3-r-provenance.json) e nei
[crediti](assets/PORSCHE-3D-CREDITS.md).

## Uso e compatibilità

Aprire il portable nella cartella `dist-textures-v510/`, oppure utilizzare
l'installer nella stessa cartella. Non usare il precedente eseguibile in
`dist-learning-3d-v510/` per verificare la correzione: quel pacchetto è
conservato com'era. In app scegliere **Vista 3D**, **Segui auto** e, se
necessario, **Vedi da vicino**; trascinare per vedere le diverse facce.

La versione app e il formato dei progressi restano **5.1.0**. IA, fisica,
ricompense, circuiti, sensori e collisioni non sono stati modificati per
questa correzione. I progressi 5.1.0 possono quindi essere caricati anche qui;
i file 5.0.0 richiedono ancora la relativa versione. Nessun salvataggio o
eseguibile precedente è sostituito dal lavoro sul progetto.

## Verifica riproducibile nel progetto sorgente

- `node --test outputs/tests/supplied-car-3d.test.cjs`: test di risorse locali,
  SHA-256 della livrea incorporata e visualizzazione di 100 agenti senza
  modificare il loro stato.
- `node work/run-v510-smoke.cjs --capture --out=outputs/texture-verification-v510/source-3d`:
  controllo nell'app Windows con immagini di inseguimento, panoramiche,
  atlante affiancato e interfaccia stretta; non una prova di giri appresi.
- `node work/preserve-texture-fix-v510.cjs --verify`: confronto con i file
  protetti di IA, fisica, salvataggi e distribuzioni precedenti.
- `node work/verify-texture-package-v510.cjs`: controllo del nuovo pacchetto,
  delle risorse incorporate e dei report delle prove native. I report della
  correzione sono in `outputs/texture-verification-v510/` nel progetto, non
  nel pacchetto distribuito.

La revisione visiva è `992-user-glb-lod-3`; non è un cambio del modello neurale
V2/V3/V4/V5. Questa correzione non dimostra aumenti di velocità o apprendimento.
Per il significato di collegamento materiale/texture e coordinate UV si veda
la [specifica glTF 2.0 Khronos](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
e [KHR_texture_transform](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_transform/README.md).
