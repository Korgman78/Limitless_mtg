# Calibration sur resultats reels : FRA (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-23
- Donnees 17Lands : `game_data_public.FRA.Sealed.csv.gz` (mise a jour Mon, 19 Oct 2026 16:20:07 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 253 cartes (>= 200 parties) : correlation brute 0.92, **corrigee du bruit 0.95**, ecart reel par carte 1.34 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 15205 decks, 60191 parties, WR moyen 56.5 %.
- A niveau de joueur egal, +10 pts de score = WR 56.5 % -> **59.2 %** toutes paires confondues, **60.3 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.41 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat multi_leger vs prod

| Mesure | prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64385 | 0.64378 |
| AUC niveau + score (CV) | 0.6529 | 0.6531 |
| WR +10 pts de score, toutes paires | 59.2 % | 59.5 % |
| WR +10 pts de score, intra-paire | 60.3 % | 60.7 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +6.8 pt | +6.7 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +7.4 pt | +8.3 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000074, IC 95 % [-0.000128 ; -0.000022] (bootstrap sur les events). **le candidat predit mieux**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 5862 decks a 3 couleurs principales (38.6 %), score moyen 66.3 contre 71.2 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+4.3 pts** de plus (IC 95 % [+1.9 ; +6.4], significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +2.1 pts (IC 95 % [-0.2 ; +4.1]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6848 | 0.5000 |
| niveau joueur seul | 0.6447 | 0.6504 |
| score prod seul | 0.6805 | 0.5523 |
| niveau + score prod | 0.6439 | 0.6529 |
| niveau + 4 axes (poids refits) | 0.6435 | 0.6539 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 35.5 % (3594) | 37.1 % (3020) | 36.9 % (2634) | 38.6 % (2453) | 42.3 % (2198) |
| 0.48 - 0.60 | 51.3 % (3947) | 53.5 % (4180) | 55.2 % (4246) | 55.7 % (4422) | 58.1 % (4378) |
| niveau >= 0.60 | 64.0 % (3149) | 65.9 % (3975) | 67.4 % (5047) | 68.9 % (5845) | 71.4 % (7103) |

Bornes de score des quintiles : 62.5, 67.3, 71.5, 76.3

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 66.5 | 42.9 | 90.5 | 3.6 % | 0.0 % |
| synergyNormalized | 70.0 | 57.8 | 80.8 | 0.0 % | 0.0 % |
| consistencyScore | 71.5 | 42.8 | 93.2 | 0.2 % | 0.2 % |
| curveScore | 71.4 | 50.8 | 87.8 | 0.0 % | 0.1 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.588 | +1.00 | 1.00 |
| synergyNormalized | +0.390 | +0.66 | 0.50 |
| consistencyScore | +0.170 | +0.29 | 0.65 |
| curveScore | -0.024 | -0.04 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| GR | 1299 | 55.0 % | 55.4 % | -0.4 pt | 67.2 | 53.3 |
| BU | 1286 | 57.8 % | 57.5 % | +0.3 pt | 79.5 | 84.9 |
| UW | 1232 | 59.0 % | 57.3 % | +1.7 pt | 74.5 | 70.1 |
| GW | 1169 | 55.7 % | 55.8 % | -0.1 pt | 64.7 | 46.8 |
| BR | 940 | 55.1 % | 56.3 % | -1.2 pt | 70.5 | 56.0 |
| BGR | 920 | 57.1 % | 56.9 % | +0.2 pt | 66.9 | 70.2 |
| BG | 872 | 57.9 % | 57.8 % | +0.1 pt | 72.6 | 69.2 |
| RU | 832 | 57.1 % | 57.8 % | -0.7 pt | 74.3 | 71.4 |
| BUW | 774 | 57.3 % | 55.7 % | +1.6 pt | 69.6 | 79.0 |
| GRW | 705 | 52.9 % | 54.3 % | -1.3 pt | 61.7 | 55.5 |
| BRU | 579 | 57.4 % | 57.0 % | +0.4 pt | 70.3 | 81.2 |
| BW | 575 | 57.0 % | 56.3 % | +0.7 pt | 68.6 | 55.4 |
| RW | 575 | 57.2 % | 57.2 % | +0.0 pt | 65.8 | 45.9 |
| BGU | 549 | 56.7 % | 56.9 % | -0.2 pt | 69.5 | 83.5 |
| GU | 547 | 56.8 % | 57.3 % | -0.5 pt | 71.3 | 74.8 |
| BGW | 509 | 54.5 % | 54.5 % | +0.0 pt | 62.6 | 62.2 |
| GRU | 465 | 56.3 % | 56.9 % | -0.6 pt | 68.7 | 77.6 |
| RUW | 459 | 57.0 % | 56.5 % | +0.5 pt | 67.3 | 70.4 |
| GUW | 387 | 54.5 % | 55.0 % | -0.5 pt | 64.3 | 68.2 |
| BRW | 265 | 50.8 % | 52.2 % | -1.4 pt | 60.9 | 59.9 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
