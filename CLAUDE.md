# Instructions pour les assistants IA travaillant sur BALISIM

Porteur du projet : Benjamin (compte GitHub Kitcut40). Il **ne code pas** : il teste, donne des retours
et valide. L'IA écrit tout le code, les tests, les données et la documentation.

## Règles

1. Le cahier des charges complet (« BALISIM v2 — Cahier des charges ») fait foi. Feuille de route :
   étape 0 fondations, **étape 1 cœur balistique + projet 40 mm** (en cours), étape 2 vraies poudres et
   outils rechargeur, étape 3 vol avancé / impact / 3D, étape 4 autres familles (calibre 12, poudre noire,
   airsoft, PCP, CO2, paintball), étape 5 finition et publication.
2. Livrer à chaque étape un logiciel prêt à lancer (lien web + .exe), jamais des fragments.
3. Quand un fichier change, le réécrire en entier.
4. Ne jamais inventer une donnée présentée comme réelle : toute valeur estimée porte `quality: "estimated"`
   et l'interface l'affiche.
5. Ne jamais recopier les PDF/dessins CIP ou SAAMI ni les tables de charges des fabricants ; seulement des
   cotes chiffrées avec lien vers la source, et des paramètres calibrés.
6. Interface et documentation en français (anglais via `app/src/i18n.ts`), code en anglais.
7. Toute modification du moteur doit garder `cargo test -p balisim-core --release` vert.

## Architecture

- `crates/core` : moteur Rust pur et déterministe. Point d'entrée : `scenario::run` (unités utilisateur :
  mm, g, cm³, MPa) → `ScenarioResult`. JSON via `run_json`.
- `crates/wasm` : `run_scenario(json)`, `library()`, `version()`.
- `app/` : React + Vite + uPlot ; `src/engine.ts` charge le WebAssembly (`src/engine/pkg`, construit par la CI)
  ou, en `npm run dev`, le moteur natif via `crates/devbridge`.
- `app/src-tauri` : application Windows (Tauri 2), construite par `.github/workflows/windows.yml`.

## Reste à faire à l'étape 1

- Runtime Godot (`crates/godot`, GDExtension) + stand de tir de démonstration qui lit les profils
  `balisim-ammo` (schéma : `schemas/balisim-ammo.schema.json`).
- Calibres de la vague 1 au-delà des 6 de référence (nécessite les poudres réelles de l'étape 2 pour
  rester honnête).
- Remplacer le canvas de la vue en coupe par PixiJS si le nombre de particules l'exige.
