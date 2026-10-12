# Immagini e diagramma del README

Le anteprime correnti sono acquisizioni native dell'app sorgente **5.5.0**,
copiate per byte dai controlli della vista 3D in un profilo di prova separato.
Non sono mockup generati e non sono state ritoccate per il README.
Origine, stato della simulazione, limiti e checksum sono nella
[scheda delle immagini 5.5.0](screenshots/v550/README.md).

## Anteprime correnti 5.5.0

| Anteprima | File |
| --- | --- |
| Circuito e atlante affiancati | [desktop-split.png](screenshots/v550/desktop-split.png) |
| Tribuna di Monza | [monza-grandstand.png](screenshots/v550/monza-grandstand.png) |
| Box di Monza | [monza-pits.png](screenshots/v550/monza-pits.png) |
| Tribuna di Monaco | [monaco-grandstand.png](screenshots/v550/monaco-grandstand.png) |
| Tribuna di Le Mans | [le-mans-grandstand.png](screenshots/v550/le-mans-grandstand.png) |
| Panoramica di Monza | [monza-overview.png](screenshots/v550/monza-overview.png) |

## Immagini storiche 5.1.0, preservate

Le precedenti acquisizioni rimangono nel repository e nella cronologia delle
release. Non sono più le anteprime della versione corrente.

| Anteprima | Acquisizione originale |
| --- | --- |
| Apertura: circuito e atlante affiancati | [desktop-split.png](../../outputs/texture-verification-v510/source-3d/desktop-split.png) |
| Porsche con livrea | [monza-car-left.png](../../outputs/texture-verification-v510/source-3d/monza-car-left.png) |
| Panoramica di Monza | [monza-overview.png](../../outputs/texture-verification-v510/source-3d/monza-overview.png) |

Origine: controllo nativo [circuit-3d-smoke.cjs](../../desktop/circuit-3d-smoke.cjs).
Il [report della cattura](../../outputs/texture-verification-v510/source-3d/ui-smoke.json)
riporta la versione 5.1.0 e la data `2026-10-11T15:34:03.108Z`.
La [verifica delle texture](../../outputs/TEXTURE-v510.md) descrive risorse e limiti.

Le immagini mostrano l'interfaccia e il rendering in una prova controllata,
anche in pausa: **non dimostrano giri appresi, convergenza o fedeltà CAD**.
Il modello Porsche rappresentato mantiene i relativi
[crediti e condizioni](../../outputs/assets/PORSCHE-3D-CREDITS.md).

[learning-flow.svg](learning-flow.svg) è un diagramma vettoriale originale
delle relazioni fra sensori, policy, simulazione e selezione evolutiva.
È stato scritto per questa documentazione, non generato da un'immagine.
Le relazioni descritte fanno riferimento a
[simulation.js](../../outputs/simulation.js) e
[neural-learning.js](../../outputs/neural-learning.js).

I cinque [badge locali](badges/) sono SVG originali scritti per il README,
senza dipendenza da un servizio esterno di immagini. Riportano la versione
in package.json, il target Windows x64, l'esecuzione locale, il calcolo
CPU/WebGPU e il metodo di sviluppo indicato dall'autore. Non rappresentano
misurazioni di performance o certificazioni.
