# Comparaison appariee : poids+div40 vs div22

- Set : FRA, 50 pools communs
- div22 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- poids+div40 : poids {'power': 2, 'consistency': 1, 'curve': 0.6, 'synergy': 0.3}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 42/50 pools

| Metrique | div22 | poids+div40 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3166 | 0.3361 | +0.0194 | [-0.0034 ; +0.0434] | non |
| Jaccard best3 | 0.4924 | 0.4539 | -0.0385 | [-0.0707 ; -0.0110] | oui |
| Color match top1 | 8.0 % | 12.0 % | +4.0 pt | [-4.0 pt ; +12.0 pt] | non |
| Color match top3 | 32.0 % | 34.0 % | +2.0 pt | [-6.0 pt ; +12.0 pt] | non |
| Strict match top1 | 6.0 % | 10.0 % | +4.0 pt | [-4.0 pt ; +12.0 pt] | non |
| Strict match top3 | 26.0 % | 28.0 % | +2.0 pt | [-6.0 pt ; +12.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4404 | 0.4614 | +0.0210 | [-0.0075 ; +0.0500] | non |

Scores non compares : les poids different, donc l'echelle du score aussi.
