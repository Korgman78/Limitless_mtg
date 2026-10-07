# Comparaison appariee : parite+trios3 vs parite

- Set : FRA, 50 pools communs
- parite : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- parite+trios3 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 3/50 pools

| Metrique | parite | parite+trios3 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3166 | 0.3166 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Jaccard best3 | 0.4861 | 0.4904 | +0.0043 | [-0.0042 ; +0.0189] | non |
| Color match top1 | 8.0 % | 8.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Color match top3 | 34.0 % | 36.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Strict match top1 | 6.0 % | 6.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top3 | 28.0 % | 28.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 | 85.3830 | 85.3574 | -0.0256 | [-0.0696 ; +0.0000] | non |
| Score top1 - joueur | 13.1325 | 13.1069 | -0.0256 | [-0.0696 ; +0.0000] | non |
