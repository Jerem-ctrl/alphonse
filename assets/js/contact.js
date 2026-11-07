/*
Page des contacts : liste des personnes inscrites, avec recherche par pseudo.
*/


// -- Éléments et initialisation


const listeContacts = document.getElementById("liste-contacts");
const champRecherche = document.getElementById("recherche-contact");

// Tous les profils, chargés une seule fois depuis Supabase
let tousLesContacts = [];

// Affiche une liste de profils dans la page
function afficherContacts(profils) {
  listeContacts.textContent = "";

  if (profils.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Aucun contact trouvé.";
    listeContacts.append(li);
    return;
  }

  profils.forEach((profil) => {
    const li = document.createElement("li");
    li.textContent = profil.pseudo;
    listeContacts.append(li);
  });
}

// Charge tous les profils sauf le sien, triés par pseudo
async function init() {
  const { user } = await Auth.getUser();

  const { data } = await supabaseClient
    .from("utilisateurs")
    .select("pseudo")
    .neq("id", user.id)
    .order("pseudo");

  tousLesContacts = data;
  afficherContacts(tousLesContacts);
}

init();


// -- Événements


// À chaque lettre tapée : on garde les pseudos qui contiennent le texte recherché
champRecherche.oninput = () => {
  const texte = champRecherche.value.trim().toLowerCase();
  const resultats = tousLesContacts.filter((profil) => profil.pseudo.toLowerCase().includes(texte));
  afficherContacts(resultats);
}

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});