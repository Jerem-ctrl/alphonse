// spclient.js — Connexion au projet Supabase d'Alphonse

// Adresse du projet Supabase :
const SUPABASE_URL = "https://nsncedqaecfkgijeulyz.supabase.co";

// Clé publique :
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QrH4g8-GVaugBMM-eoZWZg_M3c2Z2ug";

// Création du client :
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);