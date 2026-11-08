/*
    dictee.js — La dictée vocale : on parle, le texte s'écrit dans le champ du message, puis il passe par Alphonse comme un texte tapé.

    On utilise l'API Web Speech (SpeechRecognition). Tous les navigateurs ne la proposent pas : Chrome et Edge oui, Safari en partie,
    Firefox non. On vérifie donc qu'elle existe avant tout (détection de fonctionnalité) : sans elle, le bouton « Dicter » reste caché
    et rien d'autre ne change. Chrome l'appelle encore webkitSpeechRecognition, d'où les deux noms.
    Comme Alphonse, Dictee ne touche pas au document : elle donne le texte reconnu, et conversation.js l'écrit dans le champ.
*/

const ReconnaissanceVocale = window.SpeechRecognition || window.webkitSpeechRecognition;

const Dictee = {

  // Vrai si le navigateur sait reconnaître la voix
  disponible: Boolean(ReconnaissanceVocale),

  // La reconnaissance en cours, ou null
  reconnaissance: null,

  /*
      Démarre la dictée en français du Canada.
      - surTexte(texte) reçoit chaque phrase reconnue, une fois qu'elle est terminée (isFinal) ;
      - surFin() est appelée quand la dictée s'arrête, d'elle-même ou parce qu'on l'a arrêtée ;
      - surErreur(message) reçoit une explication lisible, par exemple si l'accès au micro est refusé.
  */
  demarrer(surTexte, surFin, surErreur) {
    if (!Dictee.disponible || Dictee.reconnaissance) {
      return;
    }

    const reconnaissance = new ReconnaissanceVocale();
    reconnaissance.lang = "fr-CA";
    reconnaissance.continuous = true;
    reconnaissance.interimResults = false;

    reconnaissance.addEventListener("result", (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          surTexte(event.results[i][0].transcript.trim());
        }
      }
    });

    reconnaissance.addEventListener("error", (event) => {
      const messages = {
        "not-allowed": "L'accès au micro a été refusé. Autorisez-le dans les réglages du navigateur pour dicter.",
        "no-speech": "Aucune parole détectée. Réessayez en parlant un peu plus près du micro.",
        "audio-capture": "Aucun micro n'a été trouvé.",
        "network": "La dictée a besoin d'Internet : la connexion semble coupée."
      };
      surErreur(messages[event.error] ?? "La dictée s'est arrêtée à cause d'une erreur.");
    });

    reconnaissance.addEventListener("end", () => {
      Dictee.reconnaissance = null;
      surFin();
    });

    Dictee.reconnaissance = reconnaissance;
    reconnaissance.start();
  },

  // Arrête la dictée ; l'événement « end » préviendra la page.
  arreter() {
    if (Dictee.reconnaissance) {
      Dictee.reconnaissance.stop();
    }
  },
};