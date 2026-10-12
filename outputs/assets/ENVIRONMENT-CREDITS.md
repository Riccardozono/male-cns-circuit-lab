# Alberi ed edifici — attribuzione degli asset 5.4.0

Gli asset di questa pagina hanno licenza **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**.
Autore, licenza e disponibilità al download sono stati verificati nei metadati
pubblici ufficiali Sketchfab; per le case anche nelle finestre di download del
sito, dopo l'accesso eseguito dall'utente. Verifica: 12 ottobre 2026.
La licenza della Porsche è separata: [CC BY-NC-SA 4.0](PORSCHE-3D-CREDITS.md).

## Alberi forniti dall'utente

[Tree low poly lowpoly](https://sketchfab.com/3d-models/tree-low-poly-lowpoly-73201f05280d48dcb10ed4ca362d69f8)
di **[00amza](https://sketchfab.com/00amza)**.
Ingresso: `tree-low-poly-lowpoly.zip`, `source/Tree 1 and 2.fbx` e
`textures/Tree.png`. Sono usati entrambi gli alberi, non copie procedurali della
loro forma. Le coordinate UV originali e i byte dell'atlante PNG 256 × 256 sono
conservati. I riferimenti immagine non risolvibili del FBX sono stati collegati
alla texture effettivamente presente nello ZIP, per colore e alpha.

Conversione FBX → GLB con Blender in un processo separato; trasformazioni
applicate, scala uniforme, base a quota zero, parti condivise e due livelli di
dettaglio. LOD vicino: **1.629 triangoli complessivi per le due forme**; lontano:
**421**, non triangoli per ogni singolo albero. Le foglie usano alpha test.
File derivato: `trees-supplied-v1.glb`. I cespugli rimangono procedurali.

## Edifici per Monaco

[Modular modernist eclectic building](https://sketchfab.com/3d-models/modular-modernist-eclectic-building-7003371cd8ba430c819ebd78eb0594cf)
di **ChristosRami.studio**. GLB scaricato dal sito, immagini incorporate originali.
File derivato: `monaco-building-v1.glb`. Trasformazioni applicate, scala uniforme,
base a quota zero, unione per materiale e LOD lontano semplificato.
I **12 segmenti lineari** originali sono conservati come tubi aperti a quattro
lati negli stessi punti: il loro spessore di visualizzazione è una scelta
artificiale, pari a 0,002 dell'altezza sorgente prima della normalizzazione finale.
Non è una dimensione architettonica misurata.

## Case per Le Mans

[European House #3](https://sketchfab.com/3d-models/european-house-3-ebdc29841f4d4b1fbc3d63c841a0a48a)
di **Satik64**. GLB scaricato scegliendo le texture 1k originali per contenere il
costo della scenografia. File derivato: `le-mans-house-v1.glb`.
Trasformazioni applicate, scala uniforme, base a quota zero, unione per materiale
e LOD lontano semplificato. Colore diffuso, normali, occlusione, colori dei vertici,
tangenti e coordinate UV sono mantenuti. Il materiale legacy specular/glossiness
è convertito nel metallic/roughness supportato dall'app: la risposta lucida è
**approssimata**, non identica al vecchio shader. Le immagini originali restano
incorporate, comprese le mappe specular/glossiness non campionate dal nuovo shader.

## Limiti e riproducibilità

Posizioni e dimensioni della scenografia sono illustrative: **non sono le case
reali rilevate lungo Monaco o Le Mans**, né un censimento della vegetazione.
Nessuna nuova collisione; fisica, ricompense, apprendimento e dati neurali non
sono modificati dagli asset. Tutti i modelli sono locali; non serve Sketchfab
durante l'uso dell'app. Nessuna nuova texture generata o ridipinta.

[Manifest SHA-256, origini e adattamenti](environment-provenance-v1.json).
Strumenti nel repository: `work/prepare-environment-assets.py` e
`work/prepare-environment-lods.mjs`. Gli ZIP/GLB originali scaricati dall'utente
sono conservati; le credenziali e i dati dell'account non fanno parte dell'app.
