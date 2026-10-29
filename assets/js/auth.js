/*
    auth.js — Inscription, connexion et déconnexion avec Supabase
*/

const Auth = {

  // Connexion avec email et mot de passe
  async signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
  },

  // Création d'un compte (Supabase hache le mot de passe)
  async signUp(email, password) {
    return await supabaseClient.auth.signUp({
      email,
      password
    });
  },

  // Déconnexion
  async signOut() {
    return await supabaseClient.auth.signOut();
  },

  // Renvoie l'utilisateur connecté (ou null)
  async getUser() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
      return { user: null, error: error ?? new Error("Aucune session") };
    }
    return { user: data.session.user, error: null };
  },

  // Exécute "callback" à chaque connexion ou déconnexion
  onSessionChange(callback) {
    supabaseClient.auth.onAuthStateChange((event, session) => callback(event, session));
  },

  // Exécute "callback" si personne n'est connecté
  onSessionEnded(callback) {
    Auth.onSessionChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        callback();
      }
    });
  },
};