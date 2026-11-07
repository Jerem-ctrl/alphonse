/*
    local.js — Préférences, session et brouillons gardés dans le navigateur
*/

// On a rangé ici tout ce qui touche au stockage du navigateur, et chaque accès passe par un try/catch : en navigation privée ou avec le stockage bloqué, localStorage peut lever une erreur, et on refuse qu'un tiroir coincé fasse tomber toute la page.
const CLE_SE_SOUVENIR = "alphonse-se-souvenir";
const CLE_BROUILLONS = "alphonse-brouillons";
const CLE_DERNIER_SALON = "alphonse-dernier-salon";

const Local = {

  // On relit la préférence avec JSON.parse, mais sans la croire sur parole : tout ce qui n'est pas exactement true compte comme false. N'importe qui peut modifier le stockage dans la console, autant prévoir le coup.
  lireSeSouvenir() {
    try {
      return JSON.parse(localStorage.getItem(CLE_SE_SOUVENIR)) === true;
    } catch (erreur) {
      console.error(erreur);
      return false;
    }
  },

  // On enregistre l'état de la case avec JSON.stringify, comme dans la fiche. Si le stockage refuse, tant pis : on retombera sur false, le choix le plus discret.
  enregistrerSeSouvenir(valeur) {
    try {
      localStorage.setItem(CLE_SE_SOUVENIR, JSON.stringify(valeur === true));
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // Une préférence d'affichage (analyse automatique, et plus tard le thème ou le son), rangée dans localStorage avec JSON.stringify.
  // À la relecture, on ne garde la valeur que si elle a le même type que la valeur par défaut : un true reste un booléen, jamais une chaîne bricolée dans la console.
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

  // Le brouillon et le dernier salon vont dans sessionStorage, pas dans localStorage : ils disparaissent avec l'onglet. Un brouillon peut contenir quelque chose de privé, on ne veut pas qu'il reste sur l'ordinateur.

  // Les brouillons de tous les salons tiennent dans un seul objet { identifiant du salon: texte }, relu avec JSON.parse. Si ce qu'on relit n'est pas un objet, on repart d'un objet vide.
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

  // Le brouillon d'un salon, ou une chaîne vide s'il n'y en a pas (ou si ce qu'on trouve n'est pas du texte).
  lireBrouillon(salonId) {
    const texte = Local.lireBrouillons()[salonId];
    return typeof texte === "string" ? texte : "";
  },

  // On enregistre le brouillon avec JSON.stringify. Un brouillon vide est retiré de l'objet : on ne garde pas de cases inutiles.
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

  // Le dernier salon ouvert, pour y revenir quand on clique sur « Conversations ». Number() et Number.isInteger écartent tout ce qui n'est pas un identifiant valide.
  lireDernierSalon() {
    try {
      const salonId = Number(sessionStorage.getItem(CLE_DERNIER_SALON));
      return Number.isInteger(salonId) && salonId > 0 ? salonId : null;
    } catch (erreur) {
      console.error(erreur);
      return null;
    }
  },

  // Avec null, on oublie le dernier salon : c'est le cas quand il n'existe plus.
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

  // À la déconnexion, on efface les brouillons et le dernier salon : la personne suivante sur le même onglet ne doit rien en retrouver.
  oublierConversation() {
    try {
      sessionStorage.removeItem(CLE_BROUILLONS);
      sessionStorage.removeItem(CLE_DERNIER_SALON);
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // L'adaptateur pour Supabase. Selon la préférence, la session dort dans localStorage (elle survit à la fermeture du navigateur) ou dans sessionStorage (elle s'en va avec l'onglet). Seule la session de Supabase passe par ici, jamais le mot de passe.
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

    // Quand on écrit dans un stockage, on efface la copie de l'autre : une seule session à la fois, pas de jumelle oubliée dans un coin.
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

    // À la déconnexion, on vide les deux tiroirs, chacun dans son try/catch : si l'un est bloqué, l'autre se vide quand même. Mieux vaut un coup de balai de trop qu'une session qui traîne.
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