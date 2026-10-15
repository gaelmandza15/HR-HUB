//! Library crate de HR HUB : expose les modules pour `main.rs` (binaire Tauri)
//! et pour les tests d'intégration (`tests/`), qui ne peuvent pas importer un
//! simple binaire.

pub mod commands;
pub mod db;
