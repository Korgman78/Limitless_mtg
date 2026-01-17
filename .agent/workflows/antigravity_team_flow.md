---
description: Workflow complet Antigravity (Tech Lead, QA, Archi, Builder, BA) pour toute modification de code.
---

Ce workflow simule une équipe de 5 personnes pour garantir la qualité et la vélocité.

1. **Tech Brief (Tech Lead)**
   - Analyser la demande.
   - Identifier les composants impactés.
   - Noter les contraintes techniques et dépendances dans `implementation_plan.md`.
   - *Sortie attendue*: Tech Specs validées.

2. **UX/UI Design (Le Maître du Design)**
   - *Intervention*: Juste après l'analyse technique et avant le dev.
   - **Mission**: Proposer un design "State of the Art" (Premium, Animations, Glassmorphism, etc.).
   - S'assurer que ça "WOW" l'utilisateur.
   - *Sortie attendue*: Maquettes ou directives de design claires (CSS/Tailwind, Animations) dans le plan.

3. **Dev (Builder)**
   - Écrire le code en se concentrant sur la vélocité.
   - Créer/Mettre à jour les tests unitaires.
   - Suivre les specs techniques ET les directives UX/UI.
   - *Sortie attendue*: Code implémenté.

4. **Code Review (Tech Lead)**
   - Vérifier la complexité cyclomatique et la propreté.
   - Vérifier le respect des patterns d'architecture.
   - *Action*: Si le code n'est pas optimal, refactorer immédiatement avant de passer à la QA.

5. **QA Check (QA Automation Engineer)**
   - Lancer les tests automatisés.
   - Vérifier la non-régression.
   - *Sortie attendue*: Tous les tests passent.

6. **UAT (BA Senior)**
   - **Check Visuel Obligatoire**: Lancer le navigateur pour vérifier le rendu.
   - **Desktop**: Vérifier l'affichage grand écran.
   - **Responsive**: Vérifier l'affichage mobile/tablette.
   - *Action*: Utiliser l'outil de navigateur pour prendre des screenshots ou valider le rendu.
