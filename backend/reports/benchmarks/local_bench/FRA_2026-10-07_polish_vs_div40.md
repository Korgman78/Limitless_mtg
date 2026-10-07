# Comparaison appariee : div40+polish vs div40

- Set : FRA, 50 pools communs
- div40 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- div40+polish : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 4/50 pools

| Metrique | div40 | div40+polish | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3166 | 0.3165 | -0.0002 | [-0.0026 ; +0.0020] | non |
| Jaccard best3 | 0.4905 | 0.4853 | -0.0051 | [-0.0136 ; +0.0000] | non |
| Color match top1 | 8.0 % | 8.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Color match top3 | 30.0 % | 30.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top1 | 6.0 % | 6.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top3 | 24.0 % | 24.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4179 | 0.4230 | +0.0051 | [+0.0001 ; +0.0134] | oui |
| Score top1 | 85.3830 | 85.3938 | +0.0108 | [+0.0002 ; +0.0238] | oui |
| Score top1 - joueur | 13.1325 | 13.1433 | +0.0108 | [+0.0002 ; +0.0238] | oui |
