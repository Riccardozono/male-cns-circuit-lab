# Esplorazione dello sterzo: confronto privato R7

Prova locale del 17 ottobre 2026, non distribuita. Versione 5.6.0,
interfaccia approvata, copia Windows e salvataggio originale invariati.
Non è stato ottenuto un nuovo campione e non sono stati completati due giri.

## Diagnosi sui dati registrati

`work/audit_direct_action_distribution.py` controlla gli hash delle 65.536
transizioni effettive del controllo `direct-neuronal-ppo64-from-line-r7`.
Nessun comando medio supera il valore assoluto 0,99; lo scarto RMS fra
azione campionata e comando medio è 0,020153 sullo sterzo e 0,019801 sul
longitudinale. La soglia 0,99 è diagnostica, non un limite fisico.
Questo non sostiene l'ipotesi di saturazione in quei dati; non dimostra
che l'esplorazione sia sufficiente in tutti gli stati.

Evidenza: `.impeccable/review/neural-sacl/direct-neuronal-ppo64-from-line-r7/action-distribution-audit.json`.

## Una sola variabile modificata

Il learner `direct_neuronal_ppo_steering_explore.py` porta la deviazione
standard iniziale dello sterzo da 0,02 a 0,08, mantenendo quella
longitudinale a 0,02. Non aggiunge neuroni biologici, regole di guida,
azioni di un insegnante o dati di traiettoria alla politica.
Restano uguali i 154 pesi iniziali, il critico, i semi, PPO, la fisica
Monza/GT3 e l'obiettivo R7. Il test del costruttore è passato.

Le prime 1.024 transizioni usano 2.048 estrazioni Gaussiane standardizzate
corrispondenti al controllo, con errore massimo 1,5544e-15.
Le traiettorie fisiche sono intenzionalmente diverse perché cambia la scala
del rumore. I vecchi comandi servono solo al confronto, non come target.

## Risultato effettivo

Studio: `.impeccable/review/neural-sacl/direct-neuronal-ppo64-r7-steering-explore/`.

- 64 aggiornamenti PPO e 65.536 transizioni fisiche registrate.
- 223 episodi di training conclusi; non sono 223 giri o generazioni.
- Otto valutazioni complete della politica media: nessun giro completato.
- Miglior distanza tra le otto politiche aggiornate: 641,946 m (update 8), urto.
- Ultima politica: 369,463 m, 0 giri, urto, punteggio R5/R7 -5.969,408.
- Il miglior punteggio resta quello iniziale: 803,478 m, 0 giri, urto.
- Nessun candidato supera il riferimento globale più forte, già distinto
  da questo punto iniziale; nessuna promozione nella copia Windows.

`verification.json` ricostruisce esattamente tutti i 64 aggiornamenti:
pesi, deviazioni standard, perdite, hash del critico e conteggi registrati.
Non equivale a ripercorrere fisicamente ogni transizione.
`latest-policy-native.json` ripete invece realmente tutta l'ultima corsa:
361 controlli, traccia e risultato identici, CUDA senza fallback CPU.

SHA-256 report: `4c985dcdc4394c99e357f64e67b834102fc399f28c836e3b640f2b7c77d35d5e`.

## Decisione

Non applicare l'aumento del rumore all'app: questa prova è negativa.
La riduzione della perdita del critico non dimostra guida migliore.
La prossima alternativa da valutare è un readout diretto non lineare,
inizialmente equivalente alla politica di riferimento, con verifiche
fisiche separate prima di qualsiasi adozione. Non è ancora implementato.

La copia Windows resta configurata per partire in pausa, con 16 auto,
dal modello qualificato `0d23973f4f7ef4d590238b38062203db5b1eb773923315d70d02a2f285eef908`.
Identità motore ricontrollata:
`2a851cf6146a91a14692c055926815a9335000343dced07aa3c168c9f5c21dcd`.
Hash del salvataggio originale ricontrollato:
`29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3`.
