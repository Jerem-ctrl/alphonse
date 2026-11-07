// spclient.js — Connexion au projet Supabase d'Alphonse

// La clé publishable est faite pour être vue : n'importe qui peut la lire dans le code de la page, et ce n'est pas grave, parce que ce sont nos policies RLS qui décident qui lit ou écrit quoi. Une clé secrète, elle, n'a rien à faire ici : elle passe outre la RLS, ce serait laisser le passe-partout sur la porte.

// Adresse du projet Supabase :
const SUPABASE_URL = "https://nsncedqaecfkgijeulyz.supabase.co";

// Clé publique :
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QrH4g8-GVaugBMM-eoZWZg_M3c2Z2ug";

// On confie à Supabase notre adaptateur avec auth.storage : c'est Local qui décide où dort la session, selon la case « Se souvenir de moi ».
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: Local.stockageSession }
});
