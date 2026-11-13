# BALISIM

Simulateur balistique libre : de la percussion de l'amorce jusqu'à l'impact sur la cible.
Ludique à l'écran, rigoureux dans les calculs.

- **Version web** (rien à installer) : https://kitcut40.github.io/balisim/
- **Windows** : onglet *Releases* (installateur ou version portable `.exe`)

> ⚠️ Données indicatives issues d'une simulation. Pour le rechargement réel, suivez toujours
> les guides des fabricants et commencez aux charges de départ.

## Ce que ça fait

| Étape | Modèle |
| --- | --- |
| Dans le canon | Thermodynamique à paramètres globaux (Noble-Abel / Résal), combustion de Vieille avec forme des grains, gradient de Lagrange, décollement, frottement, pertes thermiques, fuites de gaz. Mode **haute/basse pression** (cartouche à blanc + chambre + projectile) pour les lanceurs 40 mm. |
| En vol | Point matériel 3D : traînée G1 / G7, sphères lisses ou alvéolées selon le nombre de Reynolds (crise de traînée), cylindre nez rond, effet Magnus (hop-up), vent, Coriolis, stabilité gyroscopique (Miller), dérive gyroscopique (Litz). |
| À l'impact | Énergie, vitesse, quantité de mouvement, J/cm², critère de choc de Sturdivan (non létal), dégâts pour le jeu. |

Modes simplifié et avancé, français / anglais, unités métriques ou impériales, vue en coupe animée,
jauges, trajectoire, graphiques, comparaison de tirs, export de profils de munition pour les jeux vidéo.

## Précision (suite de validation)

| Munition | Vitesse simulée | Référence publique |
| --- | --- | --- |
| 9×19, 8,0 g, canon 102 mm | 356 m/s | 350–365 m/s |
| .45 ACP, 14,9 g, 127 mm | 248 m/s | 250–260 m/s |
| .22 LR, 2,6 g, 508 mm | 368 m/s | 370–390 m/s |
| .223 Rem, 4,0 g, 508 mm | 968 m/s | 940–990 m/s |
| 7,62×39, 7,9 g, 415 mm | 698 m/s | 715–730 m/s |
| .308 Win, 9,7 g, 610 mm | 837 m/s | 830–860 m/s |

Les poudres actuelles sont des **classes génériques** calibrées sur ces références. Les vraies poudres
du commerce (Vihtavuori, Vectan, Hodgdon…) arrivent à l'étape 2.

## Structure

```
crates/core/       moteur physique (Rust) + suite de validation (tests/)
crates/wasm/       liaison WebAssembly pour l'interface
crates/devbridge/  outil de développement (moteur natif pour `npm run dev`)
app/               interface React + Vite ; app/src-tauri = application Windows
data/library.json  poudres et munitions prédéfinies
schemas/           format des profils exportés pour les jeux
docs/              documentation des modèles
```

## Développer

```bash
cargo test -p balisim-core --release -- --nocapture   # validation
cargo build --release -p balisim-devbridge            # moteur natif pour le mode dev
cd app && npm install && npm run dev                  # http://localhost:5173
```

Les builds web et Windows sont faits automatiquement par GitHub Actions à chaque envoi sur `main`.

Licence : MIT.
