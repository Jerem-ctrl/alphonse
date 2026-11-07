/*
ecriture.js — L'indicateur « … est en train d'écrire ».
Il passe par la diffusion (Broadcast) du temps réel de Supabase : de petits signaux envoyés directement
aux autres pages ouvertes sur le même salon, sans rien enregistrer dans la base.
*/

// On n'envoie pas un signal à chaque lettre : au plus un toutes les 2 secondes
const INTERVALLE_SIGNAL = 2000;

// Sans nouveau signal pendant 4 secondes, on considère que la personne a arrêté d'écrire
const DUREE_AFFICHAGE = 4000;

const Ecriture = {

  // Le canal de diffusion du salon ouvert, et son propre pseudo
  canal: null,
  monPseudo: null,

  // L'heure du dernier signal envoyé
  dernierEnvoi: 0,

  // Les personnes en train d'écrire : pseudo → minuteur qui les retirera après 4 secondes sans signal
  personnes: new Map(),

  // Rejoint le canal du salon. self: false : on ne reçoit pas ses propres signaux.
  async demarrer(salonId, monId) {
    const { data } = await Data.fetchPseudo(monId);
    Ecriture.monPseudo = data ? data.pseudo : null;

    Ecriture.canal = supabaseClient
      .channel("ecriture-" + salonId, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "ecrit" }, ({ payload }) => Ecriture.recevoir(payload.pseudo))
      .on("broadcast", { event: "arrete" }, ({ payload }) => Ecriture.retirer(payload.pseudo))
      .subscribe();
  },

  // Appelée à chaque frappe : envoie « j'écris », au plus une fois toutes les 2 secondes
  signalerFrappe() {
    const maintenant = Date.now();
    if (!Ecriture.canal || !Ecriture.monPseudo || maintenant - Ecriture.dernierEnvoi < INTERVALLE_SIGNAL) {
      return;
    }
    Ecriture.dernierEnvoi = maintenant;
    Ecriture.canal.send({ type: "broadcast", event: "ecrit", payload: { pseudo: Ecriture.monPseudo } });
  },

  // Appelée après l'envoi d'un message : « j'ai fini », pour que l'indicateur disparaisse tout de suite chez les autres
  signalerArret() {
    if (!Ecriture.canal || !Ecriture.monPseudo) {
      return;
    }
    Ecriture.dernierEnvoi = 0;
    Ecriture.canal.send({ type: "broadcast", event: "arrete", payload: { pseudo: Ecriture.monPseudo } });
  },

  // Quelqu'un écrit : on l'ajoute (ou on relance son minuteur), puis on met à jour l'affichage
  recevoir(pseudo) {
    clearTimeout(Ecriture.personnes.get(pseudo));
    Ecriture.personnes.set(pseudo, setTimeout(() => Ecriture.retirer(pseudo), DUREE_AFFICHAGE));
    Ecriture.afficher();
  },

  // Quelqu'un a arrêté d'écrire (signal « arrete », ou 4 secondes sans signal)
  retirer(pseudo) {
    clearTimeout(Ecriture.personnes.get(pseudo));
    Ecriture.personnes.delete(pseudo);
    Ecriture.afficher();
  },

  // Remplit le <p id="en-train-ecrire">, ou le cache s'il n'y a personne
  afficher() {
    const zone = document.getElementById("en-train-ecrire");
    const noms = [...Ecriture.personnes.keys()];

    if (noms.length === 0) {
      zone.textContent = "";
      zone.hidden = true;
      return;
    }

    if (noms.length === 1) {
      zone.textContent = noms[0] + " est en train d'écrire…";
    } else if (noms.length === 2) {
      zone.textContent = noms[0] + " et " + noms[1] + " sont en train d'écrire…";
    } else {
      zone.textContent = "Plusieurs personnes sont en train d'écrire…";
    }
    zone.hidden = false;
  },
};

// En quittant la page, on quitte aussi le canal
window.addEventListener("pagehide", () => {
  if (Ecriture.canal) {
    supabaseClient.removeChannel(Ecriture.canal);
  }
});