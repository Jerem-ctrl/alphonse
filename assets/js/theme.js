/*
theme.js — Thème jour ou nuit, choisi dans les paramètres et gardé dans le navigateur (localStorage).
*/

const CLE_THEME = "alphonse-theme";

const Theme = {

  // Le choix enregistré : "nuit" (par défaut), "jour" ou "auto". Toute autre valeur compte comme "nuit".
  // try/catch : en navigation privée, le localStorage peut être bloqué, et la page ne doit pas planter pour autant.
  lire() {
    try {
      const choix = localStorage.getItem(CLE_THEME);
      return ["nuit", "jour", "auto"].includes(choix) ? choix : "nuit";
    } catch (erreur) {
      return "nuit";
    }
  },

  // Garde le choix pour les prochaines visites, sur toutes les pages
  enregistrer(choix) {
    try {
      localStorage.setItem(CLE_THEME, choix);
    } catch (erreur) {
      console.error(erreur);
    }
  },

  // Applique le thème : data-theme="jour" sur <html> active les couleurs jour de style.css,
  appliquer(choix) {
    const jour = choix === "jour"
      || (choix === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);

    if (jour) {
      document.documentElement.dataset.theme = "jour";
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  },
};

// Dès le chargement de la page : on applique le thème choisi
Theme.appliquer(Theme.lire());