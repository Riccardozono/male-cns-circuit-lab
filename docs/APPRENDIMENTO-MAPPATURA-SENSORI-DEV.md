# Mappatura sensoriale della policy — sviluppo `dev`

Data: 30 ottobre 2026. Questa modifica resta nel branch `dev`; non appartiene
alla release Windows 5.7.0.

## Diagnosi

Nel sorgente precedente, `MaleCNSLearning.drive()` assegnava a ogni neurone di
ingresso il canale `k % 28`. Il compilatore del grafo calcolava già le mappe
laterali visive (`inputChannels`) e i relay dedicati di fisica e strada
(`physicsChannels`, `roadChannels`), ma la policy appresa non le consultava.
Il percorso encoder non-policy usava invece quelle mappe. La discrepanza è nel
codice sorgente precedente al commit `394bd067c2450306d19bf0e35a1d209228536d96`.

## Modifica

Le nuove policy ricevono `sensorMappingVersion: 2`: ogni neurone usa il canale
visivo compilato in base al lato e, quando previsto dal grafo, i relay di
fisica e strada con lo stesso guadagno della pista. I salvataggi precedenti,
che non hanno questo campo, vengono letti come versione 1 e mantengono il
comportamento modulo-28. L’ottimizzatore e la topologia anatomica non cambiano.

## Confronti di apprendimento

Prove headless CPU, Monza, V3 e V2 da policy inizializzate a freddo, 16 auto,
mutazione 0,32, 12 generazioni. La metrica è la massima frontiera di progresso
sicuro; i massimi grezzi non sicuri non vengono contati.

| Profilo | Seed | Modulo-28 | Mappatura nuova | Differenza | Giri |
| --- | ---: | ---: | ---: | ---: | ---: |
| V3 | 7717 | 27,555 m | 28,052 m | +0,497 m | 0 / 0 |
| V3 | 7718 | 31,199 m | 211,309 m | +180,110 m | 0 / 0 |
| V3 | 7719 | 32,921 m | 18,297 m | −14,624 m | 0 / 0 |
| V3 | 7720 | 27,274 m | 419,258 m | +391,984 m | 0 / 0 |
| V3 | 7721 | 27,848 m | 619,501 m | +591,653 m | 0 / 0 |
| V2 | 7722 | 72,363 m | 200,163 m | +127,800 m | 0 / 0 |

Il confronto V3 migliora in 4 seed su 5 ma resta molto variabile. L’ablation
appaiata sul seed 7721 separa i relay: modulo-28 27,848 m; solo visione
34,075 m; visione più fisica 30,347 m; visione, fisica e strada 619,501 m.
Questo singolo seed indica che i relay stradali spiegano gran parte del
vantaggio osservato in quel caso, non dimostra un effetto generale.

Per V4 e V5 sono stati verificati i valori d’ingresso sulla rete anatomica
completa e la conservazione del formato dei checkpoint; non è stato eseguito
un confronto di training. Nessuno dei test di apprendimento qui riportati ha
completato un giro. La convergenza non è dimostrata.

## Verifiche e confini

- `npm test`: **468/468** test passati alla seconda esecuzione completa.
- `outputs/tests/progress-save.test.cjs`: **23/23**.
- `outputs/tests/model-v5.test.cjs`: **9/9**.
- Prove di training V2/V3: Node headless su CPU, non WebGPU.
- Versione sorgente ancora 5.7.0; nessun pacchetto, tag o release creati.
- L’originale del salvataggio dell’utente non è stato modificato.

SHA-256 del sorgente dopo la modifica:

| File | SHA-256 |
| --- | --- |
| `outputs/simulation.js` | `10c3ce0a30f5f34fc87b0d360bee452e313fbf292d0a7027ed434841a03cee58` |
| `outputs/neural-learning.js` | `b661e4db6bfe64d4e2fb97a0dbcaf6e8a3b5df7a00b53753579b6f1fd87adfb0` |
| `outputs/progress-save.js` | `856be315da3db86e0ea2479503e30b7e90c229efd32f361519aea1567fab2a6a` |

I runner e i risultati grezzi restano in `.impeccable/review/learning-ml/`
nella macchina di sviluppo e non sono inclusi nella release.
