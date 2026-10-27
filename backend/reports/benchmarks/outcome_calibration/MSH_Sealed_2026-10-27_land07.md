# Calibration sur resultats reels : MSH (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-27
- Donnees 17Lands : `game_data_public.MSH.Sealed.csv.gz` (mise a jour Mon, 27 Jul 2026 18:11:25 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 251 cartes (>= 200 parties) : correlation brute 0.88, **corrigee du bruit 0.92**, ecart reel par carte 1.58 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 12019 decks, 52062 parties, WR moyen 57.9 %.
- A niveau de joueur egal, +10 pts de score = WR 57.9 % -> **61.1 %** toutes paires confondues, **61.5 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.26 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat land07 vs prod

| Mesure | prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64316 | 0.64321 |
| AUC niveau + score (CV) | 0.6467 | 0.6466 |
| WR +10 pts de score, toutes paires | 61.1 % | 61.1 % |
| WR +10 pts de score, intra-paire | 61.5 % | 61.5 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.2 pt | +7.4 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +8.3 pt | +8.3 pt |

Ecart de log-loss apparie (candidat - prod) : +0.000048, IC 95 % [+0.000004 ; +0.000090] (bootstrap sur les events). **le candidat predit moins bien**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 3647 decks a 3 couleurs principales (30.3 %), score moyen 70.1 contre 72.6 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **-0.4 pts** de plus (IC 95 % [-2.7 ; +1.9], non significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : -1.3 pts (IC 95 % [-3.7 ; +1.0]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6807 | 0.5000 |
| niveau joueur seul | 0.6443 | 0.6430 |
| score prod seul | 0.6749 | 0.5621 |
| niveau + score prod | 0.6432 | 0.6467 |
| niveau + 4 axes (poids refits) | 0.6430 | 0.6474 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.5 % (2645) | 37.3 % (2221) | 38.8 % (1985) | 40.1 % (1434) | 41.3 % (1161) |
| 0.48 - 0.60 | 51.5 % (3494) | 53.3 % (3424) | 54.4 % (3454) | 55.9 % (3680) | 58.7 % (3317) |
| niveau >= 0.60 | 63.0 % (3098) | 63.8 % (3963) | 66.8 % (5069) | 68.8 % (5828) | 71.4 % (7289) |

Bornes de score des quintiles : 65.2, 70.2, 74.3, 78.7

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 64.9 | 42.2 | 86.8 | 1.6 % | 0.0 % |
| synergyNormalized | 58.9 | 33.9 | 79.3 | 0.3 % | 0.0 % |
| consistencyScore | 88.6 | 74.6 | 98.9 | 5.1 % | 0.0 % |
| curveScore | 76.7 | 59.2 | 90.2 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.639 | +1.00 | 1.00 |
| synergyNormalized | +0.030 | +0.05 | 0.50 |
| consistencyScore | +0.442 | +0.69 | 0.65 |
| curveScore | +0.172 | +0.27 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| UW | 2064 | 61.7 % | 60.0 % | +1.8 pt | 77.7 | 80.5 |
| GW | 1280 | 60.1 % | 59.2 % | +0.9 pt | 70.7 | 61.4 |
| BW | 875 | 59.8 % | 59.2 % | +0.6 pt | 75.0 | 68.9 |
| BU | 874 | 56.6 % | 58.3 % | -1.7 pt | 75.5 | 69.3 |
| BR | 725 | 53.4 % | 55.5 % | -2.1 pt | 67.3 | 43.6 |
| RW | 700 | 59.8 % | 58.4 % | +1.3 pt | 69.9 | 56.7 |
| GUW | 601 | 55.2 % | 56.6 % | -1.4 pt | 71.9 | 73.1 |
| GU | 518 | 57.6 % | 58.0 % | -0.4 pt | 70.8 | 63.2 |
| BG | 500 | 56.6 % | 57.1 % | -0.5 pt | 70.4 | 52.5 |
| BUW | 465 | 58.4 % | 58.2 % | +0.3 pt | 73.9 | 79.1 |
| GRW | 453 | 54.9 % | 55.8 % | -0.9 pt | 67.1 | 59.7 |
| GR | 418 | 55.7 % | 56.3 % | -0.5 pt | 62.2 | 38.1 |
| RU | 395 | 53.0 % | 56.1 % | -3.2 pt | 70.3 | 56.7 |
| BGR | 349 | 53.5 % | 54.3 % | -0.9 pt | 66.6 | 51.2 |
| BGW | 321 | 59.0 % | 58.2 % | +0.8 pt | 72.2 | 68.2 |
| BRW | 306 | 56.8 % | 55.8 % | +1.0 pt | 68.4 | 61.8 |
| RUW | 287 | 56.4 % | 57.0 % | -0.6 pt | 72.0 | 73.8 |
| BGU | 249 | 53.7 % | 54.8 % | -1.2 pt | 70.6 | 65.5 |
| BRU | 233 | 51.6 % | 55.5 % | -4.0 pt | 69.2 | 62.1 |
| GRU | 174 | 55.1 % | 55.2 % | -0.1 pt | 66.5 | 59.3 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
