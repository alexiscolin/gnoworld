# Exercice de relecture 01 — `r/seal` avant l'audit

`seal.gno` est la version exacte de `r/seal` avant l'audit indépendant. Relis-la à froid.

## Ce que le realm doit garantir

1. Seul le détenteur d'une clé de chat peut la lier (`Bind`), et seulement à sa propre adresse.
2. Un sceau prouve que les détenteurs des clés `a` et `b` ont tous les deux signé la même racine, pour ces `n` messages.
3. N'importe qui peut soumettre un sceau : une des deux parties ou un sponsor paie.
4. Les sceaux gardés (`keep`) sont lisibles par d'autres realms, qui s'en servent comme réputation.
5. Une clé de chat volée peut être neutralisée.
6. Une clé de session (déléguée, ADR-002) ne peut pas changer la clé de chat de l'utilisateur.

## Règles

- 45 minutes au plus. Ne lis ni `gno/r/seal/seal.gno` (la version corrigée) ni l'annexe de l'ADR avant d'avoir fini.
- Si tu as déjà lu les décisions 2 et 3 de l'ADR, tu connais une partie des réponses. Cherche alors surtout les autres, et vérifie que tu sais montrer la ligne exacte.
- Suis l'ordre de [`docs/REVIEW.md`](../../REVIEW.md) : l'intention, les tests, les frontières, les erreurs, l'état, la sécurité et les coûts, la lisibilité.
- Pour chaque `issue:`, écris le scénario : qui appelle quoi, avec quels arguments, et ce qu'il obtient.

Pour te calibrer : l'audit a trouvé 2 failles bloquantes, 4 problèmes sérieux et 1 détail. Tu peux en trouver d'autres.

## Où écrire

Dans `findings.md` (à créer), une remarque par entrée :

```
- issue (L66): <le problème>
  scénario: <qui fait quoi, et le résultat>
- question (L…): …
- nit (L…): …
```

Ensuite, on compare avec l'annexe de l'ADR et le code corrigé, et on note ce que tu as vu ou raté dans `docs/review-log.md`.
