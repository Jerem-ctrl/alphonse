/*
    local.js — Préférences et session gardées dans le navigateur
*/

// On a rangé ici tout ce qui touche au stockage du navigateur, et chaque accès passe par un try/catch : en navigation privée ou avec le stockage bloqué, localStorage peut lever une erreur, et on refuse qu'un tiroir coincé fasse tomber toute la page.
const CLE_SE_SOUVENIR = "alphonse-se-souvenir";

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
