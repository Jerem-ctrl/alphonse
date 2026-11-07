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


-- =====================================================================
-- 5. Sécurité
-- =====================================================================

/*
    La règle de base : seuls les comptes connectés (le rôle authenticated) lisent, et chacun n'écrit que ses propres lignes.
    La clé publique du site est visible par tout le monde dans spclient.js : c'est donc ici, dans la base, que tout se joue,
    pas dans le navigateur, qu'on peut toujours contourner.
*/

-- 5.1 On repart d'une feuille blanche : on retire toutes les règles existantes de nos tables, puis on les recrée ci-dessous.
-- Ainsi, ce fichier décrit exactement ce qui est en place, sans règle oubliée d'une version précédente.
do $$
declare
    regle record;
begin
    for regle in
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and tablename in ('utilisateurs', 'salons', 'messages', 'lectures', 'contacts')
    loop
        execute format('drop policy %I on public.%I', regle.policyname, regle.tablename);
    end loop;
end $$;

/*
    5.2 Les visiteurs non connectés (le rôle anon) n'ont aucun droit sur nos tables.
    La RLS les bloquerait déjà ; on retire aussi les droits eux-mêmes : deux verrous valent mieux qu'un.
*/
revoke all on public.utilisateurs, public.salons, public.messages, public.lectures, public.contacts from anon;

/*
    5.3 Les profils : tout compte connecté peut les lire (pour trouver un contact ou afficher un pseudo).
    Seule la colonne derniere_activite peut être modifiée, et seulement sur son propre profil :
    personne ne peut changer son identifiant, sa date d'inscription ni, en douce, le pseudo d'un autre.
    Création et suppression : aucune règle, donc interdites depuis le site. Le trigger crée le profil, la cascade le supprime.

    On écrit (select auth.uid()) plutôt que auth.uid() : Postgres calcule l'identifiant une seule fois par requête
    au lieu d'une fois par ligne, comme le recommande Supabase. Le résultat est le même.
*/
revoke insert, update, delete on public.utilisateurs from authenticated;
grant update (derniere_activite) on public.utilisateurs to authenticated;

create policy "Profils lisibles par les comptes connectés"
    on public.utilisateurs for select to authenticated
    using (true);

create policy "Chacun met à jour son propre profil"
    on public.utilisateurs for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

-- 5.4 Les salons : tout compte connecté les voit et peut en créer, toujours en son propre nom. Ni modification ni suppression.
create policy "Salons lisibles par les comptes connectés"
    on public.salons for select to authenticated
    using (true);

create policy "Création d'un salon en son propre nom"
    on public.salons for insert to authenticated
    with check ((select auth.uid()) = created_by);

/*
    5.5 Les messages : lisibles par les comptes connectés, écrits en son propre nom, supprimés seulement par leur auteur.
    Une image jointe doit se trouver dans le dossier de l'auteur : impossible de faire passer le fichier d'un autre pour le sien.
    Pas de modification : un message envoyé ne change pas derrière le dos de ceux qui l'ont lu.
*/
create policy "Messages lisibles par les comptes connectés"
    on public.messages for select to authenticated
    using (true);

create policy "Envoi d'un message en son propre nom"
    on public.messages for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and (image is null or split_part(image, '/', 1) = (select auth.uid())::text)
    );

create policy "Suppression de ses propres messages"
    on public.messages for delete to authenticated
    using ((select auth.uid()) = user_id);

/*
    5.6 Les lectures : lisibles par les comptes connectés, puisque c'est ce qui affiche « reçu » ou « lu » sous un message.
    Chacun crée et met à jour seulement les siennes (insert et update, ce qu'il faut pour un upsert).
*/
create policy "Lectures lisibles par les comptes connectés"
    on public.lectures for select to authenticated
    using (true);

create policy "Création de ses propres lectures"
    on public.lectures for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Mise à jour de ses propres lectures"
    on public.lectures for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

/*
    5.7 Les contacts : une liste de contacts est privée. Chacun ne voit, n'ajoute et ne retire que les siens.
    C'est la seule table qu'un compte connecté ne peut pas lire en entier, et c'est voulu.
*/
create policy "Chacun voit ses propres contacts"
    on public.contacts for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "Ajout d'un contact à sa propre liste"
    on public.contacts for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Retrait d'un contact de sa propre liste"
    on public.contacts for delete to authenticated
    using ((select auth.uid()) = user_id);

/*
    5.8 Les contraintes CHECK : les mêmes règles que les formulaires, mais côté base, là où on ne peut pas les contourner.
    On retire chaque contrainte avant de la recréer, pour pouvoir relancer le script.
*/

-- Un nom de salon de 1 à 40 caractères, sans espaces autour (le maxlength du formulaire, en version incontournable).
alter table public.salons drop constraint if exists nom_salon_valide;
alter table public.salons add constraint nom_salon_valide
    check (nom = btrim(nom) and char_length(nom) between 1 and 40);

-- « Projet » et « projet » seraient deux salons différents pour unique ; cet index les considère comme un seul nom.
create unique index if not exists salons_nom_sans_casse_idx on public.salons (lower(nom));

-- Un texte de message non vide, de 2000 caractères au plus, comme le maxlength de la zone de saisie.
alter table public.messages drop constraint if exists texte_message_valide;
alter table public.messages add constraint texte_message_valide
    check (texte is null or (btrim(texte) <> '' and char_length(texte) <= 2000));

-- Le chemin d'une image : « identifiant-du-compte/nom-du-fichier », rien d'autre.
alter table public.messages drop constraint if exists chemin_image_valide;
alter table public.messages add constraint chemin_image_valide
    check (image is null or (char_length(image) <= 200 and image ~ '^[0-9a-f-]{36}/[^/]+$'));

/*
    Le pseudo suit la même règle que le formulaire d'inscription : 3 à 20 caractères, lettres sans accent, chiffres, _ ou -.
    not valid applique la règle à toute nouvelle inscription sans refuser les comptes créés avant elle ;
    on tente ensuite de la valider sur les anciens comptes, et si l'un d'eux ne la respecte pas, on le laisse tranquille.
*/
alter table public.utilisateurs drop constraint if exists pseudo_valide;
alter table public.utilisateurs add constraint pseudo_valide
    check (pseudo ~ '^[A-Za-z0-9_-]{3,20}$') not valid;

do $$
begin
    alter table public.utilisateurs validate constraint pseudo_valide;
exception when check_violation then
    raise notice 'Un ancien pseudo ne respecte pas la règle : la contrainte s''applique seulement aux nouvelles inscriptions.';
end $$;

/*
    5.9 Les images : un dossier par compte, nommé avec son identifiant.
    Un compte connecté dépose, liste et supprime des fichiers seulement dans son propre dossier.
    Le compartiment est public : afficher une image ne demande pas de règle de lecture, son lien suffit.
    La taille (2 Mo) et les formats (PNG, JPEG, WebP, GIF) sont fixés sur le compartiment, dans la section 4.
*/
drop policy if exists "Dépôt d'images dans son propre dossier" on storage.objects;
drop policy if exists "Liste de ses propres images" on storage.objects;
drop policy if exists "Suppression de ses propres images" on storage.objects;

create policy "Dépôt d'images dans son propre dossier"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Liste de ses propres images"
    on storage.objects for select to authenticated
    using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Suppression de ses propres images"
    on storage.objects for delete to authenticated
    using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);

/*
    5.10 Supprimer son compte, depuis la page des paramètres, avec supabaseClient.rpc("supprimer_mon_compte").
    security definer : la fonction a le droit de toucher à auth.users, ce que le site n'a pas ; mais elle ne supprime
    que la ligne de la personne connectée (auth.uid()), jamais une autre. La cascade emporte ensuite son profil,
    ses messages, ses lectures et ses contacts. Les fichiers de Storage, eux, s'effacent avant, par l'API de Storage.
*/
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Aucun compte connecté.';
    end if;
    delete from auth.users where id = auth.uid();
end;
$$;

-- Seuls les comptes connectés peuvent l'appeler ; un visiteur anonyme n'a rien à supprimer.
revoke execute on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- La fonction du trigger de profil ne doit pas pouvoir s'appeler à la main depuis le site.
revoke execute on function public.creer_profil_utilisateur() from public, anon, authenticated;
