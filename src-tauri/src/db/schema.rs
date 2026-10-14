//! Schéma SQLite + données de démonstration.

use rusqlite::{params, Connection};

/// Crée les tables si elles n'existent pas.
pub fn create_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS roles (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS employees (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT    NOT NULL,
            role_id  INTEGER NOT NULL REFERENCES roles(id),
            contract INTEGER NOT NULL DEFAULT 35
        );

        -- Un créneau par employé, par semaine ISO et par jour (1 = Lundi ... 7 = Dimanche)
        CREATE TABLE IF NOT EXISTS shifts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            week        INTEGER NOT NULL,
            day         INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
            shift       TEXT    NOT NULL DEFAULT 'Repos',
            UNIQUE (employee_id, week, day)
        );

        CREATE TABLE IF NOT EXISTS absences (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
            type        TEXT    NOT NULL,
            period      TEXT    NOT NULL,
            status      TEXT    NOT NULL DEFAULT 'En attente'
                              CHECK (status IN ('En attente', 'Validé', 'Refusé'))
        );

        CREATE INDEX IF NOT EXISTS idx_shifts_week ON shifts (week);
        CREATE INDEX IF NOT EXISTS idx_absences_employee ON absences (employee_id);
        ",
    )
}

/// La base est-elle vide (premier lancement) ?
pub fn is_empty(conn: &Connection) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM employees", [], |r| r.get(0))?;
    Ok(count == 0)
}

/// Insère les données de démonstration issues de l'application HTML d'origine.
pub fn seed_demo_data(conn: &Connection) -> rusqlite::Result<()> {
    // Rôles
    let roles = ["Caisse", "Logistique", "Service Client", "Management"];
    for role in roles {
        conn.execute("INSERT OR IGNORE INTO roles (name) VALUES (?1)", params![role])?;
    }

    // Employés (nom, rôle, contrat hebdomadaire)
    let employees = [
        ("Sophie Martin", "Caisse", 35),
        ("Lucas Bernard", "Logistique", 35),
        ("Emma Leroy", "Service Client", 35),
        ("Thomas Petit", "Caisse", 39),
        ("Chloé Moreau", "Logistique", 30),
    ];
    for (name, role, contract) in employees {
        conn.execute(
            "INSERT INTO employees (name, role_id, contract)
             SELECT ?1, id, ?2 FROM roles WHERE name = ?3",
            params![name, contract, role],
        )?;
    }

    // Créneaux de la semaine 42 (jour : 1 = Lundi ... 7 = Dimanche)
    let week = 42;
    let planning = [
        ("Sophie Martin", [("Lundi", "08:00 - 16:00"), ("Mardi", "08:00 - 16:00"), ("Mercredi", "Repos"), ("Jeudi", "10:00 - 18:00"), ("Vendredi", "08:00 - 16:00"), ("Samedi", "Repos"), ("Dimanche", "Repos")]),
        ("Lucas Bernard", [("Lundi", "12:00 - 20:00"), ("Mardi", "12:00 - 20:00"), ("Mercredi", "12:00 - 20:00"), ("Jeudi", "Repos"), ("Vendredi", "12:00 - 20:00"), ("Samedi", "12:00 - 20:00"), ("Dimanche", "Repos")]),
        ("Emma Leroy", [("Lundi", "09:00 - 17:00"), ("Mardi", "09:00 - 17:00"), ("Mercredi", "09:00 - 17:00"), ("Jeudi", "09:00 - 17:00"), ("Vendredi", "Repos"), ("Samedi", "Repos"), ("Dimanche", "Repos")]),
        ("Thomas Petit", [("Lundi", "Repos"), ("Mardi", "08:00 - 16:00"), ("Mercredi", "08:00 - 16:00"), ("Jeudi", "08:00 - 16:00"), ("Vendredi", "08:00 - 16:00"), ("Samedi", "08:00 - 16:00"), ("Dimanche", "Repos")]),
        ("Chloé Moreau", [("Lundi", "10:00 - 16:00"), ("Mardi", "10:00 - 16:00"), ("Mercredi", "Repos"), ("Jeudi", "10:00 - 16:00"), ("Vendredi", "10:00 - 16:00"), ("Samedi", "Repos"), ("Dimanche", "Repos")]),
    ];

    let day_index = |day: &str| -> i64 {
        match day {
            "Lundi" => 1,
            "Mardi" => 2,
            "Mercredi" => 3,
            "Jeudi" => 4,
            "Vendredi" => 5,
            "Samedi" => 6,
            _ => 7,
        }
    };

    for (emp_name, shifts) in planning {
        for (day, value) in shifts {
            conn.execute(
                "INSERT INTO shifts (employee_id, week, day, shift)
                 SELECT id, ?2, ?3, ?4 FROM employees WHERE name = ?1",
                params![emp_name, week, day_index(day), value],
            )?;
        }
    }

    // Absences de démonstration
    let absences = [
        ("Lucas Bernard", "Congé payé", "16 Octobre - 17 Octobre", "En attente"),
        ("Thomas Petit", "Arrêt maladie", "12 Octobre", "Validé"),
        ("Chloé Moreau", "Congé sans solde", "14 Octobre", "Refusé"),
    ];
    for (emp_name, kind, period, status) in absences {
        conn.execute(
            "INSERT INTO absences (employee_id, type, period, status)
             SELECT id, ?2, ?3, ?4 FROM employees WHERE name = ?1",
            params![emp_name, kind, period, status],
        )?;
    }

    Ok(())
}
