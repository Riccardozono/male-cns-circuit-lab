# Alberi dello ZIP e case Sketchfab — 5.4.0

La vista 3D usa i **due alberi effettivi** forniti dall'utente, con la loro texture.
Monaco aggiunge l'edificio di ChristosRami.studio; Le Mans la casa di Satik64.
Monza e Laboratorio non ricevono edifici. Tutte le fonti, le licenze CC BY 4.0,
gli adattamenti e gli hash sono nei [crediti](assets/ENVIRONMENT-CREDITS.md) e nel
[manifest](assets/environment-provenance-v1.json).

## Comandi

Scegli **Vista 3D**, poi **Segui auto** o **Panoramica**. Zoom, trascinamento,
frecce e focus sulle curve rimangono disponibili. **Dettagli: sì/no** mostra o
nasconde anche alberi e case, senza spegnere la fisica del terreno. La mappa 2D
e l'atlante del cervello restano separati e utilizzabili.
Il testo sotto la mappa indica il caricamento dei modelli locali; in caso di
file mancante comunica il fallback. Apri **Modelli 3D e crediti** per le fonti.

## Costo e posizionamento

Geometria e texture sono condivise con instancing GPU; due LOD scelti dalla
distanza della camera. Gli edifici si caricano soltanto sul loro circuito e
rimangono in cache durante la sessione. Le istanze vengono rilasciate al cambio
di pista senza distruggere i materiali condivisi; la chiusura del renderer
libera anche la cache. Non si aumenta il numero di tick o di neuroni per creare
la scenografia e non si usa il generatore casuale dell'apprendimento.

Budget: fino a **84 edifici a Monaco**, **64 a Le Mans**; la disposizione è
deterministica. Un controllo sull'intera impronta evita il corridoio stradale
anche vicino a tratti paralleli; zone conservative escludono le vie di fuga.
Le case non si sovrappongono e gli alberi vengono esclusi dalle loro impronte.
Fondazioni visive raccordano la base orizzontale al terreno disegnato.

La vegetazione ha al massimo **5 parti istanziate**: due forme × due LOD e i
cespugli. Monaco al massimo 34 parti degli edifici e una fondazione; Le Mans
4 parti e una fondazione. Questi sono budget di invio, **non FPS misurati**.
Non si rivendica un incremento delle prestazioni o una convergenza più veloce.

## Confini della modifica

È un'estensione esclusivamente visiva della 5.3.0: solver, terreno fisico, sensori,
grafo, policy, mutazioni, ricompense e carreggiata XY sono conservati. Niente
collisioni fra auto o con alberi/case. Gli edifici non riproducono un quartiere
rilevato: modello, scala e collocazione sono scenografici, non CAD ufficiale.
Il materiale lucido di Le Mans e lo spessore dei segmenti di Monaco sono
approssimazioni dichiarate nei crediti.

App Windows x64 in `dist-assets-v540/`. I salvataggi nuovi richiedono **5.4.0**;
quelli 5.3.0 restano utilizzabili soltanto con la vecchia app 5.3.0, preservata.
Nessuna migrazione automatica. [Verifiche effettive](VERIFICA-v540.md).
