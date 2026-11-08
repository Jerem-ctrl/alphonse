// spclient.js
// Connexion au projet Supabase d'Alphonse.

// La clé « publishable » est prévue pour être visible dans le code de la page.
// La protection des données repose sur les règles RLS, qui déterminent qui peut lire ou écrire quoi.
// Une clé secrète n'a jamais sa place ici, car elle contourne la RLS.

// Adresse du projet Supabase
const SUPABASE_URL = "https://nsncedqaecfkgijeulyz.supabase.co";

// Clé publique
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QrH4g8-GVaugBMM-eoZWZg_M3c2Z2ug";

// L'option auth.storage confie le stockage de la session à Local, qui choisit son emplacement selon la case « Se souvenir de moi »
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: Local.stockageSession }
});