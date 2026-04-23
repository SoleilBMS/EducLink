# Demo walkthrough (issue #52)

Ce guide décrit le parcours recommandé pour une démonstration rapide d'EducLink avec les seed data enrichies.

## Démarrage

```bash
npm install
npm run start
```

Puis ouvrir:
- `http://localhost:3000/demo` (guide intégré)
- `http://localhost:3000/login`

> Mot de passe unique pour tous les comptes de démonstration: `password123`.

## Comptes de démo (tenant principal: `school-a`)

| Rôle | Email | Espace principal |
|---|---|---|
| Admin | `admin@school-a.test` | `/dashboard/admin` |
| Director | `director@school-a.test` | `/dashboard/director` |
| Teacher | `teacher@school-a.test` | `/dashboard/teacher` |
| Teacher (secondaire) | `teacher2@school-a.test` | `/dashboard/teacher` |
| Parent | `parent@school-a.test` | `/dashboard/parent` |
| Parent (secondaire) | `parent2@school-a.test` | `/dashboard/parent` |
| Student | `student@school-a.test` | `/dashboard/student` |
| Accountant | `accountant@school-a.test` | `/dashboard/accountant` |

## Scénario démo recommandé (15-20 min)

1. **Admin**
   - Ouvrir le dashboard admin pour vérifier les métriques principales.
   - Parcourir élèves / responsables / enseignants.
   - Ouvrir finance (plans de frais, factures, paiements pré-remplis).
   - Ouvrir attendance admin pour visualiser les présences déjà saisies.

2. **Teacher**
   - Ouvrir attendance et charger une classe.
   - Vérifier les lesson logs/devoirs existants puis publier un nouvel élément.
   - Vérifier les évaluations existantes puis saisir/mettre à jour des notes.

3. **Teacher + IA**
   - Ouvrir `/teacher/report-comments`.
   - Générer un brouillon d'appréciation pour un élève puis l'éditer/valider.

4. **Parent**
   - Ouvrir devoirs, notes, inbox, puis finance.
   - Vérifier la cohérence parent/enfants et les statuts de facturation.

5. **Student / Accountant**
   - Student: ouvrir devoirs + notes.
   - Accountant: ouvrir finance depuis dashboard accountant.

## Couverture des seed data

Le tenant `school-a` couvre désormais:
- structure de classes + matières
- enseignants avec affectations classes/matières
- élèves + liens parent/enfant cohérents
- attendance
- cahier de texte + devoirs
- évaluations + notes
- annonces + threads/messages
- finance (plans, factures, paiements)
- audit logs de base

Le tenant `school-b` reste léger pour conserver un jeu de données de contraste multi-tenant.
