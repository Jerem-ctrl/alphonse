/*
    connexion.js — Page de connexion (index.html)
*/

// Éléments de la page
const formulaire = document.getElementById("login-form");
const zoneErreur = document.getElementById("message-erreur");

// Clic sur « Se connecter »
formulaire.addEventListener("submit", async (event) => {
  // Empêche le rechargement de la page
  event.preventDefault();

  // Récupère ce que l'utilisateur a tapé
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // Demande la connexion à Supabase
  const { error } = await Auth.signIn(email, password);

  // En cas d'échec : message pour l'utilisateur, détail dans la console
  if (error) {
    zoneErreur.textContent = "Email ou mot de passe incorrect.";
    console.error(error);
  }
});

// Dès qu'une session existe (connexion réussie, ou déjà connecté) : direction la messagerie
Auth.onSessionChange((event, session) => {
  if (session) {
    window.location.replace("./conversation.html");
  }
});