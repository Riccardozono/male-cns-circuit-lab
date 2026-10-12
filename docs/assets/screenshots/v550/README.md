# Anteprime native — app 5.5.0

Questi sei PNG sono copie **identiche per byte** delle acquisizioni di conferma
della vista 3D della sorgente 5.5.0, commit
[`77cc34470339a7e80e47df0fb05f4ad5c1455c4b`](https://github.com/Riccardozono/male-cns-circuit-lab/commit/77cc34470339a7e80e47df0fb05f4ad5c1455c4b),
identificato dal tag `v5.5.0`. Le immagini originali sono state conservate.

## Origine e condizioni

- Acquisizione nativa Electron tramite
  [circuit-3d-smoke.cjs](../../../../desktop/circuit-3d-smoke.cjs),
  evento di conferma `2026-10-12T08:07:40.079Z`.
- Windows, Ryzen 5 5600G e RTX 4060; renderer **WebGL 2**, backend neurale
  CPU forzato per questa prova. Non sono immagini di un benchmark GPU.
- Profilo di prova isolato, quattro piste e 100 agenti. Simulazione **in pausa**
  nelle schermate. L'atlante affiancato mostra attività già calcolata.
- Nessuna posa o struttura spostata per la foto: il controllo **Inquadra** e
  la camera dell'app osservano le istanze realmente presenti. Il contorno
  ambrato del canvas nei primi piani è il focus da tastiera.
- Dimensioni dei sei file: **1524 × 941 pixel**. Nessun ritocco, ritaglio,
  ridimensionamento del file o generazione di immagini con IA. L'attributo
  `width` del README cambia soltanto la visualizzazione sul sito.
- Il report della conferma registra **82 controlli passati**, zero errori di
  console e dieci acquisizioni; qui si pubblicano soltanto i sei PNG indicati,
  senza il report privato, profili, salvataggi o log.

La [verifica pubblica 5.5.0](../../../../outputs/VERIFICA-v550.md) riassume le
prove della sorgente. I checksum seguenti permettono di identificare i file
pubblicati senza distribuire dati delle sessioni.

## Contenuti

| File | Vista |
| --- | --- |
| [desktop-split.png](desktop-split.png) | Monza e atlante del cervello affiancati |
| [monza-grandstand.png](monza-grandstand.png) | Tribuna schematica nella zona Centrale di Monza |
| [monza-pits.png](monza-pits.png) | Box illustrativi di Monza |
| [monaco-grandstand.png](monaco-grandstand.png) | Tribuna schematica nella zona Sainte-Dévote |
| [le-mans-grandstand.png](le-mans-grandstand.png) | Tribuna coperta e rettilineo dei box di Le Mans |
| [monza-overview.png](monza-overview.png) | Panoramica completa di Monza |

```text
6437b53c49f8818d466ae8c44ea20e97e867d810542fee7d57d61c6e1e9f9922  desktop-split.png
e5a3eb066de342009d6e6edac18aeda9eed185013f83355a2dc57ab81a97d2a5  monza-grandstand.png
abca1c3104eafe8fd45eb564f91943ee7735e35a9cdc913bfeae45534e1896b8  monza-pits.png
4d1a9b8be08484accc8e57cc2fa1b3f656ceb82305afdbc9c3be16ab76e2b79d  monaco-grandstand.png
f764b8d434b112db685da958077eab39c0365c39984ccca651aa65b32a2318a6  le-mans-grandstand.png
2a167156f8584f2bc81e0cb7359e22a84130fdc13e8019ba529d92dae9b5d95b  monza-overview.png
```

## Limiti e crediti

Le immagini mostrano l'app e i suoi modelli schematici. **Non dimostrano giri
appresi, convergenza, FPS o una ricostruzione CAD degli autodromi.** Tribune,
dimensioni e raccordo alle mappe sono stimati; case e altre installazioni sono
illustrative. [Guida e fonti delle strutture](../../../../outputs/TRIBUNE-v550.md).

Restano i crediti degli asset presenti nelle scene:
[Porsche](../../../../outputs/assets/PORSCHE-3D-CREDITS.md) e
[alberi/edifici](../../../../outputs/assets/ENVIRONMENT-CREDITS.md).
