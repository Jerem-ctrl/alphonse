/*
    conversation.js — La page des conversations : la liste des salons, le fil du salon ouvert et l'envoi des messages.
    On ne parle jamais directement à Supabase ici : on passe par Auth (la session), Data (les requêtes) et Local (le stockage du navigateur).
*/


// -- Éléments de la page


const listeSalons = document.getElementById("liste-salons");
const titreSalon = document.getElementById("titre-salon");
const filMessages = document.getElementById("fil-messages");
const zoneErreur = document.getElementById("erreur-conversation");
const formulaireSalon = document.getElementById("formulaire-salon");
const champNomSalon = document.getElementById("nom-salon");
const boutonCreerSalon = formulaireSalon.querySelector("button");
const formulaireMessage = document.getElementById("formulaire-message");
const champMessage = document.getElementById("message");
const champImage = document.getElementById("image");
const boutonEnvoyer = formulaireMessage.querySelector("button");


// -- État de la page


// La personne connectée, pour reconnaître ses propres messages
let monId = null;

// Le salon ouvert (un nombre), ou null si aucun salon n'est ouvert
let salonActif = null;

// L'écoute du salon ouvert, qu'on coupe en quittant la page
let canalMessages = null;

// Les messages affichés, rangés par identifiant : un message déjà présent (chargé ET reçu en temps réel, par exemple) est ignoré
const messagesAffiches = new Map();

// Les salons déjà dans la liste, pour la même raison
const salonsAffiches = new Set();

// Les pseudos déjà connus, pour ne pas redemander à Supabase à chaque message reçu en temps réel
const pseudos = new Map();

// Pour les messages plus anciens : la date du plus ancien message affiché, un chargement en cours, et la fin du salon atteinte
let plusAncienneDate = null;
let chargementAnciens = false;
let debutAtteint = false;

// Pour le bouton « Envoyer », désactivé pendant l'envoi
let envoiEnCours = false;


// -- Petites fonctions utiles


// Les erreurs s'affichent dans la page, dans le <p role="alert"> ; la console ne garde que le détail technique.
function afficherErreur(texte, erreur) {
  zoneErreur.textContent = texte;
  if (erreur) {
    console.error(erreur);
  }
}

function effacerErreur() {
  zoneErreur.textContent = "";
}

// L'heure à la manière de l'appareil qui lit (fuseau local) : juste l'heure pour aujourd'hui, la date en plus pour les jours précédents.
function formaterDate(iso) {
  const date = new Date(iso);
  const heure = date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });

  if (date.toDateString() === new Date().toDateString()) {
    return heure;
  }
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) + ", " + heure;
}

// Le bouton « Envoyer » n'est utilisable que dans un salon ouvert, avec un message non vide, et quand aucun envoi n'est en cours.
function mettreAJourBoutonEnvoyer() {
  boutonEnvoyer.disabled = !salonActif || envoiEnCours || champMessage.value.trim() === "";
}

// Faut-il suivre le bas du fil ? Oui si on y est déjà (à 100 px près) : on ne fait pas sauter la lecture de quelqu'un qui est remonté.
function estEnBasDuFil() {
  return filMessages.scrollHeight - filMessages.scrollTop - filMessages.clientHeight < 100;
}

function descendreEnBas() {
  filMessages.scrollTop = filMessages.scrollHeight;
}


// -- Salons


// Ajoute un salon à la liste : un <li> avec un lien vers ?salon=<id>. Le salon ouvert est marqué aria-current="page".
function afficherSalon(salon) {
  if (salonsAffiches.has(salon.id)) {
    return;
  }
  salonsAffiches.add(salon.id);

  const li = document.createElement("li");
  const lien = document.createElement("a");
  lien.href = "?salon=" + salon.id;
  lien.textContent = salon.nom;

  if (salon.id === salonActif) {
    lien.setAttribute("aria-current", "page");
  }

  li.append(lien);
  listeSalons.append(li);
}


// -- Messages


// Le pseudo de l'auteur : il arrive avec les messages chargés (utilisateurs.pseudo), mais pas avec ceux du temps réel.
// Dans ce cas, on le demande une seule fois à Data, puis on le garde dans la Map.
async function trouverPseudo(message) {
  if (message.utilisateurs) {
    pseudos.set(message.user_id, message.utilisateurs.pseudo);
  }

  if (!pseudos.has(message.user_id)) {
    const { data } = await Data.fetchPseudo(message.user_id);
    pseudos.set(message.user_id, data ? data.pseudo : "Compte supprimé");
  }

  return pseudos.get(message.user_id);
}

// Construit un message : <article> <header>pseudo</header> <p>texte</p> <img> <time> [Supprimer] </article>.
// Tout passe par createElement et textContent : un message qui contient du HTML s'affiche comme du texte, il n'est jamais exécuté.
function creerArticle(message, pseudo) {
  const article = document.createElement("article");
  article.dataset.id = message.id;
  article.dataset.temps = Date.parse(message.created_at);

  // Ses propres messages ont la classe « envoye », pour les placer à droite
  const estAMoi = message.user_id === monId;
  if (estAMoi) {
    article.classList.add("envoye");
  }

  const auteur = document.createElement("header");
  auteur.textContent = pseudo;
  article.append(auteur);

  if (message.texte) {
    const texte = document.createElement("p");
    texte.textContent = message.texte;
    article.append(texte);
  }

  if (message.image) {
    const image = document.createElement("img");
    image.src = Data.imageUrl(message.image);
    image.alt = "Image envoyée par " + pseudo;
    image.loading = "lazy";
    article.append(image);
  }

  // <time datetime> garde la date exacte (ISO) pour les machines ; le texte, lui, est à l'heure locale de la personne qui lit.
  const heure = document.createElement("time");
  heure.dateTime = message.created_at;
  heure.textContent = formaterDate(message.created_at);
  article.append(heure);

  // « Supprimer » seulement sous ses propres messages. Ce n'est qu'un confort : c'est la RLS qui interdit de supprimer ceux des autres.
  if (estAMoi) {
    const boutonSupprimer = document.createElement("button");
    boutonSupprimer.type = "button";
    boutonSupprimer.dataset.action = "supprimer";
    boutonSupprimer.textContent = "Supprimer";
    article.append(boutonSupprimer);
  }

  return article;
}

// Range un article à sa place dans le fil, selon sa date : avant le premier message plus récent que lui.
// Un message chargé, reçu en temps réel ou plus ancien trouve ainsi toujours sa place, dans n'importe quel ordre d'arrivée.
function rangerDansLeFil(article) {
  const temps = Number(article.dataset.temps);
  const suivant = [...filMessages.children].find((autre) => Number(autre.dataset.temps) > temps);
  filMessages.insertBefore(article, suivant ?? null);
}

// Affiche un message, sauf s'il est déjà dans la Map.
// On réserve sa place dans la Map AVANT d'attendre le pseudo : si la même ligne arrive deux fois presque en même temps, la deuxième est ignorée.
async function afficherMessage(message) {
  if (messagesAffiches.has(message.id)) {
    return;
  }
  messagesAffiches.set(message.id, null);

  const pseudo = await trouverPseudo(message);

  // Le message a pu être supprimé pendant qu'on cherchait le pseudo
  if (!messagesAffiches.has(message.id)) {
    return;
  }

  const article = creerArticle(message, pseudo);
  messagesAffiches.set(message.id, article);
  rangerDansLeFil(article);
}

// Un message arrive en temps réel : on l'affiche, et on descend si on était déjà en bas (ou si c'est le sien).
async function recevoirMessage(message) {
  const suivre = estEnBasDuFil() || message.user_id === monId;
  await afficherMessage(message);
  if (suivre) {
    descendreEnBas();
  }
}

// Un message a été supprimé (par nous ou depuis un autre appareil) : on retire sa bulle si on l'affiche.
function retirerMessage(messageId) {
  const article = messagesAffiches.get(Number(messageId));
  if (article) {
    article.remove();
  }
  messagesAffiches.delete(Number(messageId));
}

// Retient le plus ancien message chargé, et si le paquet était incomplet, c'est qu'on a atteint le début du salon.
// Les messages arrivent du plus récent au plus ancien : le dernier du paquet est donc le plus ancien.
function noterPaquet(messages) {
  if (messages.length > 0) {
    plusAncienneDate = messages[messages.length - 1].created_at;
  }
  if (messages.length < Data.TAILLE_PAQUET) {
    debutAtteint = true;
  }
}

// Les 50 messages précédents, quand on remonte en haut du fil.
// On mesure la hauteur du fil avant et après l'ajout, puis on décale le défilement d'autant : la personne garde sa place de lecture.
async function chargerPlusAnciens() {
  if (chargementAnciens || debutAtteint || !plusAncienneDate) {
    return;
  }
  chargementAnciens = true;

  try {
    const { data: messages, error } = await Data.fetchOlderMessages(salonActif, plusAncienneDate);
    if (error) {
      afficherErreur("Impossible de charger les messages plus anciens.", error);
      return;
    }

    const hauteurAvant = filMessages.scrollHeight;
    for (const message of messages) {
      await afficherMessage(message);
    }
    filMessages.scrollTop += filMessages.scrollHeight - hauteurAvant;

    noterPaquet(messages);
  } finally {
    chargementAnciens = false;
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

  // Le salon demandé, lu dans l'adresse (?salon=3). L'adresse est du texte : Number() le convertit, et on n'accepte qu'un entier positif.
  // Sans salon dans l'adresse, on rouvre le dernier salon de l'onglet, gardé par Local.
  const parametre = new URLSearchParams(window.location.search).get("salon");
  const salonDemande = parametre === null ? Local.lireDernierSalon() : Number(parametre);
  if (Number.isInteger(salonDemande) && salonDemande > 0) {
    salonActif = salonDemande;
  }

  // On écoute AVANT de charger : un message envoyé pendant le chargement ne peut pas passer entre les deux.
  // S'il arrive des deux côtés, la Map n'en garde qu'un.
  if (salonActif) {
    canalMessages = Data.subscribeToMessages(salonActif, recevoirMessage, retirerMessage);
  }
  Data.subscribeToChannels(afficherSalon);

  // Les salons et les messages se chargent en même temps avec Promise.all : on attend la plus lente des deux requêtes, pas leur somme.
  const [reponseSalons, reponseMessages] = await Promise.all([
    Data.fetchChannels(),
    salonActif ? Data.fetchMessages(salonActif) : null
  ]);

  if (reponseSalons.error) {
    afficherErreur("Impossible de charger les salons.", reponseSalons.error);
    return;
  }

  // Le salon demandé doit exister parmi les salons : une adresse modifiée à la main (?salon=abc, ?salon=999) n'ouvre rien.
  const salon = reponseSalons.data.find((s) => s.id === salonActif);
  if (!salon) {
    await Data.unsubscribe(canalMessages);
    canalMessages = null;
    salonActif = null;
    Local.enregistrerDernierSalon(null);
    if (parametre !== null) {
      afficherErreur("Ce salon n'existe pas ou plus. Choisissez-en un dans la liste.");
    }
  }

  reponseSalons.data.forEach(afficherSalon);

  // Aucun salon ouvert : on désactive l'écriture, le reste de la page reste utilisable.
  if (!salonActif) {
    champMessage.disabled = true;
    champImage.disabled = true;
    mettreAJourBoutonEnvoyer();
    return;
  }

  titreSalon.textContent = salon.nom;
  document.title = salon.nom + " - Alphonse";
  Local.enregistrerDernierSalon(salonActif);

  // Le brouillon laissé dans ce salon, s'il y en a un
  champMessage.value = Local.lireBrouillon(salonActif);
  mettreAJourBoutonEnvoyer();

  if (reponseMessages.error) {
    afficherErreur("Impossible de charger les messages.", reponseMessages.error);
    return;
  }

  // for...of avec await : on affiche les messages un par un ; rangerDansLeFil les met dans l'ordre des dates.
  for (const message of reponseMessages.data) {
    await afficherMessage(message);
  }
  noterPaquet(reponseMessages.data);
  descendreEnBas();
}

init();


// -- Événements


// Création d'un salon : le bouton est désactivé pendant l'attente, puis on ouvre directement le nouveau salon.
formulaireSalon.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nom = champNomSalon.value.trim();
  if (!nom) {
    afficherErreur("Donnez un nom au salon.");
    return;
  }

  effacerErreur();
  boutonCreerSalon.disabled = true;

  try {
    const { data: salon, error } = await Data.createChannel(nom);

    if (error) {
      // 23505 = le code d'erreur de PostgreSQL pour « valeur déjà existante » : le nom d'un salon est unique.
      afficherErreur(error.code === "23505" ? "Un salon porte déjà ce nom." : "Impossible de créer le salon.", error);
      return;
    }

    window.location.href = "?salon=" + salon.id;
  } finally {
    boutonCreerSalon.disabled = false;
  }
});

// À chaque frappe : on garde le brouillon et on met à jour le bouton « Envoyer ».
champMessage.addEventListener("input", () => {
  if (salonActif) {
    Local.enregistrerBrouillon(salonActif, champMessage.value);
  }
  mettreAJourBoutonEnvoyer();
});

// Entrée envoie le message, Maj + Entrée passe à la ligne.
// isComposing : pendant la saisie d'un accent ou d'un caractère composé, Entrée valide le caractère, pas le message.
champMessage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    formulaireMessage.requestSubmit();
  }
});

// Envoi d'un message, au clic sur « Envoyer » ou avec Entrée.
// Le bouton reste désactivé pendant l'envoi : deux clics rapides n'envoient pas deux fois le même message. Le finally le rétablit, même en cas d'erreur.
formulaireMessage.addEventListener("submit", async (event) => {
  event.preventDefault();
  const texte = champMessage.value.trim();
  if (!salonActif || !texte || envoiEnCours) {
    return;
  }

  effacerErreur();
  envoiEnCours = true;
  mettreAJourBoutonEnvoyer();

  try {
    const { data: message, error } = await Data.sendMessage(salonActif, texte);

    if (error) {
      afficherErreur("Le message n'a pas pu être envoyé. Votre texte est toujours là, vous pouvez réessayer.", error);
      return;
    }

    // Le message enregistré s'affiche tout de suite ; quand le temps réel le renverra, la Map l'ignorera.
    formulaireMessage.reset();
    Local.enregistrerBrouillon(salonActif, "");
    await afficherMessage(message);
    descendreEnBas();
  } finally {
    envoiEnCours = false;
    mettreAJourBoutonEnvoyer();
    champMessage.focus();
  }
});

// Un seul écouteur pour tous les boutons « Supprimer » du fil : event.target dit sur quoi on a cliqué, closest() remonte jusqu'au bouton.
filMessages.addEventListener("click", async (event) => {
  const bouton = event.target.closest("[data-action='supprimer']");
  if (!bouton) {
    return;
  }

  // Une suppression ne s'annule pas : on demande confirmation avant.
  if (!confirm("Supprimer ce message ? Il disparaîtra aussi pour les autres membres du salon.")) {
    return;
  }

  const messageId = Number(bouton.closest("article").dataset.id);
  effacerErreur();
  bouton.disabled = true;

  try {
    const { data, error } = await Data.deleteMessage(messageId);

    if (error) {
      afficherErreur("Le message n'a pas pu être supprimé.", error);
      return;
    }
    // Aucune ligne supprimée : la base a refusé (ce n'est pas notre message, ou il n'existe plus).
    if (data.length === 0) {
      afficherErreur("Ce message ne peut pas être supprimé.");
      return;
    }

    retirerMessage(messageId);
  } finally {
    bouton.disabled = false;
  }
});

// Arrivé tout en haut du fil (à 50 px près), on charge les messages précédents.
filMessages.addEventListener("scroll", () => {
  if (filMessages.scrollTop < 50) {
    chargerPlusAnciens();
  }
});

// En quittant la page (autre salon, autre page), on coupe l'écoute du salon avec removeChannel.
window.addEventListener("pagehide", () => {
  Data.unsubscribe(canalMessages);
});

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});