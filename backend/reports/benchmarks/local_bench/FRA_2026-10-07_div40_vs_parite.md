# Comparaison appariee : div40 vs parite

- Set : FRA, 50 pools communs
- parite : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- div40 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 0/50 pools

| Metrique | parite | div40 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3166 | 0.3166 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Jaccard best3 | 0.4861 | 0.4905 | +0.0044 | [-0.0041 ; +0.0189] | non |
| Color match top1 | 8.0 % | 8.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Color match top3 | 34.0 % | 30.0 % | -4.0 pt | [-10.0 pt ; +0.0 pt] | non |
| Strict match top1 | 6.0 % | 6.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top3 | 28.0 % | 24.0 % | -4.0 pt | [-10.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4479 | 0.4179 | -0.0300 | [-0.0538 ; -0.0099] | oui |
| Score top1 | 85.3830 | 85.3830 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 - joueur | 13.1325 | 13.1325 | +0.0000 | [+0.0000 ; +0.0000] | non |
