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

## Création automatique du profil
Le trigger `creation_profil` (sur `auth.users`) lance la fonction `creer_profil_utilisateur`
après chaque inscription : elle crée la ligne dans `utilisateurs` avec le pseudo choisi.
Si le pseudo est déjà pris, l'inscription est refusée.

## Filtre des adresses email
Le hook **Before User Created** appelle la fonction `filtre_email` avant chaque inscription.
Elle refuse toute adresse qui ne finit pas par `@uqac.ca` ou `@etu.uqac.ca`.

## Sécurité (RLS)
Row Level Security activée sur `utilisateurs` :
- **Lecture** : toute personne connectée peut voir les profils (pseudos, contacts).
- **Modification** : chacun ne peut modifier que son propre profil.
- **Création et suppression** : aucune règle, donc interdites depuis le site.
  Le profil est créé par le trigger, et supprimé automatiquement avec le compte.