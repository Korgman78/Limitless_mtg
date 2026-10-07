# Comparaison appariee : parite vs prod

- Set : FRA, 50 pools communs
- prod : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- parite : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 9/50 pools

| Metrique | prod | parite | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3151 | 0.3166 | +0.0016 | [-0.0064 ; +0.0119] | non |
| Jaccard best3 | 0.5044 | 0.4861 | -0.0183 | [-0.0433 ; +0.0015] | non |
| Color match top1 | 6.0 % | 8.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Color match top3 | 28.0 % | 34.0 % | +6.0 pt | [+0.0 pt ; +14.0 pt] | non |
| Strict match top1 | 4.0 % | 6.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Strict match top3 | 22.0 % | 28.0 % | +6.0 pt | [+0.0 pt ; +14.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 | 85.3334 | 85.3830 | +0.0496 | [+0.0086 ; +0.1030] | oui |
| Score top1 - joueur | 14.2211 | 13.1325 | -1.0885 | [-1.3898 ; -0.7990] | oui |
