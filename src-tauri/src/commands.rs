//! Commandes Tauri (IPC) exposées au frontend.
//! Chaque commande lit/écrit dans la base SQLite via `DbState`.

use serde::Serialize;
use tauri::State;

use crate::db::DbState;

// ---------- Modèles sérialisés vers le frontend ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: i64,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub contract: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shift {
    pub employee_id: i64,
    pub week: i64,
    pub day: i64,
    pub shift: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Absence {
    pub id: i64,
    pub employee_id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub period: String,
    pub status: String,
}

fn lock<'a>(db: &'a State<'a, DbState>) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    db.conn.lock().map_err(|e| e.to_string())
}

// ---------- Rôles ----------

#[tauri::command]
pub fn list_roles(db: State<DbState>) -> Result<Vec<Role>, String> {
    let conn = lock(&db)?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM roles ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok(Role { id: r.get(0)?, name: r.get(1)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ---------- Employés ----------

#[tauri::command]
pub fn list_employees(db: State<DbState>) -> Result<Vec<Employee>, String> {
    let conn = lock(&db)?;
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.name, r.name, e.contract
             FROM employees e JOIN roles r ON r.id = e.role_id
             ORDER BY e.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Employee {
                id: r.get(0)?,
                name: r.get(1)?,
                role: r.get(2)?,
                contract: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_employee(
    db: State<DbState>,
    name: String,
    role: String,
    contract: i64,
) -> Result<i64, String> {
    let conn = lock(&db)?;
    conn.execute(
        "INSERT INTO employees (name, role_id, contract)
         SELECT ?1, id, ?2 FROM roles WHERE name = ?3",
        rusqlite::params![name, contract, role],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_employee(
    db: State<DbState>,
    id: i64,
    name: String,
    role: String,
    contract: i64,
) -> Result<(), String> {
    let conn = lock(&db)?;
    conn.execute(
        "UPDATE employees
         SET name = ?1, contract = ?2,
             role_id = (SELECT id FROM roles WHERE name = ?3)
         WHERE id = ?4",
        rusqlite::params![name, contract, role, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_employee(db: State<DbState>, id: i64) -> Result<(), String> {
    let conn = lock(&db)?;
    // ON DELETE CASCADE supprime aussi les créneaux et absences liés.
    conn.execute("DELETE FROM employees WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Créneaux / Planning ----------

#[tauri::command]
pub fn list_shifts(db: State<DbState>, week: i64) -> Result<Vec<Shift>, String> {
    let conn = lock(&db)?;
    let mut stmt = conn
        .prepare("SELECT employee_id, week, day, shift FROM shifts WHERE week = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![week], |r| {
            Ok(Shift {
                employee_id: r.get(0)?,
                week: r.get(1)?,
                day: r.get(2)?,
                shift: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_shift(
    db: State<DbState>,
    employee_id: i64,
    week: i64,
    day: i64,
    shift: String,
) -> Result<(), String> {
    let conn = lock(&db)?;
    conn.execute(
        "INSERT INTO shifts (employee_id, week, day, shift)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (employee_id, week, day) DO UPDATE SET shift = excluded.shift",
        rusqlite::params![employee_id, week, day, shift],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Absences ----------

#[tauri::command]
pub fn list_absences(db: State<DbState>) -> Result<Vec<Absence>, String> {
    let conn = lock(&db)?;
    let mut stmt = conn
        .prepare("SELECT id, employee_id, type, period, status FROM absences ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Absence {
                id: r.get(0)?,
                employee_id: r.get(1)?,
                kind: r.get(2)?,
                period: r.get(3)?,
                status: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_absence(
    db: State<DbState>,
    employee_id: i64,
    kind: String,
    period: String,
) -> Result<i64, String> {
    let conn = lock(&db)?;
    conn.execute(
        "INSERT INTO absences (employee_id, type, period, status) VALUES (?1, ?2, ?3, 'En attente')",
        rusqlite::params![employee_id, kind, period],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn set_absence_status(db: State<DbState>, id: i64, status: String) -> Result<(), String> {
    let conn = lock(&db)?;
    conn.execute(
        "UPDATE absences SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
