# Tribune e dettagli del circuito — 5.5.0

La vista 3D aggiunge tribune con gradoni, sedute, corsie di scale, parapetti,
supporti e travature. Alcune hanno una copertura. Completano l'ambiente edifici
dei box con serrande e vetrate, cabine schematiche a bordo pista, un portale
di partenza e cartelli 150 / 100 / 50 prima di alcune frenate.

## Dove trovarli

Apri **Vista 3D** e il menu **Inquadra**: il gruppo **Tribune e box · 3D stimato**
porta direttamente a ogni struttura. La selezione ripristina **Dettagli: sì**
se questi erano nascosti. Usa trascinamento/frecce per orbitare, rotella o
pizzico per lo zoom e **Centra** per tornare al circuito completo. La mappa
2D non offre destinazioni che non disegna. L'atlante del cervello e la vista
affiancata rimangono disponibili.

## Riferimenti e limiti della ricostruzione

- Monza: [mappa ufficiale tribune Monzanet 2026](https://www.monzanet.it/wp-content/uploads/2026/03/GP_F1_2026_LISTINO_PREZZI_3_2.pdf), pagina 1. Zone Centrale, Prima Variante, Roggia, Ascari e Parabolica.
- Monaco: [mappa ufficiale ACM 2026](https://acm.mc/wp-content/uploads/2025/05/Hospitalites_ACM_F12026_F-3.pdf), pagina 2. Zone Sainte-Dévote, Casino, porto, Piscine e Anthony Noghès.
- Le Mans: [plan tribunes ACO 2026](https://assets.lemans.org/explorer/pdf/aco/2026/2026-plan-aco-tribunes-24h.pdf), pagina 1, intestazione visibile «10 au 14 juin 2026». Zone rettilineo dei box, Dunlop, Tertre Rouge e raccordo.
- Laboratorio: tutte le strutture e le loro posizioni sono sintetiche.

Queste mappe documentano **zone e nomi**, non le coordinate, le misure o
l'architettura dei modelli nell'app. Registrazione sul tracciato, distanze
laterali, gradoni, colori, numero di sedili, coperture e dimensioni sono
**stime grafiche**. Il numero di sedili disegnati non è la capienza ufficiale
della tribuna. Box, cabine, portale e cartelli sono illustrativi, non un
rilievo delle installazioni reali. I PDF non sono incorporati nei modelli.

Il posizionamento cerca spazio libero intorno all'ancoraggio stimato. Se non
trova un'impronta sicura, omette la struttura e lo segnala nelle metriche
diagnostiche; non sposta la strada. I cartelli conservano la distanza lungo
la linea del modello rispetto alla stazione di riferimento, ma **non sono
un consiglio di frenata** né la posizione rilevata dei cartelli reali.

Le geometrie sono create dal codice locale, senza nuovi asset scaricati,
loghi o immagini delle mappe ufficiali. I crediti e le licenze delle Porsche,
degli alberi e degli edifici preesistenti restano invariati.

## Prestazioni e separazione dalla simulazione

Le strutture usano una sola geometria condivisa e al massimo **tre batch di
disegno**: strutture, fasce delle file lontane e sedute singole vicine. Il
dettaglio delle sedute compare entro 190 metri di distanza 3D dalla tribuna;
le matrici vengono ricomposte soltanto quando cambia l'insieme delle tribune
vicine. Il terreno disegnato viene campionato per le fondazioni. Le impronte
sono controllate contro la carreggiata e il perimetro delle protezioni/vie di
fuga; gli alberi e gli edifici rispettano lo spazio riservato alle strutture.

**Dettagli: sì/no** nasconde o mostra anche questi elementi, senza disattivare
pendenze o fisica. Non sono aggiunte collisioni, pit lane percorribili, sensori,
un pilota guida o ingressi neurali. Fisica, carreggiata, ricompense, policy e
algoritmi di apprendimento sono conservati rispetto alla 5.4.0. Non è stato
misurato un miglioramento dell'apprendimento con queste aggiunte visuali.

## Salvataggi e distribuzione

I nuovi file `.malecns-save` richiedono **esattamente l'app 5.5.0**. Usa i file
5.4.0 con la relativa app precedente, preservata; nessuna migrazione automatica.
Portable e installer Windows x64 sono generati in `dist-facilities-v550/`.
Verifiche effettive e limiti: [VERIFICA-v550.md](VERIFICA-v550.md).
