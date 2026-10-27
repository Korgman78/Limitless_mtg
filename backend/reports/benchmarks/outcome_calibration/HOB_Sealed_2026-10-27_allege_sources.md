# Calibration sur resultats reels : HOB (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-27
- Donnees 17Lands : `game_data_public.HOB.Sealed.csv.gz` (mise a jour Thu, 01 Oct 2026 13:16:56 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 169 cartes (>= 200 parties) : correlation brute 0.87, **corrigee du bruit 0.89**, ecart reel par carte 1.81 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 13913 decks, 59125 parties, WR moyen 57.1 %.
- A niveau de joueur egal, +10 pts de score = WR 57.1 % -> **61.1 %** toutes paires confondues, **61.3 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.78 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat allege_sources vs prod

| Mesure | prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64317 | 0.64315 |
| AUC niveau + score (CV) | 0.6517 | 0.6517 |
| WR +10 pts de score, toutes paires | 61.1 % | 61.1 % |
| WR +10 pts de score, intra-paire | 61.3 % | 61.2 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +7.5 pt | +7.5 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +10.5 pt | +10.5 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000022, IC 95 % [-0.000039 ; -0.000004] (bootstrap sur les events). **le candidat predit mieux**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 1589 decks a 3 couleurs principales (11.4 %), score moyen 66.8 contre 70.9 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **-2.9 pts** de plus (IC 95 % [-5.9 ; -0.1], significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : -2.3 pts (IC 95 % [-5.3 ; +0.5]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6831 | 0.5000 |
| niveau joueur seul | 0.6449 | 0.6470 |
| score prod seul | 0.6767 | 0.5653 |
| niveau + score prod | 0.6432 | 0.6517 |
| niveau + 4 axes (poids refits) | 0.6429 | 0.6523 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.3 % (3127) | 35.4 % (2642) | 38.0 % (2694) | 39.6 % (2132) | 43.8 % (1734) |
| 0.48 - 0.60 | 50.7 % (3811) | 53.5 % (4120) | 55.2 % (4179) | 56.5 % (4065) | 58.2 % (4209) |
| niveau >= 0.60 | 61.9 % (3157) | 63.7 % (4119) | 66.8 % (4917) | 69.2 % (6370) | 72.4 % (7849) |

Bornes de score des quintiles : 64.0, 69.0, 73.1, 77.1

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 55.6 | 37.0 | 72.3 | 0.0 % | 0.0 % |
| synergyNormalized | 75.7 | 50.9 | 96.2 | 6.2 % | 0.0 % |
| consistencyScore | 88.5 | 77.9 | 96.8 | 0.6 % | 0.0 % |
| curveScore | 71.1 | 52.0 | 87.8 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.917 | +1.00 | 1.00 |
| synergyNormalized | +0.178 | +0.19 | 0.50 |
| consistencyScore | +0.446 | +0.49 | 0.65 |
| curveScore | +0.099 | +0.11 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| BR | 4553 | 60.2 % | 58.5 % | +1.7 pt | 75.6 | 64.1 |
| BG | 2872 | 57.0 % | 57.1 % | -0.1 pt | 67.7 | 45.8 |
| RW | 1875 | 57.3 % | 56.8 % | +0.5 pt | 72.2 | 59.5 |
| UW | 872 | 51.4 % | 53.6 % | -2.2 pt | 67.4 | 48.1 |
| GU | 679 | 49.4 % | 53.7 % | -4.3 pt | 59.8 | 33.8 |
| BGR | 406 | 55.8 % | 56.2 % | -0.3 pt | 67.4 | 57.0 |
| BU | 397 | 57.6 % | 59.1 % | -1.5 pt | 68.1 | 58.8 |
| BW | 387 | 61.0 % | 59.4 % | +1.6 pt | 75.0 | 66.1 |
| GR | 365 | 52.0 % | 55.2 % | -3.2 pt | 62.5 | 46.7 |
| BRW | 315 | 55.2 % | 54.8 % | +0.4 pt | 71.5 | 69.0 |
| BGU | 226 | 48.1 % | 51.4 % | -3.4 pt | 60.4 | 43.5 |
| RUW | 207 | 49.9 % | 54.0 % | -4.1 pt | 68.0 | 61.1 |
| GW | 166 | 56.7 % | 56.6 % | +0.1 pt | 63.4 | 43.3 |
| GUW | 151 | 49.4 % | 54.4 % | -5.0 pt | 63.9 | 48.8 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
