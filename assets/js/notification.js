/*
notification.js — Prévenir d'un nouveau message quand l'onglet n'est pas affiché.
Visuel : le titre de l'onglet affiche le nombre de messages non lus, « (2) général - Alphonse ».
Sonore : un petit « ding » à deux notes, fabriqué par le navigateur (API Web Audio), sans fichier son.
L'objet s'appelle Alerte et non Notification : Notification est déjà un nom réservé par le navigateur.
Utilisé par conversation.js.
*/

const Alerte = {

  // Le nombre de messages arrivés pendant que l'onglet était caché
  nonLus: 0,

  // Le « haut-parleur » du navigateur, créé à la première action de la personne (voir plus bas)
  contexteAudio: null,

  // Appelée par conversation.js à chaque message reçu d'une autre personne.
  // Si on regarde déjà la page, pas besoin de prévenir.
  nouveauMessage() {
    if (!document.hidden) {
      return;
    }
    Alerte.nonLus += 1;
    document.title = "(" + Alerte.nonLus + ") " + Alerte.titreSansCompteur();
    Alerte.jouerSon();
  },

  // Le titre de l'onglet sans le compteur : « (3) général - Alphonse » devient « général - Alphonse »
  titreSansCompteur() {
    return document.title.replace(/^\(\d+\) /, "");
  },

  // On revient sur l'onglet : les messages sont vus, on retire le compteur
  reinitialiser() {
    Alerte.nonLus = 0;
    document.title = Alerte.titreSansCompteur();
  },

  // Les navigateurs n'autorisent le son qu'après une action de la personne (clic ou touche).
  // On prépare donc le haut-parleur à la première action ; avant, la notification reste seulement visuelle.
  preparerSon() {
    try {
      Alerte.contexteAudio = new AudioContext();
    } catch (erreur) {
      Alerte.contexteAudio = null;
    }
  },

  // Deux notes courtes et douces (la puis mi), qui montent puis s'éteignent en un quart de seconde
  jouerSon() {
    const contexte = Alerte.contexteAudio;
    if (!contexte) {
      return;
    }
    // Un onglet caché peut mettre le son en pause : on le relance
    contexte.resume();

    const maintenant = contexte.currentTime;
    [880, 1320].forEach((frequence, numero) => {
      const oscillateur = contexte.createOscillator();
      const volume = contexte.createGain();
      const debut = maintenant + numero * 0.12;

      oscillateur.type = "sine";
      oscillateur.frequency.value = frequence;
      volume.gain.setValueAtTime(0.0001, debut);
      volume.gain.exponentialRampToValueAtTime(0.15, debut + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, debut + 0.25);

      oscillateur.connect(volume).connect(contexte.destination);
      oscillateur.start(debut);
      oscillateur.stop(debut + 0.3);
    });
  },
};

// Retour sur l'onglet : on retire le compteur du titre
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    Alerte.reinitialiser();
  }
});

// Première action de la personne sur la page : on prépare le son (once: true = une seule fois)
document.addEventListener("pointerdown", Alerte.preparerSon, { once: true });
document.addEventListener("keydown", Alerte.preparerSon, { once: true });