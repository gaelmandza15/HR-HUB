mod commands;
mod db;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Base SQLite stockée dans le dossier de données de l'application
            let app_data_dir = app.handle().path_resolver().app_data_dir().unwrap();
            let db_state = db::init_db(&app_data_dir)
                .map_err(|e| format!("Impossible d'initialiser la base SQLite : {e}"))?;
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_roles,
            commands::list_employees,
            commands::add_employee,
            commands::update_employee,
            commands::delete_employee,
            commands::list_shifts,
            commands::set_shift,
            commands::list_absences,
            commands::add_absence,
            commands::set_absence_status
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors de l'exécution de HR HUB");
}
