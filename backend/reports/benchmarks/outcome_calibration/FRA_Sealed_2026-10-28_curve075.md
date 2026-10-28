# Calibration sur resultats reels : FRA (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-28
- Donnees 17Lands : `game_data_public.FRA.Sealed.csv.gz` (mise a jour Mon, 19 Oct 2026 16:20:07 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 255 cartes (>= 200 parties) : correlation brute 0.92, **corrigee du bruit 0.95**, ecart reel par carte 1.34 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 15205 decks, 60191 parties, WR moyen 56.5 %.
- A niveau de joueur egal, +10 pts de score = WR 56.5 % -> **59.7 %** toutes paires confondues, **60.7 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.43 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat curve075 vs prod

| Mesure | prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64366 | 0.64358 |
| AUC niveau + score (CV) | 0.6535 | 0.6537 |
| WR +10 pts de score, toutes paires | 59.7 % | 59.8 % |
| WR +10 pts de score, intra-paire | 60.7 % | 60.9 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.6 pt | +8.1 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +8.5 pt | +9.0 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000083, IC 95 % [-0.000112 ; -0.000053] (bootstrap sur les events). **le candidat predit mieux**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 5862 decks a 3 couleurs principales (38.6 %), score moyen 69.7 contre 72.3 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+2.0 pts** de plus (IC 95 % [-0.2 ; +3.8], non significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +1.9 pts (IC 95 % [-0.2 ; +3.7]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6848 | 0.5000 |
| niveau joueur seul | 0.6447 | 0.6504 |
| score prod seul | 0.6798 | 0.5564 |
| niveau + score prod | 0.6437 | 0.6535 |
| niveau + 4 axes (poids refits) | 0.6434 | 0.6541 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 35.1 % (3652) | 36.8 % (2923) | 36.8 % (2630) | 39.3 % (2610) | 42.8 % (2084) |
| 0.48 - 0.60 | 51.4 % (4001) | 53.6 % (4201) | 54.9 % (4248) | 54.8 % (4255) | 59.0 % (4468) |
| niveau >= 0.60 | 63.4 % (2942) | 65.2 % (4146) | 67.6 % (5078) | 68.8 % (5768) | 71.8 % (7185) |

Bornes de score des quintiles : 65.0, 69.5, 73.3, 77.8

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 65.3 | 41.9 | 89.0 | 2.9 % | 0.0 % |
| synergyNormalized | 70.5 | 58.2 | 81.6 | 0.1 % | 0.0 % |
| consistencyScore | 81.1 | 61.5 | 96.3 | 1.0 % | 0.0 % |
| curveScore | 71.4 | 50.8 | 87.7 | 0.0 % | 0.1 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.609 | +1.00 | 1.00 |
| synergyNormalized | +0.402 | +0.66 | 0.50 |
| consistencyScore | +0.256 | +0.42 | 0.65 |
| curveScore | -0.006 | -0.01 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| GR | 1299 | 55.0 % | 55.4 % | -0.4 pt | 68.4 | 51.5 |
| BU | 1286 | 57.8 % | 57.5 % | +0.3 pt | 80.1 | 83.6 |
| UW | 1232 | 59.0 % | 57.3 % | +1.7 pt | 75.5 | 69.9 |
| GW | 1169 | 55.7 % | 55.8 % | -0.1 pt | 66.3 | 46.1 |
| BR | 940 | 55.1 % | 56.3 % | -1.2 pt | 71.3 | 54.2 |
| BGR | 920 | 57.1 % | 56.9 % | +0.2 pt | 70.1 | 68.3 |
| BG | 872 | 57.9 % | 57.8 % | +0.1 pt | 74.0 | 68.0 |
| RU | 832 | 57.1 % | 57.8 % | -0.7 pt | 74.7 | 69.7 |
| BUW | 774 | 57.3 % | 55.7 % | +1.6 pt | 72.7 | 78.3 |
| GRW | 705 | 52.9 % | 54.3 % | -1.3 pt | 65.3 | 54.2 |
| BRU | 579 | 57.4 % | 57.0 % | +0.4 pt | 73.0 | 79.6 |
| BW | 575 | 57.0 % | 56.3 % | +0.7 pt | 69.8 | 55.1 |
| RW | 575 | 57.2 % | 57.2 % | +0.0 pt | 67.0 | 45.4 |
| BGU | 549 | 56.7 % | 56.9 % | -0.2 pt | 73.2 | 82.0 |
| GU | 547 | 56.8 % | 57.3 % | -0.5 pt | 72.7 | 73.2 |
| BGW | 509 | 54.5 % | 54.5 % | +0.0 pt | 66.4 | 61.4 |
| GRU | 465 | 56.3 % | 56.9 % | -0.6 pt | 71.8 | 75.4 |
| RUW | 459 | 57.0 % | 56.5 % | +0.5 pt | 70.0 | 69.8 |
| GUW | 387 | 54.5 % | 55.0 % | -0.5 pt | 68.4 | 67.3 |
| BRW | 265 | 50.8 % | 52.2 % | -1.4 pt | 64.6 | 59.0 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
