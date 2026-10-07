# Comparaison appariee : poids+div22 vs div22

- Set : FRA, 50 pools communs
- div22 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- poids+div22 : poids {'power': 2, 'consistency': 1, 'curve': 0.6, 'synergy': 0.3}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 42/50 pools

| Metrique | div22 | poids+div22 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3166 | 0.3361 | +0.0194 | [-0.0034 ; +0.0434] | non |
| Jaccard best3 | 0.4924 | 0.4387 | -0.0537 | [-0.0916 ; -0.0215] | oui |
| Color match top1 | 8.0 % | 12.0 % | +4.0 pt | [-4.0 pt ; +12.0 pt] | non |
| Color match top3 | 32.0 % | 32.0 % | +0.0 pt | [-10.0 pt ; +10.0 pt] | non |
| Strict match top1 | 6.0 % | 10.0 % | +4.0 pt | [-4.0 pt ; +12.0 pt] | non |
| Strict match top3 | 26.0 % | 26.0 % | +0.0 pt | [-10.0 pt ; +10.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4404 | 0.4843 | +0.0439 | [+0.0158 ; +0.0739] | oui |

Scores non compares : les poids different, donc l'echelle du score aussi.
