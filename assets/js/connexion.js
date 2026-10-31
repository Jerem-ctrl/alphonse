/*
    connexion.js — Page de connexion et d'inscription (index.html)
*/


/* ---- Connexion ---- */

const formulaireConnexion = document.getElementById("login-form");
const zoneErreurConnexion = document.getElementById("message-erreur");

// Clic sur « Se connecter »
formulaireConnexion.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { error } = await Auth.signIn(email, password);

  if (error) {
    zoneErreurConnexion.textContent = "Email ou mot de passe incorrect.";
    console.error(error);
  }
});


/* ---- Inscription (fenêtre pop-up) ---- */

const dialogInscription = document.getElementById("dialog-inscription");
const formulaireInscription = document.getElementById("signup-form");
const zoneErreurInscription = document.getElementById("message-erreur-inscription");

// Ouvre la fenêtre
document.getElementById("ouvrir-inscription").addEventListener("click", () => {
  dialogInscription.showModal();
});

// Ferme la fenêtre
document.getElementById("fermer-inscription").addEventListener("click", () => {
  dialogInscription.close();
});

// Clic sur « S'inscrire »
formulaireInscription.addEventListener("submit", async (event) => {
  event.preventDefault();

  const pseudo = document.getElementById("signup-pseudo").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  const { error } = await Auth.signUp(email, password, pseudo);

  // Affiche l'erreur s'il y en a une
  if (error) {
    // "User already registered" = un compte existe déjà avec cette adresse
    if (error.message === "User already registered") {
      zoneErreurInscription.textContent = "Adresse déjà utilisée.";

    // "Database error saving new user" = le pseudo est déjà pris
    } else if (error.message === "Database error saving new user") {
      zoneErreurInscription.textContent = "Pseudo déjà pris.";

    // Autre erreur
    } else {
      zoneErreurInscription.textContent = error.message;
    }
    console.error(error);
  }
});


/* ---- Redirection ---- */

// Dès qu'une session existe : direction la messagerie
Auth.onSessionChange((event, session) => {
  if (session) {
    window.location.replace("./conversation.html");
  }
});