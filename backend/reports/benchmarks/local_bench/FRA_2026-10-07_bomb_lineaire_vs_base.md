# Comparaison appariee : bomb_lineaire vs base

- Set : FRA, 50 pools communs
- base : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- bomb_lineaire : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 26/50 pools

| Metrique | base | bomb_lineaire | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3165 | 0.3201 | +0.0037 | [-0.0077 ; +0.0157] | non |
| Jaccard best3 | 0.4853 | 0.5046 | +0.0192 | [+0.0005 ; +0.0440] | oui |
| Color match top1 | 8.0 % | 4.0 % | -4.0 pt | [-10.0 pt ; +0.0 pt] | non |
| Color match top3 | 30.0 % | 30.0 % | +0.0 pt | [-8.0 pt ; +8.0 pt] | non |
| Strict match top1 | 6.0 % | 4.0 % | -2.0 pt | [-6.0 pt ; +0.0 pt] | non |
| Strict match top3 | 24.0 % | 26.0 % | +2.0 pt | [-4.0 pt ; +8.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4230 | 0.4244 | +0.0014 | [-0.0276 ; +0.0305] | non |
| Score top1 | 85.3938 | 86.4004 | +1.0066 | [+0.7938 ; +1.2284] | oui |
| Score top1 - joueur | 13.1433 | 13.0034 | -0.1399 | [-0.3935 ; +0.1170] | non |
