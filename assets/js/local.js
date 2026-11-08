/*
    local.js
    Préférences, session et brouillons conservés dans le navigateur.
    Chargé sans defer, car spclient.js en a besoin pour créer le client Supabase.
*/

// Tout ce qui concerne le stockage du navigateur est regroupé ici, et chaque accès passe par un bloc try/catch.
// En navigation privée ou avec un stockage bloqué, localStorage peut lever une erreur, qui ne doit pas interrompre la page.
const CLE_SE_SOUVENIR = "alphonse-se-souvenir";
const CLE_BROUILLONS = "alphonse-brouillons";
const CLE_DERNIER_SALON = "alphonse-dernier-salon";
const CLE_NON_LUS = "alphonse-non-lus";

const Local = {

  // La préférence est relue avec JSON.parse, puis vérifiée. Toute valeur différente de true est traitée comme false,
  // car le stockage peut être modifié depuis la console.
  lireSeSouvenir() {
    try {
      return JSON.parse(localStorage.getItem(CLE_SE_SOUVENIR)) === true;
    } catch (erreur) {
      console.error(erreur);
      return false;
    }
  },

  // L'état de la case est enregistré avec JSON.stringify. Si le stockage refuse l'écriture, la valeur false s'applique par défaut.
  enregistrerSeSouvenir(valeur) {
    try {
      localStorage.setItem(CLE_SE_SOUVENIR, JSON.stringify(valeur === true));
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // Préférence d'affichage ou de fonctionnement (analyse automatique, thème, taille du texte, son), enregistrée dans localStorage avec JSON.stringify
  // À la relecture, la valeur n'est conservée que si son type correspond à celui de la valeur par défaut.
  // Un booléen reste ainsi un booléen, même si une chaîne a été saisie dans la console.
  lirePreference(nom, valeurParDefaut) {
    try {
      const valeur = JSON.parse(localStorage.getItem("alphonse-" + nom));
      return valeur !== null && typeof valeur === typeof valeurParDefaut ? valeur : valeurParDefaut;
    } catch (erreur) {
      console.error(erreur);
      return valeurParDefaut;
    }
  },

  enregistrerPreference(nom, valeur) {
    try {
      localStorage.setItem("alphonse-" + nom, JSON.stringify(valeur));
    } catch (erreur) {
      console.error(erreur);
    }
  },

  /*
      Statistiques de l'assistant, conservées dans ce navigateur (localStorage, au format JSON). Elles correspondent aux résultats attendus de la fiche d'analyse.
      - relus, nombre de messages envoyés après une analyse d'Alphonse
      - sommeNotes, somme de leurs notes, pour calculer la moyenne
      - appliquees, nombre de reformulations appliquées
      - telQuel, nombre de messages envoyés avec « Envoyer tel quel »
      Seuls des entiers positifs sont relus, et un objet modifié dans la console est remis à zéro.
  */
  lireStatistiques() {
    const zero = { relus: 0, sommeNotes: 0, appliquees: 0, telQuel: 0 };
    const lues = Local.lirePreference("statistiques", zero);
    const statistiques = {};
    for (const cle of Object.keys(zero)) {
      statistiques[cle] = Number.isInteger(lues[cle]) && lues[cle] >= 0 ? lues[cle] : 0;
    }
    return statistiques;
  },

  // Ajoute 1 (ou la valeur indiquée) à une statistique
  compter(cle, valeur = 1) {
    const statistiques = Local.lireStatistiques();
    statistiques[cle] += valeur;
    Local.enregistrerPreference("statistiques", statistiques);
  },

  // Le brouillon et le dernier salon sont conservés dans sessionStorage et non dans localStorage, afin de disparaître avec l'onglet.
  // Un brouillon peut contenir une information privée qui ne doit pas rester sur l'ordinateur.

  // Les brouillons de tous les salons sont regroupés dans un seul objet ({ identifiant du salon: texte }), relu avec JSON.parse.
  // Si la valeur relue n'est pas un objet, un objet vide est utilisé.
  lireBrouillons() {
    try {
      const brouillons = JSON.parse(sessionStorage.getItem(CLE_BROUILLONS));
      if (brouillons && typeof brouillons === "object" && !Array.isArray(brouillons)) {
        return brouillons;
      }
    } catch (erreur) {
      console.error(erreur);
    }
    return {};
  },

  // Brouillon d'un salon, ou chaîne vide s'il n'y en a pas ou si la valeur trouvée n'est pas du texte
  lireBrouillon(salonId) {
    const texte = Local.lireBrouillons()[salonId];
    return typeof texte === "string" ? texte : "";
  },

  // Enregistre le brouillon avec JSON.stringify. Un brouillon vide est retiré de l'objet pour ne pas conserver d'entrée inutile.
  enregistrerBrouillon(salonId, texte) {
    const brouillons = Local.lireBrouillons();
    if (texte.trim()) {
      brouillons[salonId] = texte;
    } else {
      delete brouillons[salonId];
    }
    try {
      sessionStorage.setItem(CLE_BROUILLONS, JSON.stringify(brouillons));
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // Dernier salon ouvert, rouvert lors d'un clic sur « Conversations ».
  // Number() et Number.isInteger écartent toute valeur qui n'est pas un identifiant valide.
  lireDernierSalon() {
    try {
      const salonId = Number(sessionStorage.getItem(CLE_DERNIER_SALON));
      return Number.isInteger(salonId) && salonId > 0 ? salonId : null;
    } catch (erreur) {
      console.error(erreur);
      return null;
    }
  },

  // La valeur null efface le dernier salon, par exemple lorsqu'il n'existe plus
  enregistrerDernierSalon(salonId) {
    try {
      if (salonId) {
        sessionStorage.setItem(CLE_DERNIER_SALON, String(salonId));
      } else {
        sessionStorage.removeItem(CLE_DERNIER_SALON);
      }
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // Messages non lus de chaque salon, conservés pendant la durée de l'onglet. Une Map ne peut pas être convertie directement en JSON,
  // elle est donc enregistrée sous forme de liste de paires [salon, nombre], et seules les paires de deux entiers positifs sont relues.
  lireNonLus() {
    try {
      const paires = JSON.parse(sessionStorage.getItem(CLE_NON_LUS));
      if (Array.isArray(paires)) {
        return new Map(paires.filter((paire) => Array.isArray(paire)
          && Number.isInteger(paire[0]) && Number.isInteger(paire[1]) && paire[1] > 0));
      }
    } catch (erreur) {
      console.error(erreur);
    }
    return new Map();
  },

  enregistrerNonLus(nonLus) {
    try {
      sessionStorage.setItem(CLE_NON_LUS, JSON.stringify([...nonLus]));
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // À la déconnexion, les brouillons, le dernier salon et les messages non lus sont effacés,
  // afin que la personne suivante utilisant le même onglet n'y ait pas accès.
  oublierConversation() {
    try {
      sessionStorage.removeItem(CLE_BROUILLONS);
      sessionStorage.removeItem(CLE_DERNIER_SALON);
      sessionStorage.removeItem(CLE_NON_LUS);
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // Adaptateur de stockage fourni à Supabase. Selon la préférence, la session est conservée dans localStorage (elle survit à la fermeture du navigateur)
  // ou dans sessionStorage (elle disparaît avec l'onglet). Seule la session Supabase transite ici, jamais le mot de passe.
  stockageSession: {

    getItem(cle) {
      try {
        if (Local.lireSeSouvenir()) {
          return localStorage.getItem(cle);
        }
        return sessionStorage.getItem(cle);
      } catch (erreur) {
        console.error(erreur);
        return null;
      }
    },

    // Une écriture dans un stockage efface la copie présente dans l'autre, afin qu'une seule session existe à la fois
    setItem(cle, valeur) {
      try {
        if (Local.lireSeSouvenir()) {
          localStorage.setItem(cle, valeur);
          sessionStorage.removeItem(cle);
        } else {
          sessionStorage.setItem(cle, valeur);
          localStorage.removeItem(cle);
        }
      } catch (erreur) {
        console.error(erreur);
      }
    },

    // À la déconnexion, les deux stockages sont vidés, chacun dans son propre try/catch.
    // Si l'un est bloqué, l'autre est tout de même vidé.
    removeItem(cle) {
      try {
        localStorage.removeItem(cle);
      } catch (erreur) {
        console.error(erreur);
      }
      try {
        sessionStorage.removeItem(cle);
      } catch (erreur) {
        console.error(erreur);
      }
    },
  },
};