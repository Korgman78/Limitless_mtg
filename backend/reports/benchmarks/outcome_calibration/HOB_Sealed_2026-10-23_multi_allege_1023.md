# Calibration sur resultats reels : HOB (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-23
- Donnees 17Lands : `game_data_public.HOB.Sealed.csv.gz` (mise a jour Thu, 01 Oct 2026 13:16:56 GMT)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 169 cartes (>= 200 parties) : correlation brute 0.87, **corrigee du bruit 0.89**, ecart reel par carte 1.81 pt (seuil d'acceptation : 0.88).

**Verdict : proxy accepte**

## En bref

- 13913 decks, 59125 parties, WR moyen 57.1 %.
- A niveau de joueur egal, +10 pts de score = WR 57.1 % -> **60.6 %** toutes paires confondues, **60.9 %** au sein d'une meme paire.
- Correlation entre score moyen d'une paire et ses victoires au-dessus de l'attendu : +0.82 (proche de +1 = le score classe bien les paires).

## Comparaison : candidat multi_allege_1023 vs prod

| Mesure | prod | Candidat |
|---|---:|---:|
| Log-loss niveau + score (CV) | 0.64310 | 0.64308 |
| AUC niveau + score (CV) | 0.6518 | 0.6518 |
| WR +10 pts de score, toutes paires | 60.6 % | 60.8 % |
| WR +10 pts de score, intra-paire | 60.9 % | 61.1 % |
| Ecart Q5 - Q1, niveau 0.48-0.60 | +8.0 pt | +7.9 pt |
| Ecart Q5 - Q1, niveau >= 0.60 | +10.1 pt | +10.7 pt |

Ecart de log-loss apparie (candidat - prod) : -0.000016, IC 95 % [-0.000049 ; +0.000016] (bootstrap sur les events). **pas de difference distinguable du bruit**.

Les ecarts de score ne se comparent pas en valeur absolue (l'echelle change avec les poids) : seuls le pouvoir predictif et l'ecart entre quintiles sont comparables.

## Decks tricolores

- 1589 decks a 3 couleurs principales (11.4 %), score moyen 58.6 contre 68.8 pour les bicolores.
- A score egal, un tricolore gagne comme un bicolore note **+2.8 pts** de plus (IC 95 % [-0.6 ; +5.6], non significatif). Positif = le score sous-note les tricolores.

- Avec le candidat : +1.3 pts (IC 95 % [-2.0 ; +4.1]).

## Pouvoir predictif (validation croisee 5 plis, groupes par event)

| Modele | Log-loss | AUC |
|---|---:|---:|
| aucun predicteur | 0.6831 | 0.5000 |
| niveau joueur seul | 0.6449 | 0.6470 |
| score prod seul | 0.6774 | 0.5617 |
| niveau + score prod | 0.6431 | 0.6518 |
| niveau + 4 axes (poids refits) | 0.6428 | 0.6526 |

Une partie isolee est tres bruitee : le gain d'AUC du score reste faible meme quand son effet est reel. Lire plutot l'effet en points de WR et les quintiles.

## WR de partie par quintile de score, a niveau comparable

| Niveau | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---:|---:|---:|---:|---:|
| niveau < 0.48 | 33.7 % (3035) | 35.5 % (2649) | 37.4 % (2578) | 39.1 % (2238) | 43.8 % (1829) |
| 0.48 - 0.60 | 50.1 % (3600) | 54.0 % (4124) | 54.6 % (4294) | 57.0 % (4166) | 58.1 % (4200) |
| niveau >= 0.60 | 62.4 % (3499) | 64.3 % (4217) | 66.8 % (4906) | 69.0 % (6203) | 72.5 % (7587) |

Bornes de score des quintiles : 60.0, 66.0, 70.8, 75.5

## Saturation des axes

| Axe | Moyenne | p10 | p90 | A 100 | A 0 |
|---|---:|---:|---:|---:|---:|
| wrNormalized | 55.6 | 37.0 | 72.3 | 0.0 % | 0.0 % |
| synergyNormalized | 75.7 | 50.9 | 96.2 | 6.2 % | 0.0 % |
| consistencyScore | 77.2 | 48.3 | 94.5 | 0.2 % | 0.1 % |
| curveScore | 71.1 | 52.0 | 87.8 | 0.0 % | 0.0 % |

## Poids refits sur les victoires (ratio a l'axe puissance)

| Axe | Effet par point (log-odds x100) | Ratio refit | Ratio prod |
|---|---:|---:|---:|
| wrNormalized | +0.927 | +1.00 | 1.00 |
| synergyNormalized | +0.142 | +0.15 | 0.50 |
| consistencyScore | +0.295 | +0.32 | 0.65 |
| curveScore | +0.095 | +0.10 | 0.50 |

Un axe sature a un effet par point gonfle (il ne varie que sur les decks hors plafond) : ne pas reporter ces ratios tels quels dans la prod.

## Par paire de couleurs (>= 150 decks)

| Paire | Decks | WR reel | WR attendu (niveau) | Ecart | Score moyen | Axe puissance moyen |
|---|---:|---:|---:|---:|---:|---:|
| BR | 4553 | 60.2 % | 58.5 % | +1.7 pt | 74.0 | 64.1 |
| BG | 2872 | 57.0 % | 57.1 % | -0.1 pt | 65.4 | 45.8 |
| RW | 1875 | 57.3 % | 56.8 % | +0.5 pt | 70.6 | 59.5 |
| UW | 872 | 51.4 % | 53.6 % | -2.2 pt | 65.3 | 48.1 |
| GU | 679 | 49.4 % | 53.7 % | -4.3 pt | 56.6 | 33.8 |
| BGR | 406 | 55.8 % | 56.2 % | -0.3 pt | 60.2 | 57.0 |
| BU | 397 | 57.6 % | 59.1 % | -1.5 pt | 64.1 | 58.8 |
| BW | 387 | 61.0 % | 59.4 % | +1.6 pt | 72.0 | 66.1 |
| GR | 365 | 52.0 % | 55.2 % | -3.2 pt | 59.8 | 46.7 |
| BRW | 315 | 55.2 % | 54.8 % | +0.4 pt | 64.0 | 69.0 |
| BGU | 226 | 48.1 % | 51.4 % | -3.4 pt | 51.7 | 43.5 |
| RUW | 207 | 49.9 % | 54.0 % | -4.1 pt | 59.8 | 61.1 |
| GW | 166 | 56.7 % | 56.6 % | +0.1 pt | 60.1 | 43.3 |
| GUW | 151 | 49.4 % | 54.4 % | -5.0 pt | 54.7 | 48.8 |

## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
