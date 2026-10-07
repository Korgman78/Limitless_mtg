# Calibration sur resultats reels : MSH (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-07
- Donnees 17Lands : `game_data_public.MSH.Sealed.csv.gz` (mise a jour Mon, 27 Jul 2026 18:11:25 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 251 cartes (>= 200 parties) : correlation brute 0.88, **corrigee du bruit 0.92**, ecart reel par carte 1.58 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 12019 decks, 52062 parties, WR moyen 57.9 %.
- A niveau de joueur egal, +10 pts de score = WR 57.9 % -> **60.9 %** toutes paires confondues, **61.3 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.28 (proche de +1 = le score classe bien les paires).

## Decks tricolores

- 3647 decks a 3 couleurs principales (30.3 %), score moyen 67.2 contre 71.8 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+1.6 pts** de plus (IC 95 % [-0.7 ; +4.1], non significatif). Positif = le score sous-note les tricolores.

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6807 | 0.5000 |
| niveau joueur seul | 0.6443 | 0.6430 |
| score prod seul | 0.6752 | 0.5605 |
| niveau + score prod | 0.6432 | 0.6466 |
| niveau + 4 axes (poids refits) | 0.6430 | 0.6474 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.1 % (2573) | 36.8 % (2106) | 40.0 % (2118) | 39.5 % (1419) | 41.0 % (1230) |
| 0.48 - 0.60 | 51.7 % (3502) | 53.0 % (3485) | 54.4 % (3383) | 55.7 % (3698) | 59.1 % (3301) |
| niveau >= 0.60 | 62.3 % (3053) | 64.9 % (4124) | 67.2 % (5010) | 68.2 % (5812) | 71.4 % (7248) |

Bornes de score des quintiles : 63.4, 68.8, 73.1, 77.8

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 64.9 | 42.2 | 86.8 | 1.6 % | 0.0 % |
| synergyNormalized | 58.8 | 33.7 | 79.2 | 0.3 % | 0.0 % |
| consistencyScore | 83.0 | 59.3 | 98.8 | 4.5 % | 0.0 % |
| curveScore | 76.7 | 59.2 | 90.2 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.643 | +1.00 | 1.00 |
| synergyNormalized | +0.034 | +0.05 | 0.50 |
| consistencyScore | +0.264 | +0.41 | 0.65 |
| curveScore | +0.171 | +0.27 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| UW | 2064 | 61.7 % | 60.0 % | +1.8 pt | 76.9 | 80.5 |
| GW | 1280 | 60.1 % | 59.2 % | +0.9 pt | 69.9 | 61.4 |
| BW | 875 | 59.8 % | 59.2 % | +0.6 pt | 74.3 | 68.9 |
| BU | 874 | 56.6 % | 58.3 % | -1.7 pt | 74.7 | 69.3 |
| BR | 725 | 53.4 % | 55.5 % | -2.1 pt | 66.6 | 43.6 |
| RW | 700 | 59.8 % | 58.4 % | +1.3 pt | 69.3 | 56.7 |
| GUW | 601 | 55.2 % | 56.6 % | -1.4 pt | 69.2 | 73.1 |
| GU | 518 | 57.6 % | 58.0 % | -0.4 pt | 70.1 | 63.2 |
| BG | 500 | 56.6 % | 57.1 % | -0.5 pt | 69.6 | 52.5 |
| BUW | 465 | 58.4 % | 58.2 % | +0.3 pt | 70.6 | 79.1 |
| GRW | 453 | 54.9 % | 55.8 % | -0.9 pt | 64.7 | 59.7 |
| GR | 418 | 55.7 % | 56.3 % | -0.5 pt | 61.6 | 38.1 |
| RU | 395 | 53.0 % | 56.1 % | -3.2 pt | 69.6 | 56.7 |
| BGR | 349 | 53.5 % | 54.3 % | -0.9 pt | 64.4 | 51.2 |
| BGW | 321 | 59.0 % | 58.2 % | +0.8 pt | 69.7 | 68.2 |
| BRW | 306 | 56.8 % | 55.8 % | +1.0 pt | 65.1 | 61.8 |
| RUW | 287 | 56.4 % | 57.0 % | -0.6 pt | 68.9 | 73.8 |
| BGU | 249 | 53.7 % | 54.8 % | -1.2 pt | 67.9 | 65.5 |
| BRU | 233 | 51.6 % | 55.5 % | -4.0 pt | 66.1 | 62.1 |
| GRU | 174 | 55.1 % | 55.2 % | -0.1 pt | 64.1 | 59.3 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
