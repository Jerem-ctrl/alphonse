/*
    auth.js
    Inscription, connexion et déconnexion avec Supabase Auth.
    Nécessite spclient.js, chargé avant ce fichier.
*/

const Auth = {

  // Connecte la personne avec son adresse courriel et son mot de passe
  async signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
  },

  // Crée un compte. Le mot de passe est haché par Supabase et n'est jamais stocké en clair.
  // Le pseudo est transmis dans les métadonnées du compte, puis recopié dans la table utilisateurs par le trigger creation_profil.
  async signUp(email, password, pseudo) {
    return await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { pseudo } }
    });
  },

  // Ferme la session et efface le jeton enregistré dans le navigateur.
  // Avec scope "local", seule la session du navigateur est effacée, sans appel au serveur,
  // ce qui est nécessaire après la suppression du compte, puisque celui-ci n'existe plus.
  async signOut(scope = "global") {
    return await supabaseClient.auth.signOut({ scope });
  },

  // Renvoie la personne connectée, ou null accompagné d'une erreur si aucune session n'est ouverte
  async getUser() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
      return { user: null, error: error ?? new Error("Aucune session") };
    }
    return { user: data.session.user, error: null };
  },

  // Appelle la fonction callback à chaque changement de session (connexion, déconnexion, ouverture de la page).
  // Un callback est une fonction transmise en paramètre, que Supabase exécute au moment voulu.
  onSessionChange(callback) {
    supabaseClient.auth.onAuthStateChange((event, session) => callback(event, session));
  },

  // Appelle la fonction callback lorsque personne n'est connecté, après une déconnexion ou à l'ouverture d'une page sans session.
  // Les pages protégées s'en servent pour renvoyer vers la page de connexion.
  onSessionEnded(callback) {
    Auth.onSessionChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        callback();
      }
    });
  },
};