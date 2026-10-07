# Comparaison appariee : 45k vs 15k

- Set : SOS, 50 pools communs
- 15k : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- 45k : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 45000 evals/shard
- Build top1 different sur 11/50 pools

| Metrique | 15k | 45k | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.4218 | 0.4267 | +0.0049 | [-0.0137 ; +0.0310] | non |
| Jaccard best3 | 0.5228 | 0.5206 | -0.0022 | [-0.0095 ; +0.0057] | non |
| Color match top1 | 40.0 % | 42.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Color match top3 | 52.0 % | 50.0 % | -2.0 pt | [-6.0 pt ; +0.0 pt] | non |
| Strict match top1 | 36.0 % | 34.0 % | -2.0 pt | [-6.0 pt ; +0.0 pt] | non |
| Strict match top3 | 46.0 % | 44.0 % | -2.0 pt | [-6.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4002 | 0.4109 | +0.0107 | [-0.0238 ; +0.0426] | non |
| Score top1 | 85.2800 | 85.3716 | +0.0916 | [+0.0080 ; +0.2002] | oui |
| Score top1 - joueur | 10.4199 | 10.5115 | +0.0916 | [+0.0080 ; +0.2002] | oui |
