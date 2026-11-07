/*
presence.js — L'indicateur « en ligne / hors ligne ».
Tant qu'une page d'Alphonse est ouverte et affichée, on enregistre l'heure de sa dernière activité
dans utilisateurs.derniere_activite, une fois par minute.
Une personne est « en ligne » si sa dernière activité date de moins de 2 minutes.
*/

// Toutes les combien de temps on signale qu'on est là (en millisecondes)
const INTERVALLE_PRESENCE = 60 * 1000;

// Au-delà de ce délai sans activité, une personne est « hors ligne »
const DUREE_EN_LIGNE = 2 * 60 * 1000;

const Presence = {

  // Enregistre l'heure actuelle comme dernière activité de la personne connectée.
  // Seulement si la page est affichée : un onglet oublié en arrière-plan ne compte pas comme « en ligne ».
  async signaler() {
    if (document.visibilityState !== "visible") return;

    const { user } = await Auth.getUser();
    if (!user) return;

    const { error } = await supabaseClient
      .from("utilisateurs")
      .update({ derniere_activite: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      console.error("Impossible de mettre à jour la présence.", error);
    }
  },

  // Vrai si la dernière activité date de moins de 2 minutes
  estEnLigne(derniereActivite) {
    if (!derniereActivite) return false;
    return Date.now() - new Date(derniereActivite).getTime() < DUREE_EN_LIGNE;
  },
};

// Dès l'ouverture de la page, puis chaque minute
Presence.signaler();
setInterval(Presence.signaler, INTERVALLE_PRESENCE);

// Quand on revient sur l'onglet, on le signale tout de suite, sans attendre la minute suivante
document.addEventListener("visibilitychange", () => Presence.signaler());