# Paesaggio e boschi — Windows 5.6.0

Release richiesta dall'autore il 12 ottobre 2026. Integra lo sviluppo di
paesaggio e boschi precedentemente provato come sorgente 5.5.0, senza
sostituire le distribuzioni o i progressi precedenti.

## Novità

- Fascia attorno ai bordi pista: 1 km a Monza e Monaco, **2 km a Le Mans**.
- Quote originali NASA SRTMGL1 v003, con raccordo stimato al tracciato.
- Edifici e aree del terreno derivati dai poligoni disponibili OSM.
- Nuovi alberi Sketchfab: sette sagome con texture del Tree Pack di Fabio
  Rinaldo Roloff e una quercia volumetrica di riskris Design. I due alberi
  originali rimangono, per dieci sagome complessive.
- Boschi più densi soprattutto a Monza; 10.626 alberi totali nel controllo
  nativo 5.6.0 e 25.075 a Le Mans, con 1.970 impronte edilizie collocate.
- Inquadra → Bosco e Paesaggio, mantenendo inseguimento 3D, panoramica,
  mappa 2D e atlante del cervello.
- Repository privo dei salvataggi e dei risultati grezzi di prova già esclusi
  dai pacchetti. Test, fonti, strumenti e crediti rimangono.

I conteggi descrivono la scena generata, non un censimento del paesaggio reale.
Per metodo, autori, hash e licenze vedere [PAESAGGIO-SRTM.md](PAESAGGIO-SRTM.md),
[BOSCHI-PAESAGGIO.md](BOSCHI-PAESAGGIO.md) e
[WOODLAND-CREDITS.md](assets/WOODLAND-CREDITS.md).

## Limiti e conservazione

SRTM è stato acquisito nel 2000 e ha risoluzione nominale circa 30 m. La
registrazione geografica e il raccordo al circuito sono stimati. Posizioni
degli alberi, colori del terreno e architettura sono illustrativi; i poligoni
OSM importati non rappresentano ogni oggetto o pianta reale. Il pack distante
usa piani alpha incrociati, non un volume completo di ogni ramo.

Fisica, sensori, policy, ricompense e apprendimento non cambiano rispetto
alla 5.5.0. Il DEM dei dintorni non sostituisce la superficie fisica della
pista; la gravità sul tracciato rimane quella del modello esistente.
Queste novità non dimostrano FPS minimi o un apprendimento più veloce.

## Progressi e distribuzione

I nuovi file `.malecns-save` richiedono esattamente **5.6.0**. I file 5.5.0
richiedono ancora 5.5.0, disponibile nelle release precedenti. Non vengono
rinominati, migrati o riscritti automaticamente. Il profilo dell'app può
contenere progressi di versioni differenti in chiavi separate.

Portable e installer Windows x64 sono generati in `dist-landscape-v560/`.
Le vecchie cartelle e i vecchi eseguibili restano intatti. I pacchetti e i
checksum sono allegati alla release; [verifica](VERIFICA-v560.md) e
[note della release](RELEASE-v560.md).
