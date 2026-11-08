/*
    presence.js — L'indicateur « en ligne / hors ligne ».

    Tant qu'une page d'Alphonse est ouverte et affichée, on enregistre l'heure de notre dernière activité
    dans utilisateurs.derniere_activite, une fois par minute (setInterval).
    Les autres pages ouvertes l'apprennent tout de suite, par le temps réel (postgres_changes).
    Une personne est « en ligne » si sa dernière activité date de moins de 2 minutes.
    Comme les autres services, Presence passe par Data pour parler à Supabase, et ne touche pas au document : chaque page affiche l'état à sa façon.
*/

// Toutes les combien de temps on signale qu'on est là (en millisecondes)
const INTERVALLE_PRESENCE = 60 * 1000;

// Au-delà de ce délai sans activité, une personne est « hors ligne »
const DUREE_EN_LIGNE = 2 * 60 * 1000;

// Quelqu'un qui ferme son onglet n'envoie plus rien : il passe « hors ligne » simplement parce que le temps passe.
// On refait donc le calcul pour tout le monde toutes les 30 secondes, même sans nouvelle du temps réel.
const INTERVALLE_VERIFICATION = 30 * 1000;

const Presence = {

  // La dernière activité connue de chaque personne, rangée par identifiant
  activites: new Map(),

  // Enregistre l'heure actuelle comme dernière activité de la personne connectée.
  // Seulement si la page est affichée : un onglet oublié en arrière-plan ne compte pas comme « en ligne ».
  async signaler() {
    if (document.visibilityState !== "visible") {
      return;
    }

    const { user } = await Auth.getUser();
    if (!user) {
      return;
    }

    const { error } = await Data.updateActivity(user.id);
    if (error) {
      console.error("Impossible de mettre à jour la présence.", error);
    }
  },

  // Retient la dernière activité d'une personne (lue avec ses messages, ses contacts, ou reçue en temps réel)
  noter(id, derniereActivite) {
    if (id && derniereActivite) {
      Presence.activites.set(id, derniereActivite);
    }
  },

  // Vrai si une date d'activité a moins de 2 minutes
  estEnLigne(derniereActivite) {
    if (!derniereActivite) {
      return false;
    }
    return Date.now() - new Date(derniereActivite).getTime() < DUREE_EN_LIGNE;
  },

  // Vrai si cette personne est en ligne, d'après ce qu'on sait d'elle
  personneEnLigne(id) {
    return Presence.estEnLigne(Presence.activites.get(id));
  },

  /*
      Suit la présence de tout le monde. La page donne une fonction rappel, qui redessine ses indicateurs :
      on l'appelle à chaque profil mis à jour en temps réel, et toutes les 30 secondes pour faire passer « hors ligne » ceux qui sont partis.
  */
  suivre(rappel) {
    Data.subscribeToPresence((profil) => {
      Presence.noter(profil.id, profil.derniere_activite);
      rappel();
    });
    setInterval(rappel, INTERVALLE_VERIFICATION);
  },
};

// Dès l'ouverture de la page, puis chaque minute
Presence.signaler();
setInterval(Presence.signaler, INTERVALLE_PRESENCE);

// Quand on revient sur l'onglet, on le signale tout de suite, sans attendre la minute suivante
document.addEventListener("visibilitychange", () => Presence.signaler());