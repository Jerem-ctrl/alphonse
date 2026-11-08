/*
    notification.js
    Notification des nouveaux messages.

    - Une pastille sur chaque salon contenant des messages non lus (animée par le CSS).
    - Un compteur dans le titre de l'onglet, par exemple « (3) Général - Alphonse ».
    - Un son joué avec l'élément <audio> de la page, uniquement si l'option est activée dans les paramètres.
    Les messages non lus sont comptés dans une Map (identifiant du salon associé au nombre de messages).
    Local la conserve pendant la durée de l'onglet, car changer de salon recharge la page et les compteurs des autres salons doivent être préservés.
    L'objet s'appelle Alerte, car le nom Notification est déjà réservé par le navigateur.
*/

const Alerte = {

  // Messages non lus, indexés par salon
  nonLus: new Map(),

  // Titre de la page sans le compteur (« Général - Alphonse »)
  titre: document.title,

  // Reprend les compteurs conservés par Local
  charger() {
    Alerte.nonLus = Local.lireNonLus();
    Alerte.mettreAJourTitre();
  },

  // Ajoute un message non lu à un salon
  ajouter(salonId) {
    Alerte.nonLus.set(salonId, (Alerte.nonLus.get(salonId) ?? 0) + 1);
    Local.enregistrerNonLus(Alerte.nonLus);
    Alerte.mettreAJourTitre();
  },

  // Retire le compteur d'un salon dont les messages ont été vus
  lire(salonId) {
    if (Alerte.nonLus.delete(salonId)) {
      Local.enregistrerNonLus(Alerte.nonLus);
      Alerte.mettreAJourTitre();
    }
  },

  // Nombre de messages non lus d'un salon (0 si aucun)
  nombre(salonId) {
    return Alerte.nonLus.get(salonId) ?? 0;
  },

  // Total des messages non lus, tous salons confondus
  total() {
    return [...Alerte.nonLus.values()].reduce((somme, nombre) => somme + nombre, 0);
  },

  // Mémorise le nouveau titre de la page (à l'ouverture d'un salon, par exemple) et y ajoute le compteur
  definirTitre(titre) {
    Alerte.titre = titre;
    Alerte.mettreAJourTitre();
  },

  // Affiche « (3) Général - Alphonse » en présence de messages non lus, et le titre seul sinon
  mettreAJourTitre() {
    const total = Alerte.total();
    document.title = total > 0 ? "(" + total + ") " + Alerte.titre : Alerte.titre;
  },

  /*
      Joue le son si l'option est activée dans les paramètres. La méthode play() renvoie une Promise.
      Un navigateur refuse souvent de jouer un son tant que la personne n'a pas cliqué ou tapé sur la page.
      Ce refus est intercepté par .catch() et noté dans la console, la pastille et le titre suffisant alors à prévenir.
  */
  jouerSon() {
    const son = document.getElementById("son-notification");
    if (!son || !Local.lirePreference("son", true)) {
      return;
    }

    son.currentTime = 0;
    son.play()
      .then(() => {
        // Le son a été joué, aucune autre action n'est nécessaire
      })
      .catch((erreur) => {
        console.info("Son de notification refusé par le navigateur :", erreur.name);
      });
  },
};