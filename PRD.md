# PRD — EducLink

**Produit :** EducLink  
**Version :** 1.0  
**Positionnement :** ERP scolaire SaaS pour écoles privées, inspiré de Pronote + TouteMonAnnée + IA  
**Marché cible initial :** Algérie, puis Afrique francophone  
**Type de produit :** SaaS multi-établissements (multi-tenant)

---

## 1. Vision produit

EducLink est une plateforme SaaS tout-en-un destinée aux écoles privées.  
Le produit combine :

- la **communication fluide école ↔ parents** dans l’esprit de TouteMonAnnée,
- la **gestion pédagogique et administrative complète** dans l’esprit de Pronote,
- une **couche d’intelligence artificielle** pour automatiser, assister et améliorer le suivi scolaire.

EducLink doit devenir l’outil central de pilotage d’un établissement privé : administration, direction, enseignants, parents et élèves travaillent dans un environnement unique, moderne, simple et mobile-first.

---

## 2. Problème à résoudre

Les écoles privées, notamment en Algérie et en Afrique, utilisent souvent :

- des outils dispersés,
- du papier,
- WhatsApp,
- Excel,
- des solutions peu adaptées au contexte local,
- ou des logiciels rigides, anciens, coûteux ou mal localisés.

### Résultats observés
- perte d’informations,
- faible traçabilité,
- communication peu structurée avec les parents,
- difficulté de suivi pédagogique,
- charge administrative élevée,
- manque de visibilité pour la direction,
- faible exploitation de la donnée scolaire.

EducLink vise à centraliser, simplifier et moderniser toute la gestion scolaire.

---

## 3. Objectifs produit

### 3.1 Objectifs business
- Adresser le marché des écoles privées en Algérie puis Afrique francophone.
- Proposer une solution SaaS scalable par établissement.
- Créer une forte récurrence via abonnement mensuel ou annuel.
- Se différencier des solutions classiques grâce à l’IA et à l’UX.

### 3.2 Objectifs utilisateur
- Simplifier la gestion quotidienne des écoles.
- Offrir un portail clair à chaque acteur.
- Réduire la charge administrative.
- Améliorer le suivi pédagogique et la communication.
- Donner à la direction une vision consolidée et actionnable.

---

## 4. Proposition de valeur

EducLink = **Pronote + TouteMonAnnée + IA**, pensé pour les écoles privées du marché francophone africain.

### Différenciation clé
- expérience moderne et simple,
- structure multi-rôle complète,
- communication parents-école centralisée,
- pilotage pédagogique et administratif,
- IA utile et concrète,
- adaptation au terrain local,
- vision mobile-first.

---

## 5. Utilisateurs cibles

### 5.1 Super Admin plateforme
Gère la plateforme globale :
- onboarding des établissements,
- configuration SaaS,
- support,
- supervision,
- facturation SaaS.

### 5.2 Direction / Chef d’établissement
A besoin de :
- piloter l’école,
- suivre les performances,
- superviser la pédagogie,
- suivre la finance,
- contrôler les incidents et absences,
- visualiser les indicateurs.

### 5.3 Administration scolaire
A besoin de :
- gérer les inscriptions,
- fiches élèves,
- classes,
- affectations,
- documents,
- paiements,
- relances,
- organisation interne.

### 5.4 Enseignants
A besoin de :
- consulter ses classes,
- faire l’appel,
- saisir les notes,
- publier devoirs et contenus,
- suivre la progression,
- communiquer avec les parents,
- préparer bulletins et observations.

### 5.5 Parents
A besoin de :
- suivre la scolarité de son enfant,
- recevoir les informations,
- consulter notes, absences, devoirs,
- échanger avec l’établissement,
- payer la scolarité,
- accéder aux documents.

### 5.6 Élèves
A besoin de :
- consulter emploi du temps,
- devoirs,
- notes,
- supports de cours,
- messages,
- progression.

### 5.7 Comptabilité / Finance
A besoin de :
- suivre frais de scolarité,
- paiements,
- échéances,
- relances,
- reçus / factures,
- reporting financier.

---

## 6. Périmètre fonctionnel global

EducLink est structuré autour de plusieurs espaces métiers.

### 6.1 Espace Direction
- tableau de bord global,
- indicateurs pédagogiques,
- indicateurs de présence,
- indicateurs financiers,
- alertes prioritaires,
- comparaison classes / niveaux,
- suivi établissement.

### 6.2 Espace Administration
- gestion établissements,
- année scolaire,
- niveaux,
- classes,
- matières,
- enseignants,
- élèves,
- parents / responsables,
- inscriptions / réinscriptions,
- documents administratifs,
- affectations,
- calendrier scolaire.

### 6.3 Espace Enseignant
- tableau de bord personnel,
- classes et groupes,
- appel / absences / retards,
- cahier de texte,
- devoirs,
- ressources pédagogiques,
- saisie de notes,
- appréciations,
- suivi individuel élève,
- messages aux parents / administration.

### 6.4 Espace Parents
- vue enfant par enfant,
- carnet de liaison numérique,
- absences,
- notes,
- devoirs,
- bulletins,
- documents,
- messages,
- paiements,
- notifications.

### 6.5 Espace Élève
- emploi du temps,
- devoirs,
- notes,
- résultats,
- messages,
- supports de cours,
- progression.

### 6.6 Espace Finance
- structure tarifaire,
- échéancier,
- factures,
- reçus,
- paiements,
- suivi impayés,
- relances,
- export comptable.

### 6.7 Espace IA
- génération d’appréciations,
- résumé de suivi élève,
- aide à rédaction de messages,
- détection de signaux faibles,
- synthèses pédagogiques,
- assistance administrative.

---

## 7. Modules produit

### 7.1 Module Authentification et rôles
#### Objectif
Permettre un accès sécurisé, cloisonné et multi-rôle.

#### Fonctionnalités
- connexion par email / mot de passe,
- reset mot de passe,
- rôles et permissions,
- gestion session,
- multi-tenant,
- accès basé sur l’établissement,
- journal de connexion.

#### Rôles initiaux
- super_admin
- school_admin
- director
- teacher
- parent
- student
- accountant

---

### 7.2 Module Référentiel établissement
#### Objectif
Structurer les données d’une école.

#### Fonctionnalités
- établissement,
- campus éventuels,
- années scolaires,
- niveaux,
- classes,
- matières,
- périodes / trimestres / semestres,
- salles,
- calendriers.

---

### 7.3 Module Élèves / Parents / Professeurs
#### Objectif
Créer le cœur du référentiel humain.

#### Fonctionnalités
- fiches élèves,
- fiches responsables légaux,
- relation parent-enfant,
- fiches enseignants,
- historique de scolarité,
- classe assignée,
- documents liés,
- statut actif / inactif.

#### Données élève
- identité,
- date de naissance,
- sexe,
- photo,
- classe,
- contacts,
- informations médicales légères si autorisé,
- documents,
- observations administratives.

#### Données parent
- identité,
- lien avec l’enfant,
- téléphone,
- email,
- adresse,
- accès plateforme,
- statut payeur.

#### Données enseignant
- identité,
- matières,
- classes,
- emploi du temps,
- contact,
- statut.

---

### 7.4 Module Inscriptions / Admissions
#### Objectif
Digitaliser l’entrée et la réinscription des élèves.

#### Fonctionnalités
- formulaire d’inscription,
- dépôt de pièces,
- validation administrative,
- affectation classe,
- statut dossier,
- réinscription annuelle.

---

### 7.5 Module Présences / Absences / Retards
#### Objectif
Permettre le suivi quotidien de l’assiduité.

#### Fonctionnalités
- appel par classe,
- absences,
- retards,
- motifs,
- justificatifs,
- notification parent,
- statistiques d’assiduité,
- alertes sur récurrence.

#### Cas d’usage
- un enseignant fait l’appel depuis son tableau de bord,
- le parent reçoit une notification d’absence,
- l’administration visualise les élèves à risque.

---

### 7.6 Module Cahier de texte / Devoirs / Contenus
#### Objectif
Assurer la continuité pédagogique.

#### Fonctionnalités
- cahier de texte par classe et matière,
- devoirs à faire,
- date de remise,
- consignes,
- pièces jointes,
- ressources pédagogiques,
- historique.

#### Version avancée
- dépôt de devoir rendu par l’élève,
- correction,
- annotation.

---

### 7.7 Module Notes / Évaluations / Bulletins
#### Objectif
Structurer l’évaluation scolaire.

#### Fonctionnalités
- création d’évaluations,
- saisie des notes,
- coefficients,
- moyenne par matière,
- moyenne générale,
- appréciations,
- bulletins périodiques,
- classement si activé.

#### Vision
- enseignant : saisie et consultation,
- parent : résultats et bulletins,
- direction : consolidation globale.

#### Évolutions
- types d’évaluation,
- compétences,
- rubriques comportementales,
- export PDF bulletin.

---

### 7.8 Module Messagerie et communication
#### Objectif
Centraliser la communication officielle.

#### Fonctionnalités
- messagerie interne,
- messages école → parents,
- messages prof → parent,
- messages admin → personnel,
- notifications ciblées,
- annonces générales,
- historique des échanges.

#### Canaux futurs
- email,
- SMS,
- WhatsApp,
- push mobile.

---

### 7.9 Module Documents
#### Objectif
Centraliser les documents scolaires et administratifs.

#### Fonctionnalités
- bulletins,
- certificats,
- autorisations,
- règlements intérieurs,
- pièces administratives,
- supports pédagogiques,
- documents téléchargeables.

---

### 7.10 Module Finance / Scolarité
#### Objectif
Gérer les frais scolaires et paiements.

#### Fonctionnalités
- frais d’inscription,
- frais de scolarité,
- échéanciers,
- paiements enregistrés,
- historique,
- reçus,
- impayés,
- relances.

#### Cas d’usage
- admin enregistre un paiement,
- parent consulte son solde,
- direction suit le taux de recouvrement.

#### Évolutions
- paiement en ligne,
- intégration passerelles locales,
- export comptable.

---

### 7.11 Module Tableau de bord / Reporting
#### Objectif
Donner une vision synthétique et pilotable.

#### Indicateurs direction
- nombre d’élèves,
- absences du jour,
- retards,
- moyenne générale par classe,
- paiements en attente,
- taux de recouvrement,
- alertes critiques.

#### Indicateurs enseignant
- cours du jour,
- appels à faire,
- copies / notes à saisir,
- messages reçus.

#### Indicateurs parent
- actualités,
- devoirs à venir,
- absences,
- dernières notes,
- solde.

---

### 7.12 Module Emploi du temps
#### Objectif
Structurer les cours et disponibilités.

#### Fonctionnalités
- emploi du temps par classe,
- par enseignant,
- par élève,
- gestion des créneaux,
- salles,
- visualisation hebdomadaire.

#### Priorité
V2 plutôt que MVP strict, sauf si besoin marché immédiat.

---

### 7.13 Module IA
#### Objectif
Faire gagner du temps et améliorer le pilotage.

#### Fonctionnalités IA prioritaires
- génération d’appréciations de bulletin à partir des notes et observations,
- résumé automatique du suivi d’un élève,
- aide à rédaction d’un message parent,
- synthèse hebdomadaire pour la direction,
- alertes sur risque scolaire ou absentéisme.

#### Fonctionnalités IA futures
- OCR de copies / documents scannés,
- correction assistée,
- recommandations pédagogiques,
- chatbot parent,
- chatbot admin école,
- recherche intelligente dans les documents.

#### Principes IA
- IA assistive, pas opaque,
- validation humaine,
- traçabilité,
- protection des données.

---

## 8. MVP — version de lancement

Le MVP doit rester ambitieux mais livrable.

### Inclus dans le MVP
- authentification multi-rôle,
- gestion établissement / classes / matières,
- fiches élèves / parents / enseignants,
- affectations classes,
- appel / absences / retards,
- cahier de texte,
- devoirs,
- saisie de notes,
- messagerie / annonces,
- documents simples,
- finance basique,
- tableau de bord par rôle,
- premières fonctions IA simples.

### Exclu du MVP
- paiement en ligne avancé,
- OCR complexe,
- correction de copies par IA,
- transport,
- cantine,
- bibliothèque,
- visioconférence native,
- analytics avancés multi-écoles,
- app mobile native complète.

---

## 9. Versions futures

### V2
- emploi du temps complet,
- bulletins avancés,
- portail d’inscription,
- notifications multicanal,
- export / imports avancés,
- finance plus poussée,
- application mobile.

### V3
- IA avancée,
- prédiction décrochage / risque,
- OCR documents et devoirs,
- workflow d’approbation,
- moteur de recommandations,
- automatisations avancées.

---

## 10. Exigences UX/UI

### Principes
- simple,
- moderne,
- mobile-first,
- accès rapide à l’essentiel,
- peu de friction,
- adapté à des utilisateurs non techniques.

### Inspirations UX
- clarté d’un portail parent,
- puissance fonctionnelle d’un ERP,
- navigation par rôle,
- dashboards très lisibles,
- actions fréquentes en un clic.

### Contraintes
- performance sur connexions moyennes,
- bon rendu mobile,
- interface en français au lancement,
- support futur arabe / anglais.

---

## 11. Exigences techniques

### Architecture recommandée
- SaaS multi-tenant,
- application web responsive,
- API sécurisée,
- RBAC complet,
- audit logs,
- architecture modulaire.

### Stack suggérée
- Frontend : Next.js
- UI : Tailwind CSS + composants réutilisables
- Backend : Next.js API / NestJS possible
- Base de données : PostgreSQL
- Auth : Supabase Auth ou provider dédié
- Storage : bucket documents
- Notifications : email puis SMS/WhatsApp
- IA : provider LLM modulaire

### Contraintes majeures
- isolation des données par établissement,
- sécurité des données enfants et familles,
- traçabilité actions,
- sauvegarde et restauration,
- gestion permissions fine.

---

## 12. Données clés du domaine

### Entités principales
- School
- AcademicYear
- Term
- GradeLevel
- ClassRoom
- Subject
- Teacher
- Student
- Parent
- Enrollment
- Attendance
- Homework
- LessonLog
- Assessment
- Grade
- ReportCard
- Message
- Notification
- Document
- Invoice
- Payment
- User
- Role

---

## 13. Permissions par rôle

### Super Admin
- accès global plateforme

### Admin école
- gestion complète de son établissement

### Direction
- lecture large + pilotage + validation selon paramétrage

### Enseignant
- accès à ses classes, matières, appels, notes, devoirs, messages

### Parent
- accès à ses enfants uniquement

### Élève
- accès à ses propres données

### Comptable
- accès finance et reporting financier

---

## 14. Principaux parcours utilisateur

### Parcours enseignant
1. Se connecte
2. Consulte ses classes du jour
3. Fait l’appel
4. Dépose le contenu du cours
5. Ajoute un devoir
6. Saisit les notes
7. Envoie un message si besoin

### Parcours parent
1. Se connecte
2. Consulte la fiche de son enfant
3. Voit absences / notes / devoirs
4. Lit les messages
5. Télécharge un document
6. Vérifie les paiements

### Parcours administration
1. Crée l’année scolaire
2. Configure classes et matières
3. Inscrit les élèves
4. Associe parents et classes
5. Suit les paiements
6. Gère documents et communications

### Parcours direction
1. Ouvre le dashboard
2. Visualise alertes et indicateurs
3. Consulte classes à risque
4. Analyse recouvrement
5. Suit la qualité pédagogique

---

## 15. KPIs produit

### KPIs usage
- nombre d’établissements actifs,
- nombre d’utilisateurs actifs mensuels,
- taux de connexion parent,
- taux de saisie des appels,
- taux de saisie des notes,
- volume de messages envoyés.

### KPIs business
- MRR,
- churn,
- ARPA par établissement,
- temps moyen d’onboarding,
- taux de conversion essai → abonnement.

### KPIs impact
- baisse du temps administratif,
- amélioration du taux de consultation parent,
- réduction des impayés,
- meilleure réactivité sur absences.

---

## 16. Contraintes réglementaires et confiance

- protection des données personnelles,
- séparation stricte des données par école,
- consentement et gouvernance des données,
- journalisation,
- gestion des accès,
- export / suppression selon politique de conformité,
- chiffrement et bonnes pratiques de sécurité.

---

## 17. Hypothèses produit

- les écoles privées cherchent une solution plus moderne et plus flexible,
- les parents veulent plus de transparence,
- le mobile est essentiel,
- l’IA sera perçue comme une valeur ajoutée si elle reste concrète,
- un déploiement progressif par modules facilitera l’adoption.

---

## 18. Risques

- périmètre trop large dès la V1,
- complexité multi-rôle,
- diversité des pratiques scolaires,
- résistance au changement,
- exigence forte de fiabilité,
- données sensibles,
- intégrations locales à adapter pays par pays.

---

## 19. Priorisation fonctionnelle

### Priorité P0
- auth,
- rôles,
- structure établissement,
- élèves / parents / profs,
- absences,
- notes,
- devoirs,
- messages,
- dashboard de base.

### Priorité P1
- finance,
- documents,
- bulletins,
- rapports avancés,
- onboarding école.

### Priorité P2
- emploi du temps,
- admission en ligne,
- mobile app,
- IA avancée,
- paiements en ligne,
- OCR.

---

## 20. Positionnement marketing synthétique

EducLink est le cockpit digital des écoles privées : un ERP scolaire moderne qui réunit administration, pédagogie, parents et communication dans une seule plateforme, enrichie par l’intelligence artificielle.

---

## 21. Taglines produit possibles

- EducLink, le lien intelligent entre l’école et les familles.
- EducLink, l’ERP scolaire nouvelle génération.
- EducLink, pilotez votre école, connectez vos familles.
- EducLink, la gestion scolaire augmentée par l’IA.
