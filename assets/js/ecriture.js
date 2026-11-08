/*
    ecriture.js
    Indicateur « … est en train d'écrire ».

    Pendant la saisie (événement input), un signal « ecrit » est diffusé sur le canal du salon ouvert.
    Après 3 secondes sans frappe (setTimeout), un signal « arrete » est diffusé et l'indicateur disparaît chez les autres.
    Comme Alphonse et Presence, l'objet Ecriture ne modifie pas la page. Il fournit la liste des pseudos, et conversation.js se charge de l'affichage.
    Nécessite spclient.js et data.js, chargés avant ce fichier.
*/

// Intervalle minimal entre deux signaux « ecrit » (2 secondes), pour ne pas en envoyer un à chaque lettre
const INTERVALLE_SIGNAL = 2000;

// Délai sans frappe (3 secondes) au-delà duquel le signal « arrete » est envoyé
const DELAI_ARRET = 3000;

// Sécurité côté réception. Si le signal « arrete » se perd (onglet fermé brusquement), l'indicateur s'efface tout de même après 4 secondes.
const DUREE_AFFICHAGE = 4000;

const Ecriture = {

  // Canal de diffusion du salon ouvert et identifiant de la personne connectée
  canal: null,
  monId: null,

  // Heure du dernier signal envoyé, et minuteur du délai sans frappe
  dernierEnvoi: 0,
  minuteurArret: null,

  // Personnes en train d'écrire, indexées par identifiant ({ pseudo, minuteur de retrait })
  personnes: new Map(),

  // Pseudos déjà retrouvés, conservés pour éviter de les redemander à chaque signal
  pseudos: new Map(),

  // Fonction de la page chargée d'afficher la liste des pseudos
  rappel: null,

  // Rejoint le canal du salon. La fonction rappel(pseudos) est appelée à chaque changement de la liste.
  demarrer(salonId, monId, rappel) {
    Ecriture.monId = monId;
    Ecriture.rappel = rappel;
    Ecriture.canal = Data.subscribeToTyping(salonId, Ecriture.recevoir, Ecriture.retirer);
  },

  // Appelée à chaque frappe. Envoie le signal « ecrit », au plus une fois toutes les 2 secondes.
  // Chaque frappe relance aussi le minuteur, si bien que le signal « arrete » part 3 secondes après la dernière lettre.
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

  // Envoie le signal « arrete » après 3 secondes sans frappe, lorsque le champ est vidé ou lorsque le message est envoyé.
  // Aucun signal n'est envoyé si la personne n'avait pas signalé qu'elle écrivait.
  signalerArret() {
    clearTimeout(Ecriture.minuteurArret);
    if (!Ecriture.canal || Ecriture.dernierEnvoi === 0) {
      return;
    }
    Ecriture.dernierEnvoi = 0;
    Data.sendTyping(Ecriture.canal, "arrete", Ecriture.monId);
  },

  // Traite le signal d'une personne qui écrit. Son pseudo est retrouvé, puis elle est ajoutée à la liste (ou son minuteur est relancé),
  // et la page est prévenue. Un identifiant sans profil correspondant est ignoré.
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

  // Retire une personne de la liste, à la réception du signal « arrete » ou faute de nouveau signal depuis 4 secondes
  retirer(id) {
    if (!Ecriture.personnes.has(id)) {
      return;
    }
    clearTimeout(Ecriture.personnes.get(id).minuteur);
    Ecriture.personnes.delete(id);
    Ecriture.prevenir();
  },

  // Transmet à la page la liste des pseudos en train d'écrire
  prevenir() {
    if (Ecriture.rappel) {
      Ecriture.rappel([...Ecriture.personnes.values()].map((personne) => personne.pseudo));
    }
  },

  // À la sortie du salon, signale l'arrêt de la saisie et ferme le canal
  arreter() {
    Ecriture.signalerArret();
    Data.unsubscribe(Ecriture.canal);
    Ecriture.canal = null;
  },
};