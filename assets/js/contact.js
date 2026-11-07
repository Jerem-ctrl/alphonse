/*
    contact.js — La page des contacts : chercher une personne inscrite par son pseudo, l'ajouter à ses contacts ou l'en retirer,
    et voir qui est en ligne.
    Comme sur les autres pages, on passe par Auth (la session), Data (les requêtes) et Presence (l'indicateur en ligne),
    jamais directement par Supabase.
*/


// -- Éléments de la page


const zoneStatut = document.getElementById("statut-contacts");
const zoneErreur = document.getElementById("erreur-contacts");
const titreMesContacts = document.getElementById("titre-mes-contacts");
const aucunContact = document.getElementById("aucun-contact");
const listeMesContacts = document.getElementById("mes-contacts");
const formulaireRecherche = document.getElementById("formulaire-recherche");
const champRecherche = document.getElementById("recherche-contact");
const etatRecherche = document.getElementById("etat-recherche");
const resultatsRecherche = document.getElementById("resultats-recherche");


// -- État de la page


// La personne connectée, qu'on retire des résultats de recherche
let monId = null;

// Ses contacts, rangés par identifiant de la personne ajoutée : { pseudo, derniere_activite }.
// Avec une Map, on sait tout de suite si quelqu'un est déjà dans la liste.
const mesContacts = new Map();

// Les derniers résultats affichés, pour les redessiner après un ajout ou un retrait
let derniersResultats = [];

// L'anti-rebond : on attend une courte pause dans la frappe avant d'interroger Supabase, plutôt qu'une requête par lettre
const DELAI_RECHERCHE = 300;
let minuteurRecherche = null;

// Le numéro de la dernière recherche lancée. Si une réponse plus ancienne arrive en retard, elle est ignorée :
// on n'affiche jamais les résultats de « gi » par-dessus ceux de « gigi ».
let numeroRecherche = 0;

// La règle des pseudos, la même qu'à l'inscription : chercher d'autres caractères ne trouverait personne
const CARACTERES_PSEUDO = /^[A-Za-z0-9_-]*$/;


// -- Petites fonctions utiles


// Les erreurs vont dans le <p role="alert">, les confirmations dans le <p role="status"> ; la console ne garde que le détail technique.
function afficherErreur(texte, erreur) {
  zoneStatut.textContent = "";
  zoneErreur.textContent = texte;
  if (erreur) {
    console.error(erreur);
  }
}

function afficherStatut(texte) {
  zoneErreur.textContent = "";
  zoneStatut.textContent = texte;
}


// -- Mes contacts


// Redessine les cartes, triées par pseudo. Chaque carte : <li> <h3>pseudo</h3> <p>en ligne / hors ligne</p> <button>Retirer</button> </li>.
// Les boutons portent un aria-label avec le pseudo : un lecteur d'écran entend « Retirer gigi de mes contacts », pas cinq fois « Retirer ».
function afficherMesContacts() {
  const contacts = [...mesContacts.entries()].sort((a, b) => a[1].pseudo.localeCompare(b[1].pseudo, "fr"));

  const cartes = contacts.map(([id, personne]) => {
    const li = document.createElement("li");

    const pseudo = document.createElement("h3");
    pseudo.textContent = personne.pseudo;

    // « En ligne » ou « Hors ligne », toujours écrit en toutes lettres : la pastille de couleur seule ne suffirait pas
    const presence = document.createElement("p");
    const enLigne = Presence.estEnLigne(personne.derniere_activite);
    presence.className = enLigne ? "presence en-ligne" : "presence";
    presence.textContent = enLigne ? "En ligne" : "Hors ligne";

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.dataset.action = "retirer";
    bouton.dataset.id = id;
    bouton.textContent = "Retirer";
    bouton.setAttribute("aria-label", "Retirer " + personne.pseudo + " de mes contacts");

    li.append(pseudo, presence, bouton);
    return li;
  });

  listeMesContacts.replaceChildren(...cartes);
  aucunContact.hidden = mesContacts.size > 0;
}

// Charge ses contacts depuis Data et les range dans la Map.
async function chargerMesContacts() {
  const { data, error } = await Data.fetchContacts();
  if (error) {
    afficherErreur("Impossible de charger vos contacts.", error);
    return;
  }

  mesContacts.clear();
  data.forEach((contact) => mesContacts.set(contact.contact_id, contact.personne));
  afficherMesContacts();
}


// -- Recherche


// Redessine les résultats : chaque personne avec un bouton « Ajouter », ou la mention « Dans vos contacts » si elle y est déjà.
function afficherResultats(profils) {
  const lignes = profils.map((profil) => {
    const li = document.createElement("li");

    const pseudo = document.createElement("span");
    pseudo.textContent = profil.pseudo;
    li.append(pseudo);

    if (mesContacts.has(profil.id)) {
      const mention = document.createElement("small");
      mention.textContent = "Dans vos contacts";
      li.append(mention);
    } else {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.dataset.action = "ajouter";
      bouton.dataset.id = profil.id;
      bouton.textContent = "Ajouter";
      bouton.setAttribute("aria-label", "Ajouter " + profil.pseudo + " à mes contacts");
      li.append(bouton);
    }

    return li;
  });

  resultatsRecherche.replaceChildren(...lignes);
}

// Cherche les inscrits dont le pseudo contient le texte tapé, sauf soi-même.
async function rechercher() {
  const texte = champRecherche.value.trim();

  // Champ vide : on n'affiche personne, plutôt que la liste de tous les inscrits.
  if (!texte) {
    derniersResultats = [];
    afficherResultats([]);
    etatRecherche.textContent = "";
    return;
  }

  if (!CARACTERES_PSEUDO.test(texte)) {
    derniersResultats = [];
    afficherResultats([]);
    etatRecherche.textContent = "Un pseudo ne contient que des lettres sans accent, des chiffres, _ ou -.";
    return;
  }

  numeroRecherche += 1;
  const numero = numeroRecherche;

  const { data, error } = await Data.searchUsers(texte, monId);

  // Une recherche plus récente a été lancée pendant l'attente : cette réponse est périmée.
  if (numero !== numeroRecherche) {
    return;
  }

  if (error) {
    afficherErreur("La recherche n'a pas abouti. Réessayez dans un instant.", error);
    return;
  }

  derniersResultats = data;
  afficherResultats(data);

  if (data.length === 0) {
    etatRecherche.textContent = "Aucun pseudo ne contient « " + texte + " ».";
  } else if (data.length === 1) {
    etatRecherche.textContent = "1 personne trouvée.";
  } else if (data.length === 20) {
    etatRecherche.textContent = "Les 20 premières personnes trouvées : précisez la recherche pour en voir d'autres.";
  } else {
    etatRecherche.textContent = data.length + " personnes trouvées.";
  }
}


// -- Ouverture de la page


async function init() {
  // Garde de session : sans session, on repart vers la connexion avant de charger quoi que ce soit.
  const { user } = await Auth.getUser();
  if (!user) {
    window.location.replace("../index.html");
    return;
  }
  monId = user.id;

  await chargerMesContacts();

  // Chaque minute, on recharge les contacts pour mettre à jour « en ligne / hors ligne »
  setInterval(chargerMesContacts, INTERVALLE_PRESENCE);
}

init();


// -- Événements


// À chaque frappe, on relance le minuteur : la recherche part 300 ms après la dernière lettre.
champRecherche.addEventListener("input", () => {
  clearTimeout(minuteurRecherche);
  minuteurRecherche = setTimeout(rechercher, DELAI_RECHERCHE);
});

// Entrée dans le champ : on cherche tout de suite, sans recharger la page.
formulaireRecherche.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(minuteurRecherche);
  rechercher();
});

// Un seul écouteur pour tous les boutons « Ajouter » : event.target dit où l'on a cliqué, closest() remonte jusqu'au bouton.
// Le bouton est désactivé pendant l'attente, pour ne pas envoyer deux fois la même demande.
resultatsRecherche.addEventListener("click", async (event) => {
  const bouton = event.target.closest("[data-action='ajouter']");
  if (!bouton) {
    return;
  }

  const profil = derniersResultats.find((p) => p.id === bouton.dataset.id);
  bouton.disabled = true;

  try {
    const { error } = await Data.addContact(profil.id);

    // 23505 = déjà dans la liste (ajouté depuis un autre onglet, par exemple) : on recharge la liste plutôt que d'afficher une erreur.
    if (error && error.code !== "23505") {
      afficherErreur("Impossible d'ajouter " + profil.pseudo + ".", error);
      return;
    }

    if (error) {
      await chargerMesContacts();
    } else {
      mesContacts.set(profil.id, { pseudo: profil.pseudo, derniere_activite: profil.derniere_activite });
      afficherMesContacts();
    }

    afficherResultats(derniersResultats);
    afficherStatut(profil.pseudo + " a été ajouté à vos contacts.");
    champRecherche.focus();
  } finally {
    bouton.disabled = false;
  }
});

// Même principe pour les boutons « Retirer » des cartes.
// Le bouton disparaît avec sa carte : on ramène donc le focus sur le titre « Mes contacts ».
listeMesContacts.addEventListener("click", async (event) => {
  const bouton = event.target.closest("[data-action='retirer']");
  if (!bouton) {
    return;
  }

  const id = bouton.dataset.id;
  const pseudo = mesContacts.get(id).pseudo;
  bouton.disabled = true;

  try {
    const { error } = await Data.removeContact(id);
    if (error) {
      afficherErreur("Impossible de retirer " + pseudo + ".", error);
      return;
    }

    mesContacts.delete(id);
    afficherMesContacts();
    afficherResultats(derniersResultats);
    afficherStatut(pseudo + " a été retiré de vos contacts.");
    titreMesContacts.focus();
  } finally {
    bouton.disabled = false;
  }
});

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});