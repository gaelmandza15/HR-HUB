//! Tests d'intégration import/export : on construit un modèle exportable,
//! on le rend dans chaque format, on le reparse et on l'écrit dans une base
//! SQLite fraîche — le résultat doit être identique aux données d'origine.

use rusqlite::Connection;
use serde_json::json;

fn seeded_conn() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    hr_hub_lib::db::schema::migrate(&conn).unwrap();
    conn.execute(
        "INSERT INTO roles (id, name) VALUES (1, 'Boucherie'), (2, 'Pâtisserie'), (3, 'Caissier')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO employees (id, name, role_id, contract) VALUES (1, 'Alice Martin', 1, 35), (2, 'Jean \"JD\" Dupont', 2, 20)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO shifts (employee_id, week, day, shift) VALUES (1, 42, 1, '06:00 - 13:00'), (2, 42, 3, 'Repos')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO absences (id, employee_id, type, period, status) VALUES (1, 1, 'Congé payé', 'Du 20/10 au 25/10', 'Validée')",
        [],
    )
    .unwrap();
    hr_hub_lib::db::settings::set(&conn, "week_start_year", "2026").unwrap();
    hr_hub_lib::db::settings::set(&conn, "default_shift", "08:00 - 16:00").unwrap();
    hr_hub_lib::commands::sync_roles_setting(&conn).unwrap();
    conn
}

fn counts(conn: &Connection) -> (i64, i64, i64, i64) {
    let one = |q: &str| -> i64 { conn.query_row(q, [], |r| r.get(0)).unwrap() };
    (
        one("SELECT COUNT(*) FROM roles"),
        one("SELECT COUNT(*) FROM employees"),
        one("SELECT COUNT(*) FROM shifts"),
        one("SELECT COUNT(*) FROM absences"),
    )
}

#[test]
fn export_model_contains_all_tables() {
    let conn = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&conn).unwrap();
    assert_eq!(model["roles"].as_array().unwrap().len(), 3);
    assert_eq!(model["employees"].as_array().unwrap().len(), 2);
    assert_eq!(model["shifts"].as_array().unwrap().len(), 2);
    assert_eq!(model["absences"].as_array().unwrap().len(), 1);
    // Le nom avec guillemets doit survivre au voyage JSON.
    assert_eq!(model["employees"][1]["name"], json!("Jean \"JD\" Dupont"));
}

#[test]
fn json_roundtrip_into_fresh_db() {
    let src = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&src).unwrap();
    let content = hr_hub_lib::db::export::render(&model, "json").unwrap();

    let dst = Connection::open_in_memory().unwrap();
    hr_hub_lib::db::schema::migrate(&dst).unwrap();
    let parsed = hr_hub_lib::db::export::parse_payload(&content, "json").unwrap();
    hr_hub_lib::db::export::write_model(&dst, &parsed, false).unwrap();

    assert_eq!(counts(&dst), counts(&src));
    let name: String = dst
        .query_row("SELECT name FROM employees WHERE id = 2", [], |r| r.get(0))
        .unwrap();
    assert_eq!(name, "Jean \"JD\" Dupont");
    let year: String = dst
        .query_row(
            "SELECT value FROM settings WHERE key = 'week_start_year'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(year, "2026");
}

#[test]
fn csv_roundtrip_into_fresh_db() {
    let src = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&src).unwrap();
    let content = hr_hub_lib::db::export::render(&model, "csv").unwrap();
    // L'échappement RFC 4180 est présent pour le nom contenant des guillemets.
    assert!(content.contains("\"Jean \"\"JD\"\" Dupont\""));

    let dst = Connection::open_in_memory().unwrap();
    hr_hub_lib::db::schema::migrate(&dst).unwrap();
    let parsed = hr_hub_lib::db::export::parse_payload(&content, "csv").unwrap();
    hr_hub_lib::db::export::write_model(&dst, &parsed, false).unwrap();

    assert_eq!(counts(&dst), counts(&src));
    let role: String = dst
        .query_row(
            "SELECT r.name FROM employees e JOIN roles r ON r.id = e.role_id WHERE e.id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(role, "Boucherie");
}

#[test]
fn tsv_roundtrip_into_fresh_db() {
    let src = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&src).unwrap();
    let content = hr_hub_lib::db::export::render(&model, "tsv").unwrap();

    let dst = Connection::open_in_memory().unwrap();
    hr_hub_lib::db::schema::migrate(&dst).unwrap();
    let parsed = hr_hub_lib::db::export::parse_payload(&content, "tsv").unwrap();
    hr_hub_lib::db::export::write_model(&dst, &parsed, false).unwrap();

    assert_eq!(counts(&dst), counts(&src));
}

#[test]
fn md_and_sql_render_and_are_not_importable() {
    let conn = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&conn).unwrap();
    let md = hr_hub_lib::db::export::render(&model, "md").unwrap();
    assert!(md.contains("## employees"));
    let sql = hr_hub_lib::db::export::render(&model, "sql").unwrap();
    assert!(sql.contains("INSERT INTO employees"));

    // Les formats lecture-seule sont refusés proprement à l'import.
    assert!(hr_hub_lib::db::export::parse_payload(&md, "md").is_err());
    assert!(hr_hub_lib::db::export::parse_payload(&sql, "sql").is_err());
}

#[test]
fn merge_mode_adds_without_duplicating() {
    let src = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&src).unwrap();
    let content = hr_hub_lib::db::export::render(&model, "json").unwrap();

    // Base de destination = mêmes données + un employé supplémentaire.
    let dst = seeded_conn();
    dst.execute(
        "INSERT INTO employees (id, name, role_id, contract) VALUES (99, 'Extra Employee', 3, 35)",
        [],
    )
    .unwrap();

    let parsed = hr_hub_lib::db::export::parse_payload(&content, "json").unwrap();
    hr_hub_lib::db::export::write_model(&dst, &parsed, true).unwrap();

    // Fusion : rien en double, l'employé local est conservé.
    assert_eq!(counts(&dst), (3, 3, 2, 1));
    let extra: i64 = dst
        .query_row(
            "SELECT COUNT(*) FROM employees WHERE name = 'Extra Employee'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(extra, 1);
}

#[test]
fn replace_mode_wipes_and_reloads() {
    let src = seeded_conn();
    let model = hr_hub_lib::db::export::build_model(&src).unwrap();
    let content = hr_hub_lib::db::export::render(&model, "json").unwrap();

    let dst = Connection::open_in_memory().unwrap();
    hr_hub_lib::db::schema::migrate(&dst).unwrap();
    dst.execute("INSERT INTO roles (name) VALUES ('Trancheur')", [])
        .unwrap();
    dst.execute(
        "INSERT INTO employees (name, role_id, contract) VALUES ('Bob', 1, 35)",
        [],
    )
    .unwrap();

    let parsed = hr_hub_lib::db::export::parse_payload(&content, "json").unwrap();
    hr_hub_lib::db::export::write_model(&dst, &parsed, false).unwrap();

    // 'Trancheur' et 'Bob' ont été remplacés par le contenu du fichier.
    assert_eq!(counts(&dst), counts(&src));
    let bob: i64 = dst
        .query_row("SELECT COUNT(*) FROM employees WHERE name = 'Bob'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(bob, 0);
}

#[test]
fn invalid_payload_is_rejected() {
    assert!(hr_hub_lib::db::export::parse_payload("not json at all", "json").is_err());
    assert!(hr_hub_lib::db::export::parse_payload("{\"foo\": 1}", "json").is_err());
    assert!(hr_hub_lib::db::export::parse_payload("[]", "json").is_err());
    assert!(hr_hub_lib::db::export::render(&json!({}), "xls").is_err());
}

#[test]
fn suggested_filename_has_extension() {
    assert!(hr_hub_lib::db::export::suggested_filename("json").ends_with(".json"));
    assert!(hr_hub_lib::db::export::suggested_filename("CSV").ends_with(".csv"));
    assert!(hr_hub_lib::db::export::suggested_filename("excel").ends_with(".tsv"));
    assert!(hr_hub_lib::db::export::suggested_filename("md").ends_with(".md"));
    assert!(hr_hub_lib::db::export::suggested_filename("sql").ends_with(".sql"));
}
