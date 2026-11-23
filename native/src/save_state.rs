use crate::engine::Result;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::collections::HashMap;

const SCORE_LIMIT: f64 = 1e15;
const INTEGER_LIMIT: f64 = 1e12;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compatibility {
    pub model_id: String,
    pub graph: Value,
    pub vehicle_revision: String,
    pub sensor_count: usize,
    pub model_outputs: usize,
    pub policy_version: u32,
    pub policy_width: usize,
    pub population_limit: u32,
    pub circuits: HashMap<String, u32>,
    pub reward_revisions: Vec<String>,
    pub reward_keys: Vec<String>,
    pub penalty_keys: Vec<String>,
}

fn invalid<T>(label: &str) -> Result<T> {
    Err(format!("{label} non valido.").into())
}

fn keys(value: &Value, allowed: &[&str], label: &str) -> Result<()> {
    if !value
        .as_object()
        .is_some_and(|map| map.keys().all(|key| allowed.contains(&key.as_str())))
    {
        return invalid(label);
    }
    Ok(())
}

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value> {
    value
        .get(key)
        .ok_or_else(|| format!("Campo del salvataggio mancante: {key}.").into())
}

fn finite(value: &Value, label: &str, min: f64, max: f64) -> Result<f64> {
    value
        .as_f64()
        .filter(|number| number.is_finite() && *number >= min && *number <= max)
        .ok_or_else(|| format!("{label} non valido.").into())
}

fn integer(value: &Value, label: &str, min: f64, max: f64) -> Result<f64> {
    let number = finite(value, label, min, max)?;
    if number.fract() != 0. {
        return Err(format!("{label} non intero.").into());
    }
    Ok(number)
}

fn time(value: &Value, key: &str, label: &str) -> Result<()> {
    let timer = field(value, key)?;
    if !timer.is_null() {
        finite(timer, label, 0.001, SCORE_LIMIT)?;
    }
    Ok(())
}

fn vector(value: &Value, width: usize, label: &str, min: f64, max: f64) -> Result<()> {
    let vector = value
        .as_array()
        .filter(|entries| entries.len() == width)
        .ok_or_else(|| format!("{label}: dimensioni incompatibili."))?;
    for weight in vector {
        finite(weight, label, min, max)?;
    }
    Ok(())
}

impl Compatibility {
    pub fn validate(&self, payload: &Value) -> Result<()> {
        keys(
            payload,
            &[
                "modelId",
                "circuitId",
                "graph",
                "vehicleRevision",
                "workers",
                "globalChampion",
            ],
            "Contenuto del file",
        )?;
        if payload["modelId"].as_str() != Some(self.model_id.as_str()) {
            return Err("Modello neurale incompatibile.".into());
        }
        if payload["vehicleRevision"].as_str() != Some(self.vehicle_revision.as_str())
            || crate::save_file::compact(&payload["graph"])?
                != crate::save_file::compact(&self.graph)?
        {
            return Err("Dati neurali o fisica incompatibili.".into());
        }
        let workers = payload["workers"]
            .as_array()
            .filter(|workers| (1..=32).contains(&workers.len()))
            .ok_or("Numero di worker non supportato.")?;
        let first = &workers[0]["state"];
        for (index, worker) in workers.iter().enumerate() {
            keys(worker, &["index", "state"], "Worker")?;
            if worker["index"].as_f64() != Some(index as f64) {
                return Err("Ordine dei worker non valido.".into());
            }
            let state = &worker["state"];
            self.training(state)?;
            if state["circuitId"].as_str() != payload["circuitId"].as_str()
                || ["population", "mutation", "speedMultiplier"]
                    .iter()
                    .any(|&name| state[name].as_f64() != first[name].as_f64())
            {
                return Err("Impostazioni dei worker non coerenti.".into());
            }
        }
        let global = field(payload, "globalChampion")?;
        if !global.is_null() {
            keys(
                global,
                &["genome", "stats", "workerIndex"],
                "Campione globale",
            )?;
            self.genome(&global["genome"])?;
            self.stats(&global["stats"], "Record globale", false)?;
            integer(
                &global["workerIndex"],
                "Worker del record",
                0.,
                (workers.len() - 1) as f64,
            )?;
        }
        Ok(())
    }

    fn genome(&self, genome: &Value) -> Result<()> {
        keys(
            genome,
            &[
                "encoder",
                "readout",
                "gain",
                "adapterVersion",
                "sensorMappingVersion",
                "policyWeights",
            ],
            "Genoma",
        )?;
        vector(
            &genome["encoder"],
            self.sensor_count * 2,
            "Encoder",
            -12.,
            12.,
        )?;
        vector(
            &genome["readout"],
            self.model_outputs * 3,
            "Readout",
            -100.,
            100.,
        )?;
        finite(&genome["gain"], "Guadagno", 0.01, 100.)?;
        let mapping = &genome["sensorMappingVersion"];
        if genome["adapterVersion"].as_f64() != Some(f64::from(self.policy_version))
            || !(mapping.is_null() || matches!(mapping.as_f64(), Some(1. | 2.)))
            || vector(
                &genome["policyWeights"],
                self.policy_width,
                "Policy",
                -8.,
                8.,
            )
            .is_err()
        {
            return Err("Policy neurale incompatibile.".into());
        }
        Ok(())
    }

    fn stats(&self, value: &Value, label: &str, archived: bool) -> Result<()> {
        let allowed: &[&str] = if archived {
            &[
                "genome",
                "fitness",
                "progress",
                "bestProgress",
                "laps",
                "bestLapTime",
            ]
        } else {
            &["fitness", "bestProgress", "laps", "bestLapTime"]
        };
        keys(value, allowed, label)?;
        finite(
            &value["fitness"],
            "Punteggio campione",
            -SCORE_LIMIT,
            SCORE_LIMIT,
        )?;
        finite(
            &value["bestProgress"],
            "Progresso campione",
            0.,
            SCORE_LIMIT,
        )?;
        integer(&value["laps"], "Giri campione", 0., 2.)?;
        time(value, "bestLapTime", "Tempo campione")?;
        if archived {
            finite(&value["progress"], "Progresso archivio", 0., SCORE_LIMIT)?;
            self.genome(&value["genome"])?;
        }
        Ok(())
    }

    fn training(&self, state: &Value) -> Result<()> {
        keys(
            state,
            &[
                "circuitId",
                "circuitRevision",
                "population",
                "mutation",
                "speedMultiplier",
                "generation",
                "elapsedAtSave",
                "seed",
                "rngState",
                "stagnation",
                "learningFrontier",
                "history",
                "bestEver",
                "champion",
                "championStats",
                "hallOfFame",
                "externalChampion",
                "optimizer",
                "genomes",
                "rewardRevision",
            ],
            "Stato di apprendimento",
        )?;
        let revision = state["rewardRevision"]
            .as_str()
            .filter(|revision| {
                self.reward_revisions
                    .iter()
                    .any(|value| value.as_str() == *revision)
            })
            .ok_or("Sistema di ricompense incompatibile.")?;
        let circuit = state["circuitId"]
            .as_str()
            .and_then(|id| self.circuits.get(id));
        if circuit.is_none()
            || state["circuitRevision"].as_f64() != circuit.map(|&value| f64::from(value))
        {
            return Err("Circuito o revisione del circuito incompatibile.".into());
        }
        let population = integer(
            &state["population"],
            "Popolazione",
            4.,
            f64::from(self.population_limit),
        )?;
        finite(&state["mutation"], "Mutazione", 0., 0.35)?;
        finite(&state["speedMultiplier"], "Velocità", 0.5, 30.)?;
        let generation = integer(&state["generation"], "Generazione", 1., INTEGER_LIMIT)?;
        finite(
            &state["elapsedAtSave"],
            "Tempo della prova",
            0.,
            SCORE_LIMIT,
        )?;
        integer(&state["seed"], "Seed", 0., f64::from(u32::MAX))?;
        integer(&state["rngState"], "Stato casuale", 0., 1e30)?;
        integer(&state["stagnation"], "Stagnazione", 0., INTEGER_LIMIT)?;
        let genomes = state["genomes"]
            .as_array()
            .filter(|genomes| genomes.len() == population as usize)
            .ok_or("Popolazione salvata incompleta.")?;
        for genome in genomes {
            self.genome(genome)?;
        }

        let frontier = &state["learningFrontier"];
        keys(
            frontier,
            &["progress", "laps", "lapTime"],
            "Progresso di apprendimento",
        )?;
        finite(&frontier["progress"], "Distanza appresa", 0., SCORE_LIMIT)?;
        integer(&frontier["laps"], "Giri appresi", 0., 2.)?;
        time(frontier, "lapTime", "Tempo appreso")?;

        let champion = field(state, "champion")?;
        let stats = field(state, "championStats")?;
        let record = field(state, "bestEver")?;
        if !record.is_null() {
            finite(record, "Record", -SCORE_LIMIT, SCORE_LIMIT)?;
        }
        if champion.is_null() {
            if !stats.is_null() || !record.is_null() {
                return Err("Campione salvato incompleto.".into());
            }
        } else {
            self.genome(champion)?;
            self.stats(stats, "Campione", false)?;
            if record.as_f64() != stats["fitness"].as_f64() {
                return Err("Record e campione non coerenti.".into());
            }
        }
        let migrant = field(state, "externalChampion")?;
        if !migrant.is_null() {
            self.genome(migrant)?;
        }
        let archives = state["hallOfFame"]
            .as_array()
            .filter(|archive| archive.len() <= 4)
            .ok_or("Archivio di apprendimento non valido.")?;
        for saved in archives {
            self.stats(saved, "Archivio", true)?;
        }
        let es = &state["optimizer"];
        keys(
            es,
            &["mean", "sigma", "updates", "episodes"],
            "Ottimizzatore",
        )?;
        vector(&es["mean"], self.policy_width, "Media appresa", -8., 8.)?;
        vector(
            &es["sigma"],
            self.policy_width,
            "Esplorazione",
            0.000001,
            10.,
        )?;
        integer(&es["updates"], "Aggiornamenti", 0., INTEGER_LIMIT)?;
        integer(&es["episodes"], "Episodi", 0., INTEGER_LIMIT)?;

        let history = state["history"]
            .as_array()
            .filter(|history| history.len() <= 100)
            .ok_or("Storico troppo lungo o non valido.")?;
        let mut previous = 0.;
        for row in history {
            previous = self.history_row(row, previous, generation, population, revision)?;
        }
        Ok(())
    }

    fn history_row(
        &self,
        row: &Value,
        previous: f64,
        generation: f64,
        population: f64,
        revision: &str,
    ) -> Result<f64> {
        keys(
            row,
            &[
                "generation",
                "best",
                "mean",
                "reward",
                "penalty",
                "laps",
                "maxLaps",
                "bestProgress",
                "meanProgress",
                "bestSafeProgress",
                "meanSafeProgress",
                "bestLapTime",
                "noLapCount",
                "slowerLapCount",
                "stagnation",
                "mutationAmount",
                "immigrantCount",
                "hallOfFame",
                "learning",
                "rewardRevision",
                "baseBest",
                "previousBestLapTime",
                "rewardBreakdown",
            ],
            "Voce storico",
        )?;
        let current = integer(
            &row["generation"],
            "Generazione storico",
            1.,
            generation - 1.,
        )?;
        if current <= previous {
            return Err("Ordine dello storico non valido.".into());
        }
        let best = finite(
            &row["best"],
            "Miglior punteggio storico",
            -SCORE_LIMIT,
            SCORE_LIMIT,
        )?;
        for field in ["mean", "baseBest"] {
            finite(&row[field], field, -SCORE_LIMIT, SCORE_LIMIT)?;
        }
        let maximum = finite(
            &row["bestProgress"],
            "Miglior progresso storico",
            0.,
            SCORE_LIMIT,
        )?;
        finite(
            &row["meanProgress"],
            "Progresso medio storico",
            0.,
            SCORE_LIMIT,
        )?;
        match (row.get("bestSafeProgress"), row.get("meanSafeProgress")) {
            (Some(best), Some(mean)) => {
                let safe = finite(best, "Miglior progresso sicuro", 0., SCORE_LIMIT)?;
                finite(mean, "Progresso medio sicuro", 0., SCORE_LIMIT)?;
                if safe > maximum + 1e-8 {
                    return Err("Progresso sicuro superiore al massimo fisico.".into());
                }
            }
            (None, None) => {}
            _ => return Err("Progresso sicuro dello storico incompleto.".into()),
        }
        if row["rewardRevision"].as_str() != Some(revision) {
            return Err("Ricompense dello storico incompatibili.".into());
        }
        time(
            row,
            "previousBestLapTime",
            "Riferimento generazione precedente",
        )?;
        let reward = finite(&row["reward"], "Ricompensa storico", 0., SCORE_LIMIT)?;
        let penalty = finite(&row["penalty"], "Penalità storico", 0., SCORE_LIMIT)?;
        let detail = &row["rewardBreakdown"];
        keys(detail, &["rewards", "penalties"], "Dettaglio punteggio")?;
        let sum_reward = score(&detail["rewards"], &self.reward_keys)?;
        let sum_penalty = score(&detail["penalties"], &self.penalty_keys)?;
        let close = |a: f64, b: f64| (a - b).abs() < 1e-7 * a.abs().max(b.abs()).max(1.);
        if !close(sum_reward, reward)
            || !close(sum_penalty, penalty)
            || !close(reward - penalty, best)
        {
            return Err("Totali del punteggio non coerenti.".into());
        }
        let laps = integer(&row["laps"], "Giri storico", 0., 2.)?;
        time(row, "bestLapTime", "Tempo storico")?;
        integer(&row["maxLaps"], "Massimo giri storico", laps, 2.)?;
        for count in ["noLapCount", "slowerLapCount", "immigrantCount"] {
            integer(&row[count], count, 0., population)?;
        }
        integer(&row["stagnation"], "Stagnazione storico", 0., INTEGER_LIMIT)?;
        finite(&row["mutationAmount"], "Mutazione storico", 0., 0.35)?;
        integer(&row["hallOfFame"], "Archivio storico", 0., 4.)?;
        let stats = &row["learning"];
        keys(
            stats,
            &[
                "algorithm",
                "version",
                "updates",
                "episodes",
                "parameters",
                "meanExploration",
                "warmStart",
            ],
            "Metriche storico",
        )?;
        if stats["algorithm"].as_str() != Some("diagonal evolution strategy")
            || stats["version"].as_f64() != Some(f64::from(self.policy_version))
            || stats["parameters"].as_f64() != Some(self.policy_width as f64)
            || stats["warmStart"].as_bool() != Some(false)
        {
            return Err("Metriche di apprendimento incompatibili.".into());
        }
        integer(
            &stats["updates"],
            "Aggiornamenti storico",
            0.,
            INTEGER_LIMIT,
        )?;
        integer(&stats["episodes"], "Episodi storico", 0., INTEGER_LIMIT)?;
        finite(&stats["meanExploration"], "Esplorazione storico", 0., 10.)?;
        Ok(current)
    }
}

fn score(value: &Value, allowed: &[String]) -> Result<f64> {
    let map: &Map<String, Value> = value
        .as_object()
        .filter(|map| map.len() == allowed.len() && map.keys().all(|key| allowed.contains(key)))
        .ok_or("Voci del punteggio non valide.")?;
    map.values().try_fold(0., |sum, value| {
        Ok(sum + finite(value, "Voce del punteggio", 0., SCORE_LIMIT)?)
    })
}
