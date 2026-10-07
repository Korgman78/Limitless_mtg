# Comparaison appariee : div22 vs parite

- Set : SOS, 50 pools communs
- parite : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- div22 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 0/50 pools

| Metrique | parite | div22 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3777 | 0.3777 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Jaccard best3 | 0.5089 | 0.5145 | +0.0056 | [+0.0000 ; +0.0167] | non |
| Color match top1 | 30.0 % | 30.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Color match top3 | 48.0 % | 48.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top1 | 30.0 % | 30.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top3 | 42.0 % | 42.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4185 | 0.4124 | -0.0061 | [-0.0152 ; +0.0000] | non |
| Score top1 | 84.4036 | 84.4036 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 - joueur | 10.5529 | 10.5529 | +0.0000 | [+0.0000 ; +0.0000] | non |
