mod commands;
mod db;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Base SQLite stockée dans le dossier de données de l'application
            let app_data_dir = app.path_resolver().app_data_dir()
                .expect("impossible de resoudre le repertoire de donnees");
            let db_state = db::init_db(&app_data_dir)
                .map_err(|e| format!("Impossible d'initialiser la base SQLite : {e}"))?;

            // Année de référence des semaines ISO : calculée dynamiquement,
            // jamais codée en dur côté frontend.
            let year = chrono::Local::now().format("%Y").to_string();
            db::settings::set_if_absent(&db_state.conn.lock().unwrap(), "week_start_year", &year)
                .map_err(|e| format!("Parametre week_start_year : {e}"))?;

            // Export `hrhub-demo.json` (utilisé par l'aperçu navigateur hors
            // Tauri pour reproduire les mêmes données sans rien coder en dur).
            commands::export_demo_json(&db_state.conn.lock().unwrap(), &app_data_dir)
                .map_err(|e| format!("Export hrhub-demo.json : {e}"))?;

            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_roles,
            commands::add_role,
            commands::update_role,
            commands::delete_role,
            commands::list_employees,
            commands::add_employee,
            commands::update_employee,
            commands::delete_employee,
            commands::list_shifts,
            commands::set_shift,
            commands::list_absences,
            commands::add_absence,
            commands::set_absence_status,
            commands::get_settings,
            commands::set_setting
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors de l'execution de HR HUB");
}
