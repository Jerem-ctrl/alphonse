/*
    theme.js
    Préférences d'affichage, avec le thème (sombre, clair ou celui du système) et la taille du texte.

    Elles sont choisies dans les paramètres et conservées par Local, dans localStorage avec JSON.stringify et JSON.parse.
    Ce fichier est chargé dans le <head> de chaque page, sans defer. Le thème et la taille s'appliquent ainsi avant le premier affichage,
    sans flash blanc ni changement de taille du texte sous les yeux.
*/

// Choix possibles. Toute autre valeur trouvée dans le navigateur est ignorée.
const THEMES = ["nuit", "jour", "auto"];
const TAILLES = ["petite", "normale", "grande", "tres-grande"];

// Préférence du système, lue avec la media query prefers-color-scheme
const SYSTEME_CLAIR = window.matchMedia("(prefers-color-scheme: light)");

const Theme = {

  // Thème choisi, parmi "nuit" (sombre, par défaut), "jour" (clair) et "auto" (celui du système)
  lire() {
    const choix = Local.lirePreference("theme", "nuit");
    return THEMES.includes(choix) ? choix : "nuit";
  },

  enregistrer(choix) {
    Local.enregistrerPreference("theme", choix);
  },

  // L'attribut data-theme="jour" sur <html> active les couleurs claires de style.css. Sans cet attribut, le thème sombre s'applique.
  // Avec "auto", le thème suit le système, clair s'il le demande et sombre sinon.
  appliquer(choix) {
    const clair = choix === "jour" || (choix === "auto" && SYSTEME_CLAIR.matches);
    if (clair) {
      document.documentElement.dataset.theme = "jour";
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  },

  // Taille du texte, "normale" par défaut
  lireTaille() {
    const taille = Local.lirePreference("taille", "normale");
    return TAILLES.includes(taille) ? taille : "normale";
  },

  enregistrerTaille(taille) {
    Local.enregistrerPreference("taille", taille);
  },

  // L'attribut data-taille sur <html> modifie la taille de base de la page. Toutes les dimensions étant en rem, les textes, marges et boutons suivent.
  appliquerTaille(taille) {
    document.documentElement.dataset.taille = taille;
  },
};

// Application du thème et de la taille choisis dès le chargement de la page
Theme.appliquer(Theme.lire());
Theme.appliquerTaille(Theme.lireTaille());

// Lorsque le thème suit le système et que celui-ci change (passage au mode sombre le soir, par exemple), la page suit sans être rechargée.
SYSTEME_CLAIR.addEventListener("change", () => {
  Theme.appliquer(Theme.lire());
});