# Comparaison appariee : parite+trios3 vs parite

- Set : SOS, 50 pools communs
- parite : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- parite+trios3 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 26/50 pools

| Metrique | parite | parite+trios3 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3777 | 0.3803 | +0.0027 | [-0.0184 ; +0.0195] | non |
| Jaccard best3 | 0.5089 | 0.5188 | +0.0099 | [-0.0138 ; +0.0345] | non |
| Color match top1 | 30.0 % | 28.0 % | -2.0 pt | [-10.0 pt ; +4.0 pt] | non |
| Color match top3 | 48.0 % | 48.0 % | +0.0 pt | [-6.0 pt ; +6.0 pt] | non |
| Strict match top1 | 30.0 % | 28.0 % | -2.0 pt | [-10.0 pt ; +4.0 pt] | non |
| Strict match top3 | 42.0 % | 42.0 % | +0.0 pt | [-6.0 pt ; +6.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 | 84.4036 | 84.3670 | -0.0366 | [-0.1940 ; +0.1070] | non |
| Score top1 - joueur | 10.5529 | 10.5163 | -0.0366 | [-0.1940 ; +0.1070] | non |
