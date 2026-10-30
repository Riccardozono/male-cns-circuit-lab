---
name: MAL-E CNS / Circuit Lab
description: Interfaccia operativa chiara con variante scura opzionale, circuito interattivo e misure reali.
colors:
  # Base chiara: valori di :root; i nomi storici e la palette restano invariati.
  ink: "#fcfefe"
  panel: "#ffffff"
  panel-raised: "#edf1f7"
  rule: "#c5cedd"
  rule-soft: "#e1e7f0"
  paper: "#14294d"
  graphite: "#475873"
  muted: "#586880"
  coral: "#cf2529"
  teal: "#08777b"
  amber: "#845914"
  danger: "#b02238"
  purple: "#7835b2"
  navy: "#172e50"
  canvas-ink: "#0d1720"
  focus-link: "#176098"
  # Alias semantici chiari; focus-link conserva il riferimento storico a link/focus.
  on-accent: "#ffffff"
  link: "#176098"
  focus: "#176098"
  nav-hover: "#dde5f0"
  primary-hover: "#b21d24"
  secondary-hover-rule: "#8798b2"
  selection-bg: "#c8d7ef"
  switch-ground: "#e7ebf1"
  signal-ground: "#dce3ec"
  empty-flag: "#8b9bb2"
  current-model: "#e7f3f2"
  history-ink: "#53627a"
  history-best: "#08777b"
  history-rule: "#c5cedd"
  # dark-X documenta --X selezionato da :root[data-theme="dark"], non --dark-X.
  dark-ink: "#101720"
  dark-panel: "#18222e"
  dark-panel-raised: "#222f40"
  dark-rule: "#4b5b70"
  dark-rule-soft: "#2b3a4d"
  dark-paper: "#ecf1f8"
  dark-graphite: "#becbdb"
  dark-muted: "#a5b5cb"
  dark-coral: "#f56b73"
  dark-teal: "#58d2c4"
  dark-amber: "#edc179"
  dark-danger: "#ff8ea0"
  dark-purple: "#8650c1"
  dark-navy: "#111b29"
  dark-on-accent: "#111b29"
  dark-link: "#94c9ff"
  dark-focus: "#94c9ff"
  dark-nav-hover: "#2b3a4d"
  dark-primary-hover: "#ff858d"
  dark-secondary-hover-rule: "#a5b5cb"
  dark-selection-bg: "#3d5778"
  dark-switch-ground: "#2b3b50"
  dark-signal-ground: "#35455a"
  dark-empty-flag: "#95a7c3"
  dark-current-model: "#183a3a"
  dark-history-ink: "#bdcbdf"
  dark-history-best: "#58d2c4"
  dark-history-rule: "#4b5b70"
typography:
  brand:
    fontFamily: "Tajawal, Segoe UI, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  measure:
    fontFamily: "ui-monospace, Consolas, Liberation Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.3
  stat:
    fontFamily: "ui-monospace, Consolas, Liberation Mono, monospace"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  lap:
    fontFamily: "Sintony, ui-monospace, Consolas, Liberation Mono, monospace"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  control: "5px"
  surface: "6px"
  compact: "4px"
  bar: "3px"
spacing:
  xs: "6px"
  sm: "8px"
  gap: "12px"
  panel: "14px"
  md: "16px"
  lg: "22px"
  action: "28px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.paper}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "36px"
  navigation:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  navigation-active:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.on-accent}"
  status:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "{rounded.surface}"
  generation:
    backgroundColor: "{colors.purple}"
    textColor: "{colors.panel}"
    typography: "{typography.stat}"
    rounded: "{rounded.compact}"
    padding: "4px 12px"
  button-primary-dark:
    backgroundColor: "{colors.dark-coral}"
    textColor: "{colors.dark-on-accent}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "42px"
  button-primary-dark-hover:
    backgroundColor: "{colors.dark-primary-hover}"
    textColor: "{colors.dark-on-accent}"
  button-secondary-dark:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-paper}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "36px"
  button-secondary-dark-hover:
    backgroundColor: "{colors.dark-panel-raised}"
    textColor: "{colors.dark-paper}"
  input-dark:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-paper}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "36px"
  navigation-dark:
    backgroundColor: "{colors.dark-panel-raised}"
    textColor: "{colors.dark-paper}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  navigation-dark-active:
    backgroundColor: "{colors.dark-coral}"
    textColor: "{colors.dark-on-accent}"
  status-dark:
    backgroundColor: "transparent"
    textColor: "{colors.dark-paper}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  panel-dark:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.dark-paper}"
    rounded: "{rounded.surface}"
  generation-dark:
    backgroundColor: "{colors.dark-purple}"
    textColor: "{colors.panel}"
    typography: "{typography.stat}"
    rounded: "{rounded.compact}"
    padding: "4px 12px"
  theme-toggle:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "36px"
  theme-toggle-dark:
    backgroundColor: "{colors.dark-panel-raised}"
    textColor: "{colors.dark-coral}"
    rounded: "{rounded.control}"
    padding: "7px 11px"
    height: "36px"
  text-button:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    padding: "4px 6px"
    height: "32px"
  text-button-dark:
    backgroundColor: "transparent"
    textColor: "{colors.dark-link}"
    padding: "4px 6px"
    height: "32px"
---

# Design System: MAL-E CNS / Circuit Lab

## Overview

**Creative North Star: "Registro di sessione"**

Sistema operativo chiaro, con testi navy, superfici quasi bianche e rosso
riservato all'azione principale o alla selezione di un'area. Gruppi delimitati
da regole sottili danno gerarchia a comandi e letture senza introdurre effetti
decorativi. La metafora è un registro di prove: segnali, valori e stati devono
restare verificabili, non imitare dati illustrativi.

Questo sistema sostituisce l'identità scura precedente nel redesign approvato
dall'autore il 13 ottobre 2026. La UI reale è stata approvata esplicitamente:
«Approvo questa UI reale; l’immagine resta un riferimento visivo». Il paesaggio
e la vettura dell'anteprima non definiscono il renderer; circuito, atlante,
Porsche e telemetria continuano a usare le risorse effettive dell'app.

Dopo l'approvazione della UI chiara, l'autore richiede «aggiungi una modalita
scura». La variante opzionale estende lo stesso registro: superfici ardesia,
testi chiari e accenti adeguati allo sfondo. Il tema chiaro resta predefinito;
tipografia, spaziatura, forme e scena autentica sono condivise.

**Key Characteristics:**

- Superfici quasi bianche, testi navy e separatori sottili.
- Variante scura opzionale sulle stesse superfici e regole; chiaro predefinito.
- Rosso per l'azione principale e l'area attiva; segnali sempre accompagnati da testo.
- Etichette sans e misure tabulari, con accenti tipografici locali limitati a marchio e giri.
- Canvas interattivi autentici, senza fotografie che sostituiscano il simulatore.
- Controlli nativi, disclosure e reflow; nessuna animazione ornamentale.

Fonti del sistema: [stili](outputs/styles.css),
[composizione di presentazione](outputs/session-ui.js) e
[binding esistenti](outputs/app.js); selezione e persistenza in
[ui-theme.js](outputs/ui-theme.js) caricato dal [documento](outputs/index.html).
Il contratto della singola superficie e i
rapporti di revisione restano nella cartella privata .impeccable. Le decisioni
storiche si possono recuperare dalla cronologia Git; non sono più token correnti.

## Colors

Il frontmatter conserva i nomi e i valori della base chiara di `:root`.
I nomi storici `ink` e `paper` indicano, nella base, il fondo chiaro e il testo
navy. Gli alias normativi `dark-X` riportano il valore dello stesso `--X`
quando `:root[data-theme="dark"]` è selezionato; non sono nuove proprietà
CSS `--dark-X`. Il riferimento storico `focus-link` conserva il valore chiaro
ora condiviso da `--link` e `--focus`, senza rivendicare un `--focus-link` nel CSS.

### Primary

- **Rosso azione — coral:** avvio/pausa, area attiva, cursore e comandi di sterzo.

### Secondary

- **Teal misurato — teal:** gas, esiti positivi e trend in miglioramento.
- **Navy di campo — navy:** intestazioni del circuito e del cervello.

### Tertiary

- **Viola generazione — purple:** indicatore della generazione corrente.
- **Ambra di stato — amber:** letture e stati già associati a questo segnale.
- **Rosso errore — danger:** errori, regressioni e valori negativi.

### Neutral

- **Bianco di pagina — ink:** fondo dell'app.
- **Bianco di pannello — panel:** controlli, schede e toolbar.
- **Grigio rialzato — panel-raised:** navigazione e intestazioni tabellari.
- **Regole — rule / rule-soft:** bordi e separatori interni.
- **Testo navy — paper:** testo, titoli e principali letture.
- **Testo di supporto — graphite / muted:** spiegazioni e metadati leggibili.
- **Campo canvas — canvas-ink:** fondo specifico dei renderer, non dell'intera UI.
- **Blu interazione — link / focus:** link e focus da tastiera, ruoli separati.

### Variante scura e alias semantici

La variante usa `dark-ink`, `dark-panel` e `dark-panel-raised` per pagina,
pannelli e superfici rialzate; `dark-paper`, `dark-graphite` e `dark-muted`
per testo principale, supporto e metadati. `dark-rule` e `dark-rule-soft`
preservano i bordi sottili, mentre `dark-navy` mantiene le testate di campo.
Gli accenti `dark-coral`, `dark-teal`, `dark-amber`, `dark-danger` e
`dark-purple` conservano i rispettivi significati.

Ogni ruolo semantico ha un valore chiaro e un alias `dark-` nel frontmatter:

- `on-accent`: testo su azione primaria e navigazione attiva; bianco in chiaro,
  scuro in modalità scura. Non coincide con il fondo variabile `panel`.
- `link` / `focus`: link e azioni testuali / outline tastiera; hover del link
  usa `coral`, outline di 2px con offset 3px.
- `primary-hover`, `nav-hover`, `secondary-hover-rule`: hover di azione
  primaria, voce inattiva e bordo del bottone secondario.
- `selection-bg`, `switch-ground`, `signal-ground`: selezione del testo,
  fondo del selettore 2D/3D e piste delle barre di telemetria.
- `empty-flag` / `current-model`: icona dello storico vuoto e riga del modello
  corrente nella tabella di confronto.
- `history-ink`, `history-best`, `history-rule`: testo, serie migliore e
  regole del grafico; il renderer legge i valori CSS e ridisegna anche in pausa.

`canvas-ink` resta comune ai temi. Il numero della generazione e le testate
di campo mantengono il bianco esplicito del CSS, anche in scuro: il riferimento
`{colors.panel}` nel token generazione è il bianco della base, non `var(--panel)`.

I colori dei dataset, delle auto e degli assi del cervello rimangono propri
dei renderer. Non convertirli automaticamente nei token del chrome.

**The State-Only Accent Rule.** Gli accenti identificano azioni o stati e restano accompagnati da etichette; non decorano superfici inattive.

**The Explicit Theme Rule.** Il chiaro è predefinito; solo la scelta esplicita del tema seleziona la variante scura, senza modalità sistema o automatica.

## Typography

**Display Font:** Tajawal Bold per il marchio; non per le intestazioni operative.
**Body Font:** Segoe UI e fallback sans di sistema, appropriati ai controlli Windows.
**Label/Mono Font:** monospace di sistema per misure; Sintony Bold per il conteggio giri.

Tajawal e Sintony sono file locali, con origine e licenze in
[PROVENANCE.md](outputs/assets/fonts/PROVENANCE.md). Nessun caricamento da CDN.

### Hierarchy

- **Brand:** ruolo `brand`, marchio compatto; su mobile scende a 20px.
- **Headline / title:** intestazioni di campo e pannello; sottosezioni a 13px.
- **Body / label:** prosa e comandi; labels in sentence case, non tracking decorativo.
- **Measure / stat / lap:** valori tabulari; non trasformare in monospace i paragrafi.
- **Powertrain:** letture forti a 16px desktop, 15px narrow e 14px mobile.
- **HUD:** 14px desktop e 11px mobile, fondo scuro proprio e testo chiaro.
- **Note e footer:** minimo osservato di 11px nelle etichette funzionali corrette.

Le annotazioni degli assi canvas a 10px sono geometria accessoria, non uno
standard per etichette o controlli. La didascalia nascosta dell'anteprima auto
non definisce la scala leggibile delle nuove superfici.
Le taglie ausiliarie ereditate sono osservazioni della UI approvata, non nuovi
token o prescrizioni da estendere ad altre superfici.

**The Meaning-and-Measure Rule.** Sans per significato e comandi, cifre tabulari per misure; la compattezza non giustifica etichette funzionali illeggibili.

## Layout

Il layout della sessione è specifico della superficie, non una griglia obbligata
per ogni futura schermata. Desktop: topbar di almeno 52px, margini laterali
16px, configurazione `clamp(238px, 18vw, 284px)`, campo fluido e gap 12px.
Il canvas parte da `clamp(400px, calc(100dvh - 455px), 660px)`; dati e comandi
rimangono elementi semantici, non coordinate di una fotografia.

In Affiancati, da 1191px, circuito e atlante si estendono alla stessa altezza
esterna, con bordi superiore/inferiore e origine dei titoli comuni. Le testate
hanno minimo 64px e padding 12px 16px; entrambi i titoli usano il ruolo
`headline`. I contenitori dei canvas crescono in flex dallo spazio di partenza:
si espande il renderer reale, senza riempitivi o scrollbar interne aggiunte.
Strumenti, legenda e ricerca restano disponibili; il titolo può andare a capo.
In questa vista il HUD usa 12px e può restringersi. Sono comportamenti locali
della sessione, osservati nel [CSS corrente](outputs/styles.css).

Sotto il campo, stato / risultati / auto usano tre colonne diseguali; a 1400px
si compattano, a 1190px diventano due e la vista affiancata si impila. A 880px
il campo precede la configurazione, raggiungibile tramite Impostazioni, e il
canvas è alto 420px. A 620px, un'unica colonna presenta auto, stato e risultati;
navigazione 2×2 e canvas 410px. Il campo non diventa un poster ridotto.

Le tabelle possono scorrere nel proprio contenitore; testi e nomi possono
andare a capo. Valori brevi come i giri non si spezzano. Lo storico espone le
ultime sei generazioni reali e conserva il grafico in una disclosure nativa.

## Elevation & Depth

Chrome piatto: superfici, bordi da 1px e intestazioni tonalmente distinte
organizzano la lettura. Non sono presenti ombre diffuse, vetro o gradienti
decorativi. La profondità appartiene al vero circuito 3D, non ai contenitori.

**The Flat Record Rule.** Separare gruppi con una regola o un cambio di tono; non aggiungere ombre decorative al registro operativo.

## Shapes

Angoli contenuti: raggio `surface` sui pannelli, `control` sui comandi,
`compact` su indicatori e tasti piccoli, `bar` sulle barre. Punti e marker
circolari identificano stati, non pillole per ogni contenuto. Le icone di
azione sono SVG espliciti da 20px; la bandiera dello stato vuoto è un'icona
a scacchi da 44px, non un'illustrazione che sostituisce dati.

## Components

### Buttons

Azione primaria `coral` con testo `on-accent`, hover `primary-hover`, altezza
minima 42px nel gruppo di esecuzione. Secondarie `panel` / `paper`, altezza
minima 36px, hover `panel-raised` e bordo `secondary-hover-rule`. Azioni
testuali e link usano `link`, con hover `coral`. Focus `focus` da 2px con
offset 3px. I ruoli selezionano gli alias scuri tramite `data-theme`.
Stati disabled usano semantica nativa e opacità, non soltanto un colore.
Icona e label rimangono insieme.

### Inputs / Fields

Select e campi numerici nativi, fondo `panel`, testo `paper`, bordo `rule` e altezza minima
36px. Il campo popolazione riusa limiti e binding del range originale,
compreso il blocco durante operazioni protette. Slider mutazione/velocità
mantengono valore adiacente; nessun nuovo significato dei comandi.
Il tema seleziona anche `color-scheme: light` / `dark` per i controlli nativi;
caret `coral`, placeholder `muted`, selezione `selection-bg` / `paper`.

### Navigation

Aree dirette con `aria-pressed`, voce attiva `coral` / `on-accent` e altezza
minima 36px; hover della voce inattiva `nav-hover`.
Confronto modelli apre il pannello separato ma non avvia un test. Sessione,
Cervello 3D e Affiancati conservano il contesto della simulazione. Su mobile
la navigazione si dispone in due colonne.

### Chips / Status

Stato locale rettangolare compatto, bordo sottile, testo e punto. Indicatore
generazione viola con numero autentico. Errori e loading restano espliciti;
un dato non disponibile non viene sostituito con uno zero inventato.
La generazione usa `purple` e testo bianco esplicito in entrambi i temi.

### Cards / Containers

Fondo `panel`, testo `paper`, bordo `rule-soft`, raggio `surface` e padding 12–16px
secondo il ruolo. Il canvas ha un proprio fondo scuro. I dettagli secondari
si aprono con `details/summary`, senza modali decorative.

### Telemetry

Select auto e frecce nella testata; scelta automatica/manuale mantenuta.
Anteprima usa la risorsa reale, non la Porsche prospettica del mock.
Marcia, RPM, velocità, sterzo/gas/freno e ABS/TC/Cambio leggono la simulazione.
Le tre barre mantengono label e valore numerico. Sensori, meccanica,
ricompense e grafico restano raggiungibili nei dettagli.

### Theme toggle

Bottone secondario «Scuro» nella topbar, SVG luna inline da 20px con
`aria-hidden="true"`; nome accessibile «Modalità scura». `aria-pressed` è
`false` in chiaro e `true` in scuro. La label e la luna restano le stesse:
cambiano stato, titolo e stile. Lo stato premuto usa `coral` per testo/bordo
e `panel-raised` come fondo; hover e focus ereditano il bottone secondario.
Il comando viene montato a `DOMContentLoaded`, fuori dalla workspace inerte,
senza attendere l'inizializzazione dei worker.

`ui-theme.js` è caricato nel head prima del foglio di stile: legge soltanto
`malecns-ui-theme`, applica `data-theme` e aggiorna `meta[name="theme-color"]`
prima del primo rendering. Solo il valore salvato `dark` seleziona lo scuro;
chiave assente, valore diverso o lettura fallita avviano il chiaro. Un cambio
esplicito salva `light` o `dark` nella medesima chiave, senza accesso ai
checkpoint. Se lo storage è assente o non scrivibile, il comando funziona
nella pagina corrente; la persistenza non è garantita al caricamento seguente.
L'evento `malecns-theme-change` aggiorna lo storico senza riavviare la prova.
Nessuna preferenza del sistema operativo o modalità automatica è consultata.

### Observation canvas

Switch 2D/3D, camera, focus di sezione, zoom e selezione conservano renderer
e fisica esistenti. Lo stato pausa/running è sovrapposto con testo e icona.
Osservare circuito/atlante in pausa non avanza l'apprendimento. Nessuna
animazione introduttiva: il movimento appartiene alla simulazione.

Il select nativo Camera del circuito include «Prima persona · auto selezionata»;
dalla mappa 2D apre il 3D. La camera segue posizione, direzione, riferimento
del terreno e inclinazioni della carrozzeria dell'auto selezionata. Trascinamento
e frecce muovono lo sguardo; rotella, pizzico e tasti zoom variano il campo visivo
fra 40° e 95°. Centra/Home conserva la prima persona e ripristina sguardo
frontale e 70°. Cambiando agente cambia l'auto osservata, senza comandi di guida.

Il nome accessibile del canvas identifica l'auto e il posto guida schematico;
le descrizioni associate espongono comandi effettivi, nota sul posto guida e
stato 3D. Centra conserva questi metadati; passando a 2D, Segui auto o Panoramica
si ripristinano le istruzioni pertinenti. La nota visibile dichiara l'abitacolo
schematico: punto occhi stimato e plancia/volante geometrici originali, non
interni Porsche originali o dati CAD. Le texture e il GLB esterno sono conservati.

Solo in prima persona il disegno omette l'esterno scelto e gli esterni che
racchiudono il punto occhi, anello di selezione, raggi e marker visivi. Le altre
viste conservano i propri overlay; popolazione, sensori fisici e ingressi neurali
restano presenti. Fonti: [opzione nativa](outputs/index.html),
[binding e descrizioni](outputs/app.js), [camera](outputs/circuit-3d.mjs),
[geometria e filtro visivo](outputs/car-3d.mjs) e
[istanze del GLB](outputs/supplied-car-3d.mjs).

## Do's and Don'ts

### Do:

- **Do** mantenere i renderer interattivi e i dati reali, anche quando differiscono dal mock.
- **Do** usare controlli nativi, focus visibile e stato testuale accanto al colore.
- **Do** tenere leggibili valori e label, adattando il layout prima di ridurre il testo.
- **Do** conservare test, salvataggi, diagnostici, crediti e disclosure dei dettagli.
- **Do** usare file di font e risorse locali, con licenze e provenienza verificabili.
- **Do** mantenere il chiaro predefinito e applicare lo scuro solo tramite i ruoli condivisi selezionati da `data-theme`.

### Don't:

- **Don't** trasformare l'immagine di riferimento in una falsa scena o telemetria.
- **Don't** modificare fisica, ricompense o modello neurale per far coincidere la UI con il mock.
- **Don't** dichiarare superata una soglia visiva quando è stata approvata un'adaptation.
- **Don't** rendere scura per default l'interfaccia chiara approvata; la variante scura richiesta usa i suoi token, senza copiare indiscriminatamente il fondo dei canvas.
- **Don't** presentare la copia di sviluppo come una nuova release o sostituire distribuzioni esistenti.
