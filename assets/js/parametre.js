/*
Page des paramètres : affichage du compte, choix du thème et déconnexion.
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


// Le thème : on coche le choix enregistré, puis chaque changement est appliqué et gardé tout de suite
document.querySelectorAll('input[name="theme"]').forEach((bouton) => {
  bouton.checked = bouton.value === Theme.lire();

  bouton.onchange = () => {
    Theme.enregistrer(bouton.value);
    Theme.appliquer(bouton.value);
  };
});

// Le son des notifications : la case reprend le choix enregistré, et chaque changement est gardé par Local
const caseSon = document.getElementById("option-son");
caseSon.checked = Local.lirePreference("son", false);
caseSon.addEventListener("change", () => {
  Local.enregistrerPreference("son", caseSon.checked);
});

// Déconnexion : on efface d'abord les brouillons et le dernier salon de l'onglet, puis on ferme la session
document.getElementById("bouton-deconnexion").onclick = async () => {
  Local.oublierConversation();
  const { error } = await Auth.signOut();
  if (error) {
    console.error("Impossible de se déconnecter.", error);
  }
}

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});