# Calibration sur resultats reels : FRA (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-27
- Donnees 17Lands : `game_data_public.FRA.Sealed.csv.gz` (mise a jour Mon, 19 Oct 2026 16:20:07 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 255 cartes (>= 200 parties) : correlation brute 0.92, **corrigee du bruit 0.95**, ecart reel par carte 1.35 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 15205 decks, 60191 parties, WR moyen 56.5 %.
- A niveau de joueur egal, +10 pts de score = WR 56.5 % -> **59.7 %** toutes paires confondues, **60.8 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.45 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat land06_parite vs prod

| Mesure | prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64370 | 0.64368 |
| AUC niveau + score (CV) | 0.6534 | 0.6535 |
| WR +10 pts de score, toutes paires | 59.7 % | 59.6 % |
| WR +10 pts de score, intra-paire | 60.8 % | 60.6 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.3 pt | +7.9 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +7.8 pt | +8.4 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000025, IC 95 % [-0.000077 ; +0.000028] (bootstrap sur les events). **pas de difference distinguable du bruit**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 5862 decks a 3 couleurs principales (38.6 %), score moyen 70.2 contre 72.1 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+1.4 pts** de plus (IC 95 % [-0.8 ; +3.2], non significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +1.6 pts (IC 95 % [-0.7 ; +3.5]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6848 | 0.5000 |
| niveau joueur seul | 0.6447 | 0.6504 |
| score prod seul | 0.6800 | 0.5555 |
| niveau + score prod | 0.6437 | 0.6534 |
| niveau + 4 axes (poids refits) | 0.6435 | 0.6540 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 35.2 % (3627) | 37.1 % (2971) | 36.1 % (2618) | 39.8 % (2566) | 42.5 % (2117) |
| 0.48 - 0.60 | 51.5 % (4058) | 53.7 % (4107) | 54.5 % (4255) | 55.4 % (4353) | 58.8 % (4400) |
| niveau >= 0.60 | 63.8 % (3005) | 65.4 % (4189) | 67.3 % (5135) | 69.1 % (5584) | 71.6 % (7206) |

Bornes de score des quintiles : 65.2, 69.6, 73.3, 77.8

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 65.8 | 42.4 | 89.3 | 3.0 % | 0.0 % |
| synergyNormalized | 70.4 | 58.2 | 81.3 | 0.1 % | 0.0 % |
| consistencyScore | 80.9 | 64.6 | 94.0 | 0.2 % | 0.0 % |
| curveScore | 71.4 | 50.8 | 87.7 | 0.0 % | 0.1 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.605 | +1.00 | 1.00 |
| synergyNormalized | +0.404 | +0.67 | 0.50 |
| consistencyScore | +0.272 | +0.45 | 0.65 |
| curveScore | -0.021 | -0.03 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| GR | 1299 | 55.0 % | 55.4 % | -0.4 pt | 68.1 | 52.0 |
| BU | 1286 | 57.8 % | 57.5 % | +0.3 pt | 80.0 | 83.8 |
| UW | 1232 | 59.0 % | 57.3 % | +1.7 pt | 75.5 | 70.3 |
| GW | 1169 | 55.7 % | 55.8 % | -0.1 pt | 66.0 | 46.7 |
| BR | 940 | 55.1 % | 56.3 % | -1.2 pt | 71.1 | 54.6 |
| BGR | 920 | 57.1 % | 56.9 % | +0.2 pt | 70.3 | 68.8 |
| BG | 872 | 57.9 % | 57.8 % | +0.1 pt | 73.7 | 68.3 |
| RU | 832 | 57.1 % | 57.8 % | -0.7 pt | 74.8 | 70.2 |
| BUW | 774 | 57.3 % | 55.7 % | +1.6 pt | 73.5 | 78.5 |
| GRW | 705 | 52.9 % | 54.3 % | -1.3 pt | 65.4 | 54.9 |
| BRU | 579 | 57.4 % | 57.0 % | +0.4 pt | 73.8 | 79.9 |
| BW | 575 | 57.0 % | 56.3 % | +0.7 pt | 69.6 | 55.3 |
| RW | 575 | 57.2 % | 57.2 % | +0.0 pt | 66.9 | 45.9 |
| BGU | 549 | 56.7 % | 56.9 % | -0.2 pt | 73.6 | 82.3 |
| GU | 547 | 56.8 % | 57.3 % | -0.5 pt | 72.6 | 73.7 |
| BGW | 509 | 54.5 % | 54.5 % | +0.0 pt | 66.9 | 61.8 |
| GRU | 465 | 56.3 % | 56.9 % | -0.6 pt | 72.0 | 76.1 |
| RUW | 459 | 57.0 % | 56.5 % | +0.5 pt | 70.7 | 70.2 |
| GUW | 387 | 54.5 % | 55.0 % | -0.5 pt | 68.8 | 67.9 |
| BRW | 265 | 50.8 % | 52.2 % | -1.4 pt | 65.4 | 59.4 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
