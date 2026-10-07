# Comparaison appariee : bomb_lineaire vs base

- Set : SOS, 50 pools communs
- base : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- bomb_lineaire : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- Build top1 different sur 23/50 pools

| Metrique | base | bomb_lineaire | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3814 | 0.4218 | +0.0404 | [+0.0045 ; +0.0860] | oui |
| Jaccard best3 | 0.5258 | 0.5228 | -0.0029 | [-0.0256 ; +0.0131] | non |
| Color match top1 | 28.0 % | 40.0 % | +12.0 pt | [+4.0 pt ; +22.0 pt] | oui |
| Color match top3 | 52.0 % | 52.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top1 | 28.0 % | 36.0 % | +8.0 pt | [+2.0 pt ; +16.0 pt] | oui |
| Strict match top3 | 44.0 % | 46.0 % | +2.0 pt | [+0.0 pt ; +6.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Similarite builds 2-3 / build 1 | 0.4005 | 0.4002 | -0.0003 | [-0.0258 ; +0.0265] | non |
| Score top1 | 84.5068 | 85.2800 | +0.7732 | [+0.5446 ; +1.0096] | oui |
| Score top1 - joueur | 10.6561 | 10.4199 | -0.2362 | [-0.4536 ; -0.0279] | oui |
