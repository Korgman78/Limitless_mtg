# Calibration sur resultats reels : MSH (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-07
- Donnees 17Lands : `game_data_public.MSH.Sealed.csv.gz` (mise a jour Mon, 27 Jul 2026 18:11:25 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}
- Reference `parite` (toutes les sections ci-dessous sauf la comparaison) : poids prod, reglages `{"multicolor":{"deficitFactor":3.5,"deficitMaxFactor":0,"earlyFloorFactor":4.5,"midFloorFactor":2.8}}`

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 251 cartes (>= 200 parties) : correlation brute 0.88, **corrigee du bruit 0.92**, ecart reel par carte 1.58 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 12019 decks, 52062 parties, WR moyen 57.9 %.
- A niveau de joueur egal, +10 pts de score = WR 57.9 % -> **60.8 %** toutes paires confondues, **61.3 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.29 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat bomb_linear vs parite

| Mesure | parite | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64326 | 0.64319 |
| AUC niveau + score (CV) | 0.6464 | 0.6466 |
| WR +10 pts de score, toutes paires | 60.8 % | 60.9 % |
| WR +10 pts de score, intra-paire | 61.3 % | 61.3 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.1 pt | +7.4 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +9.2 pt | +9.1 pt |

Ecart de log-loss apparie (candidat - parite) : -0.000076, IC 95 % [-0.000113 ; -0.000043] (bootstrap sur les events). **le candidat predit mieux**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 3647 decks a 3 couleurs principales (30.3 %), score moyen 66.2 contre 71.0 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+1.8 pts** de plus (IC 95 % [-0.6 ; +4.3], non significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +1.6 pts (IC 95 % [-0.7 ; +4.1]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6807 | 0.5000 |
| niveau joueur seul | 0.6443 | 0.6430 |
| score prod seul | 0.6753 | 0.5595 |
| niveau + score prod | 0.6433 | 0.6464 |
| niveau + 4 axes (poids refits) | 0.6431 | 0.6472 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.6 % (2569) | 37.1 % (2136) | 39.5 % (2058) | 39.1 % (1465) | 41.1 % (1218) |
| 0.48 - 0.60 | 51.7 % (3509) | 53.1 % (3480) | 54.5 % (3494) | 55.9 % (3648) | 58.8 % (3238) |
| niveau >= 0.60 | 62.6 % (3081) | 64.8 % (4183) | 67.1 % (4912) | 67.6 % (5774) | 71.8 % (7297) |

Bornes de score des quintiles : 62.6, 68.0, 72.2, 76.7

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 62.5 | 40.8 | 83.0 | 0.5 % | 0.0 % |
| synergyNormalized | 58.8 | 33.7 | 79.2 | 0.3 % | 0.0 % |
| consistencyScore | 83.0 | 59.3 | 98.8 | 4.5 % | 0.0 % |
| curveScore | 76.7 | 59.2 | 90.2 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.654 | +1.00 | 1.00 |
| synergyNormalized | +0.036 | +0.06 | 0.50 |
| consistencyScore | +0.256 | +0.39 | 0.65 |
| curveScore | +0.171 | +0.26 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| UW | 2064 | 61.7 % | 60.0 % | +1.8 pt | 76.0 | 78.2 |
| GW | 1280 | 60.1 % | 59.2 % | +0.9 pt | 69.3 | 59.9 |
| BW | 875 | 59.8 % | 59.2 % | +0.6 pt | 73.3 | 66.2 |
| BU | 874 | 56.6 % | 58.3 % | -1.7 pt | 73.6 | 66.4 |
| BR | 725 | 53.4 % | 55.5 % | -2.1 pt | 65.7 | 41.0 |
| RW | 700 | 59.8 % | 58.4 % | +1.3 pt | 68.6 | 55.0 |
| GUW | 601 | 55.2 % | 56.6 % | -1.4 pt | 68.4 | 70.8 |
| GU | 518 | 57.6 % | 58.0 % | -0.4 pt | 69.4 | 61.4 |
| BG | 500 | 56.6 % | 57.1 % | -0.5 pt | 68.7 | 50.1 |
| BUW | 465 | 58.4 % | 58.2 % | +0.3 pt | 69.5 | 76.2 |
| GRW | 453 | 54.9 % | 55.8 % | -0.9 pt | 63.9 | 57.5 |
| GR | 418 | 55.7 % | 56.3 % | -0.5 pt | 60.8 | 36.2 |
| RU | 395 | 53.0 % | 56.1 % | -3.2 pt | 68.8 | 54.5 |
| BGR | 349 | 53.5 % | 54.3 % | -0.9 pt | 63.2 | 48.0 |
| BGW | 321 | 59.0 % | 58.2 % | +0.8 pt | 68.8 | 65.8 |
| BRW | 306 | 56.8 % | 55.8 % | +1.0 pt | 64.0 | 59.1 |
| RUW | 287 | 56.4 % | 57.0 % | -0.6 pt | 67.9 | 71.2 |
| BGU | 249 | 53.7 % | 54.8 % | -1.2 pt | 67.0 | 63.1 |
| BRU | 233 | 51.6 % | 55.5 % | -4.0 pt | 64.9 | 59.1 |
| GRU | 174 | 55.1 % | 55.2 % | -0.1 pt | 63.0 | 56.5 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
