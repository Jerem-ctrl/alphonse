# Alphonse

Messagerie web professionnelle, réservée aux étudiants et au personnel de l'UQAC.
Projet fil-rouge du cours 8WEB101 (UQAC, automne 2026).

**Site en ligne :** https://jerem-ctrl.github.io/alphonse/


# Équipe

| Membre | Compte GitHub |
|---|---|
| Olwen CRAVILLY--MITAINE | Cravilly-Olwen |
| Jérémy *(nom à compléter)* | Jerem-ctrl |


# Fonctionnalités

## Comptes et authentification
- **Inscription** dans une fenêtre pop-up : pseudo, adresse courriel UQAC et mot de passe.
- **Inscription réservée à l'UQAC** : seules les adresses `@uqac.ca` et `@etu.uqac.ca` sont acceptées (vérifié par le navigateur, puis par Supabase).
- **Connexion** par courriel et mot de passe, avec des messages d'erreur clairs en français.
- **Redirection automatique** : une personne déjà connectée arrive directement sur la messagerie, et une personne non connectée est renvoyée vers la page de connexion.
- **Déconnexion** depuis la page des paramètres.

## Pages
- **Connexion** (`index.html`) : connexion et création de compte.
- **Conversations** (`pages/conversation.html`) : salons de discussion et messages.
- **Contacts** (`pages/contact.html`) : liste des personnes inscrites, avec une recherche par pseudo.
- **Paramètres** (`pages/parametre.html`) : affichage du pseudo et du courriel, déconnexion.

## Messagerie
- Création de salons et liste des salons.
- Envoi et affichage des messages, avec l'heure.
- Réception des nouveaux messages en temps réel.

## Fonctionnalité supplémentaire : assistant de rédaction
Avant l'envoi, le message peut être vérifié par le correcteur **LanguageTool** (orthographe, grammaire, typographie), complété par des règles locales sur la politesse et le ton.


# Technologies

- **HTML5** sémantique et accessible (`<header>`, `<nav>`, `<main>`, `<dialog>`, `<fieldset>`, attributs ARIA).
- **CSS3** : variables, Flexbox, media queries, transitions.
- **JavaScript** sans framework : DOM, événements, `async` / `await`.
- **Supabase** : authentification, base de données PostgreSQL, temps réel.
- **GitHub Pages** pour l'hébergement.


# Structure du projet

```
alphonse/
├── index.html                  Connexion et inscription
├── pages/
│   ├── conversation.html       Salons et messages
│   ├── contact.html            Liste des contacts
│   └── parametre.html          Paramètres du compte
├── assets/
│   ├── css/
│   │   ├── style.css           Styles communs (couleurs, polices, base)
│   │   └── auth.css            Page de connexion
│   ├── img/                    Logo et bannière
│   └── js/
│       ├── spclient.js         Connexion au projet Supabase
│       ├── auth.js             Inscription, connexion, déconnexion, session
│       ├── data.js             Lecture et écriture des salons et des messages
│       ├── connexion.js        Page de connexion et d'inscription
│       ├── contact.js          Page des contacts
│       └── parametre.js        Page des paramètres
└── docs/
    ├── bdd/                    Documentation de la base de données
    ├── croquis/                Croquis des pages
    ├── api-languagetool.md     Étude de l'API LanguageTool
    ├── arborescence.jpeg
    ├── flux-utilisation.jpeg
    └── fiche-analyse.pdf
```

**Règle de nommage :** les fichiers repris du projet Webchat du cours gardent leur nom d'origine (`spclient.js`, `auth.js`, `data.js`) ; nos propres fichiers sont nommés en français.

Chaque page charge ses scripts dans le même ordre : la bibliothèque Supabase, puis `spclient.js`, `auth.js`, et enfin le script de la page. Chaque fichier utilise ce que crée le précédent.


# Installation

Le site fonctionne directement en ligne. Pour le faire tourner sur un autre projet Supabase :

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécuter le contenu de `docs/bdd/schema.sql`.
3. Dans **Authentication > Hooks**, activer le hook **Before User Created** avec la fonction `public.filtre_email`.
4. Dans **Authentication > Sign In / Providers > Email**, désactiver **Confirm email**.
5. Dans `assets/js/spclient.js`, remplacer `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` par ceux du nouveau projet (**Project Settings > API Keys**).
6. Ouvrir `index.html` dans un navigateur, ou publier le dépôt avec GitHub Pages.


# Services Web utilisés

## Supabase
- **Authentification** : les comptes (courriel et mot de passe haché) sont gérés par Supabase Auth. Aucun mot de passe n'est stocké dans nos tables.
- **Base de données** : la table `utilisateurs` contient les informations publiques de chaque compte (pseudo, dernière activité). Les tables `salons`, `messages`, `lectures` et `contacts` contiennent les salons, les messages, l'état de lecture et les listes de contacts. Tout le schéma est dans `docs/bdd/schema.sql`, détaillé dans `docs/bdd/base-de-donnees.md`.
- **Temps réel** : les nouveaux messages sont reçus sans recharger la page.
- **Stockage** : le compartiment `images` reçoit les images partagées, 2 Mo au plus, en PNG, JPEG, WebP ou GIF.

## LanguageTool
API publique de correction : https://languagetool.org. Le texte du message est envoyé à ce service tiers uniquement quand l'utilisateur demande une vérification. L'étude de l'API, ses limites et nos tests sont détaillés dans `docs/api-languagetool.md`.

## Google Fonts
Police **Playfair Display** pour les titres, choisie pour rappeler le logo.


# Sécurité

- **Clé publique uniquement** : la clé présente dans `spclient.js` est la clé « publishable » de Supabase, prévue pour être visible. La clé secrète n'apparaît jamais dans le code.
- **Row Level Security (RLS)** : sur la table `utilisateurs`, une personne connectée peut lire les profils, mais ne peut modifier que le sien. Personne ne peut créer ou supprimer un profil depuis le site.
- **Création du profil côté serveur** : un trigger (`creation_profil`) crée automatiquement le profil avec le pseudo au moment de l'inscription. Le pseudo ne peut donc pas être falsifié par le navigateur, ce qui corrige une limite relevée dans le projet Webchat.
- **Filtre des adresses côté serveur** : la fonction `filtre_email` refuse toute adresse qui n'est pas de l'UQAC, même si quelqu'un contourne le formulaire.
- **Affichage avec `textContent`** : les pseudos et les messages sont affichés comme du texte, jamais comme du HTML, ce qui empêche l'injection de code.
- **Validation en deux couches** : les règles du formulaire (`required`, `pattern`, `minlength`) servent au confort de l'utilisateur ; les vraies vérifications sont faites par Supabase.


# Limites


# Répartition de notre travail

## Olwen CRAVILLY--MITAINE


## Jérémy


# Sources

- Projet **Webchat** de Damien Brun, présenté dans le cours (licence MIT). Nous nous sommes inspirés de ses fichiers JavaScript, puis nous les avons modifiés et complétés pour notre projet : affichage des erreurs dans la page, pseudo enregistré par un trigger, inscription en pop-up, filtre des adresses UQAC, page des contacts.
- Cours et TD du cours 8WEB101.
- [Documentation de Supabase](https://supabase.com/docs).
- [Documentation de l'API LanguageTool](https://dev.languagetool.org/public-http-api).


# Usage de l'IA