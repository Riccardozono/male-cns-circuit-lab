use crate::engine::Result;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const MAX_BYTES: usize = 16 * 1024 * 1024;
const FORMAT: &str = "male-cns-training-save";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const SCHEMA: u64 = 1;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct File {
    format: String,
    schema: f64,
    app_version: String,
    saved_at: String,
    payload: Value,
    checksum: Checksum,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Checksum {
    algorithm: String,
    value: String,
}

pub fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn read(
    text: &str,
    legacy_date: impl FnOnce(&str) -> bool,
    legacy_unicode: impl FnOnce(&str) -> Option<String>,
) -> Result<Value> {
    if text.len() > MAX_BYTES {
        return Err("File troppo grande: massimo 16 MiB.".into());
    }
    // JSON.parse keeps the last value of repeated keys. Parse to a map first
    // so derive validates the same final object that Electron would see.
    let (fields, date_literal) = match serde_json::from_str::<Value>(text) {
        Ok(value) => (Ok(value), None),
        Err(error) => match text
            .contains("\\u")
            .then(|| normalize_date(text, legacy_unicode))
            .flatten()
        {
            Some((normalized, original)) => (Ok(normalized), Some(original)),
            None => (Err(error), None),
        },
    };
    let file: File = fields
        .and_then(serde_json::from_value)
        .map_err(|_| "File di salvataggio non leggibile.")?;
    if file.format != FORMAT || file.schema != SCHEMA as f64 {
        return Err("Formato di salvataggio non riconosciuto.".into());
    }
    if file.app_version != VERSION {
        let version: String = file.app_version.chars().take(40).collect();
        return Err(format!(
            "Salvataggio della versione {version}: richiede esattamente quella versione. Questa app è {VERSION}."
        ).into());
    }
    let standard_date = DateTime::parse_from_rfc3339(&file.saved_at)
        .is_ok_and(|date| date.timestamp_subsec_nanos() < 1_000_000_000);
    if file.saved_at.encode_utf16().count() > 40 || (!standard_date && !legacy_date(&file.saved_at))
    {
        return Err("Data del salvataggio non valida.".into());
    }
    if file.checksum.algorithm != "SHA-256"
        || file.checksum.value.len() != 64
        || !file
            .checksum
            .value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("Controllo di integrità non valido.".into());
    }
    let mut data = body(file.saved_at, file.payload);
    if digest(&data, date_literal.as_deref())? != file.checksum.value {
        return Err("File danneggiato o modificato: checksum SHA-256 non corrispondente.".into());
    }
    Ok(data
        .remove("payload")
        .expect("Il payload è incluso nel digest"))
}

fn normalize_date(
    text: &str,
    legacy: impl FnOnce(&str) -> Option<String>,
) -> Option<(Value, String)> {
    // Preserve every other value exactly as it appeared in the source file.
    // Passing the entire document through JSON.stringify would replace
    // an out-of-range number with null before validation.
    let mut fields: BTreeMap<String, Box<RawValue>> = serde_json::from_str(text).ok()?;
    let original = legacy(fields.get("savedAt")?.get())?;
    let iso = RawValue::from_string(r#""2000-01-01T00:00:00.000Z""#.into()).ok()?;
    fields.insert("savedAt".into(), iso);
    let normalized = serde_json::to_string(&fields).ok()?;
    Some((serde_json::from_str(&normalized).ok()?, original))
}

pub fn write(payload: Value) -> Result<String> {
    let mut data = body(timestamp(), payload);
    let checksum = Checksum {
        algorithm: "SHA-256".into(),
        value: digest(&data, None)?,
    };
    data.insert("checksum".into(), serde_json::to_value(checksum)?);
    let text = serde_json::to_string_pretty(&data)?;
    if text.len() > MAX_BYTES {
        return Err("Salvataggio oltre il limite di 16 MiB.".into());
    }
    Ok(text)
}

fn body(saved_at: String, payload: Value) -> Map<String, Value> {
    [
        ("format", FORMAT.into()),
        ("schema", SCHEMA.into()),
        ("appVersion", VERSION.into()),
        ("savedAt", saved_at.into()),
        ("payload", payload),
    ]
    .into_iter()
    .map(|(key, value)| (key.into(), value))
    .collect()
}

fn digest(data: &Map<String, Value>, date_literal: Option<&str>) -> Result<String> {
    // The reference hashes JSON.stringify(body). Insertion order is part of
    // the checksum, except for unsigned array-index keys, which precede the
    // other keys. Floating-point spelling follows ECMAScript exactly.
    let mut text = String::new();
    let mut numbers = ryu_js::Buffer::new();
    object(&mut text, &mut numbers, data, date_literal)?;
    Ok(format!("{:x}", Sha256::digest(text.as_bytes())))
}

pub fn compact(value: &Value) -> Result<String> {
    let mut text = String::new();
    canonical(&mut text, &mut ryu_js::Buffer::new(), value)?;
    Ok(text)
}

fn array_index(key: &str) -> Option<u32> {
    let number: u32 = key.parse().ok()?;
    (number != u32::MAX && key == number.to_string()).then_some(number)
}

fn object(
    out: &mut String,
    numbers: &mut ryu_js::Buffer,
    values: &Map<String, Value>,
    date_literal: Option<&str>,
) -> Result<()> {
    let mut indices: Vec<_> = values
        .keys()
        .filter_map(|key| array_index(key).map(|n| (n, key)))
        .collect();
    indices.sort_unstable_by_key(|&(n, _)| n);
    let keys = indices
        .into_iter()
        .map(|(_, key)| key)
        .chain(values.keys().filter(|key| array_index(key).is_none()));
    out.push('{');
    for (i, key) in keys.enumerate() {
        if i != 0 {
            out.push(',');
        }
        out.push_str(&serde_json::to_string(key)?);
        out.push(':');
        if key == "savedAt"
            && let Some(literal) = date_literal
        {
            out.push_str(literal);
        } else {
            canonical(out, numbers, &values[key])?;
        }
    }
    out.push('}');
    Ok(())
}

fn canonical(out: &mut String, numbers: &mut ryu_js::Buffer, value: &Value) -> Result<()> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        Value::String(value) => out.push_str(&serde_json::to_string(value)?),
        Value::Number(value) => {
            out.push_str(numbers.format(value.as_f64().ok_or("Numero non valido")?))
        }
        Value::Object(map) => object(out, numbers, map, None)?,
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i != 0 {
                    out.push(',');
                }
                canonical(out, numbers, item)?;
            }
            out.push(']');
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_uses_the_last_value_of_repeated_keys() {
        let original = write(serde_json::json!({"cars":[0,1]})).unwrap();
        let repeated = original
            .replacen("\"schema\": 1", "\"schema\": 99, \"schema\": 1e0", 1)
            .replacen("\"value\":", "\"value\": \"discarded\", \"value\":", 1);
        assert_eq!(
            read(&original, |_| false, |_| None).unwrap(),
            read(&repeated, |_| false, |_| None).unwrap()
        );
    }

    #[test]
    fn leap_second_is_rejected_by_the_reference_date_parser() {
        let mut document = body("2016-12-31T23:59:60.000Z".into(), Value::Null);
        let checksum = digest(&document, None).unwrap();
        document.insert(
            "checksum".into(),
            serde_json::json!({"algorithm":"SHA-256","value":checksum}),
        );
        let error = read(
            &serde_json::to_string(&document).unwrap(),
            |legacy| {
                assert_eq!(legacy, "2016-12-31T23:59:60.000Z");
                false
            },
            |_| None,
        )
        .unwrap_err();
        assert!(error.to_string().contains("Data del salvataggio"));
    }

    #[test]
    fn legacy_unicode_date_does_not_normalize_the_payload() {
        const ISO: &str = "2000-01-01T00:00:00.000Z";
        let raw_date = r#""22 Nov 2026 12:00 GMT (\ud800)""#;
        let mut document = body(ISO.into(), serde_json::json!({"lapTime":null}));
        let checksum = digest(&document, Some(raw_date)).unwrap();
        document.insert(
            "checksum".into(),
            serde_json::json!({"algorithm":"SHA-256","value":checksum}),
        );
        let legacy = serde_json::to_string(&document)
            .unwrap()
            .replace(&format!("\"{ISO}\""), raw_date);
        let normalize = |raw: &str| (raw == raw_date).then(|| raw_date.into());
        assert!(read(&legacy, |_| false, normalize).is_ok());
        let overflow = legacy.replace("\"lapTime\":null", "\"lapTime\":1e999");
        assert!(read(&overflow, |_| false, normalize).is_err());
    }
}
