# Calibration sur resultats reels : ECL (Sealed comme proxy d'ArenaDirect_Sealed)

- Date du run : 2026-10-07
- Donnees 17Lands : `game_data_public.ECL.Sealed.csv.gz` (mise a jour None)
- Score : coeur de production `sealedOptimizerCore.ts`, contexte ArenaDirect_Sealed, poids {'wrNormalized': 2.0, 'synergyNormalized': 1.0, 'consistencyScore': 1.3, 'curveScore': 1.0}

## Proximite du proxy

GIH WR Sealed vs ArenaDirect_Sealed, 201 cartes (>= 200 parties) : correlation brute 0.68, **corrigee du bruit 0.70**, ecart reel par carte 3.38 pt (seuil d'acceptation : 0.88).

**Verdict : proxy refuse, analyse non lancee**

Analyse non lancee : Sealed ne represente pas assez ArenaDirect_Sealed pour ce set. Relancer avec `--force` pour l'analyser quand meme, a titre indicatif.
## Limites

- Proxy : Sealed n'est pas ArenaDirect_Sealed (17Lands ne publie pas les parties ArenaDirect).
- Le niveau du joueur (`user_game_win_rate_bucket`) est un controle grossier : les bons joueurs construisent aussi de meilleurs decks, l'effet du score peut etre un peu surestime.
- Les GIH WR du score viennent en partie des memes parties (fuite faible, une carte agrege des milliers de parties).
