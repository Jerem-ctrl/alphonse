/*
conversation.js — Page des conversations : salons, messages et temps réel.
*/


// -- Éléments et initialisation


const listeSalons = document.getElementById("liste-salons");
const titreSalon = document.getElementById("titre-salon");
const filMessages = document.getElementById("fil-messages");
const zoneErreur = document.getElementById("erreur-conversation");
const formulaireSalon = document.getElementById("formulaire-salon");
const formulaireMessage = document.getElementById("formulaire-message");
const champMessage = document.getElementById("message");

// Le salon ouvert, lu dans l'adresse de la page (?salon=...), ou null s'il n'y en a pas
const salonActif = new URLSearchParams(window.location.search).get("salon");

// L'identifiant de la personne connectée (pour reconnaître ses propres messages)
let monId = null;

// Les pseudos déjà connus, pour ne pas redemander à Supabase à chaque message
const pseudos = {};

// Ajoute un salon à la liste : un <li> contenant un lien vers ?salon=<id>
function afficherSalon(salon) {
  const li = document.createElement("li");
  const lien = document.createElement("a");
  lien.href = "?salon=" + salon.id;
  lien.textContent = salon.nom;

  // Le salon ouvert : signalé aux lecteurs d'écran, et son nom devient le titre
  if (String(salon.id) === salonActif) {
    lien.setAttribute("aria-current", "page");
    titreSalon.textContent = salon.nom;
  }

  li.append(lien);
  listeSalons.append(li);
}

// Ajoute un message au fil : <article> <header>pseudo</header> <p>texte</p> <time>heure</time> </article>
async function afficherMessage(message) {
  // Le pseudo arrive avec les messages chargés (utilisateurs.pseudo),
  // mais pas avec ceux du temps réel : on le cherche alors une fois, puis on le garde
  if (message.utilisateurs) {
    pseudos[message.user_id] = message.utilisateurs.pseudo;
  } else if (!pseudos[message.user_id]) {
    const { data } = await Data.fetchPseudo(message.user_id);
    pseudos[message.user_id] = data ? data.pseudo : "Inconnu";
  }

  const article = document.createElement("article");

  // Mes propres messages : à droite, en bleu (classe "envoye" du CSS)
  if (message.user_id === monId) {
    article.classList.add("envoye");
  }

  const auteur = document.createElement("header");
  auteur.textContent = pseudos[message.user_id];
  article.append(auteur);

  if (message.texte) {
    const texte = document.createElement("p");
    texte.textContent = message.texte;
    article.append(texte);
  }

  // Une image jointe : son lien public est fourni par le stockage Supabase
  if (message.image) {
    const image = document.createElement("img");
    image.src = supabaseClient.storage.from("images").getPublicUrl(message.image).data.publicUrl;
    image.alt = "Image envoyée par " + pseudos[message.user_id];
    article.append(image);
  }

  // La date et l'heure dans le fuseau et le format de la personne qui lit
  const heure = document.createElement("time");
  heure.dateTime = message.created_at;
  heure.textContent = new Date(message.created_at).toLocaleString("fr-CA", {
    dateStyle: "short",
    timeStyle: "short"
  });
  article.append(heure);

  filMessages.append(article);

  // Fait défiler le fil jusqu'au dernier message
  filMessages.scrollTop = filMessages.scrollHeight;
}

async function init() {
  const { user } = await Auth.getUser();
  monId = user.id;

  // Les salons, puis l'écoute des nouveaux salons créés par les autres
  const { data: salons, error } = await Data.fetchChannels();
  if (error) {
    zoneErreur.textContent = "Impossible de charger les salons.";
    console.error(error);
    return;
  }
  salons.forEach(afficherSalon);
  Data.subscribeToChannels(afficherSalon);

  // Aucun salon choisi : on désactive l'envoi de messages
  if (!salonActif) {
    champMessage.disabled = true;
    formulaireMessage.querySelector("button").disabled = true;
    return;
  }

  // Les 50 derniers messages, remis dans l'ordre chronologique, puis l'écoute des nouveaux
  const { data: messages, error: erreurMessages } = await Data.fetchMessages(salonActif);
  if (erreurMessages) {
    zoneErreur.textContent = "Impossible de charger les messages.";
    console.error(erreurMessages);
    return;
  }

  // for...of + await : on affiche les messages un par un, dans l'ordre
  for (const message of messages.reverse()) {
    await afficherMessage(message);
  }

  Data.subscribeToMessages(salonActif, afficherMessage);
}

init();


// -- Événements


// Création d'un salon : on ouvre directement le nouveau salon
formulaireSalon.onsubmit = async (event) => {
  event.preventDefault();
  const nom = document.getElementById("nom-salon").value.trim();

  const { data: salon, error } = await Data.createChannel(nom);

  if (error) {
    // 23505 = code d'erreur PostgreSQL « valeur déjà existante » (le nom d'un salon est unique)
    zoneErreur.textContent = error.code === "23505"
      ? "Un salon porte déjà ce nom."
      : "Impossible de créer le salon.";
    console.error(error);
    return;
  }

  window.location.href = "?salon=" + salon.id;
}

// Envoi d'un message : il s'affichera tout seul grâce au temps réel, comme ceux des autres
formulaireMessage.onsubmit = async (event) => {
  event.preventDefault();
  const contenu = champMessage.value.trim();
  if (!contenu) return;

  zoneErreur.textContent = "";
  const { error } = await Data.sendMessage(salonActif, contenu);

  if (error) {
    zoneErreur.textContent = "Le message n'a pas pu être envoyé.";
    console.error(error);
    return;
  }

  formulaireMessage.reset();
}

// Entrée envoie le message, Maj + Entrée passe à la ligne
champMessage.onkeydown = (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    formulaireMessage.requestSubmit();
  }
}

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});