/*
    presence.js
    Indicateur « en ligne / hors ligne ».

    Tant qu'une page d'Alphonse est ouverte et affichée, l'heure de la dernière activité est enregistrée
    dans utilisateurs.derniere_activite une fois par minute (setInterval).
    Les autres pages ouvertes en sont informées immédiatement par le temps réel (postgres_changes).
    Une personne est considérée en ligne si sa dernière activité date de moins de 2 minutes.
    Comme les autres services, Presence passe par Data pour communiquer avec Supabase et ne modifie pas la page.
    Chaque page affiche l'état à sa manière.
    Nécessite spclient.js, auth.js et data.js, chargés avant ce fichier.
*/

// Intervalle entre deux signalements d'activité (en millisecondes)
const INTERVALLE_PRESENCE = 60 * 1000;

// Délai sans activité au-delà duquel une personne est considérée hors ligne
const DUREE_EN_LIGNE = 2 * 60 * 1000;

// Une personne qui ferme son onglet cesse d'envoyer des signaux et passe hors ligne avec le temps.
// Le calcul est donc refait pour tout le monde toutes les 30 secondes, même sans nouvelle du temps réel.
const INTERVALLE_VERIFICATION = 30 * 1000;

const Presence = {

  // Dernière activité connue de chaque personne, indexée par identifiant
  activites: new Map(),

  // Enregistre l'heure actuelle comme dernière activité de la personne connectée,
  // uniquement si la page est affichée. Un onglet laissé en arrière-plan ne compte pas comme une présence.
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

  // Mémorise la dernière activité d'une personne, lue avec ses messages ou ses contacts, ou reçue en temps réel
  noter(id, derniereActivite) {
    if (id && derniereActivite) {
      Presence.activites.set(id, derniereActivite);
    }
  },

  // Indique si une date d'activité remonte à moins de 2 minutes
  estEnLigne(derniereActivite) {
    if (!derniereActivite) {
      return false;
    }
    return Date.now() - new Date(derniereActivite).getTime() < DUREE_EN_LIGNE;
  },

  // Indique si une personne est en ligne, d'après les informations connues
  personneEnLigne(id) {
    return Presence.estEnLigne(Presence.activites.get(id));
  },

  /*
      Suit la présence de toutes les personnes. La page fournit une fonction rappel qui redessine ses indicateurs.
      Cette fonction est appelée à chaque profil mis à jour en temps réel, et toutes les 30 secondes
      pour faire passer hors ligne les personnes parties.
  */
  suivre(rappel) {
    Data.subscribeToPresence((profil) => {
      Presence.noter(profil.id, profil.derniere_activite);
      rappel();
    });
    setInterval(rappel, INTERVALLE_VERIFICATION);
  },
};

// Signalement à l'ouverture de la page, puis chaque minute
Presence.signaler();
setInterval(Presence.signaler, INTERVALLE_PRESENCE);

// Signalement immédiat au retour sur l'onglet, sans attendre la minute suivante
document.addEventListener("visibilitychange", () => Presence.signaler());