/*
    parametre.js
    Page des paramètres. Affiche le profil, gère les préférences (thème, taille du texte, son des notifications),
    la déconnexion et la suppression du compte. Les préférences passent par Theme et Local, le profil par Data.
*/


// -- Éléments et initialisation


const zoneErreurCompte = document.getElementById("erreur-compte");
const boutonSupprimerCompte = document.getElementById("bouton-supprimer-compte");

// Identifiant et pseudo de la personne connectée, utilisés pour la suppression du compte
let monId = null;
let monPseudo = null;

// Remplit le profil : pseudo, courriel et date d'inscription. Garde de session : sans session, retour à la connexion.
async function init() {
  const { user } = await Auth.getUser();
  if (!user) {
    window.location.replace("../index.html");
    return;
  }
  monId = user.id;

  document.getElementById("affichage-email").textContent = user.email;

  const { data, error } = await Data.fetchProfil(user.id);
  if (error) {
    console.error(error);
    return;
  }

  monPseudo = data.pseudo;
  document.getElementById("affichage-pseudo").textContent = monPseudo;

  // <time datetime> garde la date exacte ; le texte est écrit à la française, « 2 novembre 2026 ».
  const inscription = document.getElementById("affichage-inscription");
  inscription.dateTime = data.created_at;
  inscription.textContent = new Date(data.created_at).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}

init();


// -- Événements


// Les statistiques de l'assistant, lues par Local. Une part est arrondie au pour cent : « 3 sur 4 » donne « 75 % ».
function afficherStatistiques() {
  const stats = Local.lireStatistiques();
  const part = (nombre) => stats.relus > 0 ? Math.round((nombre / stats.relus) * 100) + " %" : "—";

  document.getElementById("stat-relus").textContent = stats.relus;
  document.getElementById("stat-moyenne").textContent = stats.relus > 0 ? Math.round(stats.sommeNotes / stats.relus) + " / 100" : "—";
  document.getElementById("stat-appliquees").textContent = stats.appliquees;
  document.getElementById("part-appliquees").textContent = part(stats.appliquees);
  document.getElementById("stat-tel-quel").textContent = stats.telQuel;
  document.getElementById("part-tel-quel").textContent = part(stats.telQuel);
}

afficherStatistiques();

// Le thème : on coche le choix enregistré, puis chaque nouveau choix est appliqué et gardé tout de suite.
document.querySelectorAll('input[name="theme"]').forEach((bouton) => {
  bouton.checked = bouton.value === Theme.lire();

  bouton.addEventListener("change", () => {
    Theme.enregistrer(bouton.value);
    Theme.appliquer(bouton.value);
  });
});

// La taille du texte : même principe, avec la liste déroulante.
const listeTaille = document.getElementById("option-taille");
listeTaille.value = Theme.lireTaille();
listeTaille.addEventListener("change", () => {
  Theme.enregistrerTaille(listeTaille.value);
  Theme.appliquerTaille(listeTaille.value);
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

// Suppression du compte, confirmée dans une fenêtre <dialog> : on retape son pseudo, car l'action est définitive.
// Les images du stockage sont effacées d'abord, puis le compte est supprimé par la base,
// et la session locale est enfin fermée, ce qui déclenche le retour à la page de connexion.
const dialogSuppression = document.getElementById("dialog-suppression");
const formSuppression = document.getElementById("form-suppression");
const champConfirmation = document.getElementById("confirmation-pseudo");
const zoneErreurSuppression = document.getElementById("erreur-suppression");
const boutonConfirmer = document.getElementById("confirmer-suppression");

// Ouvre la fenêtre : showModal() la place au-dessus de la page et met le focus dans le champ.
boutonSupprimerCompte.addEventListener("click", () => {
  zoneErreurCompte.textContent = "";
  zoneErreurSuppression.textContent = "";
  champConfirmation.value = "";
  document.getElementById("rappel-pseudo").textContent = monPseudo;
  dialogSuppression.showModal();
});

// « Annuler » ferme la fenêtre sans rien faire (Échap fait de même).
document.getElementById("annuler-suppression").addEventListener("click", () => {
  dialogSuppression.close();
});

// « Supprimer définitivement » : on vérifie le pseudo, puis on supprime.
formSuppression.addEventListener("submit", async (event) => {
  // La fenêtre ne se ferme pas toute seule : on la garde ouverte pour afficher une éventuelle erreur.
  event.preventDefault();

  if (champConfirmation.value.trim() !== monPseudo) {
    zoneErreurSuppression.textContent = "Le pseudo saisi ne correspond pas. Votre compte n'a pas été supprimé.";
    champConfirmation.focus();
    return;
  }

  // Le bouton est désactivé pendant l'opération pour éviter un double envoi
  boutonConfirmer.disabled = true;
  zoneErreurSuppression.textContent = "";

  try {
    const images = await Data.deleteMyImages(monId);
    if (images.error) {
      zoneErreurSuppression.textContent = "Vos images n'ont pas pu être supprimées. Votre compte est conservé, réessayez dans un instant.";
      console.error(images.error);
      return;
    }

    const { error } = await Data.deleteAccount();
    if (error) {
      zoneErreurSuppression.textContent = "Votre compte n'a pas pu être supprimé. Réessayez dans un instant.";
      console.error(error);
      return;
    }

    // Le compte n'existe plus, seule la session du navigateur reste à effacer
    Local.oublierConversation();
    await Auth.signOut("local");
  } finally {
    boutonConfirmer.disabled = false;
  }
});

// À la fin de la session (déconnexion ou absence de connexion), retour à la page de connexion
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});