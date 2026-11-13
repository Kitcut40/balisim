# Modèles physiques de BALISIM (étape 1)

## Balistique intérieure (`crates/core/src/interior.rs`)

État : fraction de toile brûlée Z, masse et énergie interne des gaz dans la chambre haute (et basse en mode
haute/basse pression), course x et vitesse v du projectile. Intégration Runge-Kutta 4 à pas adaptatif.

- Équation d'état de Noble-Abel : P (V − η m) = (γ − 1) U.
- Combustion : r = β · P^α (loi de Vieille), dZ/dt = r / (e/2), ψ(Z) = χ Z (1 + λ Z + μ Z²).
- Énergie libérée : F / (γ − 1) par kg brûlé, réduite des pertes thermiques.
- Travail sur le projectile : P_moy · A · v ; pression au culot par la correction de Lagrange
  P_culot = P_moy / (1 + m_gaz / 3 m_p).
- Décollement : le projectile part quand P_culot − P_atm dépasse la pression de décollement.
- Haute/basse pression : écoulement isentropique sonique ou subsonique par l'orifice, après ouverture du
  sertissage. Fuites : orifice équivalent vers l'atmosphère.

Références : Vinti, *The Equations of Interior Ballistics*, BRL Report 307 (1942) ; AMCP 706-150,
*Interior Ballistics of Guns* (1965).

## Balistique extérieure (`crates/core/src/exterior.rs`, `drag.rs`)

Point matériel 3D (x vers la cible, y vers le haut, z vers la droite). Forces : gravité, traînée sur la
vitesse relative à l'air (vent 3D), portance de Magnus pour les sphères en rotation (coefficient de
Sawicki-Hubbard-Stronge, estimé), Coriolis.

- G1 / G7 : Cd = Cd_ref(Mach) × densité sectionnelle / BC.
- Sphères : Cd(Re) lisse (crise vers Re ≈ 3·10⁵) ou alvéolée (crise vers Re ≈ 5–8·10⁴), mêlé au Cd
  compressible au-delà de Mach 0,4.
- Cylindre nez rond (40 mm) : table Cd(Mach) estimée ; nez alvéolé : facteur estimé dans la fenêtre de
  Reynolds critique (aucune donnée publiée pour cette forme).
- Stabilité : règle de Miller (corrigée vitesse, température, pression). Sg < 1 → le projectile culbute
  (Cd ≈ 1). Dérive gyroscopique de Litz, uniquement pour les balles (G1/G7).

## Balistique terminale (`terminal.rs`)

Énergie, quantité de mouvement, densité d'énergie. Impacts non pénétrants : critère de Sturdivan
BC = ln(E / (W^⅓ · T · D)) avec W = 70 kg, T = 2 cm (estimés). Les dégâts « jeu » sont une règle
documentée, pas une donnée médicale.
