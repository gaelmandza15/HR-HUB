//! Export de données : la base SQLite est sérialisée dans un modèle unique
//! `ExportModel`, puis rendu au format demandé (JSON, CSV, TSV, Markdown, SQL).
//!
//! Les en-têtes de colonnes sont **dérivés des clés du modèle** (aucune liste
//! de champs codée en dur) : si on ajoute une table ou une colonne plus tard,
//! le CSV/Markdown s'adapte automatiquement.

use std::collections::BTreeMap;

use rusqlite::Connection;
use serde_json::{json, Value};

/// Modèle canonique de l'export : toutes les tables + métadonnées.
pub fn build_model(conn: &Connection) -> Result<Value, String> {
    let settings = crate::commands::get_settings_data(conn)?;
    let roles = crate::commands::list_roles_data(conn)?;
    let employees = crate::commands::list_employees_data(conn)?;
    let shifts = crate::commands::all_shifts_data(conn)?;
    let absences = crate::commands::list_absences_data(conn)?;

    Ok(json!({
        "app": "HR HUB",
        "version": env!("CARGO_PKG_VERSION"),
        "formatVersion": 1,
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "settings": settings,
        "roles": roles,
        "employees": employees,
        "shifts": shifts,
        "absences": absences,
    }))
}

/// Tables exportables, dans l'ordre d'écriture (les tableaux JSON du modèle).
fn sections(model: &Value) -> Vec<(&'static str, Vec<String>)> {
    ["settings", "roles", "employees", "shifts", "absences"]
        .into_iter()
        .filter_map(|name| match model.get(name).and_then(Value::as_array) {
            Some(arr) => Some((name, headers_of(arr))),
            None => None,
        })
        .collect()
}

/// En-têtes dérivés de l'union des clés des objets (ordre d'apparition).
fn headers_of(rows: &[Value]) -> Vec<String> {
    let mut headers: Vec<String> = Vec::new();
    for row in rows {
        if let Some(obj) = row.as_object() {
            for key in obj.keys() {
                if !headers.contains(key) {
                    headers.push(key.clone());
                }
            }
        }
    }
    headers
}

fn cell_to_string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Échappement RFC 4180 : guillemets doublés et encadrement si nécessaire.
fn csv_escape(value: &str, sep: char) -> String {
    if value.contains(sep) || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn render_delimited(model: &Value, sep: char, bom: bool) -> Result<String, String> {
    let mut out = String::new();
    if bom {
        out.push('\u{FEFF}');
    }
    for (name, headers) in sections(model) {
        out.push_str(&format!("# {name}\n"));
        let rows = model[name].as_array().cloned().unwrap_or_default();
        out.push_str(
            &headers
                .iter()
                .map(|h| csv_escape(h, sep))
                .collect::<Vec<_>>()
                .join(&sep.to_string()),
        );
        out.push('\n');
        for row in &rows {
            let line = headers
                .iter()
                .map(|h| csv_escape(&cell_to_string(row.get(h).unwrap_or(&Value::Null)), sep))
                .collect::<Vec<_>>()
                .join(&sep.to_string());
            out.push_str(&line);
            out.push('\n');
        }
        out.push('\n');
    }
    Ok(out)
}

fn render_markdown(model: &Value) -> Result<String, String> {
    let mut out = String::new();
    out.push_str(&format!(
        "# HR HUB — Export du {}\n\n",
        model["exportedAt"].as_str().unwrap_or("?")
    ));
    for (name, headers) in sections(model) {
        let rows = model[name].as_array().cloned().unwrap_or_default();
        out.push_str(&format!("## {name}\n\n"));
        if rows.is_empty() {
            out.push_str("_(vide)_\n\n");
            continue;
        }
        out.push_str("| ");
        out.push_str(&headers.join(" | "));
        out.push_str(" |\n| ");
        out.push_str(&headers.iter().map(|_| "---").collect::<Vec<_>>().join(" | "));
        out.push_str(" |\n");
        for row in &rows {
            let cells: Vec<String> = headers
                .iter()
                .map(|h| cell_to_string(row.get(h).unwrap_or(&Value::Null)).replace('|', "\\|"))
                .collect();
            out.push_str("| ");
            out.push_str(&cells.join(" | "));
            out.push_str(" |\n");
        }
        out.push('\n');
    }
    Ok(out)
}

fn sql_quote(v: &Value) -> String {
    match v {
        Value::Null => "NULL".into(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => other.to_string(),
    }
}

fn render_sql(model: &Value) -> Result<String, String> {
    let mut out = String::new();
    out.push_str("-- HR HUB : dump SQL réimportable (exécuter sur une base vide)\n");
    out.push_str("BEGIN;\nPRAGMA foreign_keys = OFF;\n\n");
    for (name, headers) in sections(model) {
        let rows = model[name].as_array().cloned().unwrap_or_default();
        if rows.is_empty() {
            continue;
        }
        let cols = headers.join(", ");
        for row in &rows {
            let values: Vec<String> = headers
                .iter()
                .map(|h| sql_quote(row.get(h).unwrap_or(&Value::Null)))
                .collect();
            out.push_str(&format!(
                "INSERT INTO {name} ({cols}) VALUES ({});\n",
                values.join(", ")
            ));
        }
        out.push('\n');
    }
    // Réaligne les séquences AUTOINCREMENT pour éviter tout conflit futur.
    for (table, pk) in [
        ("roles", "id"),
        ("employees", "id"),
        ("shifts", "id"),
        ("absences", "id"),
    ] {
        out.push_str(&format!(
            "UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX({pk}), 0) FROM {table}) WHERE name = '{table}';\n"
        ));
    }
    out.push_str("\nPRAGMA foreign_keys = ON;\nCOMMIT;\n");
    Ok(out)
}

/// Rend le modèle dans le format demandé (`json` | `csv` | `tsv` | `md` | `sql`).
pub fn render(model: &Value, format: &str) -> Result<String, String> {
    match format.to_ascii_lowercase().as_str() {
        "json" => serde_json::to_string_pretty(model).map_err(|e| e.to_string()),
        "csv" => render_delimited(model, ',', true),
        "tsv" | "excel" => render_delimited(model, '\t', false),
        "md" | "markdown" => render_markdown(model),
        "sql" => render_sql(model),
        other => Err(format!("Format d'export inconnu : {other}")),
    }
}

/// Nom de fichier suggéré pour un export horodaté.
pub fn suggested_filename(format: &str) -> String {
    let ext = match format.to_ascii_lowercase().as_str() {
        "tsv" | "excel" => "tsv",
        "md" | "markdown" => "md",
        "sql" => "sql",
        "csv" => "csv",
        _ => "json",
    };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    format!("hrhub-export-{stamp}.{ext}")
}

// ---------- Import ----------

/// Lit le contenu d'un fichier d'export (JSON natif, ou convertit CSV/TSV
/// via les sections `# table`) et valide sa structure minimale.
pub fn parse_payload(content: &str, format: &str) -> Result<Value, String> {
    let model = match format.to_ascii_lowercase().as_str() {
        "json" | "" => serde_json::from_str(content).map_err(|e| format!("JSON invalide : {e}"))?,
        "csv" => parse_delimited(content, ',')?,
        "tsv" | "excel" => parse_delimited(content, '\t')?,
        other => return Err(format!("Format d'import non pris en charge : {other} (utilisez JSON, CSV ou TSV)")),
    };
    validate(&model)?;
    Ok(model)
}

fn validate(model: &Value) -> Result<(), String> {
    let obj = model
        .as_object()
        .ok_or_else(|| "Le fichier ne contient pas un objet de données.".to_string())?;
    let known = ["settings", "roles", "employees", "shifts", "absences"];
    if !known.iter().any(|k| obj.contains_key(*k)) {
        return Err("Aucune table reconnue (settings, roles, employees, shifts, absences).".into());
    }
    for key in known {
        if let Some(v) = obj.get(key) {
            if !v.is_array() {
                return Err(format!("La section « {key} » doit être une liste."));
            }
        }
    }
    Ok(())
}

/// Parseur CSV minimal (guillemets échappés inclus) avec sections `# table`.
fn parse_delimited(content: &str, sep: char) -> Result<Value, String> {
    let mut map = BTreeMap::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i].trim_end_matches(['\r', '\n']);
        i += 1;
        if line.trim().is_empty() {
            continue;
        }
        if let Some(name) = line.strip_prefix("# ") {
            let name = name.trim().to_string();
            if i >= lines.len() {
                break;
            }
            let headers = split_row(lines[i], sep);
            i += 1;
            let mut rows = Vec::new();
            while i < lines.len() {
                let row_line = lines[i].trim_end_matches(['\r', '\n']);
                i += 1;
                if row_line.trim().is_empty() || row_line.starts_with("# ") {
                    break;
                }
                let cells = split_row(row_line, sep);
                let mut obj = serde_json::Map::new();
                for (idx, h) in headers.iter().enumerate() {
                    let raw = cells.get(idx).cloned().unwrap_or_default();
                    // Les colonnes purement numériques deviennent des nombres,
                    // comme dans l'export JSON d'origine.
                    let value = match raw.trim().parse::<i64>() {
                        Ok(n) => json!(n),
                        Err(_) => json!(raw),
                    };
                    obj.insert(h.clone(), value);
                }
                rows.push(Value::Object(obj));
            }
            map.insert(name, rows);
            // Si la ligne interrompante était un en-tête de section, on la rejoue.
            if i < lines.len() && lines[i - 1].starts_with("# ") {
                i -= 1;
            }
        }
    }
    Ok(Value::Object(map.into_iter().map(|(k, v)| (k, json!(v))).collect()))
}

fn split_row(line: &str, sep: char) -> Vec<String> {
    let mut cells = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cur.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            c if c == sep && !quoted => {
                cells.push(cur.clone());
                cur.clear();
            }
            c => cur.push(c),
        }
    }
    cells.push(cur);
    cells
}

/// Écrit le modèle importé dans la base (transaction : tout ou rien).
///
/// - `merge = false` (remplacer) : les tables présentes dans le fichier sont
///   vidées puis réécrites ; les FK sont désactivées pendant l'opération.
/// - `merge = true` : les postes manquants sont ajoutés, employés/créneaux/
///   absences existants sont conservés (les lignes déjà présentes sont ignorées).
pub fn write_model(conn: &Connection, model: &Value, merge: bool) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    if !merge {
        tx.execute_batch("PRAGMA foreign_keys = OFF;")
            .map_err(|e| e.to_string())?;
    }

    let result = (|| -> Result<(), String> {
        // 1) Postes
        if let Some(roles) = model.get("roles").and_then(Value::as_array) {
            if !merge {
                tx.execute("DELETE FROM roles", []).map_err(|e| e.to_string())?;
            }
            for r in roles {
                let name = field_str(r, "name").ok_or("Poste sans nom dans le fichier.")?;
                tx.execute(
                    "INSERT OR IGNORE INTO roles (id, name) VALUES (?1, ?2)",
                    rusqlite::params![field_i64(r, "id"), name],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // 2) Employés
        if let Some(emps) = model.get("employees").and_then(Value::as_array) {
            if !merge {
                tx.execute("DELETE FROM employees", []).map_err(|e| e.to_string())?;
            }
            for e in emps {
                let name = field_str(e, "name").ok_or("Employé sans nom dans le fichier.")?;
                let role_id: i64 = match field_str(e, "role") {
                    Some(role) => tx
                        .query_row(
                            "SELECT id FROM roles WHERE name = ?1",
                            rusqlite::params![role],
                            |r| r.get(0),
                        )
                        .map_err(|_| format!("Poste « {role} » introuvable pour l'employé « {name} »."))?,
                    None => tx
                        .query_row("SELECT MIN(id) FROM roles", [], |r| r.get(0))
                        .unwrap_or(1),
                };
                let contract: i64 = field_i64(e, "contract").unwrap_or(35);
                tx.execute(
                    "INSERT OR REPLACE INTO employees (id, name, role_id, contract) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![field_i64(e, "id"), name, role_id, contract],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // 3) Créneaux
        if let Some(shifts) = model.get("shifts").and_then(Value::as_array) {
            if !merge {
                tx.execute("DELETE FROM shifts", []).map_err(|e| e.to_string())?;
            }
            for s in shifts {
                let (Some(emp), Some(week), Some(day)) = (
                    field_i64(s, "employeeId").or_else(|| field_i64(s, "employee_id")),
                    field_i64(s, "week"),
                    field_i64(s, "day"),
                ) else {
                    continue;
                };
                let shift = field_str(s, "shift").unwrap_or_else(|| "Repos".into());
                tx.execute(
                    "INSERT OR REPLACE INTO shifts (employee_id, week, day, shift) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![emp, week, day, shift],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // 4) Absences
        if let Some(absences) = model.get("absences").and_then(Value::as_array) {
            if !merge {
                tx.execute("DELETE FROM absences", []).map_err(|e| e.to_string())?;
            }
            for a in absences {
                let Some(emp) = field_i64(a, "employeeId").or_else(|| field_i64(a, "employee_id")) else {
                    continue;
                };
                let kind = field_str(a, "type").unwrap_or_default();
                let period = field_str(a, "period").unwrap_or_default();
                let status = field_str(a, "status").unwrap_or_else(|| "En attente".into());
                tx.execute(
                    "INSERT OR REPLACE INTO absences (id, employee_id, type, period, status) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![field_i64(a, "id"), emp, kind, period, status],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // 5) Paramètres
        if let Some(settings) = model.get("settings").and_then(Value::as_array) {
            if !merge {
                tx.execute("DELETE FROM settings", []).map_err(|e| e.to_string())?;
            }
            for st in settings {
                let (Some(key), Some(value)) = (field_str(st, "key"), field_str(st, "value")) else {
                    continue;
                };
                crate::db::settings::set(&tx, &key, &value).map_err(|e| e.to_string())?;
            }
        }

        // Le paramètre `roles` doit rester aligné sur la table `roles`.
        crate::commands::sync_roles_setting(&tx).map_err(|e| e.to_string())?;
        Ok(())
    })();

    if !merge {
        tx.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| e.to_string())?;
    }
    result?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn field_str(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Null => None,
        other => {
            let s = other.to_string();
            if s.is_empty() || s == "null" {
                None
            } else {
                Some(s)
            }
        }
    }
}

fn field_i64(v: &Value, key: &str) -> Option<i64> {
    match v.get(key)? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}
