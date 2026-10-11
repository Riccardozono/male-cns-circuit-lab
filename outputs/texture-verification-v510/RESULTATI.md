# Texture Porsche — risultati della correzione 5.1.0

Verifica completata l'11 ottobre 2026 nel progetto locale. Revisione visiva
`992-user-glb-lod-3`; la versione app e dei salvataggi resta **5.1.0**.

## Risultato visivo

La livrea gialla/nera numero 91 proviene dalla voce `textures/decals.png`
dello ZIP fornito dall'utente. Il PNG è incorporato byte per byte nel modello;
la trasformazione del campionamento `(u,v) -> (u,2-v)` corregge la registrazione
verticale. Tutte le posizioni, normali, UV originali e indici delle 114 mesh
dei tre LOD sono identici al modello prima della correzione. Anche le 34
immagini precedenti sono conservate byte per byte.

Riscontro nelle viste native di [fronte](source-3d/monza-car.png),
[fiancata sinistra](source-3d/monza-car-left.png),
[fiancata destra](source-3d/monza-car-right.png) e
[retro](source-3d/monza-car-rear.png). Sono osservazioni dell'auto selezionata
in pausa, non una dimostrazione di guida appresa. La revisione indipendente
[Impeccable](../../.impeccable/review/finish-textures-v510.md) ha classificato
**F1 risolto**, disposizione `ship`, limitatamente all'allineamento della livrea.

## Controlli effettuati

| Controllo | Esito | Evidenza |
|---|---:|---|
| Risorse del modello, origine, hash, istanze di 100 auto | 3/3 test passati | `outputs/tests/supplied-car-3d.test.cjs`, eseguito dopo la correzione |
| App sorgente: 100 agenti, quattro circuiti, camere, 10 catture | 28/28 | [UI e viste](source-3d/ui-smoke.json) |
| App Windows impacchettata, calcolo ibrido | 18/18 | [Verifica nativa](packaged-3d/ui-smoke.json) |
| App Windows impacchettata, calcolo neurale solo CPU | 18/18 | [Fallback CPU](packaged-cpu-3d/ui-smoke.json) |
| Salvataggi/caricamento, modelli e versione esatta | 49/49 | [Progressi](packaged-progress/progress-smoke.json) |
| Portable finale effettivamente avviato | 18/18 | [Verifica portable](portable-3d/ui-smoke.json) |
| File del pacchetto, geometria, texture, versioni e risorse locali | 20/20 | [Integrità](package-integrity.json) |
| IA, fisica, progressi e distribuzioni precedenti protetti | 270/270 invariati | [Manifest](../../work/pre-texture-fix-v510/protected.json), confermato dall'integrità |

Le prove native sono state avviate con profili temporanei separati. Non è
stata chiusa l'app dell'utente o caricata/sostituita la sua sessione. I file
**5.1.0** restano compatibili; quelli **5.0.0** richiedono la relativa app.
Questi controlli non misurano convergenza dell'IA, giri appresi o FPS.

## Eseguibili finali

- [Portable aggiornato](../../dist-textures-v510/MAL-E-CNS-Circuit-Lab-portable-5.1.0-x64.exe):
  122.925.463 byte; SHA-256
  `c40e6069562b0a62b11b18f38c50cd70cf5295f812ab1e962c20a9098975fd0a`.
- [Installer aggiornato](../../dist-textures-v510/MAL-E-CNS-Circuit-Lab-setup-5.1.0-x64.exe):
  123.155.645 byte; SHA-256
  `54865e5b4adbde6ffe8458efadebb82b064b8c95f518ed255611decd9c9f5ab9`.

Il payload Windows è x64. Entrambi gli eseguibili risultano `NotSigned`
al controllo Authenticode di Windows. L'installer è stato generato e ne è
stata verificata l'integrità; non è stato installato nel profilo dell'utente.
La precedente distribuzione `dist-learning-3d-v510/` è intatta e non contiene
questa correzione. Per visualizzarla, salvare i progressi, chiudere la vecchia
app e aprire il portable collegato sopra.
