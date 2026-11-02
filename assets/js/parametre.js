/*
        Page des paramètres : affichage du compte et déconnexion.
*/


// -- Éléments et initialisation


// Affiche l'email et le pseudo de la personne connectée
async function init() {
  const { user } = await Auth.getUser();

  document.getElementById("affichage-email").textContent = user.email;

  const { data } = await supabaseClient
    .from("utilisateurs")
    .select("pseudo")
    .eq("id", user.id)
    .single();

  document.getElementById("affichage-pseudo").textContent = data.pseudo;
}

init();

// -- Événements
 
document.getElementById("bouton-deconnexion").onclick = async () => {
  const { error } = await Auth.signOut();
  if (error) {
    console.error("Impossible de se déconnecter.", error);
  }
}

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});