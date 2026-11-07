/*
    schema.sql : toute la base de données d'Alphonse, en un seul script.

    On le lance dans Supabase, menu SQL Editor, bouton Run.
    Il fonctionne sur un projet neuf comme sur notre projet existant, et on peut le relancer sans danger :
    chaque instruction vérifie d'abord ce qui existe déjà (if not exists, if exists, on conflict).

    Comme dans le cours, nos tables ont un identifiant int8 généré par la base et une date created_at.
    Seuls les comptes gardent l'uuid de Supabase Auth, puisque c'est lui qui les crée.
*/


-- =====================================================================
-- 0. Ménage de la première version
-- =====================================================================

/*
    La première version de la base avait des tables channels et messages, avec des identifiants uuid et des noms en anglais.
    On les remplace par notre schéma en français. On ne supprime messages que si c'est l'ancienne
    (celle qui a une colonne channel_id) : relancer le script n'efface donc jamais les vrais messages.
*/
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'channel_id'
    ) then
        drop table public.messages cascade;
    end if;
end $$;

drop table if exists public.channels cascade;

-- Cette fonction remplissait le pseudo dans l'ancienne table messages. Désormais, on lit le pseudo dans utilisateurs au moment d'afficher : il n'est plus recopié dans chaque message.
drop function if exists public.remplir_pseudo_message() cascade;


-- =====================================================================
-- 1. Comptes : utilisateurs, profil automatique, filtre des adresses
-- =====================================================================

-- Le profil public de chaque compte. Il disparaît avec le compte (on delete cascade).
create table if not exists public.utilisateurs (
    id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    pseudo text not null unique,
    derniere_activite timestamptz not null default now()
);

/*
    derniere_activite remplace l'ancien booléen en_ligne. Un booléen reste à true si l'onglet se ferme brutalement ;
    avec une date, on dit « en ligne » seulement si la dernière activité est récente, et l'information ne ment jamais longtemps.
*/
alter table public.utilisateurs add column if not exists derniere_activite timestamptz not null default now();
alter table public.utilisateurs drop column if exists en_ligne;

/*
    Création du profil à l'inscription : le pseudo vient des métadonnées envoyées par auth.js.
    C'est la base qui écrit la ligne, pas le navigateur : personne ne peut créer le profil de quelqu'un d'autre.
    Si le pseudo est déjà pris, la contrainte unique fait échouer l'inscription entière, et connexion.js l'explique à la personne.
    security definer et search_path vide : la fonction s'exécute avec les droits de la base, sans pouvoir être détournée par un autre schéma.
*/
create or replace function public.creer_profil_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.utilisateurs (id, pseudo)
    values (new.id, new.raw_user_meta_data ->> 'pseudo');
    return new;
end;
$$;

drop trigger if exists creation_profil on auth.users;
create trigger creation_profil
    after insert on auth.users
    for each row execute function public.creer_profil_utilisateur();

/*
    Filtre des adresses, appelé par le hook « Before User Created » de Supabase Auth : seules les adresses de l'UQAC passent.
    On ne la crée que si elle n'existe pas encore, pour ne pas toucher à celle qui tourne déjà sur notre projet.
*/
do $$
begin
    if not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'filtre_email'
    ) then
        execute $fonction$
            create function public.filtre_email(event jsonb)
            returns jsonb
            language plpgsql
            as $corps$
            begin
                if lower(event -> 'user' ->> 'email') ~ '@(etu\.)?uqac\.ca$' then
                    return '{}'::jsonb;
                end if;
                return jsonb_build_object(
                    'error', jsonb_build_object(
                        'message', 'Seules les adresses @uqac.ca et @etu.uqac.ca peuvent s''inscrire.',
                        'http_code', 403
                    )
                );
            end;
            $corps$;
        $fonction$;
    end if;
end $$;

-- Seul le service d'authentification a le droit d'appeler le filtre ; ni les visiteurs ni les comptes connectés.
grant execute on function public.filtre_email(jsonb) to supabase_auth_admin;
revoke execute on function public.filtre_email(jsonb) from authenticated, anon, public;


-- =====================================================================
-- 2. Salons, messages, lectures et contacts
-- =====================================================================

/*
    Les salons. Le nom est unique : deux salons « Projet » côte à côte, ce serait la confusion assurée.
    created_by est rempli par la base avec la personne connectée (auth.uid()), jamais envoyé par le navigateur.
    Si le créateur supprime son compte, le salon reste (on delete set null) : les messages des autres n'ont pas à disparaître avec lui.
*/
create table if not exists public.salons (
    id int8 generated by default as identity primary key,
    created_at timestamptz not null default now(),
    nom text not null unique,
    created_by uuid default auth.uid() references public.utilisateurs (id) on delete set null
);

/*
    Les messages, chacun relié à son salon et à son auteur.
    Un message contient du texte, une image (le chemin du fichier dans le compartiment images), ou les deux, mais jamais rien.
    On ne recopie pas le pseudo ici : on le lit dans utilisateurs grâce à la clé étrangère, il reste donc toujours à jour.
*/
create table if not exists public.messages (
    id int8 generated by default as identity primary key,
    created_at timestamptz not null default now(),
    salon_id int8 not null references public.salons (id) on delete cascade,
    user_id uuid not null default auth.uid() references public.utilisateurs (id) on delete cascade,
    texte text,
    image text,
    constraint message_non_vide check (texte is not null or image is not null)
);

/*
    Les lectures : pour chaque personne et chaque salon, la dernière fois que ses messages ont été reçus, puis lus.
    C'est ce qui permet d'afficher « envoyé », « reçu » ou « lu » sous un message. Une seule ligne par personne et par salon (unique).
*/
create table if not exists public.lectures (
    id int8 generated by default as identity primary key,
    user_id uuid not null default auth.uid() references public.utilisateurs (id) on delete cascade,
    salon_id int8 not null references public.salons (id) on delete cascade,
    derniere_reception timestamptz,
    derniere_lecture timestamptz,
    constraint une_lecture_par_salon unique (user_id, salon_id)
);

/*
    Les contacts : user_id est le propriétaire de la liste, contact_id la personne ajoutée.
    On ne peut pas s'ajouter soi-même, ni ajouter deux fois la même personne.
*/
create table if not exists public.contacts (
    id int8 generated by default as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references public.utilisateurs (id) on delete cascade,
    contact_id uuid not null references public.utilisateurs (id) on delete cascade,
    constraint un_contact_une_fois unique (user_id, contact_id),
    constraint pas_soi_meme check (user_id <> contact_id)
);

/*
    Des index sur les colonnes qu'on interroge le plus. Postgres n'en crée pas tout seul pour les clés étrangères :
    sans eux, chercher les messages d'un salon reviendrait à relire toute la table.
*/
create index if not exists messages_salon_date_idx on public.messages (salon_id, created_at desc);
create index if not exists messages_user_idx on public.messages (user_id);
create index if not exists salons_created_by_idx on public.salons (created_by);
create index if not exists lectures_salon_idx on public.lectures (salon_id);
create index if not exists contacts_contact_idx on public.contacts (contact_id);

/*
    La RLS (Row Level Security) est activée sur chaque table dès sa création.
    Tant qu'aucune règle n'autorise quelque chose, la base refuse tout ce qui vient du site :
    une table fermée par défaut vaut mieux qu'une table ouverte par oubli.
*/
alter table public.utilisateurs enable row level security;
alter table public.salons enable row level security;
alter table public.messages enable row level security;
alter table public.lectures enable row level security;
alter table public.contacts enable row level security;


-- =====================================================================
-- 3. Temps réel
-- =====================================================================

/*
    On ajoute à la publication supabase_realtime les tables que les pages écoutent :
    les nouveaux salons et messages, les lectures (pour « lu ») et les profils (pour « en ligne »).
    La boucle vérifie chaque table avant de l'ajouter, sinon une deuxième exécution échouerait.
*/
do $$
declare
    nom_table text;
begin
    foreach nom_table in array array['salons', 'messages', 'lectures', 'utilisateurs'] loop
        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = nom_table
        ) then
            execute format('alter publication supabase_realtime add table public.%I', nom_table);
        end if;
    end loop;
end $$;


-- =====================================================================
-- 4. Stockage des images
-- =====================================================================

/*
    Le compartiment images. Il est public : une image s'affiche avec son lien, sans jeton.
    En contrepartie, Supabase refuse tout fichier de plus de 2 Mo (2 097 152 octets) et tout ce qui n'est pas PNG, JPEG, WebP ou GIF,
    même si quelqu'un contourne le formulaire.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
