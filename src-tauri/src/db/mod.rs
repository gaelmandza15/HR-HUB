//! Couche d'accès aux données SQLite.
//!
//! La base de données est créée au premier lancement dans le dossier
//! de données applicatif (`app_data_dir`), puis alimentée avec les
//! données de démonstration si elle est vide.

pub mod schema;

use rusqlite::Connection;
use std::sync::Mutex;

/// État géré par Tauri : une connexion SQLite unique protégée par un Mutex.
pub struct DbState {
    pub conn: Mutex<Connection>,
}

/// Ouvre (ou crée) la base `hrhub.db`, initialise le schéma et
/// insère les données de départ si la base est neuve.
pub fn init_db(app_data_dir: &std::path::Path) -> Result<DbState, String> {
    std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("hrhub.db");

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;

    schema::create_tables(&conn).map_err(|e| e.to_string())?;

    if schema::is_empty(&conn).map_err(|e| e.to_string())? {
        schema::seed_demo_data(&conn).map_err(|e| e.to_string())?;
    }

    Ok(DbState {
        conn: Mutex::new(conn),
    })
}
