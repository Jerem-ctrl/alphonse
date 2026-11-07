/*
    alphonse.js — L'assistant de rédaction : il note un message sur 100, explique ses défauts et propose une reformulation.

    Comme Data et Local, l'objet Alphonse ne touche jamais au document : il reçoit un texte et renvoie un résultat.
    C'est conversation.js qui décide comment l'afficher.

    La note vient de deux sources :
    - LanguageTool, un service en ligne, pour l'orthographe et la grammaire ;
    - nos propres règles, écrites avec les méthodes de chaînes, pour la politesse, le registre et la clarté : LanguageTool ne les juge pas.
    Si LanguageTool ne répond pas, la note repose sur nos seules règles, et le résultat le signale.
*/


// -- Réglages


// Le seul point d'entrée autorisé par LanguageTool pour son service gratuit
const URL_LANGUAGETOOL = "https://api.languagetool.org/v2/check";

// Au-delà de 10 secondes sans réponse, on abandonne l'appel plutôt que de laisser l'assistant tourner dans le vide
const DELAI_MAX_LANGUAGETOOL = 10000;

// L'anti-rebond : l'analyse automatique part 800 ms après la dernière frappe. Le service gratuit accepte 20 requêtes par minute,
// on ne l'appelle donc pas à chaque lettre.
const DELAI_ANALYSE = 800;

// Le nombre de résultats gardés en cache
const TAILLE_CACHE = 30;

// Le barème : chaque critère a un nom affiché et, s'il en a un, un plafond de pénalité.
// Avec le plafond, dix fautes d'orthographe coûtent 40 points, pas 60 : la note reste lisible.
const CRITERES = {
  orthographe: { nom: "Orthographe", plafond: 40 },
  grammaire: { nom: "Grammaire et syntaxe", plafond: 30 },
  politesse: { nom: "Politesse et registre", plafond: null },
  clarte: { nom: "Clarté et ton", plafond: null }
};

// Le classement des défauts de LanguageTool. On se fie d'abord à la catégorie (category.id), parce que le type (issueType)
// vaut souvent « uncategorized » en français : une faute de grammaire n'aurait alors rien coûté.
const CATEGORIES_LANGUAGETOOL = {
  TYPOS: { critere: "orthographe", penalite: 6 },
  CAT_GRAMMAIRE: { critere: "grammaire", penalite: 8 },
  MISC: { critere: "grammaire", penalite: 8 }
};

// Une catégorie qu'on n'a jamais observée compte quand même, mais avec une pénalité modérée.
const CATEGORIE_INCONNUE = { critere: "grammaire", penalite: 4 };

// Les formules d'appel. On y met aussi « salut » et « coucou » : l'appel est bien là, c'est le registre qui pèche, et il est compté à part.
const FORMULES_APPEL = ["bonjour", "bonsoir", "madame", "monsieur", "mesdames", "messieurs", "cher", "chère", "chers", "chères", "salut", "coucou", "hello"];

// Les formules de clôture, cherchées à la fin du message
const FORMULES_CLOTURE = ["cordialement", "bien à vous", "salutations", "merci", "bonne journée", "bonne soirée", "bonne fin de journée", "à bientôt", "au plaisir"];

// Les marqueurs familiers et leur équivalent professionnel. Une chaîne vide veut dire qu'on propose de retirer le mot.
const MOTS_FAMILIERS = new Map([
  ["salut", "bonjour"],
  ["coucou", "bonjour"],
  ["hello", "bonjour"],
  ["yo", "bonjour"],
  ["ouais", "oui"],
  ["stp", "s'il te plaît"],
  ["svp", "s'il vous plaît"],
  ["dsl", "désolé"],
  ["tkt", "ne t'inquiète pas"],
  ["jsp", "je ne sais pas"],
  ["pk", "pourquoi"],
  ["pcq", "parce que"],
  ["mdr", ""],
  ["lol", ""],
  ["ptdr", ""],
  ["bisous", ""]
]);

// Une phrase de plus de 30 mots se lit mal sur un écran : au-delà, on conseille de la couper.
const MOTS_PAR_PHRASE = 30;


// -- Un défaut


/*
    Chaque défaut trouvé, par LanguageTool ou par nos règles, devient un objet Defaut, créé avec new Defaut(...).
    debut et longueur repèrent le passage dans le texte : c'est ce qui permettra de le surligner.
    suggestion est le texte qui le remplace dans la reformulation, ou null quand on n'a rien de sûr à proposer.
*/
class Defaut {
  constructor(critere, penalite, message, debut, longueur, suggestion = null, source = "Alphonse") {
    this.critere = critere;
    this.penalite = penalite;
    this.message = message;
    this.debut = debut;
    this.longueur = longueur;
    this.suggestion = suggestion;
    this.source = source;
  }

  // La position juste après le passage
  get fin() {
    return this.debut + this.longueur;
  }
}


// -- Petites fonctions utiles


// Recopie la casse du mot d'origine sur son remplaçant : « Salut » devient « Bonjour », « salut » devient « bonjour ».
function accorderCasse(original, remplacement) {
  if (remplacement && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return remplacement[0].toUpperCase() + remplacement.slice(1);
  }
  return remplacement;
}

// Un mot commence-t-il une phrase ? Oui s'il n'y a rien avant lui, ou si le dernier signe avant lui termine une phrase.
function debutDePhrase(texte, position) {
  const avant = texte.slice(0, position).trim();
  return avant === "" || ".!?…\n".includes(avant[avant.length - 1]);
}

// Tous les mots du texte, avec leur position : \p{L} reconnaît les lettres de toutes les langues, accents compris.
function lesMots(texte) {
  return [...texte.matchAll(/\p{L}+/gu)].map((resultat) => ({ mot: resultat[0], debut: resultat.index }));
}


// -- L'objet Alphonse


const Alphonse = {

  // Les derniers résultats, rangés par texte analysé : relancer l'analyse d'un texte déjà vu ne rappelle pas LanguageTool.
  cache: new Map(),

  // Le minuteur de l'anti-rebond
  minuteur: null,


  // -- LanguageTool

  /*
      Envoie le texte à LanguageTool et renvoie la liste brute de ses défauts (matches).
      fetch en POST, avec un corps URLSearchParams : le navigateur l'encode en UTF-8, accents et émojis compris.
      AbortController coupe l'appel après 10 secondes ; le finally efface ce minuteur dans tous les cas, réponse ou erreur.
  */
  async appelerLanguageTool(texte) {
    const controleur = new AbortController();
    const minuteurAbandon = setTimeout(() => controleur.abort(), DELAI_MAX_LANGUAGETOOL);

    try {
      const reponse = await fetch(URL_LANGUAGETOOL, {
        method: "POST",
        body: new URLSearchParams({ text: texte, language: "fr" }),
        signal: controleur.signal
      });

      // En cas d'erreur, LanguageTool répond en texte brut, pas en JSON : on vérifie le statut avant de lire la réponse.
      if (!reponse.ok) {
        const explication = await reponse.text();
        throw new Error("LanguageTool a répondu " + reponse.status + " : " + explication.slice(0, 200));
      }

      // On vérifie aussi la forme de la réponse avant de s'en servir : le service peut changer sans prévenir.
      const donnees = await reponse.json();
      if (!donnees || !Array.isArray(donnees.matches)) {
        throw new Error("La réponse de LanguageTool n'a pas la forme attendue.");
      }
      return donnees.matches;
    } finally {
      clearTimeout(minuteurAbandon);
    }
  },

  // Transforme les défauts de LanguageTool en objets Defaut, en écartant ceux qu'on ne peut pas utiliser sans risque.
  defautsLanguageTool(texte, matches) {
    const defauts = [];

    for (const match of matches) {
      // Une position qui sort du texte rendrait le surlignage et la reformulation faux : on ignore le défaut.
      const positionValide = Number.isInteger(match.offset) && Number.isInteger(match.length)
        && match.offset >= 0 && match.offset + match.length <= texte.length;
      if (!positionValide) {
        continue;
      }

      // Usage québécois : pas d'espace avant ? ! et ; (OQLF). On garde la règle pour le deux-points, où l'espace est attendue.
      const passage = texte.substring(match.offset, match.offset + match.length);
      if (match.rule?.id === "FRENCH_WHITESPACE" && "?!;".includes(passage[passage.length - 1])) {
        continue;
      }

      // Le classement : la catégorie d'abord, puis le type « misspelling », toujours fiable pour l'orthographe.
      let classement = CATEGORIES_LANGUAGETOOL[match.rule?.category?.id] ?? CATEGORIE_INCONNUE;
      if (match.rule?.issueType === "misspelling") {
        classement = CATEGORIES_LANGUAGETOOL.TYPOS;
      }

      // La première suggestion est la plus probable. S'il n'y en a pas, on ne remplace rien.
      const suggestion = Array.isArray(match.replacements) && match.replacements.length > 0
        ? match.replacements[0].value
        : null;

      const message = typeof match.message === "string" ? match.message : "Passage à vérifier.";

      defauts.push(new Defaut(classement.critere, classement.penalite, message, match.offset, match.length, suggestion, "LanguageTool"));
    }

    return defauts;
  },


  // -- Nos règles

  // Politesse et registre : formule d'appel, formule de clôture, marqueurs familiers. −10 par manquement.
  reglesPolitesse(texte) {
    const defauts = [];
    const mots = lesMots(texte);
    const minuscules = texte.toLowerCase();

    // La formule d'appel se cherche dans le premier mot.
    if (mots.length === 0 || !FORMULES_APPEL.includes(mots[0].mot.toLowerCase())) {
      defauts.push(new Defaut("politesse", 10, "Aucune formule d'appel : commencez par « Bonjour, » par exemple.", 0, 0, "Bonjour,\n"));
    }

    // La formule de clôture se cherche dans les 60 derniers caractères.
    const fin = minuscules.slice(-60);
    if (!FORMULES_CLOTURE.some((formule) => fin.includes(formule))) {
      defauts.push(new Defaut("politesse", 10, "Aucune formule de clôture : terminez par « Cordialement » ou « Merci » par exemple.", texte.length, 0, "\n\nCordialement"));
    }

    // Chaque marqueur familier est un manquement à part.
    for (const { mot, debut } of mots) {
      const remplacement = MOTS_FAMILIERS.get(mot.toLowerCase());
      if (remplacement !== undefined) {
        const conseil = remplacement ? "préférez « " + remplacement + " »." : "à retirer dans un message professionnel.";
        defauts.push(new Defaut("politesse", 10, "« " + mot + " » est familier : " + conseil, debut, mot.length, accorderCasse(mot, remplacement)));
      }
    }

    return defauts;
  },

  // Clarté et ton : phrases trop longues (−5 chacune), mots en majuscules (−10), points d'exclamation ou d'interrogation répétés (−5).
  reglesClarte(texte) {
    const defauts = [];

    // Les phrases, avec leur position : tout ce qui va jusqu'à un signe de fin de phrase (ou jusqu'à la fin du texte).
    for (const resultat of texte.matchAll(/[^.!?…\n]+[.!?…]*/g)) {
      const nombreDeMots = resultat[0].split(/\s+/).filter((mot) => mot !== "").length;
      if (nombreDeMots > MOTS_PAR_PHRASE) {
        defauts.push(new Defaut("clarte", 5, "Phrase de " + nombreDeMots + " mots : coupez-la en deux pour qu'elle se lise d'un coup d'œil.", resultat.index, resultat[0].length));
      }
    }

    // Un mot de 5 lettres ou plus tout en majuscules, c'est crier. On laisse passer les sigles courts (RH, UQAC).
    // On ne compte la pénalité qu'une fois, mais on signale chaque mot pour pouvoir le corriger.
    let majusculesDejaComptees = false;
    for (const { mot, debut } of lesMots(texte)) {
      if (mot.length >= 5 && mot === mot.toUpperCase() && mot !== mot.toLowerCase()) {
        const correction = debutDePhrase(texte, debut) ? mot[0] + mot.slice(1).toLowerCase() : mot.toLowerCase();
        defauts.push(new Defaut("clarte", majusculesDejaComptees ? 0 : 10, "« " + mot + " » en majuscules donne l'impression de crier.", debut, mot.length, correction));
        majusculesDejaComptees = true;
      }
    }

    // « !!! » ou « ?? » : un seul signe suffit. Là aussi, une seule pénalité pour tout le message.
    let ponctuationDejaComptee = false;
    for (const resultat of texte.matchAll(/[!?]{2,}/g)) {
      defauts.push(new Defaut("clarte", ponctuationDejaComptee ? 0 : 5, "« " + resultat[0] + " » : un seul signe suffit dans un message professionnel.", resultat.index, resultat[0].length, resultat[0][0]));
      ponctuationDejaComptee = true;
    }

    return defauts;
  },


  // -- La note

  // Additionne les pénalités par critère, applique les plafonds, puis retire le total de 100 (sans descendre sous 0).
  calculerNote(defauts) {
    const detail = Object.entries(CRITERES).map(([cle, critere]) => {
      const defautsDuCritere = defauts.filter((defaut) => defaut.critere === cle);
      const total = defautsDuCritere.reduce((somme, defaut) => somme + defaut.penalite, 0);
      const penalite = critere.plafond === null ? total : Math.min(total, critere.plafond);
      return { critere: critere.nom, nombre: defautsDuCritere.length, penalite, plafond: critere.plafond };
    });

    const totalPenalites = detail.reduce((somme, ligne) => somme + ligne.penalite, 0);
    return { note: Math.max(0, 100 - totalPenalites), detail };
  },

  // La couleur et le libellé du feu. switch sur les dizaines de la note : 10, 9 et 8 donnent le vert (80 et plus), 7, 6 et 5 l'orange (50 à 79), le reste le rouge.
  feu(note) {
    switch (Math.floor(note / 10)) {
      case 10:
      case 9:
      case 8:
        return { couleur: "vert", libelle: "Prêt à partir" };
      case 7:
      case 6:
      case 5:
        return { couleur: "orange", libelle: "Ça passe, mais on peut mieux faire" };
      default:
        return { couleur: "rouge", libelle: "À retravailler avant envoi" };
    }
  },


  // -- La reformulation

  /*
      Applique les suggestions de la fin vers le début du texte : modifier la fin ne décale pas les positions du début,
      chaque défaut reste donc à sa place. Si deux défauts se chevauchent, on ne garde que le premier rencontré.
      À position égale, le passage le plus long passe d'abord : un ajout en tout début (« Bonjour, ») ne bloque pas la correction du premier mot.
  */
  reformuler(texte, defauts) {
    const corrections = defauts
      .filter((defaut) => defaut.suggestion !== null)
      .sort((a, b) => b.debut - a.debut || b.longueur - a.longueur);

    let resultat = texte;
    let limite = Infinity;

    for (const defaut of corrections) {
      if (defaut.fin > limite) {
        continue;
      }
      resultat = resultat.slice(0, defaut.debut) + defaut.suggestion + resultat.slice(defaut.fin);
      limite = defaut.debut;
    }

    // Retirer un mot familier peut laisser deux espaces côte à côte, ou une espace avant une virgule ou un point : on fait le ménage.
    return resultat.replace(/ {2,}/g, " ").replace(/ +([.,])/g, "$1").replace(/^[ ,]+/gm, "").trim();
  },


  // -- L'analyse complète

  /*
      Analyse un texte et renvoie le résultat : la note, le feu, les défauts, le détail par critère et la reformulation.
      Le texte est d'abord normalisé en NFC : un « é » collé depuis certains logiciels arrive en deux caractères (« e » + accent),
      et LanguageTool le compterait comme une faute. Toutes les positions renvoyées se rapportent à ce texte normalisé.
  */
  async analyser(texteBrut) {
    const texte = texteBrut.normalize("NFC").trim();
    if (!texte) {
      return null;
    }

    if (Alphonse.cache.has(texte)) {
      return Alphonse.cache.get(texte);
    }

    // Si LanguageTool échoue (réseau, limite atteinte, réponse inattendue), on continue avec nos seules règles.
    let defautsApi = [];
    let languageToolDisponible = true;
    try {
      const matches = await Alphonse.appelerLanguageTool(texte);
      defautsApi = Alphonse.defautsLanguageTool(texte, matches);
    } catch (erreur) {
      console.error(erreur);
      languageToolDisponible = false;
    }

    // Un même passage n'est compté qu'une fois : si nos règles le relèvent déjà (« mdr », « URGENT », « !!! »), on écarte le défaut de LanguageTool.
    const defautsLocaux = [...Alphonse.reglesPolitesse(texte), ...Alphonse.reglesClarte(texte)];
    const defautsApiRestants = defautsApi.filter((api) => !defautsLocaux.some((local) =>
      local.longueur > 0 && api.debut < local.fin && local.debut < api.fin));

    const defauts = [...defautsApiRestants, ...defautsLocaux].sort((a, b) => a.debut - b.debut);
    const { note, detail } = Alphonse.calculerNote(defauts);
    const reformulation = Alphonse.reformuler(texte, defauts);

    const resultat = {
      texte,
      note,
      feu: Alphonse.feu(note),
      defauts,
      detail,
      reformulation: reformulation !== texte ? reformulation : null,
      languageToolDisponible
    };

    // On ne garde en cache que les analyses complètes : si LanguageTool était indisponible, on lui redonnera sa chance.
    if (languageToolDisponible) {
      Alphonse.cache.set(texte, resultat);
      // Une Map garde l'ordre d'ajout : la première clé est la plus ancienne, c'est elle qu'on retire quand le cache est plein.
      if (Alphonse.cache.size > TAILLE_CACHE) {
        Alphonse.cache.delete(Alphonse.cache.keys().next().value);
      }
    }

    return resultat;
  },

  /*
      L'anti-rebond de l'analyse automatique : chaque appel annule le précédent, et l'analyse ne part que 800 ms après le dernier.
      rappel reçoit le résultat. La page vérifie que le résultat correspond toujours au texte du champ avant de l'afficher.
  */
  programmerAnalyse(texte, rappel) {
    clearTimeout(Alphonse.minuteur);
    Alphonse.minuteur = setTimeout(async () => {
      rappel(await Alphonse.analyser(texte));
    }, DELAI_ANALYSE);
  },

  // Annule une analyse programmée (par exemple quand on clique sur « Analyser » ou qu'on envoie le message).
  annulerAnalyse() {
    clearTimeout(Alphonse.minuteur);
  },
};
