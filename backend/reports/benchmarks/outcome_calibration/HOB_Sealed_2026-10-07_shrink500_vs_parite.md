# Calibration sur resultats reels : HOB (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-07
- Donnees 17Lands : `game_data_public.HOB.Sealed.csv.gz` (mise a jour Thu, 01 Oct 2026 13:16:56 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}
- Reference `parite` (toutes les sections ci-dessous sauf la comparaison) : poids prod, reglages `{"multicolor":{"deficitFactor":3.5,"deficitMaxFactor":0,"earlyFloorFactor":4.5,"midFloorFactor":2.8}}`

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 169 cartes (>= 200 parties) : correlation brute 0.87, **corrigee du bruit 0.89**, ecart reel par carte 1.81 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 13913 decks, 59125 parties, WR moyen 57.1 %.
- A niveau de joueur egal, +10 pts de score = WR 57.1 % -> **60.6 %** toutes paires confondues, **60.7 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.79 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat shrink500 vs parite

| Mesure | parite | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64323 | 0.64328 |
| AUC niveau + score (CV) | 0.6515 | 0.6514 |
| WR +10 pts de score, toutes paires | 60.6 % | 60.7 % |
| WR +10 pts de score, intra-paire | 60.7 % | 60.7 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.6 pt | +7.6 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +9.7 pt | +9.6 pt |

Ecart de log-loss apparie (candidat - parite) : +0.000048, IC 95 % [+0.000036 ; +0.000061] (bootstrap sur les events). **le candidat predit moins bien**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 1589 decks a 3 couleurs principales (11.4 %), score moyen 57.9 contre 67.8 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+2.6 pts** de plus (IC 95 % [-0.8 ; +5.4], non significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +2.6 pts (IC 95 % [-0.7 ; +5.5]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6831 | 0.5000 |
| niveau joueur seul | 0.6449 | 0.6470 |
| score prod seul | 0.6778 | 0.5599 |
| niveau + score prod | 0.6432 | 0.6515 |
| niveau + 4 axes (poids refits) | 0.6428 | 0.6525 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.9 % (3018) | 35.7 % (2658) | 37.1 % (2538) | 39.1 % (2252) | 43.6 % (1863) |
| 0.48 - 0.60 | 50.3 % (3657) | 53.7 % (4056) | 54.9 % (4328) | 57.1 % (4123) | 57.9 % (4220) |
| niveau >= 0.60 | 62.5 % (3503) | 64.5 % (4273) | 66.9 % (4968) | 69.1 % (6146) | 72.2 % (7522) |

Bornes de score des quintiles : 59.5, 65.2, 69.7, 74.1

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 53.9 | 36.2 | 69.3 | 0.0 % | 0.0 % |
| synergyNormalized | 73.9 | 50.0 | 92.7 | 4.8 % | 0.0 % |
| consistencyScore | 77.2 | 48.3 | 94.5 | 0.2 % | 0.1 % |
| curveScore | 71.1 | 52.0 | 87.8 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.985 | +1.00 | 1.00 |
| synergyNormalized | +0.114 | +0.12 | 0.50 |
| consistencyScore | +0.301 | +0.31 | 0.65 |
| curveScore | +0.097 | +0.10 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| BR | 4553 | 60.2 % | 58.5 % | +1.7 pt | 72.4 | 62.5 |
| BG | 2872 | 57.0 % | 57.1 % | -0.1 pt | 64.6 | 44.6 |
| RW | 1875 | 57.3 % | 56.8 % | +0.5 pt | 69.7 | 56.7 |
| UW | 872 | 51.4 % | 53.6 % | -2.2 pt | 64.9 | 46.2 |
| GU | 679 | 49.4 % | 53.7 % | -4.3 pt | 56.8 | 33.3 |
| BGR | 406 | 55.8 % | 56.2 % | -0.3 pt | 59.1 | 55.8 |
| BU | 397 | 57.6 % | 59.1 % | -1.5 pt | 64.1 | 57.5 |
| BW | 387 | 61.0 % | 59.4 % | +1.6 pt | 70.3 | 63.0 |
| GR | 365 | 52.0 % | 55.2 % | -3.2 pt | 59.0 | 45.4 |
| BRW | 315 | 55.2 % | 54.8 % | +0.4 pt | 62.5 | 65.8 |
| BGU | 226 | 48.1 % | 51.4 % | -3.4 pt | 51.4 | 42.5 |
| RUW | 207 | 49.9 % | 54.0 % | -4.1 pt | 59.5 | 58.9 |
| GW | 166 | 56.7 % | 56.6 % | +0.1 pt | 59.2 | 40.7 |
| GUW | 151 | 49.4 % | 54.4 % | -5.0 pt | 54.6 | 47.2 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
