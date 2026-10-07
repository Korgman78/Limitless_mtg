# Comparaison appariee : poids+div40 vs div22

- Set : SOS, 50 pools communs
- div22 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- poids+div40 : poids {'power': 2, 'consistency': 1, 'curve': 0.6, 'synergy': 0.3}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 49/50 pools

| Metrique | div22 | poids+div40 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3777 | 0.3834 | +0.0057 | [-0.0459 ; +0.0620] | non |
| Jaccard best3 | 0.5145 | 0.5072 | -0.0072 | [-0.0388 ; +0.0248] | non |
| Color match top1 | 30.0 % | 32.0 % | +2.0 pt | [-12.0 pt ; +16.0 pt] | non |
| Color match top3 | 48.0 % | 50.0 % | +2.0 pt | [-8.0 pt ; +12.0 pt] | non |
| Strict match top1 | 30.0 % | 26.0 % | -4.0 pt | [-16.0 pt ; +8.0 pt] | non |
| Strict match top3 | 42.0 % | 42.0 % | +0.0 pt | [-8.0 pt ; +8.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4124 | 0.4242 | +0.0118 | [-0.0383 ; +0.0601] | non |

Scores non compares : les poids different, donc l'echelle du score aussi.
