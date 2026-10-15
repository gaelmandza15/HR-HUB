# HR HUB

Application de bureau pour la **gestion des horaires, des équipes et des absences**. Interface en français, fonctionne entièrement hors ligne, avec une base de données locale SQLite.

Éditée par **Zapricot LLC**.

<!-- Ajoutez une capture d'écran ici : docs/capture-dashboard.png -->
<!-- ![Tableau de bord](docs/capture-dashboard.png) -->

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Aperçu technique](#aperçu-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Développement](#développement)
- [Compilation de l'application](#compilation-de-lapplication)
- [Import / Export des données](#import--export-des-données)
- [Où sont stockées les données](#où-sont-stockées-les-données)
- [Structure du projet](#structure-du-projet)
- [Licence](#licence)

---

## Fonctionnalités

- **Tableau de bord** — indicateurs clés : effectif, heures planifiées, alertes heures supplémentaires, absences en attente.
- **Planification** — planning hebdomadaire par employé (créneaux « 08:00 - 16:00 », « Repos »…), navigation par semaine ISO, calcul automatique des heures.
- **Équipe & Postes** — ajout, modification et suppression des collaborateurs (nom, poste, contrat hebdomadaire).
- **Absences & Congés** — déclaration des demandes et workflow de validation (statuts configurables).
- **Réglages** — toutes les listes sont modifiables sans toucher au code : types d'absence, statuts, jours de la semaine, postes, créneau et contrat par défaut.
- **Import / Export** — sauvegarde et restauration complètes en JSON, CSV, TSV, Markdown ou SQL.

Rien n'est codé en dur côté interface : les listes (postes, statuts, jours…) proviennent de la base de données et sont modifiables depuis l'écran Réglages.

## Aperçu technique

| Composant | Technologie |
|---|---|
| Application de bureau | [Tauri](https://tauri.app/) 1.x |
| Backend | Rust + SQLite ([rusqlite](https://github.com/rusqlite/rusqlite), SQLite embarqué) |
| Interface | JavaScript (modules ES), HTML |
| Styles | Tailwind CSS v4 (compilé localement, **aucun CDN**) |
| Polices / icônes | Inter et Font Awesome, vendorisés via npm |
| Outil de build | Vite 5 |

L'application ne dépend d'aucun service en ligne : ni compte, ni serveur, ni connexion internet.

## Prérequis

Pour **exécuter** une version déjà compilée, rien à installer — l'application est autonome.

Pour **développer** ou **compiler** :

- [Node.js](https://nodejs.org/) 18 ou supérieur
- [Rust](https://www.rust-lang.org/tools/install) (édition 2021)
- Les dépendances système de Tauri pour votre plateforme — voir la [documentation Tauri](https://tauri.app/v1/guides/getting-started/prerequisites) (sur Windows : Visual Studio C++ Build Tools et WebView2)

## Installation

### Utilisateur final

Téléchargez l'installateur depuis la section [Releases](https://github.com/gaelmandza15/HR-HUB/releases) ou depuis les artefacts de build :

- `HR HUB_1.0.0_x64-setup.exe` (installateur NSIS, recommandé)
- `HR HUB_1.0.0_x64_en-US.msi` (installateur MSI)

L'application s'installe dans le menu Démarrer et crée ses raccourcis.

### Portable

L'exécutable `HR HUB.exe` fonctionne aussi sans installation : il suffit de le lancer.

## Développement

```bash
# Installer les dépendances JavaScript
npm install

# Lancer l'application en mode développement (fenêtre native + rechargement à chaud)
npm run tauri dev

# Aperçu de l'interface dans le navigateur, sans compiler le backend Rust
npm run dev
```

> **Mode navigateur** — `npm run dev` sert l'interface seule sur `http://localhost:1420`. La couche API bascule automatiquement sur un stockage `localStorage` alimenté par `hrhub-demo.json`, ce qui permet de travailler sur l'interface sans compiler Rust. Les données y sont indépendantes de la base SQLite.

## Compilation de l'application

```bash
npm run tauri build
```

Les artefacts sont générés dans `src-tauri/target/release/` :

| Fichier | Description |
|---|---|
| `HR HUB.exe` | Exécutable autonome (portable) |
| `bundle/nsis/HR HUB_1.0.0_x64-setup.exe` | Installateur NSIS |
| `bundle/msi/HR HUB_1.0.0_x64_en-US.msi` | Installateur MSI |

> La première compilation Rust prend plusieurs minutes (compilation de toutes les dépendances). Les suivantes sont beaucoup plus rapides.

## Import / Export des données

Depuis **Réglages → Import / Export**, vous pouvez sauvegarder ou restaurer l'intégralité des données (postes, employés, planning, absences, réglages).

**Formats d'export**

| Format | Usage |
|---|---|
| JSON | Sauvegarde complète, réimportable |
| CSV / TSV | Ouverture dans Excel ou LibreOffice |
| Markdown | Lecture rapide, documentation |
| SQL | Dump directement réexécutable sur une base vide |

**Modes d'import**

- **Fusionner** — ajoute les données du fichier sans rien supprimer.
- **Remplacer** — vide les tables concernées puis recharge le contenu du fichier.

## Où sont stockées les données

La base SQLite est créée au premier lancement dans le dossier de données de l'application :

| Système | Emplacement |
|---|---|
| Windows | `%APPDATA%\com.hrhub.app\hrhub.db` |
| macOS | `~/Library/Application Support/com.hrhub.app/hrhub.db` |
| Linux | `~/.local/share/com.hrhub.app/hrhub.db` |

Pour sauvegarder ou transférer vos données entre machines, utilisez l'export JSON depuis l'application plutôt que de copier ce fichier directement.

## Structure du projet

```
HR-HUB/
├── index.html                  # Point d'entrée de l'interface
├── public/                     # Fichiers servis tels quels (icône, données de démo)
├── src/
│   ├── css/app.css             # Styles (Tailwind)
│   └── js/
│       ├── app.js              # Démarrage, routage entre les pages
│       ├── api.js              # Couche d'accès aux données (Tauri ou navigateur)
│       ├── settings.js         # Store des réglages applicatifs
│       ├── utils.js            # Utilitaires partagés
│       ├── components/         # Composants réutilisables (sidebar, modal, toast, import/export)
│       └── pages/              # Une page par écran (dashboard, planning, équipe, absences, réglages)
├── src-tauri/                  # Backend Rust (application Tauri)
│   ├── src/
│   │   ├── main.rs             # Démarrage Tauri, enregistrement des commandes
│   │   ├── commands.rs         # Commandes exposées à l'interface
│   │   ├── lib.rs              # Bibliothèque (réutilisée par les tests)
│   │   └── db/                 # Base SQLite : schéma, migrations, réglages, import/export
│   ├── icons/                  # Icônes de l'application
│   ├── tests/                  # Tests d'intégration import/export
│   └── tauri.conf.json         # Configuration Tauri
└── scripts/generate_icons.py   # Génération des icônes depuis l'image source
```

## Tests

Les tests d'intégration couvrent l'import/export (round-trip de chaque format, modes fusion et remplacement) :

```bash
cd src-tauri
cargo test
```

## Licence

Distribué sous licence MIT — voir le fichier [LICENSE](LICENSE).

© 2026 Zapricot LLC.
