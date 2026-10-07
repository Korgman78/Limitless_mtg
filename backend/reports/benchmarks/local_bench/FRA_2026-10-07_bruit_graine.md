# Comparaison appariee : prod graine 2027 vs prod graine 1337

- Set : FRA, 50 pools communs
- prod graine 1337 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 1337, budget 15000 evals/shard
- prod graine 2027 : poids {'power': 2, 'consistency': 1.3, 'curve': 1, 'synergy': 1}, graine 2027, budget 15000 evals/shard
- Build top1 different sur 47/50 pools

| Metrique | prod graine 1337 | prod graine 2027 | Ecart | IC 95 % | Significatif |
|---|---:|---:|---:|---|---|
| Jaccard top1 | 0.3151 | 0.3153 | +0.0002 | [-0.0020 ; +0.0026] | non |
| Jaccard best3 | 0.5044 | 0.4994 | -0.0049 | [-0.0135 ; +0.0009] | non |
| Color match top1 | 6.0 % | 6.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Color match top3 | 28.0 % | 28.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top1 | 4.0 % | 4.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Strict match top3 | 22.0 % | 22.0 % | +0.0 pt | [+0.0 pt ; +0.0 pt] | non |
| Archetypes distincts top3 | 3.0000 | 3.0000 | +0.0000 | [+0.0000 ; +0.0000] | non |
| Score top1 | 85.3334 | 85.3640 | +0.0306 | [-0.0192 ; +0.0972] | non |
| Score top1 - joueur | 14.2211 | 14.2517 | +0.0306 | [-0.0192 ; +0.0972] | non |
