# Comparaison appariee : parite vs prod

- Set : SOS, 50 pools communs
- prod : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- parite : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 21/50 pools

| Metrique | prod | parite | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3735 | 0.3777 | +0.0042 | [-0.0005 ; +0.0110] | non |
| Jaccard best3 | 0.5177 | 0.5089 | -0.0087 | [-0.0439 ; +0.0247] | non |
| Color match top1 | 28.0 % | 30.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Color match top3 | 48.0 % | 48.0 % | +0.0 pt | [-8.0 pt ; +8.0 pt] | non |
| Strict match top1 | 28.0 % | 30.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Strict match top3 | 40.0 % | 42.0 % | +2.0 pt | [-4.0 pt ; +10.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 | 84.2676 | 84.4036 | +0.1360 | [+0.0534 ; +0.2352] | oui |
| Score top1 - joueur | 11.3220 | 10.5529 | -0.7691 | [-1.0563 ; -0.4913] | oui |
