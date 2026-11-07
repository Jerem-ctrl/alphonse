# Base de données (Supabase)

Toute la base est décrite dans un seul script, [`schema.sql`](schema.sql), à lancer dans **SQL Editor**.
Il fonctionne sur un projet neuf comme sur le nôtre, et peut être relancé sans danger : chaque instruction vérifie d'abord ce qui existe déjà.

Comme dans le cours, nos tables ont un identifiant `int8` généré par la base et une date `created_at`.
Seuls les comptes gardent l'identifiant `uuid` de Supabase Auth, puisque c'est lui qui les crée.

## Relations

- Un compte de `auth.users` a exactement un profil dans `utilisateurs`.
- Un profil peut créer plusieurs `salons`, écrire plusieurs `messages`, avoir une ligne de `lectures` par salon et plusieurs `contacts`.
- Un salon contient plusieurs `messages` et plusieurs `lectures`.
- Un contact relie deux profils : le propriétaire de la liste (`user_id`) et la personne ajoutée (`contact_id`).

## Authentification
Les comptes (courriel et mot de passe haché) sont gérés par Supabase Auth, dans la table interne `auth.users`.
Aucun mot de passe n'est stocké dans nos tables.

Réglages :
- **Confirm email** désactivé : le compte est utilisable dès l'inscription (le service de courriel gratuit de Supabase est trop limité).
- **Mot de passe** : 8 caractères minimum, avec au moins une lettre et un chiffre.
- **Filtre UQAC** : seules les adresses `@uqac.ca` et `@etu.uqac.ca` peuvent s'inscrire.

## Table `utilisateurs`
Le profil public de chaque compte, relié à `auth.users`.

| Colonne             | Type        | Détails                                                   |
|---------------------|-------------|-----------------------------------------------------------|
| `id`                | uuid        | Clé primaire, lien vers `auth.users.id`, supprimé avec le compte |
| `created_at`        | timestamptz | Date d'inscription                                        |
| `pseudo`            | text        | Obligatoire, unique                                       |
| `derniere_activite` | timestamptz | Dernière activité, par défaut l'heure de l'inscription    |

`derniere_activite` remplace l'ancien booléen `en_ligne` : une personne est affichée « en ligne » si sa dernière activité est récente.
Un booléen restait à `true` quand un onglet se fermait brutalement ; une date ne ment jamais longtemps.

## Table `salons`

| Colonne      | Type        | Détails                                                                 |
|--------------|-------------|-------------------------------------------------------------------------|
| `id`         | int8        | Clé primaire, générée par la base                                       |
| `created_at` | timestamptz | Date de création                                                        |
| `nom`        | text        | Obligatoire, unique                                                     |
| `created_by` | uuid        | Créateur, rempli par la base avec `auth.uid()` ; vidé si son compte est supprimé, le salon reste |

## Table `messages`

| Colonne      | Type        | Détails                                                              |
|--------------|-------------|----------------------------------------------------------------------|
| `id`         | int8        | Clé primaire, générée par la base                                    |
| `created_at` | timestamptz | Date d'envoi (sert à l'horodatage et au tri)                         |
| `salon_id`   | int8        | Salon du message ; supprimé avec le salon                            |
| `user_id`    | uuid        | Auteur, rempli par la base avec `auth.uid()` ; supprimé avec le compte |
| `texte`      | text        | Texte du message                                                     |
| `image`      | text        | Chemin de l'image dans le compartiment `images`                      |

Un message contient du texte, une image ou les deux, jamais rien (contrainte `message_non_vide`).
Le pseudo de l'auteur n'est pas recopié : on le lit dans `utilisateurs` grâce à la clé étrangère, il reste donc toujours à jour.

## Table `lectures`
Pour chaque personne et chaque salon, la dernière réception et la dernière lecture des messages.
C'est ce qui permet d'afficher « envoyé », « reçu » ou « lu » sous un message.

| Colonne              | Type        | Détails                                              |
|----------------------|-------------|------------------------------------------------------|
| `id`                 | int8        | Clé primaire, générée par la base                    |
| `user_id`            | uuid        | La personne, remplie par la base avec `auth.uid()`   |
| `salon_id`           | int8        | Le salon ; supprimé avec le salon                    |
| `derniere_reception` | timestamptz | Dernière fois que les messages ont été reçus         |
| `derniere_lecture`   | timestamptz | Dernière fois que le salon a été ouvert              |

Une seule ligne par personne et par salon (contrainte `une_lecture_par_salon`).

## Table `contacts`

| Colonne      | Type        | Détails                                                  |
|--------------|-------------|----------------------------------------------------------|
| `id`         | int8        | Clé primaire, générée par la base                        |
| `created_at` | timestamptz | Date d'ajout                                             |
| `user_id`    | uuid        | Propriétaire de la liste, rempli par la base avec `auth.uid()` |
| `contact_id` | uuid        | Personne ajoutée                                         |

On ne peut pas s'ajouter soi-même (`pas_soi_meme`) ni ajouter deux fois la même personne (`un_contact_une_fois`).
Si l'un des deux comptes est supprimé, le lien disparaît.

## Index
Postgres ne crée pas d'index tout seul sur les clés étrangères. Nous en avons ajouté sur les colonnes les plus interrogées :
`messages (salon_id, created_at)`, `messages (user_id)`, `salons (created_by)`, `lectures (salon_id)` et `contacts (contact_id)`.

## Création automatique du profil
Le trigger `creation_profil` (sur `auth.users`) lance la fonction `creer_profil_utilisateur` après chaque inscription :
elle crée la ligne dans `utilisateurs` avec le pseudo choisi. Si le pseudo est déjà pris, l'inscription est refusée.
Le profil est donc écrit par la base, jamais par le navigateur.

## Filtre des adresses
Le hook **Before User Created** (Authentication > Hooks) appelle la fonction `filtre_email` avant chaque inscription.
Elle refuse toute adresse qui ne finit pas par `@uqac.ca` ou `@etu.uqac.ca`. Seul le service d'authentification peut l'exécuter.

## Suppression d'un compte
Supprimer un compte dans `auth.users` supprime en cascade son profil, ses messages, ses lectures et ses contacts.
Les salons qu'il a créés restent, pour ne pas effacer les messages des autres membres.

## Sécurité (RLS)
La Row Level Security est activée sur les cinq tables. Sans règle qui l'autorise, tout accès depuis le site est refusé :
une table fermée par défaut vaut mieux qu'une table ouverte par oubli.

## Temps réel
Les tables `salons`, `messages`, `lectures` et `utilisateurs` sont dans la publication `supabase_realtime` :
les nouveaux salons et messages, les lectures et l'activité des comptes arrivent dans les pages ouvertes sans recharger.

## Stockage des images
Le compartiment Storage `images` est public : une image s'affiche avec son lien.
Supabase refuse tout fichier de plus de 2 Mo et tout format autre que PNG, JPEG, WebP et GIF, même si le formulaire est contourné.
