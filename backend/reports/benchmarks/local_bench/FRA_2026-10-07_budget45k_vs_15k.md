# Comparaison appariee : 45k vs 15k

- Set : FRA, 50 pools communs
- 15k : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- 45k : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 45000 evals/shard
- Build top1 different sur 20/50 pools

| Metrique | 15k | 45k | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3201 | 0.3255 | +0.0053 | [-0.0134 ; +0.0265] | non |
| Jaccard best3 | 0.5046 | 0.4823 | -0.0223 | [-0.0476 ; +0.0005] | non |
| Color match top1 | 4.0 % | 6.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Color match top3 | 30.0 % | 28.0 % | -2.0 pt | [-10.0 pt ; +6.0 pt] | non |
| Strict match top1 | 4.0 % | 4.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top3 | 26.0 % | 20.0 % | -6.0 pt | [-14.0 pt ; +2.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4244 | 0.4225 | -0.0018 | [-0.0360 ; +0.0316] | non |
| Score top1 | 86.4004 | 86.6272 | +0.2268 | [+0.0628 ; +0.4280] | oui |
| Score top1 - joueur | 13.0034 | 13.2302 | +0.2268 | [+0.0628 ; +0.4280] | oui |
