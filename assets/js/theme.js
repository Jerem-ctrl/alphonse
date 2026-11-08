/*
    theme.js — Les préférences d'affichage : le thème (sombre, clair ou celui du système) et la taille du texte.

    Elles sont choisies dans les paramètres et gardées par Local, en localStorage avec JSON.stringify et JSON.parse.
    Ce fichier est chargé dans le <head> de chaque page, sans defer : le thème et la taille s'appliquent avant le premier affichage,
    sans éclair blanc ni texte qui change de taille sous les yeux.
*/

// Les choix possibles. Toute autre valeur trouvée dans le navigateur est ignorée.
const THEMES = ["nuit", "jour", "auto"];
const TAILLES = ["petite", "normale", "grande", "tres-grande"];

// La préférence du système, lue avec la media query prefers-color-scheme
const SYSTEME_CLAIR = window.matchMedia("(prefers-color-scheme: light)");

const Theme = {

  // Le thème choisi : "nuit" (sombre, par défaut), "jour" (clair) ou "auto" (celui du système)
  lire() {
    const choix = Local.lirePreference("theme", "nuit");
    return THEMES.includes(choix) ? choix : "nuit";
  },

  enregistrer(choix) {
    Local.enregistrerPreference("theme", choix);
  },

  // data-theme="jour" sur <html> active les couleurs claires de style.css ; sans l'attribut, c'est le thème sombre.
  // Avec "auto", on suit le système : clair s'il le demande, sombre sinon.
  appliquer(choix) {
    const clair = choix === "jour" || (choix === "auto" && SYSTEME_CLAIR.matches);
    if (clair) {
      document.documentElement.dataset.theme = "jour";
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  },

  // La taille du texte : "normale" par défaut
  lireTaille() {
    const taille = Local.lirePreference("taille", "normale");
    return TAILLES.includes(taille) ? taille : "normale";
  },

  enregistrerTaille(taille) {
    Local.enregistrerPreference("taille", taille);
  },

  // data-taille sur <html> change la taille de base de la page ; tout est en rem, donc tout suit : textes, marges, boutons.
  appliquerTaille(taille) {
    document.documentElement.dataset.taille = taille;
  },
};

// Dès le chargement de la page : on applique le thème et la taille choisis
Theme.appliquer(Theme.lire());
Theme.appliquerTaille(Theme.lireTaille());

// Si le thème suit le système et que le système change (passage au mode sombre le soir, par exemple), la page suit sans recharger.
SYSTEME_CLAIR.addEventListener("change", () => {
  Theme.appliquer(Theme.lire());
});