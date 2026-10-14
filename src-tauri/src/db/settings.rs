//! Paramètres applicatifs stockés en base (table clé/valeur `settings`).
//!
//! Aucune valeur n'est codée en dur côté frontend : les listes de postes,
//! types d'absence, statuts et jours de semaine sont des paramètres
//! modifiables. Les valeurs par défaut ne servent qu'au premier seed.

use rusqlite::{params, Connection};

pub const KEY_ROLES: &str = "roles";
pub const KEY_ABSENCE_TYPES: &str = "absence_types";
pub const KEY_ABSENCE_STATUSES: &str = "absence_statuses";
pub const KEY_DAYS_OF_WEEK: &str = "days_of_week";
pub const KEY_DEFAULT_SHIFT: &str = "default_shift";
pub const KEY_DEFAULT_CONTRACT_HOURS: &str = "default_contract_hours";

/// Lit une valeur de paramètre (`None` si absente).
pub fn get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |r| r.get::<_, String>(0))?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// Écrase une valeur de paramètre.
pub fn set(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Insère un paramètre uniquement s'il n'existe pas encore (seed).
pub fn set_if_absent(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

/// Liste de chaînes séparées par virgules (vides ignorées).
pub fn get_list(conn: &Connection, key: &str) -> rusqlite::Result<Vec<String>> {
    Ok(get(conn, key)?
        .map(|raw| {
            raw.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default())
}
