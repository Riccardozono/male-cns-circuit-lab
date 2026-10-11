---
name: MAL-E CNS / Circuit Lab
description: Un flight log entomologico per osservare agenti evolutivi su un circuito locale.
colors:
  ink: "#0c1017"
  panel: "#151d27"
  panel-raised: "#1b2530"
  rule: "#2b3945"
  paper: "#f4efdf"
  graphite: "#a9b2b7"
  muted: "#84929a"
  coral: "#ff7658"
  teal: "#68d3c5"
  amber: "#f0bd69"
  danger: "#e16e75"
typography:
  ui:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  measure:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  control: "8px"
  surface: "10px"
  status: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "22px"
  xl: "26px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    typography: "{typography.measure}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    typography: "{typography.measure}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
---

# Design System: MAL-E CNS / Circuit Lab

## Circuito 3D e lettura dell’apprendimento, 5.1.0 — 11 ottobre 2026

Estensione dell’interfaccia operativa esistente, ricavata dal codice corrente.
Conservare campo e pannelli di grafite, testo paper, azioni coral, stato teal,
sans di sistema, misure monospace, controlli nativi e superfici piatte.
Questa sezione documenta la 5.1.0 senza sostituire identità, YAML, token,
regole nominate, sidecar o sezioni storiche.
Fonti: [contratto corrente](.impeccable/surfaces/outputs-index-html.md) e
[stili](outputs/styles.css).

Il campo del circuito resta l’oggetto principale. “Mappa 2D” / “Vista 3D”
sono pulsanti diretti con stato aria-pressed e accento teal per la scelta
attiva; il selettore nativo “Camera del circuito” offre “Segui auto” e
“Panoramica”. La prima attivazione 3D sceglie l’inseguimento. L’HUD compatto
usa misure monospace e legge l’auto selezionata; orbitare, zoomare, spostare
e selezionare restano osservazioni anche in pausa. Atlante e vista affiancata
mantengono l’accesso esistente. Il caricamento del modello e il fallback 2D
usano messaggi espliciti. Fonti: [markup](outputs/index.html),
[binding](outputs/app.js) e [renderer](outputs/circuit-3d.mjs).

La panoramica ora centra gli ingombri proiettati della carreggiata effettiva
e li adatta al rapporto del canvas con margine contenuto; asfalto e bordo
sono distinguibili dal terreno. L’inquadratura non allarga la strada:
triangolazione, scala e perimetri sono quelli del corridoio fisico condiviso
con mappa 2D, collisioni e sensori. Quote, terreno e indicatori verticali
restano schematici, senza inventare altimetrie o edifici. Sotto 620px lo
stack prima del campo è compattato: selettori in due colonne, azioni e
viste accessibili, regole secondarie nella disclosure esistente. Le etichette
funzionali di generazione, punteggio, tempo e telemetria selezionata usano
gli stili corretti a 12px, con numeri tabulari; non è una riscrittura della
scala tipografica storica. Fonti: [camera e geometria](outputs/circuit-3d.mjs),
[stili correnti](outputs/styles.css) e [regole in disclosure](outputs/index.html).

La Porsche dello ZIP è un modello visivo esterno con texture locali,
tre LOD condivisi e istanze; al massimo un corpo dettagliato e dodici
intermedi. Alla partenza un corpo rappresenta le superfici coincidenti,
senza rimuovere agenti dalla simulazione o dalla selezione. Sterzo, ruote,
beccheggio/rollio e luci osservano stati reali. La normalizzazione visiva
non certifica geometria Porsche ufficiale e non modifica il solver.
Crediti e licenza restano raggiungibili nella disclosure nativa.
Fonti: [guida 3D](outputs/VISTA-3D-v510.md),
[crediti](outputs/assets/PORSCHE-3D-CREDITS.md) e
[implementazione LOD](outputs/supplied-car-3d.mjs).

La rail separa punteggio netto, progresso in metri dell’ultima generazione,
media, giri validi massimi e miglior tempo sul giro nello storico.
Il grafico parte dalla distanza, con scelta distinta dei punti, legenda
migliore/media e numeri tabulari. Stato vuoto e confronto in attesa sono
espliciti: servono dieci generazioni per due mediane da cinque. Il colore
del trend accompagna la spiegazione testuale, senza promettere apprendimento.
Su Monza l’evidenza corrente è circa 800 m per V2/V3/V4/V5 con zero giri;
V3 ha solo cinque generazioni. Sul Laboratorio V2 due avvii migliorano e
uno regredisce, tutti senza giri. La presentazione non trasforma questi
risultati in convergenza, giri più rapidi o aumento del throughput.
Fonti: [metriche](outputs/learning-metrics.js),
[valori della rail](outputs/app.js) e [risultati e limiti](outputs/VERIFICA-v510.md).

La versione esatta 5.1.0 resta leggibile nel prodotto e nei controlli
Salva/Carica; un file 5.0.0 richiede l’app 5.0.0. La storia e i vecchi
progressi/distribuzioni sono conservati. La ricattura già eseguita registra
25 controlli passati, sette viste e nessun errore; le verifiche del pacchetto
GPU/CPU sono registrate separatamente nel rapporto aggiornato. Questo
passaggio documentale non aggiunge catture o una nuova revisione visiva.
Fonti: [ricattura fornita](outputs/verification-v510/review-fixes/ui-smoke.json),
[verifica corrente](outputs/VERIFICA-v510.md) e
[vincolo di versione](outputs/progress-save.js).

## Model comparison, 5.0.0 UI build — 1 October 2026

Operate refinement: native "Differenze V2 · V3 · V4 · V5" disclosure beneath the
existing selector/hint, closed by default. Two actual four-row comparison tables,
left-aligned model labels and right-aligned tabular numeric data. Anatomical
count and slot budget are separate; the selected model uses the existing teal
and a subtle selected-state fill, plus aria-current and a polite status.
Keep the incumbent palette, 12px hint copy, 11.5px data, scoped 12px body gaps,
1px dividers and native keyboard/focus behavior. No modal, nested cards, assets,
animations or new visual identity. All interactive map/3D atlas controls remain.

Model switching and save imports update the highlight without rebuilding rows.
Presentation never receives the simulation or loads datasets. Wider/narrower
comparison and split-map views are inspected together in one native batch;
functional checks and old-save compatibility are distinct from visual review
and never represented as learning-convergence or performance evidence.

## Model V5 selection 5.0.0 — 1 October 2026

Operate refinement. Extend the existing native model dropdown with V5 and
reuse the hint style for anatomical count versus processing capacity, decoder,
gain groups and compute tradeoff. Do not claim invented biological neurons or
faster convergence. Preserve every other control and the map/3D atlas; no new
cards, animations, visual identity or assets. Model choice saved previously
remains authoritative. Exact app version remains visible independently.

One source batch: 1540×980, 390×844 and split map/atlas, inspected together in
outputs/model-source-v500. V5/32,768-slot option and all explanatory text wrap
legibly; native controls remain visible, no overflow/duplicate IDs. No cosmetic
follow-up needed. Native GPU/CPU and persistence verification are functional
checks distinct from this finish-review and from learning convergence.

## Automatic best-car observation 4.6.3 — 30 September 2026

Operate extension: reuse the Auto inspector row, add an aria-pressed native
text-button beside the existing agent selector and one wrapped explanation.
Default "Auto: migliore"; a dropdown/map pick disables auto, "Auto: disattivata"
re-enables it. Explain the best-active versus final-best fallback. Preserve
the dark laboratory identity, interactive map/atlas, follow-camera choice and
all real sensor/neural ID bindings. Only inspectAgent is sent on a changed ID.

Finish review: one 1540×980 / 390×844 batch with inspector and split map/atlas,
three images inspected in outputs/selection-source-v463/attempt-4. Legible hint
and toggle, no overflow, 38px control target, no duplicated IDs. No cosmetic
follow-up required. Forty-three native source checks and 194 unit tests pass;
paused observation preserves physical/learning state and real neural reads.
Twenty-eight core/data/runtime files match preserved 4.6.2 byte-for-byte.
Release diagnostics are recorded separately; no convergence/throughput claim
or new visual asset. Exact-release progress-file isolation remains deliberate.

## Version-locked progress files 4.6.2 — 30 September 2026

Operate extension: two existing-style native buttons beneath model selection,
with the exact release, single-trial/all-island scope and paused start-line
restart explained beside them. Polite live status wraps long filenames; controls
are inert during file operations and invalid/canceled loads preserve the trial.
Keep the interactive map/atlas, existing dark palette and car rendering.

Finish review: one batched 1540×980 and 390×844 inspection of map and Save/Load
states; no overflow or duplicated IDs, 38px button height, readable wrapped copy.
All four native views were inspected in outputs/progress-source-v462/attempt-3.
No further cosmetic round was needed. Persistence tests separately cover every
model, a multi-worker trial, 100 agents, exact-version rejection, corrupt/invalid
files, cancellation, optimizer/genome/history recovery and native GPU/CPU runtime.
The save has bounded schema and SHA-256, not a cryptographic signature; it resumes
learning from a fresh episode, not the precise mid-lap state. Existing app/data
and visual assets stay preserved. No generated asset was added in this extension.

## Car visual refinement 4.6.1 — 30 September 2026

Operate only on vehicle presentation. The user's visual-model request permits
one new generated transparent top-view sprite, superseding the previous no-raster
rule for the car only. It is an illustrative GT3 R interpretation, not a Porsche
mesh/CAD or a new 3D driving view. Preserve the incumbent lab palette, map/atlas,
native controls, physical footprint, neural engine and compatible 4.6 checkpoints.

Bright neutral bodywork gets eight cached agent paint materials; glazing/carbon
and alpha remain readable. Three prepared mip levels and dot-only far LOD avoid
per-agent image decoding or tinting. A compact 120px selected-car preview sits
with its existing drivetrain telemetry; “Vedi da vicino” uses the current map
follow camera, not a modal or a different scene. Actual steering and brake output
drive read-only wheel/lamp overlays. Asset failure retains the vector fallback
and an explicit status. Authored asset, full prompt and reference are stored in
`outputs/assets/`; the official research photograph is not a shipping asset.

Finish: one native batch at wide/narrow sizes, map/atlas and selected-car detail.
All four inspected views retain controls and hierarchy, with no horizontal
overflow; graphite text contrast 8.14:1, muted 5.48:1. No cosmetic correction round
was required. Native read-only state checks, tests, 4.6-core hashes and actual
portable GPU/CPU checks are recorded in `outputs/VERIFICA-v461.md` and reports.

## Porsche SI telemetry 4.6.0 — 30 September 2026

The user-authorized physical rewrite supersedes the unchanged-physics invariant
of older map-only/compute extensions. Keep the incumbent laboratory palette,
native controls, circuit/atlas navigation and 100-agent settings. The selected
agent inspector gains real simulation km/h, sequential gear and RPM, with a native
disclosure for power, fuel, tyres, brakes, wheel loads and diagnostic gearbox/ABS/TC.
The lightweight top-view vector glyph uses the official vehicle proportions, not
a licensed mesh claim. No shipping image asset is introduced.

Manual interventions are labeled diagnostic and excluded from training/champions.
Paused gear requests wait for simulated time. Model copy links the Porsche sheet
and distinguishes published numbers from estimated ratios/tyres/aero/chassis;
planar and unsurveyed-track limits remain visible. Map scale/progress now show
metres, using the same declared track conversion and an estimated-scale label.
The old 4.5 curb observation layer is retained without inventing physical heights.

Finish review: one native wide/narrow batch of the split map/atlas and expanded
telemetry, followed by one confirmation for metric scale/population-label coherence.
The native mechanical/learning checks and release evidence are documented in
`outputs/VERIFICA-v460.md`; runtime functionality is not manufacturer validation.

## Documented curb zones 4.5.0 — 30 September 2026

Real-track curb existence is explicit and driver-side-specific, not guessed from curvature. The dated FIA / ACO observations are stored separately in `outputs/data/curbs.js`; hand-registered endpoints and stripe widths remain approximate in the existing map. Partial coverage is stated beside the canvas and linked to the reference. Unobserved zones are left unpainted. Monaco's removed flat paint is not reconstructed as a continuous kerb; Le Mans uses blue/yellow. Only the laboratory retains heuristic schematic curbs. Physical polygons, neural controls and map scale are unchanged.

Compute boundary paths once when switching tracks and reuse the incumbent capped tile cache. New source photographs and PDF raster proofs remain research files, not shipping assets. This extension supersedes the 4.4.2 schematic-curb rule for real tracks only.

Finish review 4.5.0: one batched native wide/narrow inspection, including detailed Monza / Monaco / Le Mans and A-100 split atlas. Verdict: incumbent controls, map navigation, state labels and source limits remain coherent; no horizontal overflow in measured layouts. Source-backed zones are explicitly partial. 112 tests and 54 track checks passed; the portable's 32 GPU/runtime and 12 forced-CPU checks passed. A functional correction adds serialized, read-only GPU inspection in pause; 32 UI/atlas checks cover it without advancing the trial. Transfer/mirror reductions are verified, but short GPU timings are variable and do not support a universal speed-up claim. Evidence: `outputs/VERIFICA-v450.md` and its linked JSON/TAP reports.

## Circuit model extension 4.4.2 — 30 September 2026

Map-only refinement: more readable asphalt, clipped schematic curb/grid paint, exact physical perimeter, and a distinct non-drivable apron. The source profiles and widths are unchanged. No implied surveyed scenery, elevation, real curb placement or new route-following behavior.

Native landmark focus and compact zoom/reset controls complement drag, wheel, keyboard and pinch navigation. Picking shares the camera's world/screen projection. Labels avoid the selected car readout. A minimal-details mode and physical-border overlay are explicitly display-only. Full-circuit maps get a brighter road surface, never a wider fake corridor.

The raster is a multiresolution LRU tile cache capped at 48 tiles of 388 × 388 RGBA pixels (under 30 MiB cached pixels), with opaque gutters to prevent fractional-zoom joins. This is a memory bound, not a performance benchmark. Preserve the existing atlas and training controls and verify the packaged Windows application.

## UI extension 4.4.1 — 30 September 2026

Operate refinement, not a new visual identity. Keep graphite, coral actions, teal telemetry, system UI type and monospace measurements. The working field now has three explicit views: Circuito, Cervello 3D and Affiancati. Below 1120px, the split view stacks; either single view remains directly accessible. Preserve circuit selection, car picking, real-wall rays and the follow camera.

The atlas is a read-only renderer in `outputs/brain-atlas.js`, independent of the neural solver. WebGL 2 batches a deterministic point sample; Canvas 2D is the explicit fallback. Default visual budgets are 18,000 points plus required motor-readout points and 220 connection contributions. Lower quality, colour, orbit, zoom, pan, selection and freeze affect only the illustration. A frozen atlas does not pause the trial. Redraw only when camera or displayed data changes; do not animate decorative effects.

Provide coordinate-plane views XY/YZ/XZ, annotated-class / activity colours, real body-ID search, selected-neuron metadata, filter empty states, keyboard focus and recovery labels. These planes are dataset axes, not inferred biological regions. Points are somatic positions, not neuron morphology. Exclude neurons lacking official positions rather than fabricating their coordinates; keep them in the neural graph. Separate nonzero rate activity from reserved solver slots.

Keep run/reset/evolve, model selection and motor commands visible. Put training explanations, scoring rules and detailed sensors in native disclosures. Labels must distinguish net score from distance. Body copy and controls use UI type; tabular values use the measurement face. Range targets are 24px tall, visible actions at least 32px. No new raster assets; diagnostic screenshots are captures of the application, not shipped illustration.

Verification contract: desktop and narrow render, all views/filters, coordinate and unknown-ID errors, keyboard actions, contrast, zero horizontal overflow, and an unchanged paused physical/neural/optimizer state after atlas controls. Runtime GPU success is not learning convergence. Preserve the anatomical binary, physics, workers, policy and checkpoint schema.

## Overview

**Creative North Star: "Carbon-copy entomology flight log"**

The interface reads like a working flight-cage observation bench: a dark measurement surface, paper-white labels, one coral control signal, and a teal live trace. The circuit is the specimen field; each car is an agent under observation, not a decorative tile. The first viewport is operational by default: the track is visible immediately, the population is moving, and the selected agent exposes its proxy inputs and motor outputs.

The visual language stays dense enough for an experiment but plain enough to scan. Persistent records, status chips, and the inspector keep state visible rather than hiding it in transient notifications. The app uses the phrase “fly-inspired neural proxy” as a boundary marker: it does not pretend that the local synthetic controller is a biological connectome or that `malecns` has been executed in the browser.

**Key Characteristics:**

- Graphite work surfaces with thin purposeful rules.
- Paper-white interface text, monospace measurements, and one coral action color.
- Teal live signals and amber best-agent state, never color alone.
- The circuit and sensor rays are the signature visual object.
- Motion is bounded to simulation state, with a reduced-motion fallback.

## Colors

The palette is restrained and instrument-like: deep ink and panel tones carry the working field, paper and graphite carry hierarchy, while coral, teal, amber, and danger are reserved for state and action.

### Primary

- **Signal coral:** The primary action, steering trace, and selected-agent sensor rays.
- **Live teal:** Running state, progress, sensory channels, and fitness history.
- **Selection amber:** Best-agent ring, curvature bar, and offline/source boundary status.

### Tertiary

- **Danger rose:** Brake output and future failure/error state.

### Neutral

- **Ink field:** Global app background and canvas ground.
- **Panel graphite:** Work surfaces and elevated inspector blocks.
- **Rule blue-grey:** Borders, track edge, and measurement separators.
- **Paper:** Titles, primary values, and the start/finish mark.
- **Graphite text:** Supporting values and explanatory copy.
- **Muted text:** Labels, timestamps, and low-priority metadata. The current token is `#84929a` so compact metadata remains readable on the lighter panel surface.

### Named Rules

**The State-Only Accent Rule.** Accent colors name an action or a state; they do not decorate inactive surfaces.

## Typography

**UI Font:** System sans stack for readable local rendering.

**Measurement Font:** System monospace stack for generations, fitness, signals, and timecodes.

**Character:** The sans layer is quiet and familiar; the monospace layer makes the experiment feel recorded without turning every sentence into costume code.

### Hierarchy

- **Title** (650, 21px, 1.2): Circuit and panel titles.
- **Panel heading** (650, 16px, 1.2): Inspector block names.
- **Body** (400, 14px, 1.45): Explanatory copy and general UI.
- **Measure** (700, 11px, 1.2, tracked, uppercase where used): Labels, values, buttons, status, and telemetry.
- **Canvas annotation** (monospace, 10px): Track field stamp and start/finish annotation drawn into the simulation surface.

### Named Rules

**The Two-Layer Type Rule.** Use sans for meaning and monospace for measurement; do not use monospace to replace readable prose.

## Layout

The desktop surface is a two-column operating layout: a flexible observation field and a fixed inspector rail. The canvas is the dominant object and stays at the top of the page. The inspector keeps the evolution ledger first, controls second, selected-agent signals third, and source boundary last. Spacing uses a compact 8/12/16/22/26 rhythm.

At widths below 880px, the inspector becomes a two-column flow beneath the canvas; below 620px it becomes one column, the canvas shortens, and the legend wraps without hiding information. Typography stays fixed rather than shrinking fluidly. The canvas preserves the full circuit by fitting a fixed world coordinate system into its available rectangle.

The first-viewport path is: watch the population → select or pause → read the rays and signals → adjust the trial → let the next generation evolve. A generation pulse updates the ledger and history without a page-load animation.

## Elevation & Depth

The system is flat by default. Borders and tonal layering distinguish work surfaces; the canvas has its own inset ground. No wide ambient shadow is needed for the simulator, and depth belongs to the track edge, the dark inner track, and the discrete inspector layers.

### Named Rules

**The Flat Bench Rule.** A surface is separated by a defined edge or a tonal shift; do not pair a hairline border with a diffuse shadow.

## Shapes

Work surfaces use restrained 10px corners and controls use 8px corners. Status chips are the only pill-shaped elements. Borders are 1px and remain visible against the ink field. The canvas is clipped by its own 8px frame; cars, sensor rays, and track markings are drawn as crisp geometry rather than simulated illustration.

## Components

### Population and compute observation (4.5.0)

Keep the incumbent native range control, typography and dark laboratory palette. Population is integer-valued from 4 to 100, with 16 as the initial value. The adjacent hint makes the per-generation, per-worker scope explicit and avoids promising that 30x is achievable at every load. The interactive circuit and atlas remain the same components; complete activity belongs only to the inspected car. A pending snapshot is labelled as waiting rather than zero activity. A selected A-100 must remain visible in the inspection labels.

The performance extension must not lower neural counts or numerical fidelity to make the interface appear faster. CPU solver scratch arrays belong to CPU simulations, not read-only renderer mirrors. Measure the worker scheduling and GPU transport independently of learning quality. Finish with a bounded desktop/narrow review and native runtime checks, including the full graph's CPU fallback.

### Buttons

- **Shape:** Compact 8px corners and a 36px minimum height.
- **Primary:** Coral fill with ink text; used for pause/resume, the main trial action.
- **Secondary:** Transparent panel-ground with a rule border and paper text; used for reset.
- **Hover / Focus:** Primary becomes lighter coral; secondary receives a raised panel tone; keyboard focus uses an amber 2px ring with 3px offset.

### Chips

- **Style:** Transparent, compact, pill-shaped status labels with a 1px tinted border.
- **State:** Teal for live/ready, amber for offline/source boundary. The status dot repeats the state but is not the only signal.

### Cards / Containers

- **Corner Style:** 10px work-surface radius.
- **Background:** Panel ink tones, with the canvas using a darker ground.
- **Shadow Strategy:** Flat by default; borders and tonal layers carry separation.
- **Border:** 1px rule or soft rule depending on internal separation.
- **Internal Padding:** 12–18px according to heading or data density.

### Inputs / Fields

- **Style:** Dark native select and range inputs with the same rule border language.
- **Focus:** Browser focus ring translated to amber via `:focus-visible`.
- **Disabled:** Muted text and disabled option explicitly says that the Neuprint bridge is not configured.

### Signature Component: Observation Canvas

The canvas owns the first-viewport thesis. A closed-loop track, start/finish mark, colored agents, selected-agent rays, best-agent ring, and a small field stamp make the simulation legible before the inspector is read. The canvas click target selects the nearest visible car and updates the inspector.

## Do's and Don'ts

Current reward extension (4.8.0): retain all incumbent controls and palette.
Use the existing native disclosure under Auto for times/rewards/sensors, with
a plain two-column definition list of actual worker values. Fixed 12px UI copy,
tabular point amounts, signs as well as colour, normal label wrapping. Distinguish
current selection fitness from the stable historical record, and mark reference
lap pace as simulator calibration. Pending inspected snapshots display an explicit
wait, not invented category values. No new card, modal, chart or animated meter.
Map/atlas stay interactive; row DOM is created once and only text is refreshed.
One wide/narrow/split review completed in rewards-source-v480/pass-2; no overflow.

Current metric extension (4.7.0): retain all incumbent colors, typography, controls
and map/atlas layouts. The map has two 12px measurement lines with tabular
numerals, normal wrapping and the existing 16px inset. Official lap calibration
is separated from estimated local width. Named profile segments extend the
existing native Inquadra selector, not a new panel or modal. Selection refreshes
its measured-section readout immediately in pause. No new illustration or
decorative geometry; painted road polygons are the actual physics polygons.

### Do:

- **Do** show the circuit and moving population before any explanatory copy.
- **Do** label the controller as a local fly-inspired proxy and keep synthetic channels inspectable.
- **Do** keep generation, fitness, time, and signal values in the measurement type.
- **Do** preserve the two-column-to-one-column responsive structure.
- **Do** use accent colors for state and action, with text labels beside them.

### Don't:

- **Don't** imply that `malecns` is a ready-made driving model or that this demo queries Neuprint.
- **Don't** use a neon gradient, a generic hero card, or a biology illustration in place of the running mechanism.
- **Don't** hide the offline boundary or invent neuron names/weights as verified biological facts.
- **Don't** reduce controls below readable tap and keyboard targets.
- **Don't** replace the active circuit with a static poster when the user asked for a simulator.
