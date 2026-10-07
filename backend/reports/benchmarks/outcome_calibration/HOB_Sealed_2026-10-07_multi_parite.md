# Calibration sur resultats reels : HOB (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-07
- Donnees 17Lands : `game_data_public.HOB.Sealed.csv.gz` (mise a jour Thu, 01 Oct 2026 13:16:56 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 169 cartes (>= 200 parties) : correlation brute 0.87, **corrigee du bruit 0.89**, ecart reel par carte 1.81 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 13913 decks, 59125 parties, WR moyen 57.1 %.
- A niveau de joueur egal, +10 pts de score = WR 57.1 % -> **60.4 %** toutes paires confondues, **60.5 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.77 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat multi_parite vs prod

| Mesure | Prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64328 | 0.64323 |
| AUC niveau + score (CV) | 0.6513 | 0.6515 |
| WR +10 pts de score, toutes paires | 60.4 % | 60.6 % |
| WR +10 pts de score, intra-paire | 60.5 % | 60.7 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.4 pt | +7.6 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +9.4 pt | +9.7 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000048, IC 95 % [-0.000089 ; -0.000010] (bootstrap sur les events). **le candidat predit mieux**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 1589 decks a 3 couleurs principales (11.4 %), score moyen 55.5 contre 67.3 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+4.1 pts** de plus (IC 95 % [+0.5 ; +7.1], significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +2.6 pts (IC 95 % [-0.8 ; +5.4]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6831 | 0.5000 |
| niveau joueur seul | 0.6449 | 0.6470 |
| score prod seul | 0.6781 | 0.5581 |
| niveau + score prod | 0.6433 | 0.6513 |
| niveau + 4 axes (poids refits) | 0.6428 | 0.6525 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.6 % (2961) | 35.4 % (2623) | 37.5 % (2581) | 39.1 % (2274) | 43.5 % (1890) |
| 0.48 - 0.60 | 50.4 % (3669) | 53.5 % (4043) | 55.1 % (4298) | 56.9 % (4157) | 57.9 % (4217) |
| niveau >= 0.60 | 62.7 % (3578) | 64.8 % (4292) | 66.8 % (4984) | 69.2 % (6102) | 72.1 % (7456) |

Bornes de score des quintiles : 58.3, 64.5, 69.3, 73.9

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 53.9 | 36.2 | 69.3 | 0.0 % | 0.0 % |
| synergyNormalized | 73.9 | 50.0 | 92.7 | 4.8 % | 0.0 % |
| consistencyScore | 74.4 | 38.3 | 94.5 | 0.2 % | 0.6 % |
| curveScore | 71.1 | 52.0 | 87.8 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.988 | +1.00 | 1.00 |
| synergyNormalized | +0.113 | +0.11 | 0.50 |
| consistencyScore | +0.258 | +0.26 | 0.65 |
| curveScore | +0.100 | +0.10 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| BR | 4553 | 60.2 % | 58.5 % | +1.7 pt | 72.0 | 62.5 |
| BG | 2872 | 57.0 % | 57.1 % | -0.1 pt | 64.1 | 44.6 |
| RW | 1875 | 57.3 % | 56.8 % | +0.5 pt | 69.3 | 56.7 |
| UW | 872 | 51.4 % | 53.6 % | -2.2 pt | 64.6 | 46.2 |
| GU | 679 | 49.4 % | 53.7 % | -4.3 pt | 56.1 | 33.3 |
| BGR | 406 | 55.8 % | 56.2 % | -0.3 pt | 56.8 | 55.8 |
| BU | 397 | 57.6 % | 59.1 % | -1.5 pt | 63.1 | 57.5 |
| BW | 387 | 61.0 % | 59.4 % | +1.6 pt | 69.7 | 63.0 |
| GR | 365 | 52.0 % | 55.2 % | -3.2 pt | 58.4 | 45.4 |
| BRW | 315 | 55.2 % | 54.8 % | +0.4 pt | 60.0 | 65.8 |
| BGU | 226 | 48.1 % | 51.4 % | -3.4 pt | 48.9 | 42.5 |
| RUW | 207 | 49.9 % | 54.0 % | -4.1 pt | 57.0 | 58.9 |
| GW | 166 | 56.7 % | 56.6 % | +0.1 pt | 58.5 | 40.7 |
| GUW | 151 | 49.4 % | 54.4 % | -5.0 pt | 52.2 | 47.2 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
