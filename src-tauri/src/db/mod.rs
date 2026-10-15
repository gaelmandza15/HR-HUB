//! Couche d'accès aux données SQLite.
//!
//! La base de données est créée au premier lancement dans le dossier
//! de données applicatif (`app_data_dir`), puis alimentée avec les
//! données de démonstration si elle est vide.

pub mod export;
pub mod schema;
pub mod settings;

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
    migrate(&conn)?;

    if schema::is_empty(&conn).map_err(|e| e.to_string())? {
        schema::seed_demo_data(&conn).map_err(|e| e.to_string())?;
    }

    Ok(DbState {
        conn: Mutex::new(conn),
    })
}

/// Migrations légères pour les bases créées avant les versions modulaires.
fn migrate(conn: &Connection) -> Result<(), String> {
    // 1) Les statuts d'absence étant désormais configurables (table `settings`),
    // on retire l'ancienne contrainte CHECK si elle existe encore.
    let sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'absences'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if sql.contains("CHECK (status IN") {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE absences_new (
                 id          INTEGER PRIMARY KEY AUTOINCREMENT,
                 employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                 type        TEXT    NOT NULL,
                 period      TEXT    NOT NULL,
                 status      TEXT    NOT NULL DEFAULT 'En attente'
             );
             INSERT INTO absences_new SELECT id, employee_id, type, period, status FROM absences;
             DROP TABLE absences;
             ALTER TABLE absences_new RENAME TO absences;
             COMMIT;",
        )
        .map_err(|e| e.to_string())?;
    }

    // 2) Migration des anciennes bases où les postes étaient codés en dur
    // dans la colonne `employees.role` (TEXT), sans table `roles`.
    let emp_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'employees'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !emp_sql.contains("role_id") {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE employees_new (
                 id       INTEGER PRIMARY KEY AUTOINCREMENT,
                 name     TEXT    NOT NULL,
                 role_id  INTEGER NOT NULL REFERENCES roles(id),
                 contract INTEGER NOT NULL DEFAULT 35
             );
             INSERT INTO employees_new (id, name, role_id, contract)
                 SELECT e.id, e.name,
                        (SELECT r.id FROM roles r WHERE r.name = e.role LIMIT 1),
                        COALESCE(e.contract, 35)
                 FROM employees e;
             DROP TABLE employees;
             ALTER TABLE employees_new RENAME TO employees;
             COMMIT;",
        )
        .map_err(|e| e.to_string())?;
    }

    // 3) S'assurer que chaque poste utilisé par un employé figure bien dans
    // le paramètre modifiable `roles` (visible dans Réglages).
    let names: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT r.name FROM roles r
                 JOIN employees e ON e.role_id = r.id ORDER BY r.id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    if !names.is_empty() {
        settings::set_if_absent(conn, settings::KEY_ROLES, &names.join(", "))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
