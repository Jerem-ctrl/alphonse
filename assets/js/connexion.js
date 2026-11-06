/*
    connexion.js — Page de connexion et d'inscription (index.html)
*/


/* ---- Validation des champs ---- */

// On a écrit les caractères permis en toutes lettres plutôt qu'en expression régulière : includes() suffit, et on relit la règle sans décodeur. La regex, elle, reste dans le pattern du HTML.
const LETTRES = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHIFFRES = "0123456789";

// Chaque règle renvoie un petit objet { valide, message } : le message pour la page, valide pour aria-invalid. On a préféré ça à deviner le résultat en relisant le texte.

// Courriel : on découpe autour du @ avec split. Un seul @, quelque chose devant, et uqac.ca ou etu.uqac.ca derrière, exactement comme le pattern et le filtre de Supabase.
function validerCourriel(valeur) {
  const courriel = valeur.trim();
  const morceaux = courriel.split("@");

  if (courriel === "") {
    return { valide: false, message: "Le courriel est obligatoire." };
  } else if (morceaux.length !== 2 || morceaux[0] === "") {
    return { valide: false, message: "Le courriel doit avoir la forme nom@uqac.ca." };
  } else if (morceaux[1] !== "uqac.ca" && morceaux[1] !== "etu.uqac.ca") {
    return { valide: false, message: "Seules les adresses @uqac.ca ou @etu.uqac.ca sont acceptées." };
  } else {
    return { valide: true, message: "Le courriel semble valide." };
  }
}

// Mot de passe de connexion : on vérifie seulement qu'il n'est pas vide, c'est Supabase qui tranche pour les anciens comptes. Et pas de trim() : une espace fait partie du mot de passe, on n'y touche pas.
function validerMotDePasseConnexion(valeur) {
  if (valeur === "") {
    return { valide: false, message: "Le mot de passe est obligatoire." };
  } else {
    return { valide: true, message: "Le mot de passe est saisi." };
  }
}

// Pseudo : on passe chaque caractère au crible avec for...of, un seul intrus suffit pour refuser. Pas de trim() ici : le pattern refuse les espaces, alors on les signale aussi plutôt que de les cacher.
function validerPseudo(valeur) {
  const permis = LETTRES + CHIFFRES + "_-";

  if (valeur === "") {
    return { valide: false, message: "Le pseudo est obligatoire." };
  } else if (valeur.length < 3 || valeur.length > 20) {
    return { valide: false, message: "Le pseudo doit compter de 3 à 20 caractères." };
  }

  for (const caractere of valeur) {
    if (!permis.includes(caractere)) {
      return { valide: false, message: "Le pseudo n'accepte que des lettres sans accent, des chiffres, _ et -." };
    }
  }

  return { valide: true, message: "Le pseudo semble valide." };
}

// Mot de passe d'inscription : 8 caractères, au moins une lettre et un chiffre, comme dans Supabase Auth. On fait le tour des caractères une seule fois en cochant ce qu'on trouve.
function validerMotDePasseInscription(valeur) {
  let contientLettre = false;
  let contientChiffre = false;

  for (const caractere of valeur) {
    if (LETTRES.includes(caractere)) {
      contientLettre = true;
    } else if (CHIFFRES.includes(caractere)) {
      contientChiffre = true;
    }
  }

  if (valeur === "") {
    return { valide: false, message: "Le mot de passe est obligatoire." };
  } else if (valeur.length < 8) {
    return { valide: false, message: "Le mot de passe doit compter au moins 8 caractères." };
  } else if (!contientLettre) {
    return { valide: false, message: "Le mot de passe doit contenir au moins une lettre." };
  } else if (!contientChiffre) {
    return { valide: false, message: "Le mot de passe doit contenir au moins un chiffre." };
  } else {
    return { valide: true, message: "Le mot de passe respecte les règles." };
  }
}

// On écrit le message sous le champ et on met aria-invalid à jour : les lecteurs d'écran savent si le champ pose problème, et le texte le dit à tout le monde, sans compter sur une couleur.
function afficherValidation(champ, zoneMessage, resultat) {
  zoneMessage.textContent = resultat.message;

  if (resultat.valide) {
    champ.setAttribute("aria-invalid", "false");
  } else {
    champ.setAttribute("aria-invalid", "true");
  }
}

// On valide à chaque frappe (événement input), comme dans l'exercice : le message suit la saisie au lieu d'attendre le clic.
function surveillerChamp(idChamp, idMessage, regle) {
  const champ = document.getElementById(idChamp);
  const zoneMessage = document.getElementById(idMessage);

  champ.addEventListener("input", () => {
    afficherValidation(champ, zoneMessage, regle(champ.value));
  });
}

surveillerChamp("email", "message-courriel", validerCourriel);
surveillerChamp("password", "message-mot-de-passe", validerMotDePasseConnexion);
surveillerChamp("signup-pseudo", "message-pseudo-inscription", validerPseudo);
surveillerChamp("signup-email", "message-courriel-inscription", validerCourriel);
surveillerChamp("signup-password", "message-mot-de-passe-inscription", validerMotDePasseInscription);


/* ---- Connexion ---- */

const formulaireConnexion = document.getElementById("login-form");
const zoneErreurConnexion = document.getElementById("message-erreur");

const boutonConnexion = formulaireConnexion.querySelector('button[type="submit"]');

// Clic sur « Se connecter »
formulaireConnexion.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  zoneErreurConnexion.textContent = "";

  // On désactive le bouton pendant que Supabase réfléchit : un double clic ne fera pas deux envois. Le finally le réactive quoi qu'il arrive, même quand ça tourne mal.
  try {
    boutonConnexion.disabled = true;
    const { error } = await Auth.signIn(email, password);

    if (error) {
      // Un seul message pour les identifiants refusés : on ne dit pas si le compte existe, inutile de renseigner les curieux. Seule exception, le service injoignable, parce que là, ce n'est pas la faute de la personne.
      if (error.name === "AuthRetryableFetchError") {
        zoneErreurConnexion.textContent = "Le service ne répond pas. Vérifiez votre connexion et réessayez.";
      } else {
        zoneErreurConnexion.textContent = "Courriel ou mot de passe incorrect.";
      }

      // Le détail technique part dans la console, pas à l'écran : utile pour nous, du chinois pour les autres.
      console.error(error);
    }
  } finally {
    boutonConnexion.disabled = false;
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

const boutonInscription = formulaireInscription.querySelector('button[type="submit"]');

// Clic sur « S'inscrire »
formulaireInscription.addEventListener("submit", async (event) => {
  event.preventDefault();

  const pseudo = document.getElementById("signup-pseudo").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  zoneErreurInscription.textContent = "";

  // Même garde-fou qu'à la connexion : bouton grisé pendant l'attente, et le finally le rend dans tous les cas.
  try {
    boutonInscription.disabled = true;
    const { error } = await Auth.signUp(email, password, pseudo);

    if (error) {
      // On traduit les cas qu'on connaît ; pour le reste, un message général plutôt que l'anglais brut de Supabase.
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        zoneErreurInscription.textContent = "Cette adresse courriel est déjà utilisée.";

      // Notre trigger refuse les pseudos en double, et Supabase le rapporte avec ce message très générique.
      } else if (error.message === "Database error saving new user") {
        zoneErreurInscription.textContent = "Ce pseudo est déjà pris.";

      } else if (error.code === "weak_password") {
        zoneErreurInscription.textContent = "Mot de passe trop faible : 8 caractères minimum, dont une lettre et un chiffre.";

      } else if (error.code === "email_address_invalid" || error.code === "email_address_not_authorized") {
        zoneErreurInscription.textContent = "Cette adresse n'est pas acceptée : utilisez votre adresse @uqac.ca ou @etu.uqac.ca.";

      } else {
        zoneErreurInscription.textContent = "L'inscription n'a pas abouti. Réessayez dans un instant.";
      }

      console.error(error);
    }
  } finally {
    boutonInscription.disabled = false;
  }
});


/* ---- Redirection ---- */

// Supabase lance INITIAL_SESSION dès l'abonnement, avec la session gardée dans le navigateur s'il y en a une. Déjà connecté ? On file vers la messagerie sans revoir le formulaire. Après une connexion ou une inscription, c'est SIGNED_IN qui prend le relais.
Auth.onSessionChange((event, session) => {
  if (session) {
    window.location.replace("./pages/conversation.html");
  }
});