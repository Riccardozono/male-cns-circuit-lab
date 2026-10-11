# Review del pannello Test modelli

9 ottobre 2026. Review sostitutiva in-thread: nessun agente di review disponibile
in questo ambiente. Impeccable è stato usato per l’estensione Operate, non per
ridisegnare l’interfaccia. Scope: il nuovo pannello; non un audit dell’intera app.

disposition: ship

## persistence

PRODUCT.md e brief `.impeccable/surfaces/outputs-index-html.md` descrivono lo
scope confermato: tutti i modelli da zero. DESIGN.md e design.json restano
incumbenti; nessun nuovo mondo visivo, asset, comp approvato o seed roll richiesto.

## fidelity

- TYPE: match, system UI e numeri tabulari come la superficie esistente.
- MATERIAL: match, controlli nativi e tabella di misure, nessuna finta materialità.
- GROUND: match, stessi CSS custom properties della superficie incumbent.
- Pannello chiuso inizialmente, posizione fra circuito e mappa: match.
- Azioni start/stop/export e limite 0 disattivato: match, leggibili a 1540 e 390 px.
- Esiti reali/censurati e tempi distinti: match. Nessuna convergenza inventata.
- Tabella scorrevole nella vista stretta: adattamento richiesto dalla densità dei
  dati, senza overflow del documento; configurazione dei risultati fuori dallo
  scroller per restare leggibile.
- Mappa/atlante: match; interazioni verificate nell’app durante una prova reale.

## ceiling

Raggiunto nello scope: confronto Operate, dati reali, nessuna animazione o
identità nuova. Screenshot finali letti: `source-final-gpu/desktop.png` e
`source-final-gpu/mobile.png`. Cattura corretta tramite compositor/CDP; una prima
cattura stale è stata sostituita, senza usarla come prova finale.

## material_fixes

Nessun fix materiale aperto nel pannello aggiunto dopo il secondo passaggio.
Le segnalazioni del detector su testo da 10–11 px, spaziatura e token fuori scala
appartengono alle parti incumbent: non sono un pass dell’intera UI né sono state
normalizzate modificando la documentazione del sistema.

## keep

Conservare isolamento dei progressi, misure reali, fallimenti espliciti, mappa e
atlante interattivi; non sostituire il fallimento con un pilota o un giro sintetico.

## Documenter sostitutivo

No changes: verificati DESIGN.md, `.impeccable/design.json`, styles.css e markup
del pannello. Estensione ordinaria, senza cambiamenti al sistema esistente.

- Palette: custom properties incumbent, corallo per azione e teal per successo.
- Tipo: system UI da 12–13 px nel pannello, numeri tabulari nella tabella.
- Regola: disclosure nativa invece di un modal.
- Regola: metadati del risultato separati dai controlli del prossimo test.
- Regola: regione scorrevole accessibile per le colonne nella vista stretta.

Drift preesistente di token/radius/testi piccoli non canonizzato né riparato:
fuori dallo scope confermato, nessuna autorizzazione a sostituire l’identità.
