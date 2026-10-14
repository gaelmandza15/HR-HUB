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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoShift {
    pub employee_id: i64,
    pub week: i64,
    pub day: i64,
    pub shift: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoAbsence {
    pub id: i64,
    pub employee_id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub period: String,
    pub status: String,
}

/// Exécute une requête à une colonne et collecte les résultats.
fn query_strings(conn: &rusqlite::Connection, sql: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    Ok(rows.filter_map(Result::ok).collect())
}

/// Exporte l'intégralité de la base (paramètres + données) dans
/// `hrhub-demo.json`, à côté du fichier `hrhub.db`.
///
/// Sert uniquement au mode navigateur (`npm run dev` hors Tauri) : le
/// fallback localStorage y lit les mêmes données que SQLite, sans rien
/// coder en dur côté JavaScript.
pub fn export_demo_json(conn: &rusqlite::Connection, app_data_dir: &std::path::Path) -> Result<(), String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct DemoStore<'a> {
        settings: &'a [Setting],
        roles: Vec<String>,
        employees: Vec<Employee>,
        shifts: Vec<DemoShift>,
        absences: Vec<DemoAbsence>,
        next_ids: NextIds,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct NextIds {
        emp: i64,
        abs: i64,
    }

    let settings = get_settings_data(conn)?;
    // Source de vérité : la table `roles` (le paramètre `roles` n'est qu'un miroir).
    let roles = query_strings(conn, "SELECT name FROM roles ORDER BY id")?;
    let employees = list_employees_data(conn)?;
    let shifts: Vec<DemoShift> = {
        let mut stmt = conn
            .prepare("SELECT employee_id, week, day, shift FROM shifts")
            .map_err(|e| e.to_string())?;
        let collected: Vec<DemoShift> = stmt
            .query_map([], |r| {
                Ok(DemoShift { employee_id: r.get(0)?, week: r.get(1)?, day: r.get(2)?, shift: r.get(3)? })
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        collected
    };
    let absences: Vec<DemoAbsence> = {
        let mut stmt = conn
            .prepare("SELECT id, employee_id, type, period, status FROM absences ORDER BY id")
            .map_err(|e| e.to_string())?;
        let collected: Vec<DemoAbsence> = stmt
            .query_map([], |r| {
                Ok(DemoAbsence {
                    id: r.get(0)?,
                    employee_id: r.get(1)?,
                    kind: r.get(2)?,
                    period: r.get(3)?,
                    status: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        collected
    };
    let next_emp = employees.iter().map(|e| e.id).max().unwrap_or(0) + 1;
    let next_abs = absences.iter().map(|a| a.id).max().unwrap_or(0) + 1;
    let store = DemoStore {
        settings: &settings,
        roles,
        employees,
        shifts,
        absences,
        next_ids: NextIds { emp: next_emp, abs: next_abs },
    };
    let json = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
    std::fs::write(app_data_dir.join("hrhub-demo.json"), json).map_err(|e| e.to_string())?;
    Ok(())
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

/// Lecture des employés (partagée entre la commande Tauri et l'export démo).
pub fn list_employees_data(conn: &rusqlite::Connection) -> Result<Vec<Employee>, String> {
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
pub fn list_employees(db: State<DbState>) -> Result<Vec<Employee>, String> {
    let conn = lock(&db)?;
    list_employees_data(&conn)
}

#[tauri::command]
pub fn add_employee(
    db: State<DbState>,
    name: String,
    role: String,
    contract: i64,
) -> Result<i64, String> {
    let conn = lock(&db)?;
    // Poste configurable : un rôle inconnu est créé à la volée (et déclaré
    // dans le paramètre `roles` pour rester visible dans les réglages).
    conn.execute("INSERT OR IGNORE INTO roles (name) VALUES (?1)", rusqlite::params![role])
        .map_err(|e| e.to_string())?;
    let role_id: i64 = conn
        .query_row("SELECT id FROM roles WHERE name = ?1", rusqlite::params![role], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut all: Vec<String> = crate::db::settings::get_list(&conn, crate::db::settings::KEY_ROLES)
        .map_err(|e| e.to_string())?;
    if !all.iter().any(|x| x == &role) {
        all.push(role.clone());
        crate::db::settings::set(&conn, crate::db::settings::KEY_ROLES, &all.join(", "))
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO employees (name, role_id, contract) VALUES (?1, ?2, ?3)",
        rusqlite::params![name, role_id, contract],
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
    conn.execute("INSERT OR IGNORE INTO roles (name) VALUES (?1)", rusqlite::params![role])
        .map_err(|e| e.to_string())?;
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
    // Le statut initial est le premier statut configurable (sinon valeur générique).
    let statuses = crate::db::settings::get_list(&conn, crate::db::settings::KEY_ABSENCE_STATUSES)
        .map_err(|e| e.to_string())?;
    let initial = statuses
        .first()
        .cloned()
        .unwrap_or_else(|| crate::db::schema::DEFAULT_ABSENCE_STATUSES[0].to_string());
    conn.execute(
        "INSERT INTO absences (employee_id, type, period, status) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![employee_id, kind, period, initial],
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

// ---------- Gestion des postes/rôles (entièrement configurable) ----------

#[tauri::command]
pub fn add_role(db: State<DbState>, name: String) -> Result<i64, String> {
    let conn = lock(&db)?;
    // Idempotent : si le poste existe déjà (ex. créé à la volée via un
    // employé), on renvoie son id plutôt que d'échouer sur l'UNIQUE.
    if let Ok(id) = conn.query_row(
        "SELECT id FROM roles WHERE name = ?1",
        rusqlite::params![name],
        |r| r.get::<_, i64>(0),
    ) {
        sync_roles_setting(&conn)?;
        return Ok(id);
    }
    conn.execute("INSERT INTO roles (name) VALUES (?1)", rusqlite::params![name])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    sync_roles_setting(&conn)?;
    Ok(id)
}

#[tauri::command]
pub fn update_role(db: State<DbState>, id: i64, name: String) -> Result<(), String> {
    let conn = lock(&db)?;
    conn.execute(
        "UPDATE roles SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, id],
    )
    .map_err(|e| e.to_string())?;
    sync_roles_setting(&conn)?;
    Ok(())
}

#[tauri::command]
pub fn delete_role(db: State<DbState>, id: i64) -> Result<(), String> {
    let conn = lock(&db)?;
    // Sécurité : impossible de supprimer un poste encore utilisé par des
    // employés (sinon la contrainte NOT NULL de employees.role_id échouerait).
    let used: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM employees WHERE role_id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if used > 0 {
        return Err(format!(
            "Impossible de supprimer ce poste : {used} employé(s) y sont rattachés."
        ));
    }
    conn.execute("DELETE FROM roles WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    sync_roles_setting(&conn)?;
    Ok(())
}

/// Resynchronise le paramètre `roles` avec la table `roles`.
fn sync_roles_setting(conn: &rusqlite::Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT name FROM roles ORDER BY id")
        .map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    crate::db::settings::set(conn, crate::db::settings::KEY_ROLES, &names.join(", "))
        .map_err(|e| e.to_string())
}

// ---------- Paramètres applicatifs ----------

#[derive(Serialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

/// Lecture des paramètres (partagée entre la commande Tauri et l'export démo).
pub fn get_settings_data(conn: &rusqlite::Connection) -> Result<Vec<Setting>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Setting { key: r.get(0)?, value: r.get(1)? })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(db: State<DbState>) -> Result<Vec<Setting>, String> {
    let conn = lock(&db)?;
    get_settings_data(&conn)
}

#[tauri::command]
pub fn set_setting(db: State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = lock(&db)?;
    crate::db::settings::set(&conn, &key, &value).map_err(|e| e.to_string())
}
