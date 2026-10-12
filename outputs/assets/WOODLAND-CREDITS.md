# Alberi aggiuntivi Sketchfab

Asset locali scaricati dall'interfaccia Sketchfab il 12 ottobre 2026.
Licenza verificata nei due dialoghi di download: **CC BY 4.0**, con
attribuzione agli autori. Originali conservati separatamente; hash del GLB
di origine, derivato e texture in [woodland-provenance-v1.json](woodland-provenance-v1.json).

| Asset | Autore | Licenza | Adattamento |
| --- | --- | --- | --- |
| [Tree Pack](https://sketchfab.com/3d-models/tree-pack-ea51b3ac209e4f70ab9c618e34000b84) | [Fabio Rinaldo Roloff](https://sketchfab.com/fabioroloff) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 7 sagome su piani incrociati, 8 triangoli ciascuna. Trasformazioni applicate, pivot a terra, altezza normalizzata. UV, vertex colour e 7 PNG incorporati conservati per byte. Alpha masking per il bosco istanziato. |
| [Oak Tree (LowPoly)](https://sketchfab.com/3d-models/oak-tree-lowpoly-6ccd872db7f0429b8dad40c6f00ec75c) | [riskris Design](https://sketchfab.com/risKris) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Tronco e chioma volumetrici nello stesso albero. 112 triangoli originali, 68 nel dettaglio distante. Nessuna texture di origine: colori e materiali del modello. Scala uniforme e pivot a terra. |

Gli alberi dei due modelli forniti in precedenza rimangono intatti;
[crediti originali](ENVIRONMENT-CREDITS.md). Complessivamente la scena può
usare dieci sagome. Le specie nominate sono quelle dei file dell'autore,
non un censimento delle specie reali dei circuiti.

Collocazione delle nuove istanze deterministica entro le aree di bosco,
parco o verde disponibili nei dati OSM, con raccordo geografico stimato.
Ogni tronco segue il terreno disegnato; la chioma resta fuori dalle
strade del simulatore, dalle vie di fuga e dalle impronte degli edifici.
Le nuove istanze non aggiungono collisioni o ingressi al modello neurale.

Il pack usa piani alpha incrociati, un'approssimazione visiva economica
per il bosco; la quercia e gli alberi originali mantengono chiome in volume.
Il pack conserva gli stessi 8 triangoli nei due livelli di dettaglio,
perché una ulteriore riduzione deformerebbe le sagome. Niente texture
scaricate a runtime, codice scaricato eseguito o credenziali incluse.
