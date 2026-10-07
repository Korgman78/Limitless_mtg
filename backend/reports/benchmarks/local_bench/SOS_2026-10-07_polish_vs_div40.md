# Comparaison appariee : div40+polish vs div40

- Set : SOS, 50 pools communs
- div40 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- div40+polish : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 15/50 pools

| Metrique | div40 | div40+polish | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3777 | 0.3814 | +0.0038 | [-0.0033 ; +0.0112] | non |
| Jaccard best3 | 0.5365 | 0.5258 | -0.0107 | [-0.0371 ; +0.0056] | non |
| Color match top1 | 30.0 % | 28.0 % | -2.0 pt | [-6.0 pt ; +0.0 pt] | non |
| Color match top3 | 52.0 % | 52.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top1 | 30.0 % | 28.0 % | -2.0 pt | [-6.0 pt ; +0.0 pt] | non |
| Strict match top3 | 44.0 % | 44.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.3891 | 0.4005 | +0.0113 | [-0.0045 ; +0.0344] | non |
| Score top1 | 84.4036 | 84.5068 | +0.1032 | [+0.0452 ; +0.1812] | oui |
| Score top1 - joueur | 10.5529 | 10.6561 | +0.1032 | [+0.0452 ; +0.1812] | oui |
