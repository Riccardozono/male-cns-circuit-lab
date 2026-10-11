# Barriere e vie di fuga — app 5.2.0

In **Vista 3D**, il circuito mostra ora guardrail, muri di protezione,
recinzioni, banchine e vie di fuga in asfalto o ghiaia. **Dettagli: sì/no**
mostra o nasconde questi elementi senza cambiare la simulazione. Restano
disponibili **Segui auto**, **Panoramica**, la mappa 2D e l'atlante del cervello.
Come confermato dall'utente, non sono state aggiunte strade o accessi di servizio.

## Copertura e provenienza

| Circuito | Ricostruzione visiva |
| --- | --- |
| Monza | Guardrail e recinzioni; sei zone raccordate ai tratti di Prima Variante, Roggia, Lesmo 1/2, Ascari e Parabolica. |
| Monaco | Muri ravvicinati e recinzioni; tre piccole zone asfaltate presso Sainte-Dévote, Mirabeau Haute e Nouvelle Chicane. |
| Le Mans | Guardrail e recinzioni; nove zone presso Dunlop, Tertre Rouge, le due chicane Hunaudières, Mulsanne, Indianapolis, Arnage, Porsche e Ford. |
| Laboratorio | Banchine, guardrail e recinzioni sintetici; nessuna posizione reale dichiarata. |

I nomi e gli ancoraggi dei tratti sono quelli già registrati nella
[geometria del simulatore](data/circuits.json). Riferimenti consultati:
[FIA, Monza 2025](https://www.fia.com/system/files/decision-document/2025_monza_event_-_f2_monza_event_notes_2025_v1.pdf),
[FIA, Monaco 2025](https://www.fia.com/system/files/decision-document/2025_monaco_event_-_f3_monaco_event_notes_2025_v2.pdf),
[FIA WEC/ACO, Le Mans 2025](https://fiawec.alkamelsystems.com/Results_NoticeBoard/13_2025/04_24%20Hours%20of%20Le%20Mans/059_Doc%2059%20-%20BRIEFING%20NOTES.pdf).
Queste sono edizioni datate, non una verifica delle configurazioni 2026.

**Non posso confermare le dimensioni reali o la posizione esatta delle barriere,
delle recinzioni e di ogni via di fuga dalle fonti disponibili.** L'estensione
locale, la scelta delle superfici, il raccordo ai bordi, le distanze e le altezze
sono stime grafiche esplicite. Non è una ricostruzione laser/CAD ufficiale e non
si dichiara una copertura completa delle aree di sicurezza reali.

## Separazione dalla fisica

La carreggiata resta triangolata dagli stessi poligoni usati da sensori e
collisioni. Le vie di fuga non allargano la strada percorribile e le barriere
scenografiche non diventano nuovi ostacoli fisici. Il comando **Mostra bordi
fisici** continua a evidenziare il vero perimetro di simulazione, distinto
dalla recinzione. Le auto continuano a non collidere fra loro.

Nessun dato di questo catalogo è inviato al controller neurale. Non cambiano
motore fisico, rete, ricompense, policy, sensori o tempi della simulazione.
Nel disegno vengono esclusi i raccordi che attraverserebbero un altro tratto
della carreggiata, anziché disegnare una barriera sul tornante.

## Costo del disegno e salvataggi

Le geometrie sono statiche e raggruppate per materiale: non viene creato un
oggetto di rendering per ogni pezzo di barriera. Le superfici usano dettagli
procedurali locali; non si scaricano texture. La rete della recinzione è
nascosta nella panoramica e tutte le nuove geometrie vengono liberate quando
si cambia circuito. Il limite del rendering a 30 aggiornamenti/s e DPR 1,5
resta quello precedente, distinto dalla velocità richiesta della simulazione.

App e file `.malecns-save` usano ora **5.2.0**, mantenendo il vincolo richiesto
di versione esatta. I file 5.1.0 richiedono l'app 5.1.0; non vengono cancellati
o migrati automaticamente. La vecchia distribuzione resta conservata.

Implementazione: [catalogo](data/scenery.mjs), [geometrie](track-scenery.mjs),
[renderer](circuit-3d.mjs). Verifiche: [rapporto 5.2.0](VERIFICA-v520.md).

I raccordi visuali usano la libreria locale polygon-clipping 0.15.7, con unione
dei poligoni e sottrazione della carreggiata originale. Il sorgente distribuito
è la copia del pacchetto fissato in lockfile; nessuna richiesta CDN a runtime.
[Progetto upstream](https://github.com/mfogel/polygon-clipping) ·
[licenza MIT inclusa](vendor/POLYGON-CLIPPING-LICENSE.txt).
