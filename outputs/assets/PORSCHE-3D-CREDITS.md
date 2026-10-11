# Porsche 992 GT3 R - modello 3D fornito dall'utente

Titolo nei metadati originali: **porsche_992_gt3_r**.
Autore indicato nel GLB: **MattDoesBlender**
([profilo](https://sketchfab.com/MattDoesBlender)).
Fonte indicata nel GLB:
[Porsche 992 GT3 R su Sketchfab](https://sketchfab.com/3d-models/porsche-992-gt3-r-03ea07f7972648aa9350853b2a1a942a).

Licenza indicata nel file originale e mantenuta per il modello derivato:
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/).
Il riepilogo della licenza è stato verificato sulla pagina ufficiale Creative
Commons. Il server Sketchfab ha risposto 403 durante la verifica; i crediti e il
collegamento alla fonte sono quindi attribuiti ai metadati del file fornito,
non a una lettura confermata della pagina Sketchfab.

Ingresso: `2024-porsche-992-gt3-r.zip`, voce
`source/porsche_992_gt3_r.glb`. Lo ZIP originale non è stato modificato.
Sono state mantenute le 34 immagini già incorporate nel GLB. La correzione
visiva `992-user-glb-lod-3` incorpora anche la voce `textures/decals.png` dello
stesso ZIP: la livrea gialla/nera Manthey/EMA numero 91. Questa immagine era
presente nell'archivio, ma il GLB originale non la collegava alla carrozzeria.
La texture è ora collegata a `EXT_Carpaint_Inst` mediante le coordinate UV
originali `TEXCOORD_0`, condivisa dai tre livelli di dettaglio. La trasformazione
del campionamento `(u,v) -> (u,2-v)` tramite `KHR_texture_transform` corregge
l'orientamento verticale dell'atlante, senza cambiare le UV o i pixel. Non sono state
generate, ridipinte o scaricate altre livree; non servono risorse remote.

Modifiche al modello: esterni uniti per materiale; rimozione degli strumenti
interni non visibili e dei cerchi alternativi sfocati/statici; conversione degli
assi; adattamento alle dimensioni della collisione già presente nel simulatore;
tre livelli di dettaglio tramite meshoptimizer. Ruote separate per sterzo e
rotazione visivi, luci posteriori collegate al comando di freno osservato.

Il modello derivato `porsche-992-gt3-r-lod.glb` e le modifiche alla geometria sono
distribuiti con **CC BY-NC-SA 4.0**, con attribuzione all'autore originale.
I conteggi, le trasformazioni, l'origine della livrea e gli SHA-256 sono registrati in
`porsche-992-gt3-r-provenance.json`. Il codice di preparazione si trova in
`work/prepare-porsche-3d.mjs` nel progetto sorgente.

Si tratta di un modello visivo di terzi; non è un CAD ufficiale Porsche e non
certifica dimensioni o omologazione. L'adattamento visivo non modifica la fisica,
le collisioni, i sensori, il grafo neurale o il calcolo delle ricompense.
