# Base de données (Supabase)

## Authentification
Les comptes (email + mot de passe haché) sont gérés par Supabase Auth,
dans la table interne `auth.users`. Aucun mot de passe n'est stocké dans nos tables.

Réglages :
- **Confirm email** désactivé : le compte est utilisable dès l'inscription
  (le service d'email gratuit de Supabase est trop limité).
- **Filtre UQAC** : seules les adresses `@uqac.ca` et `@etu.uqac.ca` peuvent s'inscrire.

## Table `utilisateurs`
Informations publiques de chaque compte, reliées à `auth.users`.

| Colonne      | Type        | Détails                                   |
|--------------|-------------|-------------------------------------------|
| `id`         | uuid        | Clé primaire, lien vers `auth.users.id`   |
| `created_at` | timestamptz | Date d'inscription                        |
| `pseudo`     | text        | Obligatoire, unique                       |
| `en_ligne`   | bool        | Par défaut `false`                        |

## Table `channels` (salons)

| Colonne      | Type        | Détails                                              |
|--------------|-------------|------------------------------------------------------|
| `id`         | uuid        | Clé primaire, générée automatiquement                |
| `name`       | text        | Obligatoire, unique, de 1 à 50 caractères            |
| `created_at` | timestamptz | Date de création                                     |
| `created_by` | uuid        | Créateur, rempli par la base avec la personne connectée |

## Table `messages`

| Colonne      | Type        | Détails                                                       |
|--------------|-------------|---------------------------------------------------------------|
| `id`         | uuid        | Clé primaire, générée automatiquement                         |
| `channel_id` | uuid        | Salon du message (supprimé avec le salon)                     |
| `user_id`    | uuid        | Auteur, rempli par la base avec la personne connectée         |
| `username`   | text        | Pseudo de l'auteur, rempli par le trigger `pseudo_message`    |
| `content`    | text        | Texte du message, de 1 à 2000 caractères                      |
| `created_at` | timestamptz | Date d'envoi (sert à l'horodatage)                            |

## Création automatique du profil
Le trigger `creation_profil` (sur `auth.users`) lance la fonction `creer_profil_utilisateur`
après chaque inscription : elle crée la ligne dans `utilisateurs` avec le pseudo choisi.
Si le pseudo est déjà pris, l'inscription est refusée.

## Pseudo des messages
Le trigger `pseudo_message` (sur `messages`) lance la fonction `remplir_pseudo_message`
avant chaque nouveau message : elle remplit `username` avec le vrai pseudo de la personne
connectée, lu dans `utilisateurs`. Le navigateur ne peut donc pas falsifier l'auteur d'un message.

## Filtre des adresses email
Le hook **Before User Created** appelle la fonction `filtre_email` avant chaque inscription.
Elle refuse toute adresse qui ne finit pas par `@uqac.ca` ou `@etu.uqac.ca`.

## Sécurité (RLS)
Row Level Security activée sur les trois tables.

`utilisateurs` :
- **Lecture** : toute personne connectée peut voir les profils (pseudos, contacts).
- **Modification** : chacun ne peut modifier que son propre profil.
- **Création et suppression** : aucune règle, donc interdites depuis le site.
  Le profil est créé par le trigger, et supprimé automatiquement avec le compte.

`channels` et `messages` :
- **Lecture** : toute personne connectée voit tous les salons et tous les messages.
- **Création** : seulement en son propre nom (`created_by` ou `user_id` = la personne connectée).
- **Modification et suppression** : aucune règle, donc interdites depuis le site.

## Temps réel
Les tables `channels` et `messages` sont ajoutées à la publication `supabase_realtime` :
les nouveaux salons et messages sont envoyés aux pages ouvertes, sans recharger la page.