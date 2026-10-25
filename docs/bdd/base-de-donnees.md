# Base de données (Supabase)

## Authentification
Les comptes (email + mot de passe haché) sont gérés par Supabase Auth,
dans la table interne `auth.users`. Aucun mot de passe n'est stocké dans nos tables.

## Table `utilisateurs`
Informations publiques de chaque compte, reliées à `auth.users`.

| Colonne      | Type        | Détails                                   |
|--------------|-------------|-------------------------------------------|
| `id`         | uuid        | Clé primaire, lien vers `auth.users.id`   |
| `created_at` | timestamptz | Date d'inscription                        |
| `pseudo`     | text        | Obligatoire, unique                       |
| `en_ligne`   | bool        | Par défaut `false`                        |

Sécurité : Row Level Security activée.