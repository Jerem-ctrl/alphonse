/*
    conversation.js — La page des conversations : la liste des salons, le fil du salon ouvert et l'envoi des messages.
    On ne parle jamais directement à Supabase ici : on passe par Auth (la session), Data (les requêtes), Local (le stockage du navigateur),
    Ecriture (l'indicateur « en train d'écrire ») et Alerte (la notification des nouveaux messages).
    L'assistant de rédaction, lui, passe par Alphonse : ce fichier se contente d'afficher ce qu'il renvoie.
*/


// -- Éléments de la page


const listeSalons = document.getElementById("liste-salons");
const titreSalon = document.getElementById("titre-salon");
const filMessages = document.getElementById("fil-messages");
const zoneErreur = document.getElementById("erreur-conversation");
const formulaireSalon = document.getElementById("formulaire-salon");
const zoneErreurSalon = document.getElementById("erreur-salon");
const boutonRetour = document.getElementById("bouton-retour");
const champNomSalon = document.getElementById("nom-salon");
const boutonCreerSalon = formulaireSalon.querySelector("button");
const formulaireMessage = document.getElementById("formulaire-message");
const champMessage = document.getElementById("message");
const champImage = document.getElementById("image");
const boutonEnvoyer = formulaireMessage.querySelector("button");

// Les éléments de l'assistant
const feu = document.getElementById("feu");
const texteNote = document.getElementById("texte-note");
const boutonAnalyser = document.getElementById("bouton-analyser");
const caseAnalyseAuto = document.getElementById("analyse-auto");
const resultatAssistant = document.getElementById("resultat-assistant");
const texteAnnote = document.getElementById("texte-annote");
const listeDefauts = document.getElementById("liste-defauts");
const zoneCorrections = document.getElementById("corrections");
const zoneReformulation = document.getElementById("reformulation");
const corpsDetail = document.getElementById("corps-detail");
const totalDetail = document.getElementById("total-detail");
const boutonAppliquer = document.getElementById("bouton-appliquer");
const boutonEnvoyerTelQuel = document.getElementById("bouton-envoyer-tel-quel");


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

// Le dernier résultat affiché par l'assistant, et une analyse à la demande en cours
let dernierResultat = null;
let analyseEnCours = false;

// Le message d'invitation affiché tant qu'il n'y a pas de note
const INVITATION_ASSISTANT = "Écrivez votre message, puis cliquez sur « Analyser ».";


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

// Les erreurs de création d'un salon ont leur propre zone, sous le formulaire des salons.
function afficherErreurSalon(texte, erreur) {
  zoneErreurSalon.textContent = texte;
  if (erreur) {
    console.error(erreur);
  }
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

// « Envoyer » demande un salon ouvert et un texte OU une image ; « Analyser » demande un texte.
function mettreAJourBoutons() {
  const vide = champMessage.value.trim() === "";
  const sansImage = champImage.files.length === 0;
  boutonEnvoyer.disabled = !salonActif || envoiEnCours || (vide && sansImage);
  boutonAnalyser.disabled = !salonActif || analyseEnCours || envoiEnCours || vide;
  boutonEnvoyerTelQuel.disabled = envoiEnCours;
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

  // Un salon créé pendant qu'on est sur la page se range à sa place dans l'ordre alphabétique, comme ceux chargés au départ.
  // localeCompare compare les noms à la française, accents compris.
  const suivant = [...listeSalons.children].find((autre) => autre.textContent.localeCompare(salon.nom, "fr") > 0);
  listeSalons.insertBefore(li, suivant ?? null);

  // Les messages non lus de ce salon, s'il y en a
  afficherPastille(salon.id);
}


// -- Messages


// Le pseudo de l'auteur : il arrive avec les messages chargés (utilisateurs.pseudo), mais pas avec ceux du temps réel.
// Dans ce cas, on le demande une seule fois à Data, puis on le garde dans la Map.
async function trouverPseudo(message) {
  // On en profite pour retenir la dernière activité de l'auteur : elle dit s'il est en ligne.
  if (message.utilisateurs) {
    pseudos.set(message.user_id, message.utilisateurs.pseudo);
    Presence.noter(message.user_id, message.utilisateurs.derniere_activite);
  }

  if (!pseudos.has(message.user_id)) {
    const { data } = await Data.fetchPseudo(message.user_id);
    pseudos.set(message.user_id, data ? data.pseudo : "Compte supprimé");
    Presence.noter(message.user_id, data?.derniere_activite);
  }

  return pseudos.get(message.user_id);
}

// Construit un message : <article> <header>pseudo</header> <p>texte</p> <img> <time> [Supprimer] </article>.
// Tout passe par createElement et textContent : un message qui contient du HTML s'affiche comme du texte, il n'est jamais exécuté.
function creerArticle(message, pseudo) {
  const article = document.createElement("article");
  article.dataset.id = message.id;
  article.dataset.temps = Date.parse(message.created_at);
  article.dataset.auteur = message.user_id;

  // Ses propres messages ont la classe « envoye », pour les placer à droite
  const estAMoi = message.user_id === monId;
  if (estAMoi) {
    article.classList.add("envoye");
  }

  // Sur les messages reçus, le pseudo est suivi de l'indicateur de présence : un point (en CSS) et le mot « en ligne » quand c'est le cas.
  const auteur = document.createElement("header");
  auteur.textContent = pseudo;
  if (!estAMoi) {
    auteur.dataset.auteur = message.user_id;
    const presence = document.createElement("span");
    presence.className = "presence";
    auteur.append(presence);
    afficherPresence(auteur);
  }
  article.append(auteur);

  if (message.texte) {
    const texte = document.createElement("p");
    texte.textContent = message.texte;
    article.append(texte);
  }

  // L'image : alt pour qui ne la voit pas, loading="lazy" pour ne la télécharger qu'à l'approche du fil visible,
  // et width / height pour que le navigateur lui réserve sa place avant qu'elle arrive : le fil ne saute pas pendant le chargement.
  // On réduit ces dimensions pour qu'une image ne dépasse pas 320 px de haut ; le CSS (max-width: 100 %) l'adapte ensuite à la bulle.
  if (message.image) {
    const image = document.createElement("img");
    image.src = Data.imageUrl(message.image);
    image.alt = "Image envoyée par " + pseudo;
    image.loading = "lazy";

    const dimensions = Data.imageDimensions(message.image);
    if (dimensions) {
      const echelle = Math.min(1, HAUTEUR_MAX_IMAGE / dimensions.hauteur);
      image.width = Math.round(dimensions.largeur * echelle);
      image.height = Math.round(dimensions.hauteur * echelle);
    }

    article.append(image);
  }

  // <time datetime> garde la date exacte (ISO) pour les machines ; le texte, lui, est à l'heure locale de la personne qui lit.
  const heure = document.createElement("time");
  heure.dateTime = message.created_at;
  heure.textContent = formaterDate(message.created_at);
  article.append(heure);

  // Sous ses propres messages, le statut dans un <small> : « envoyé » dès qu'il est enregistré, puis « reçu » et « lu ».
  if (estAMoi) {
    const statut = document.createElement("small");
    statut.className = "statut";
    statut.textContent = "envoyé";
    article.append(statut);
  }

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

// L'indicateur de présence d'un message reçu : la classe en-ligne colore le point, et le mot est écrit à côté.
// Hors ligne, le point reste gris et le mot disparaît : ce n'est pas la couleur seule qui porte l'information.
function afficherPresence(entete) {
  const enLigne = Presence.personneEnLigne(entete.dataset.auteur);
  entete.classList.toggle("en-ligne", enLigne);
  entete.querySelector(".presence").textContent = enLigne ? " · en ligne" : "";
}

// Met à jour tous les messages reçus affichés, appelé par Presence à chaque changement.
function mettreAJourPresences() {
  filMessages.querySelectorAll("header[data-auteur]").forEach(afficherPresence);
}

// Range un article à sa place dans le fil, selon sa date : avant le premier message plus récent que lui.
// Un message chargé, reçu en temps réel ou plus ancien trouve ainsi toujours sa place, dans n'importe quel ordre d'arrivée.
function rangerDansLeFil(article) {
  const temps = Number(article.dataset.temps);
  const suivant = [...filMessages.children].find((autre) => Number(autre.dataset.temps) > temps);
  filMessages.insertBefore(article, suivant ?? null);
}

// Proximité de la Gestalt : un message qui suit de près (moins de cinq minutes) un message du même auteur reçoit la classe « suite ».
// Le CSS le rapproche du précédent et cache son pseudo : l'œil lit les deux comme un seul bloc.
const ECART_REGROUPEMENT = 5 * 60 * 1000;

function regrouper(article) {
  if (!article) {
    return;
  }
  const precedent = article.previousElementSibling;
  const memeAuteur = precedent !== null
    && precedent.dataset.auteur === article.dataset.auteur
    && Number(article.dataset.temps) - Number(precedent.dataset.temps) < ECART_REGROUPEMENT;
  article.classList.toggle("suite", memeAuteur);
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

  // Un message inséré change aussi le regroupement de celui qui le suit
  regrouper(article);
  regrouper(article.nextElementSibling);

  // Son propre message prend tout de suite le bon statut
  if (article.classList.contains("envoye")) {
    mettreAJourStatuts();
  }
}

// Un message arrive en temps réel dans le salon ouvert : on l'affiche, et on descend si on était déjà en bas (ou si c'est le sien).
// S'il vient de quelqu'un d'autre, on le note comme reçu, et comme lu si on regarde la page.
async function recevoirMessage(message) {
  const suivre = estEnBasDuFil() || message.user_id === monId;
  await afficherMessage(message);
  if (suivre) {
    descendreEnBas();
  }
  if (message.user_id !== monId) {
    marquer(salonActif, message.created_at, !document.hidden);
  }
}


// -- Statut « envoyé », « reçu », « lu »


/*
    La table lectures garde, pour chaque personne et chaque salon, la date du dernier message reçu et du dernier message lu.
    On y range la date du message lui-même (donnée par la base), et non l'heure de l'appareil : une horloge mal réglée ne fausse rien.
*/

// Où en sont les autres membres du salon ouvert : identifiant → { derniere_reception, derniere_lecture }
const lectures = new Map();

// Ce qu'on a déjà enregistré pour soi, par salon : on n'écrit dans la base que si ça avance
const mesLectures = new Map();

// Le canal qui écoute les lectures du salon ouvert
let canalLectures = null;

// Une date ISO devient un nombre de millisecondes (0 si elle est vide), pour comparer facilement.
function enMillisecondes(date) {
  return date ? Date.parse(date) : 0;
}

// Enregistre qu'on a reçu (et, si lu vaut true, lu) les messages d'un salon jusqu'à celui daté dateMessage.
async function marquer(salonId, dateMessage, lu) {
  const deja = mesLectures.get(salonId) ?? {};
  const champs = {};

  if (enMillisecondes(dateMessage) > enMillisecondes(deja.derniere_reception)) {
    champs.derniere_reception = dateMessage;
  }
  if (lu && enMillisecondes(dateMessage) > enMillisecondes(deja.derniere_lecture)) {
    champs.derniere_lecture = dateMessage;
  }
  if (Object.keys(champs).length === 0) {
    return;
  }

  mesLectures.set(salonId, { ...deja, ...champs });
  const { error } = await Data.updateLecture(salonId, champs);
  if (error) {
    console.error(error);
  }
}

// Le salon ouvert est sous les yeux : tout ce qui est affiché est reçu et lu (si l'onglet est visible).
function marquerSalonOuvert() {
  const dernier = filMessages.lastElementChild;
  if (salonActif && dernier) {
    marquer(salonActif, dernier.querySelector("time").dateTime, !document.hidden);
  }
}

// Retient la lecture d'un autre membre (on ignore la sienne), puis met les statuts à jour.
function noterLecture(ligne) {
  if (ligne && ligne.user_id !== monId) {
    lectures.set(ligne.user_id, ligne);
    mettreAJourStatuts();
  }
}

// Le statut de chacun de ses messages : « lu » si au moins un autre membre l'a lu, « reçu » si au moins un l'a reçu, « envoyé » sinon.
// Il suffit de connaître le plus loin qu'un membre ait lu, et le plus loin qu'un membre ait reçu.
function mettreAJourStatuts() {
  let lectureMax = 0;
  let receptionMax = 0;
  for (const ligne of lectures.values()) {
    lectureMax = Math.max(lectureMax, enMillisecondes(ligne.derniere_lecture));
    receptionMax = Math.max(receptionMax, enMillisecondes(ligne.derniere_reception));
  }
  // Un message lu a forcément été reçu
  receptionMax = Math.max(receptionMax, lectureMax);

  filMessages.querySelectorAll("article.envoye").forEach((article) => {
    const temps = enMillisecondes(article.querySelector("time").dateTime);
    const statut = article.querySelector(".statut");
    if (temps <= lectureMax) {
      statut.textContent = "lu";
    } else if (temps <= receptionMax) {
      statut.textContent = "reçu";
    } else {
      statut.textContent = "envoyé";
    }
    statut.classList.toggle("lu", temps <= lectureMax);
  });
}

// -- Notifications


// La pastille d'un salon : le nombre de messages non lus, suivi d'un texte caché à l'écran, pour que le lecteur d'écran dise « 3 nouveaux messages ».
// On recrée la pastille à chaque nouveau message : son animation repart, et l'œil la remarque.
function afficherPastille(salonId) {
  const lien = listeSalons.querySelector("a[href='?salon=" + salonId + "']");
  if (!lien) {
    return;
  }

  lien.querySelector(".pastille")?.remove();
  const nombre = Alerte.nombre(salonId);
  if (nombre === 0) {
    return;
  }

  const pastille = document.createElement("span");
  pastille.className = "pastille";
  pastille.textContent = nombre;
  const explication = document.createElement("span");
  explication.className = "visuellement-cache";
  explication.textContent = nombre === 1 ? " nouveau message" : " nouveaux messages";
  pastille.append(explication);
  lien.append(pastille);
}

// Un message vient d'arriver dans n'importe quel salon (écoute sans filtre).
// On ne prévient pas pour ses propres messages, ni pour le salon qu'on a sous les yeux.
// Sinon : un message non lu de plus (pastille et titre de l'onglet), et le son si l'option est cochée.
function signalerMessage(message) {
  if (message.user_id === monId) {
    return;
  }

  // Un message d'un autre salon est arrivé sur cet appareil : il est « reçu » (pas encore lu, le salon n'est pas ouvert).
  if (message.salon_id !== salonActif) {
    marquer(message.salon_id, message.created_at, false);
  }
  if (message.salon_id === salonActif && !document.hidden) {
    return;
  }

  Alerte.ajouter(message.salon_id);
  afficherPastille(message.salon_id);
  Alerte.jouerSon();
}

// Un message a été supprimé (par nous ou depuis un autre appareil) : on retire sa bulle si on l'affiche.
function retirerMessage(messageId) {
  const article = messagesAffiches.get(Number(messageId));
  if (article) {
    // Le message suivant prend sa place : son regroupement est à refaire
    const suivant = article.nextElementSibling;
    article.remove();
    regrouper(suivant);
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


// -- Assistant de rédaction


// Le texte du champ tel qu'Alphonse l'analyse (normalisé en NFC, sans espaces autour) : c'est ce qui permet de savoir si un résultat correspond encore au champ.
function texteDuChamp() {
  return champMessage.value.normalize("NFC").trim();
}

// Le signe moins typographique (−) plutôt que le tiret : « −6 » se lit mieux que « -6 ».
function enPoints(penalite) {
  return penalite > 0 ? "−" + penalite : "0";
}

// Le message surligné : chaque passage à revoir dans un <mark>, avec son explication en infobulle (title).
// On construit des nœuds de texte et des éléments, jamais du HTML : le message de la personne ne peut pas s'exécuter.
function afficherTexteAnnote(resultat) {
  const passages = resultat.defauts.filter((defaut) => defaut.longueur > 0);
  const morceaux = [];
  let position = 0;

  for (const defaut of passages) {
    // Un passage qui en chevauche un autre déjà surligné est seulement listé plus bas
    if (defaut.debut < position) {
      continue;
    }
    morceaux.push(document.createTextNode(resultat.texte.slice(position, defaut.debut)));
    const mark = document.createElement("mark");
    mark.textContent = resultat.texte.slice(defaut.debut, defaut.fin);
    mark.title = defaut.message;
    morceaux.push(mark);
    position = defaut.fin;
  }
  morceaux.push(document.createTextNode(resultat.texte.slice(position)));

  texteAnnote.replaceChildren(...morceaux);
}

// La liste des défauts : le critère, l'explication et ce qu'il coûte.
function afficherListeDefauts(resultat) {
  if (resultat.defauts.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Rien à signaler : votre message est prêt.";
    listeDefauts.replaceChildren(li);
    return;
  }

  const lignes = resultat.defauts.map((defaut) => {
    const li = document.createElement("li");
    const critere = document.createElement("strong");
    critere.textContent = Alphonse.criteres[defaut.critere].nom + " : ";
    const cout = defaut.penalite > 0 ? " (" + enPoints(defaut.penalite) + ")" : " (déjà compté)";
    li.append(critere, defaut.message + cout);
    return li;
  });
  listeDefauts.replaceChildren(...lignes);
}

// La reformulation : d'abord les corrections dans le texte (<del> pour ce qu'on retire, <ins> pour ce qu'on ajoute), puis la version complète dans un <q>.
// Alphonse renvoie les corrections de la fin vers le début ; pour les montrer dans l'ordre de lecture, on les reprend à l'envers.
function afficherReformulation(resultat) {
  if (!resultat.reformulation) {
    zoneCorrections.textContent = "Alphonse n'a pas de correction à proposer.";
    zoneReformulation.replaceChildren();
    return;
  }

  const morceaux = [];
  let position = 0;
  for (const correction of [...resultat.corrections].reverse()) {
    morceaux.push(document.createTextNode(resultat.texte.slice(position, correction.debut)));
    if (correction.longueur > 0) {
      const retrait = document.createElement("del");
      retrait.textContent = resultat.texte.slice(correction.debut, correction.fin);
      morceaux.push(retrait);
    }
    if (correction.suggestion) {
      const ajout = document.createElement("ins");
      ajout.textContent = correction.suggestion;
      morceaux.push(ajout);
    }
    position = correction.fin;
  }
  morceaux.push(document.createTextNode(resultat.texte.slice(position)));
  zoneCorrections.replaceChildren(...morceaux);

  const citation = document.createElement("q");
  citation.textContent = resultat.reformulation;
  zoneReformulation.replaceChildren("Version complète : ", citation);
}

// Le tableau : une ligne par critère dans le <tbody>, le calcul final dans le <tfoot>.
function afficherDetail(resultat) {
  const lignes = resultat.detail.map((ligne) => {
    const tr = document.createElement("tr");
    const critere = document.createElement("th");
    critere.scope = "row";
    critere.textContent = ligne.critere;
    const nombre = document.createElement("td");
    nombre.textContent = ligne.nombre;
    const penalite = document.createElement("td");
    penalite.textContent = enPoints(ligne.penalite);
    const plafond = document.createElement("td");
    plafond.textContent = ligne.plafond === null ? "aucun" : enPoints(ligne.plafond);
    tr.append(critere, nombre, penalite, plafond);
    return tr;
  });
  corpsDetail.replaceChildren(...lignes);

  const totalPenalites = resultat.detail.reduce((somme, ligne) => somme + ligne.penalite, 0);
  totalDetail.textContent = "100 " + enPoints(totalPenalites) + " = " + resultat.note + " / 100";
}

// Affiche tout le résultat. Le feu change de couleur par son attribut data-couleur, que le CSS lit ; title et aria-label disent la même chose en mots.
function afficherResultat(resultat) {
  dernierResultat = resultat;

  feu.dataset.couleur = resultat.feu.couleur;
  feu.title = "Feu " + resultat.feu.couleur + " : " + resultat.feu.libelle;
  feu.setAttribute("aria-label", "Feu " + resultat.feu.couleur);

  let phrase = "Note : " + resultat.note + " / 100. " + resultat.feu.libelle + ".";
  if (!resultat.languageToolDisponible) {
    phrase += " LanguageTool ne répond pas : la note ne tient compte que de nos propres règles.";
  }
  texteNote.textContent = phrase;

  afficherTexteAnnote(resultat);
  afficherListeDefauts(resultat);
  afficherReformulation(resultat);
  afficherDetail(resultat);

  boutonAppliquer.disabled = !resultat.reformulation;
  resultatAssistant.hidden = false;
}

// Remet l'assistant à zéro : feu éteint, résultat caché.
function effacerResultat() {
  dernierResultat = null;
  feu.dataset.couleur = "aucune";
  feu.title = "Pas encore de note";
  feu.setAttribute("aria-label", "Feu éteint");
  texteNote.textContent = INVITATION_ASSISTANT;
  resultatAssistant.hidden = true;
}

// Analyse le texte du champ maintenant et affiche le résultat. Renvoie le résultat, ou null si le texte a changé pendant l'attente.
async function analyserMaintenant() {
  if (!salonActif || !texteDuChamp()) {
    return null;
  }

  Alphonse.annulerAnalyse();
  analyseEnCours = true;
  mettreAJourBoutons();
  texteNote.textContent = "Analyse en cours…";

  try {
    const resultat = await Alphonse.analyser(champMessage.value);
    // Pendant l'attente, la personne a pu continuer d'écrire : un résultat périmé n'est pas affiché.
    if (!resultat || resultat.texte !== texteDuChamp()) {
      texteNote.textContent = dernierResultat ? texteNote.textContent : INVITATION_ASSISTANT;
      return null;
    }
    afficherResultat(resultat);
    return resultat;
  } finally {
    analyseEnCours = false;
    mettreAJourBoutons();
  }
}


// -- Envoi


// Les mêmes règles que le compartiment Supabase : on prévient tout de suite, plutôt qu'après un envoi refusé.
const TAILLE_MAX_IMAGE = 2 * 1024 * 1024; // 2 Mo
const TYPES_IMAGE = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// La hauteur maximale d'une image dans le fil, en pixels
const HAUTEUR_MAX_IMAGE = 320;

/*
    Lit la largeur et la hauteur de l'image choisie, en la décodant avec createImageBitmap.
    C'est aussi une vérification : un fichier renommé en .png qui n'est pas une vraie image ne se décode pas, et on le refuse.
    Renvoie { largeur, hauteur }, ou null si le fichier n'est pas une image lisible.
*/
async function lireDimensions(fichier) {
  try {
    const bitmap = await createImageBitmap(fichier);
    const dimensions = { largeur: bitmap.width, hauteur: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch (erreur) {
    return null;
  }
}

// Enregistre le message (texte, image, ou les deux), puis vide le champ, le brouillon et l'assistant,
// et prévient les autres qu'on a fini d'écrire.
// L'image est d'abord déposée dans le stockage, puis son chemin est enregistré avec le message.
// Le message enregistré s'affiche tout de suite ; quand le temps réel le renverra, la Map l'ignorera.
async function enregistrerMessage(texte, fichier) {
  let chemin = null;

  if (fichier) {
    const dimensions = await lireDimensions(fichier);
    if (!dimensions) {
      afficherErreur("Ce fichier n'est pas une image lisible : choisissez une image PNG, JPEG, WebP ou GIF.");
      return;
    }

    const envoi = await Data.uploadImage(fichier, monId, dimensions.largeur, dimensions.hauteur);
    if (envoi.error) {
      afficherErreur("L'image n'a pas pu être envoyée. Vérifiez son format et sa taille, puis réessayez.", envoi.error);
      return;
    }
    chemin = envoi.chemin;
  }

  const { data: message, error } = await Data.sendMessage(salonActif, texte, chemin);

  if (error) {
    // Le message n'est pas enregistré : on retire l'image déjà déposée, pour ne pas laisser de fichier orphelin
    if (chemin) {
      await Data.deleteImage(chemin);
    }
    afficherErreur("Le message n'a pas pu être envoyé. Votre texte est toujours là, vous pouvez réessayer.", error);
    return false;
  }

  formulaireMessage.reset();
  Ecriture.signalerArret();
  Local.enregistrerBrouillon(salonActif, "");
  Alphonse.annulerAnalyse();
  effacerResultat();
  mettreAJourBoutons();
  await afficherMessage(message);
  descendreEnBas();
  return true;
}

/*
    Envoie le message. Avec avecAssistant, Alphonse est consulté d'abord, si la personne l'utilise :
    analyse automatique cochée, ou analyse demandée pour ce texte précis. Sous 80, le message ne part pas :
    on montre la note et on place le focus sur « Envoyer tel quel ». La personne choisit : corriger, appliquer la reformulation, ou envoyer quand même.
    Sans analyse demandée, rien n'est envoyé à LanguageTool : c'est ce qui permet d'écrire une information confidentielle.
    envoiEnCours bloque un deuxième envoi pendant toute l'opération, analyse comprise ; le finally le relâche, même en cas d'erreur.
*/
async function envoyer(avecAssistant) {
  const texte = champMessage.value.trim();
  const fichier = champImage.files[0] ?? null;
  // Il faut au moins un texte ou une image
  if (!salonActif || (!texte && !fichier) || envoiEnCours) {
    return;
  }

  effacerErreur();
  envoiEnCours = true;
  mettreAJourBoutons();
  let focusSurEnvoyerTelQuel = false;

  try {
    const assistantConsulte = caseAnalyseAuto.checked || dernierResultat?.texte === texteDuChamp();

    // L'assistant ne relit que du texte : une image seule part directement
    if (avecAssistant && assistantConsulte && texte) {
      const resultat = await analyserMaintenant();
      if (!resultat) {
        return;
      }
      if (resultat.note < 80) {
        texteNote.textContent += " Appliquez la reformulation, corrigez votre texte, ou choisissez « Envoyer tel quel ».";
        focusSurEnvoyerTelQuel = true;
        return;
      }
    }

    // Pour les statistiques : le résultat d'Alphonse, s'il correspond au texte qui part
    const resultatUtilise = dernierResultat?.texte === texteDuChamp() ? dernierResultat : null;

    const envoye = await enregistrerMessage(texte, fichier);

    // Statistiques de l'assistant : un message relu (avec sa note), et s'il est parti avec « Envoyer tel quel »
    if (envoye && resultatUtilise) {
      Local.compter("relus");
      Local.compter("sommeNotes", resultatUtilise.note);
    }
    if (envoye && !avecAssistant) {
      Local.compter("telQuel");
    }
  } finally {
    envoiEnCours = false;
    mettreAJourBoutons();
    if (focusSurEnvoyerTelQuel) {
      boutonEnvoyerTelQuel.focus();
    } else {
      champMessage.focus();
    }
  }
}


// -- « En train d'écrire »


// Montre ou cache la zone avec l'attribut hidden, et écrit qui est en train d'écrire. Les trois points animés sont dans le HTML.
function afficherEcriture(noms) {
  const zone = document.getElementById("en-train-ecrire");
  const texte = document.getElementById("texte-ecriture");

  if (noms.length === 0) {
    zone.hidden = true;
    texte.textContent = "";
  } else if (noms.length === 1) {
    texte.textContent = noms[0] + " est en train d'écrire";
  } else if (noms.length === 2) {
    texte.textContent = noms[0] + " et " + noms[1] + " sont en train d'écrire";
  } else {
    texte.textContent = "Plusieurs personnes sont en train d'écrire";
  }

  if (noms.length > 0) {
    zone.hidden = false;
  }
}


// -- Ouverture de la page


async function init() {
  // La case « Analyse automatique » reprend le choix fait la dernière fois, gardé par Local (décochée par défaut).
  caseAnalyseAuto.checked = Local.lirePreference("analyse-auto", false);

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
  Data.subscribeToAllMessages(signalerMessage);

  // Les compteurs de messages non lus gardés pendant la visite. Le salon qu'on ouvre est lu, sa pastille disparaît.
  Alerte.charger();
  if (salonActif) {
    Alerte.lire(salonActif);
  }
  Presence.suivre(mettreAJourPresences);

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

  // Sur téléphone, un seul panneau à la fois : la classe open sur <body> montre la conversation au lieu de la liste des salons.
  // On l'ajoute quand un salon est ouvert, ou quand l'adresse en demandait un qui n'existe pas (pour qu'on voie l'erreur).
  document.body.classList.toggle("open", salonActif !== null || parametre !== null);

  // Aucun salon ouvert : on désactive l'écriture, le reste de la page reste utilisable.
  if (!salonActif) {
    champMessage.disabled = true;
    champImage.disabled = true;
    caseAnalyseAuto.disabled = true;
    mettreAJourBoutons();
    return;
  }

  titreSalon.textContent = salon.nom;
  Alerte.definirTitre(salon.nom + " - Alphonse");
  Local.enregistrerDernierSalon(salonActif);

  // L'indicateur « en train d'écrire » : on rejoint le canal de ce salon
  Ecriture.demarrer(salonActif, monId, afficherEcriture);

  // Le brouillon laissé dans ce salon, s'il y en a un. Avec l'analyse automatique, Alphonse le note tout de suite.
  champMessage.value = Local.lireBrouillon(salonActif);
  mettreAJourBoutons();
  if (caseAnalyseAuto.checked && texteDuChamp()) {
    analyserMaintenant();
  }

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

  // Les statuts de ses messages : on écoute les lectures du salon, on charge où en sont les autres, puis on note qu'on a tout reçu et lu.
  canalLectures = Data.subscribeToLectures(salonActif, noterLecture);
  const reponseLectures = await Data.fetchLectures(salonActif);
  if (reponseLectures.error) {
    console.error(reponseLectures.error);
  } else {
    reponseLectures.data.forEach(noterLecture);
  }
  mettreAJourStatuts();
  marquerSalonOuvert();
}

init();


// -- Événements


// Création d'un salon : le bouton est désactivé pendant l'attente, puis on ouvre directement le nouveau salon.
formulaireSalon.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nom = champNomSalon.value.trim();
  if (!nom) {
    afficherErreurSalon("Donnez un nom au salon.");
    return;
  }

  zoneErreurSalon.textContent = "";
  boutonCreerSalon.disabled = true;

  try {
    const { data: salon, error } = await Data.createChannel(nom);

    if (error) {
      // 23505 = le code d'erreur de PostgreSQL pour « valeur déjà existante » : le nom d'un salon est unique.
      afficherErreurSalon(error.code === "23505" ? "Un salon porte déjà ce nom." : "Impossible de créer le salon.", error);
      return;
    }

    window.location.href = "?salon=" + salon.id;
  } finally {
    boutonCreerSalon.disabled = false;
  }
});

// « Retour aux salons » (téléphone) : on retire la classe open pour revenir à la liste, et on place le focus sur le salon ouvert.
boutonRetour.addEventListener("click", () => {
  document.body.classList.remove("open");
  const salonOuvert = listeSalons.querySelector("[aria-current='page']") ?? listeSalons.querySelector("a");
  if (salonOuvert) {
    salonOuvert.focus();
  }
});

// À chaque frappe : on garde le brouillon, on met à jour les boutons, on prévient les autres qu'on écrit, puis on s'occupe de l'assistant.
// Avec l'analyse automatique, Alphonse attend 800 ms sans frappe avant d'analyser (anti-rebond).
// Sans elle, un résultat qui ne correspond plus au texte est retiré : on n'affiche jamais la note d'un autre message.
champMessage.addEventListener("input", () => {
  if (salonActif) {
    Local.enregistrerBrouillon(salonActif, champMessage.value);
  }
  mettreAJourBoutons();

  // On signale aux autres qu'on écrit ; si le champ est vidé, on signale tout de suite qu'on a arrêté
  if (salonActif && champMessage.value.trim()) {
    Ecriture.signalerFrappe();
  } else {
    Ecriture.signalerArret();
  }

  if (caseAnalyseAuto.checked) {
    Alphonse.programmerAnalyse(champMessage.value, (resultat) => {
      if (!resultat) {
        effacerResultat();
      } else if (resultat.texte === texteDuChamp()) {
        afficherResultat(resultat);
      }
    });
  } else if (dernierResultat && dernierResultat.texte !== texteDuChamp()) {
    effacerResultat();
  }
});

// Choix d'une image : on vérifie tout de suite le format et la taille, avec les mêmes règles que Supabase
champImage.addEventListener("change", () => {
  effacerErreur();
  const fichier = champImage.files[0];

  if (fichier && !TYPES_IMAGE.includes(fichier.type)) {
    afficherErreur("Ce format n'est pas accepté : choisissez une image PNG, JPEG, WebP ou GIF.");
    champImage.value = "";
  } else if (fichier && fichier.size > TAILLE_MAX_IMAGE) {
    afficherErreur("Cette image dépasse 2 Mo : choisissez-en une plus légère.");
    champImage.value = "";
  }

  mettreAJourBoutons();
});

// Entrée envoie le message, Maj + Entrée passe à la ligne.
// isComposing : pendant la saisie d'un accent ou d'un caractère composé, Entrée valide le caractère, pas le message.
champMessage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    formulaireMessage.requestSubmit();
  }
});

// « Envoyer » et la touche Entrée passent par l'assistant (s'il est utilisé) ; « Envoyer tel quel » envoie sans le consulter.
formulaireMessage.addEventListener("submit", (event) => {
  event.preventDefault();
  envoyer(true);
});

boutonEnvoyerTelQuel.addEventListener("click", () => {
  envoyer(false);
});

// « Analyser » : l'analyse à la demande.
boutonAnalyser.addEventListener("click", () => {
  analyserMaintenant();
});

// La case « Analyse automatique » : on mémorise le choix, et si on vient de la cocher, on analyse le texte déjà écrit.
caseAnalyseAuto.addEventListener("change", () => {
  Local.enregistrerPreference("analyse-auto", caseAnalyseAuto.checked);
  if (caseAnalyseAuto.checked) {
    analyserMaintenant();
  } else {
    Alphonse.annulerAnalyse();
  }
});

// « Appliquer la reformulation » remplace le texte du champ, garde le brouillon, puis fait noter la nouvelle version.
boutonAppliquer.addEventListener("click", () => {
  if (!dernierResultat || !dernierResultat.reformulation) {
    return;
  }
  champMessage.value = dernierResultat.reformulation;
  Local.enregistrerBrouillon(salonActif, champMessage.value);
  Local.compter("appliquees");
  champMessage.focus();
  analyserMaintenant();
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

// De retour sur l'onglet : les messages du salon ouvert sont sous les yeux, ils ne sont plus « non lus ».
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && salonActif) {
    Alerte.lire(salonActif);
    afficherPastille(salonActif);
    marquerSalonOuvert();
  }
});

// En quittant la page (autre salon, autre page), on coupe l'écoute du salon avec removeChannel.
window.addEventListener("pagehide", () => {
  Data.unsubscribe(canalMessages);
  Data.unsubscribe(canalLectures);
  Ecriture.arreter();
});

// Si la session se termine (déconnexion, ou personne n'est connecté), on renvoie vers la page de connexion.
Auth.onSessionEnded(() => {
  window.location.replace("../index.html");
});