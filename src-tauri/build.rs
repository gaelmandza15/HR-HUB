//! Script de build Tauri.
//!
//! `tauri_build::build()` génère et compile les ressources Windows
//! (manifeste, icône, VERSIONINFO) mais ne renseigne jamais le champ
//! `CompanyName` (voir tauri-build 1.x, `src/lib.rs`). On reconstruit donc
//! `resource.lib` à l'identique en y ajoutant ce champ, pour que l'éditeur
//! « Zapricot LLC » apparaisse dans les propriétés du fichier Windows
//! (onglet Détails → Société).
//!
//! On compile avec `rc.exe` sans émettre de directive de lien : le
//! `resource.lib` produit écrase celui de tauri-build, sinon le linker
//! reçoit la ressource deux fois (CVT1100: duplicate resource).

use std::path::PathBuf;

/// Éditeur affiché dans les métadonnées du binaire (propriétés du fichier
/// Windows, onglet Détails → Société). Le reste du VERSIONINFO (nom, version,
/// copyright) est déjà produit par tauri-build.
const COMPANY: &str = "Zapricot LLC";

fn main() {
    tauri_build::build();

    #[cfg(windows)]
    inject_company_name();
}

/// Recompile la ressource Windows de tauri-build en y ajoutant `CompanyName`.
#[cfg(windows)]
fn inject_company_name() {
    use std::fs;
    use std::process::Command;

    let Some(out_dir) = find_resource_dir() else {
        return;
    };

    let rc_path = out_dir.join("resource.rc");
    let lib_path = out_dir.join("resource.lib");
    if !rc_path.exists() || !lib_path.exists() {
        return;
    }

    let Ok(content) = fs::read_to_string(&rc_path) else {
        return;
    };
    // Build incrémental : ne rien refaire si le champ est déjà là.
    if content.contains("CompanyName") {
        return;
    }

    // Insère le champ dans le bloc StringFileInfo de tauri-build.
    let anchor = "VALUE \"FileVersion\",";
    let Some(pos) = content.find(anchor) else {
        return;
    };
    let line = format!("VALUE \"CompanyName\", \"{COMPANY}\"\n");
    let updated = format!("{}{}{}", &content[..pos], line, &content[pos..]);

    let patched = out_dir.join("hr-hub-company.rc");
    if fs::write(&patched, updated).is_err() {
        return;
    }

    // Compile vers resource.lib (écrase celui de tauri-build, même nom).
    let Some(rc_exe) = find_rc() else {
        println!("cargo:warning=rc.exe introuvable : CompanyName non injecté");
        return;
    };
    let output = Command::new(&rc_exe)
        .arg("/nologo")
        .arg("/fo")
        .arg(&lib_path)
        .arg(&patched)
        .current_dir(&out_dir)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            println!("cargo:warning=CompanyName injecté via {}", rc_exe.display());
        }
        Ok(o) => {
            println!(
                "cargo:warning=échec rc.exe ({}): {}",
                o.status,
                String::from_utf8_lossy(&o.stderr)
            );
        }
        Err(e) => println!("cargo:warning=rc.exe non exécutable : {e}"),
    }
}

/// Localise le dossier `build/<crate>/out` contenant `resource.lib`.
#[cfg(windows)]
fn find_resource_dir() -> Option<PathBuf> {
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").ok()?);
    // OUT_DIR pointe vers .../build/<hash>/out, mais tauri-build écrit dans un
    // dossier frère. On balaie donc le dossier `build` parent.
    let build_dir = out_dir.parent()?.parent()?;
    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    for entry in std::fs::read_dir(build_dir).ok()? {
        let dir = entry.ok()?.path().join("out");
        let lib = dir.join("resource.lib");
        if lib.exists() {
            if let Ok(meta) = std::fs::metadata(&lib) {
                let t = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                if best.as_ref().map(|(_, bt)| t > *bt).unwrap_or(true) {
                    best = Some((dir, t));
                }
            }
        }
    }
    best.map(|(d, _)| d)
}

/// Trouve `rc.exe` (Windows SDK) : d'abord via embed-resource, sinon en
/// balayant les emplacements standards du SDK.
#[cfg(windows)]
fn find_rc() -> Option<PathBuf> {
    if let Some(p) = embed_resource::find_windows_sdk_tool("rc") {
        return Some(p);
    }

    let mut roots: Vec<PathBuf> = Vec::new();
    for base in [
        r"C:\Program Files (x86)\Windows Kits\10\bin",
        r"C:\Program Files\Windows Kits\10\bin",
    ] {
        roots.push(PathBuf::from(base));
    }

    // Choisit la version de SDK la plus récente disponible.
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        let mut versions: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        versions.sort();
        for version in versions.into_iter().rev() {
            let candidate = version.join("x64").join("rc.exe");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}
