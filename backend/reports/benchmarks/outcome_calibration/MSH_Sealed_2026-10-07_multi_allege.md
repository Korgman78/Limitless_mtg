# Calibration sur resultats reels : MSH (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-07
- Donnees 17Lands : `game_data_public.MSH.Sealed.csv.gz` (mise a jour Mon, 27 Jul 2026 18:11:25 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 251 cartes (>= 200 parties) : correlation brute 0.88, **corrigee du bruit 0.92**, ecart reel par carte 1.58 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 12019 decks, 52062 parties, WR moyen 57.9 %.
- A niveau de joueur egal, +10 pts de score = WR 57.9 % -> **60.6 %** toutes paires confondues, **61.0 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.28 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat multi_allege vs prod

| Mesure | Prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64331 | 0.64323 |
| AUC niveau + score (CV) | 0.6463 | 0.6465 |
| WR +10 pts de score, toutes paires | 60.6 % | 61.0 % |
| WR +10 pts de score, intra-paire | 61.0 % | 61.4 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +6.7 pt | +7.6 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +9.6 pt | +9.3 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000078, IC 95 % [-0.000140 ; -0.000013] (bootstrap sur les events). **le candidat predit mieux**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 3647 decks a 3 couleurs principales (30.3 %), score moyen 64.5 contre 70.5 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+2.8 pts** de plus (IC 95 % [+0.3 ; +5.4], significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +0.9 pts (IC 95 % [-1.3 ; +3.4]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6807 | 0.5000 |
| niveau joueur seul | 0.6443 | 0.6430 |
| score prod seul | 0.6757 | 0.5577 |
| niveau + score prod | 0.6433 | 0.6463 |
| niveau + 4 axes (poids refits) | 0.6431 | 0.6472 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.6 % (2476) | 37.2 % (2178) | 39.2 % (2047) | 39.2 % (1499) | 40.8 % (1246) |
| 0.48 - 0.60 | 51.8 % (3532) | 53.0 % (3454) | 54.7 % (3487) | 55.9 % (3590) | 58.5 % (3306) |
| niveau >= 0.60 | 62.3 % (3140) | 65.3 % (4148) | 67.4 % (5086) | 67.2 % (5681) | 71.9 % (7192) |

Bornes de score des quintiles : 61.5, 67.1, 71.6, 76.1

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 62.5 | 40.8 | 83.0 | 0.5 % | 0.0 % |
| synergyNormalized | 58.8 | 33.7 | 79.2 | 0.3 % | 0.0 % |
| consistencyScore | 79.6 | 49.9 | 98.8 | 4.5 % | 0.2 % |
| curveScore | 76.7 | 59.2 | 90.2 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.654 | +1.00 | 1.00 |
| synergyNormalized | +0.037 | +0.06 | 0.50 |
| consistencyScore | +0.206 | +0.32 | 0.65 |
| curveScore | +0.172 | +0.26 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| UW | 2064 | 61.7 % | 60.0 % | +1.8 pt | 75.5 | 78.2 |
| GW | 1280 | 60.1 % | 59.2 % | +0.9 pt | 68.7 | 59.9 |
| BW | 875 | 59.8 % | 59.2 % | +0.6 pt | 72.8 | 66.2 |
| BU | 874 | 56.6 % | 58.3 % | -1.7 pt | 73.0 | 66.4 |
| BR | 725 | 53.4 % | 55.5 % | -2.1 pt | 65.2 | 41.0 |
| RW | 700 | 59.8 % | 58.4 % | +1.3 pt | 68.2 | 55.0 |
| GUW | 601 | 55.2 % | 56.6 % | -1.4 pt | 66.9 | 70.8 |
| GU | 518 | 57.6 % | 58.0 % | -0.4 pt | 68.9 | 61.4 |
| BG | 500 | 56.6 % | 57.1 % | -0.5 pt | 68.2 | 50.1 |
| BUW | 465 | 58.4 % | 58.2 % | +0.3 pt | 67.6 | 76.2 |
| GRW | 453 | 54.9 % | 55.8 % | -0.9 pt | 62.5 | 57.5 |
| GR | 418 | 55.7 % | 56.3 % | -0.5 pt | 60.5 | 36.2 |
| RU | 395 | 53.0 % | 56.1 % | -3.2 pt | 68.4 | 54.5 |
| BGR | 349 | 53.5 % | 54.3 % | -0.9 pt | 62.0 | 48.0 |
| BGW | 321 | 59.0 % | 58.2 % | +0.8 pt | 67.4 | 65.8 |
| BRW | 306 | 56.8 % | 55.8 % | +1.0 pt | 62.1 | 59.1 |
| RUW | 287 | 56.4 % | 57.0 % | -0.6 pt | 66.1 | 71.2 |
| BGU | 249 | 53.7 % | 54.8 % | -1.2 pt | 65.5 | 63.1 |
| BRU | 233 | 51.6 % | 55.5 % | -4.0 pt | 63.2 | 59.1 |
| GRU | 174 | 55.1 % | 55.2 % | -0.1 pt | 61.6 | 56.5 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
