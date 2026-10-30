# Revisione conclusiva della copia campione neurale — 15 ottobre 2026

Perimetro: estensione Operate del design già approvato, non redesign. Impeccable
ha orientato soltanto gerarchia e lessico delle nuove etichette: modello iniziale
verificato, coefficienti effettivamente allenati, file privato incompatibile e
conseguenza del caricamento. DESIGN.md, CSS, colori e asset restano invariati.

Esito funzionale: la prova iniziale ha concluso una generazione reale ma il test
ha superato il proprio limite di attesa45s al caricamento. Fallimento conservato,
non nascosto. Recupero separato concluso con18controlli,32episodi reali/due
aggiornamenti,16varianti nella seconda generazione, baseline completo identico,
due carichi completi esatti47/51s, rifiuto di motore errato, reset e annullamenti.
Il campione non migliora: rimane un giro molto lento. La maggiore distanza con
urto non sostituisce il campione protetto.

Ispezione visiva prima: le catture del recupero avevano fotogrammi precedenti
allo stato DOM richiesto. Non attestano da sole tema/camera. Nessun cambiamento
alla UI per inseguire queste immagini.

Seconda e ultima ispezione: `chain-training-ui-visual-confirmation` attende DOM
e compositore. Ispezionate le quattro immagini1500/980/740px: scuro effettivo,
prima persona e atlante presenti, pannelli leggibili e responsive coerente,
nessun overflow di pagina, controlli abilitati a caricamento concluso e stato
in pausa/tempozero. Physics/neural snapshot invariati dopo le viste. Sette
controlli positivi, nessun errore del renderer. La prima immagine chiara a freddo
mostra il placeholder geometrico dell'auto durante il caricamento asincrono
già esistente, non un nuovo asset; nessuna altra rifinitura visiva è avviata.

Restano espliciti i limiti accettati: impostazioni collassate a740px; file picker
nativo testato tramite veri handler con risultati selettore sostituiti nel test,
non verifica visiva del dialogo; V3/Monza warm start soltanto; due coefficienti
tardivi plastici, nessun nuovo neurone biologico; ricerca CPU/3D GPU, nessuna
promessa di accelerazione CUDA o di due giri. La copia è locale e richiede la
cartella progetto, non è un nuovo portable/installer.

Nessuna nuova raster generata o provenienza asset da aggiungere. Nessuna release,
tag, incremento versione, pubblicazione, attribuzione IA inventata o chiusura di
app dell'autore. I soli processi chiusi sono quelli dei test creati qui.
