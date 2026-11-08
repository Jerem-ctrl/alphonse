/*
    notification.js — Prévenir des nouveaux messages.

    - Une pastille sur chaque salon qui a reçu des messages qu'on n'a pas encore vus (le CSS l'anime).
    - Un compteur dans le titre de l'onglet : « (3) Général - Alphonse ».
    - Un son, joué avec l'élément <audio> de la page, seulement si l'option est cochée dans les paramètres.
    Les messages non lus sont comptés dans une Map (identifiant du salon → nombre). Local la garde le temps de l'onglet :
    changer de salon recharge la page, et les compteurs des autres salons ne doivent pas se perdre en route.
    L'objet s'appelle Alerte et non Notification : Notification est déjà un nom réservé par le navigateur.
*/

const Alerte = {

  // Les messages non lus, rangés par salon
  nonLus: new Map(),

  // Le titre de la page sans le compteur (« Général - Alphonse »)
  titre: document.title,

  // Reprend les compteurs gardés par Local
  charger() {
    Alerte.nonLus = Local.lireNonLus();
    Alerte.mettreAJourTitre();
  },

  // Un message de plus dans un salon
  ajouter(salonId) {
    Alerte.nonLus.set(salonId, (Alerte.nonLus.get(salonId) ?? 0) + 1);
    Local.enregistrerNonLus(Alerte.nonLus);
    Alerte.mettreAJourTitre();
  },

  // Les messages d'un salon sont vus : on retire son compteur
  lire(salonId) {
    if (Alerte.nonLus.delete(salonId)) {
      Local.enregistrerNonLus(Alerte.nonLus);
      Alerte.mettreAJourTitre();
    }
  },

  // Le nombre de messages non lus d'un salon (0 s'il n'y en a pas)
  nombre(salonId) {
    return Alerte.nonLus.get(salonId) ?? 0;
  },

  // Le total, tous salons confondus
  total() {
    return [...Alerte.nonLus.values()].reduce((somme, nombre) => somme + nombre, 0);
  },

  // La page change de titre (par exemple en ouvrant un salon) : on garde ce titre, et on y remet le compteur.
  definirTitre(titre) {
    Alerte.titre = titre;
    Alerte.mettreAJourTitre();
  },

  // « (3) Général - Alphonse » s'il y a des messages non lus, le titre seul sinon
  mettreAJourTitre() {
    const total = Alerte.total();
    document.title = total > 0 ? "(" + total + ") " + Alerte.titre : Alerte.titre;
  },

  /*
      Le son, si l'option est cochée dans les paramètres. play() renvoie une Promise :
      un navigateur refuse souvent de jouer un son tant que la personne n'a pas encore cliqué ou tapé sur la page.
      Ce refus arrive dans le .catch() : on le note dans la console, et la pastille et le titre suffisent à prévenir.
  */
  jouerSon() {
    const son = document.getElementById("son-notification");
    if (!son || !Local.lirePreference("son", false)) {
      return;
    }

    son.currentTime = 0;
    son.play()
      .then(() => {
        // Le son est parti : rien d'autre à faire
      })
      .catch((erreur) => {
        console.info("Son de notification refusé par le navigateur :", erreur.name);
      });
  },
};