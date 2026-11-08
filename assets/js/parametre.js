/*
    parametre.js
    Page des paramètres. Affiche le compte, gère le choix du thème, le son des notifications,
    la déconnexion et la suppression du compte.
*/


// -- Éléments et initialisation


const zoneErreurCompte = document.getElementById("erreur-compte");
const boutonSupprimerCompte = document.getElementById("bouton-supprimer-compte");

// Identifiant et pseudo de la personne connectée, utilisés pour la suppression du compte
let monId = null;
let monPseudo = null;

// Affiche le courriel et le pseudo de la personne connectée
async function init() {
  const { user } = await Auth.getUser();
  monId = user.id;

  document.getElementById("affichage-email").textContent = user.email;

  const { data } = await supabaseClient
    .from("utilisateurs")
    .select("pseudo")
    .eq("id", user.id)
    .single();

  monPseudo = data.pseudo;
  document.getElementById("affichage-pseudo").textContent = monPseudo;
}

init();


// -- Événements


// Coche le thème enregistré, puis applique et conserve immédiatement chaque nouveau choix
document.querySelectorAll('input[name="theme"]').forEach((bouton) => {
  bouton.checked = bouton.value === Theme.lire();

  bouton.onchange = () => {
    Theme.enregistrer(bouton.value);
    Theme.appliquer(bouton.value);
  };
});

// Reprend le réglage enregistré du son des notifications, et conserve chaque changement avec Local
const caseSon = document.getElementById("option-son");
caseSon.checked = Local.lirePreference("son", true);
caseSon.addEventListener("change", () => {
  Local.enregistrerPreference("son", caseSon.checked);
});

// Efface les brouillons et le dernier salon de l'onglet, puis ferme la session
document.getElementById("bouton-deconnexion").onclick = async () => {
  Local.oublierConversation();
  const { error } = await Auth.signOut();
  if (error) {
    console.error("Impossible de se déconnecter.", error);
  }
}

// Suppression du compte. La personne doit retaper son pseudo avec prompt(), car l'action est définitive.
// Les images du stockage sont effacées d'abord, puis le compte est supprimé par la base,
// et la session locale est enfin fermée, ce qui déclenche le retour à la page de connexion.
boutonSupprimerCompte.onclick = async () => {
  zoneErreurCompte.textContent = "";

  const saisie = prompt("Cette action est définitive. Pour confirmer, tapez votre pseudo (" + monPseudo + ").");

  // Bouton « Annuler » de la fenêtre
  if (saisie === null) {
    return;
  }

  if (saisie.trim() !== monPseudo) {
    zoneErreurCompte.textContent = "Le pseudo saisi ne correspond pas. Votre compte n'a pas été supprimé.";
    return;
  }

  // Le bouton est désactivé pendant l'opération pour éviter un double envoi
  boutonSupprimerCompte.disabled = true;

  try {
    const images = await Data.deleteMyImages(monId);
    if (images.error) {
      zoneErreurCompte.textContent = "Vos images n'ont pas pu être supprimées. Votre compte est conservé, réessayez dans un instant.";
      console.error(images.error);
      return;
    }

    const { error } = await Data.deleteAccount();
    if (error) {
      zoneErreurCompte.textContent = "Votre compte n'a pas pu être supprimé. Réessayez dans un instant.";
      console.error(error);
      return;
    }

    // Le compte n'existe plus, seule la session du navigateur reste à effacer
    Local.oublierConversation();
    await Auth.signOut("local");
  } finally {
    boutonSupprimerCompte.disabled = false;
  }
}

// À la fin de la session (déconnexion ou absence de connexion), retour à la page de connexion
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});