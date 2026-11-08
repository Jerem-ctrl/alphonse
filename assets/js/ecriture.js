/*
    ecriture.js — L'indicateur « … est en train d'écrire ».

    Pendant la saisie (événement input), on diffuse un signal « ecrit » sur le canal du salon ouvert.
    Après 3 secondes sans frappe (setTimeout), on diffuse « arrete » : l'indicateur s'efface chez les autres.
    Comme Alphonse et Presence, Ecriture ne touche pas au document : elle donne la liste des pseudos, et conversation.js l'affiche.
*/

// On n'envoie pas un signal à chaque lettre : au plus un toutes les 2 secondes
const INTERVALLE_SIGNAL = 2000;

// 3 secondes sans frappe : on prévient qu'on a arrêté d'écrire
const DELAI_ARRET = 3000;

// Filet de sécurité chez celui qui reçoit : si le signal « arrete » se perd (onglet fermé brutalement), l'indicateur s'efface quand même
const DUREE_AFFICHAGE = 4000;

const Ecriture = {

  // Le canal de diffusion du salon ouvert, et notre identifiant
  canal: null,
  monId: null,

  // L'heure du dernier signal envoyé, et le minuteur des 3 secondes sans frappe
  dernierEnvoi: 0,
  minuteurArret: null,

  // Les personnes en train d'écrire : identifiant → { pseudo, minuteur qui la retirera }
  personnes: new Map(),

  // Les pseudos déjà retrouvés, pour ne pas les redemander à chaque signal
  pseudos: new Map(),

  // La fonction de la page qui affiche la liste des pseudos
  rappel: null,

  // Rejoint le canal du salon. rappel(pseudos) est appelée chaque fois que la liste change.
  demarrer(salonId, monId, rappel) {
    Ecriture.monId = monId;
    Ecriture.rappel = rappel;
    Ecriture.canal = Data.subscribeToTyping(salonId, Ecriture.recevoir, Ecriture.retirer);
  },

  // Appelée à chaque frappe : « j'écris », au plus une fois toutes les 2 secondes.
  // Chaque frappe relance aussi le minuteur : c'est 3 secondes après la dernière lettre qu'on envoie « arrete ».
  signalerFrappe() {
    if (!Ecriture.canal) {
      return;
    }

    clearTimeout(Ecriture.minuteurArret);
    Ecriture.minuteurArret = setTimeout(Ecriture.signalerArret, DELAI_ARRET);

    const maintenant = Date.now();
    if (maintenant - Ecriture.dernierEnvoi >= INTERVALLE_SIGNAL) {
      Ecriture.dernierEnvoi = maintenant;
      Data.sendTyping(Ecriture.canal, "ecrit", Ecriture.monId);
    }
  },

  // « J'ai arrêté » : après 3 secondes sans frappe, quand le champ est vidé, ou quand le message est envoyé.
  signalerArret() {
    clearTimeout(Ecriture.minuteurArret);
    if (!Ecriture.canal || Ecriture.dernierEnvoi === 0) {
      return;
    }
    Ecriture.dernierEnvoi = 0;
    Data.sendTyping(Ecriture.canal, "arrete", Ecriture.monId);
  },

  // Quelqu'un écrit : on retrouve son pseudo, on l'ajoute (ou on relance son minuteur), puis on prévient la page.
  // Un identifiant qui ne correspond à aucun profil est ignoré.
  async recevoir(id) {
    if (!id || id === Ecriture.monId) {
      return;
    }

    if (!Ecriture.pseudos.has(id)) {
      const { data } = await Data.fetchPseudo(id);
      if (!data) {
        return;
      }
      Ecriture.pseudos.set(id, data.pseudo);
    }

    clearTimeout(Ecriture.personnes.get(id)?.minuteur);
    Ecriture.personnes.set(id, {
      pseudo: Ecriture.pseudos.get(id),
      minuteur: setTimeout(() => Ecriture.retirer(id), DUREE_AFFICHAGE)
    });
    Ecriture.prevenir();
  },

  // Quelqu'un a arrêté d'écrire (signal « arrete », ou plus de nouvelles depuis 4 secondes)
  retirer(id) {
    if (!Ecriture.personnes.has(id)) {
      return;
    }
    clearTimeout(Ecriture.personnes.get(id).minuteur);
    Ecriture.personnes.delete(id);
    Ecriture.prevenir();
  },

  // Donne à la page la liste des pseudos en train d'écrire
  prevenir() {
    if (Ecriture.rappel) {
      Ecriture.rappel([...Ecriture.personnes.values()].map((personne) => personne.pseudo));
    }
  },

  // En quittant le salon, on prévient qu'on n'écrit plus et on coupe le canal.
  arreter() {
    Ecriture.signalerArret();
    Data.unsubscribe(Ecriture.canal);
    Ecriture.canal = null;
  },
};