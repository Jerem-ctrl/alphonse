/*
    data.js — Toutes nos requêtes vers les contacts, les salons et les messages.

    Les pages ne parlent jamais directement à Supabase : elles passent par l'objet Data.
    Chaque fonction renvoie la réponse de Supabase telle quelle ({ data, error }), et c'est la page qui décide quoi afficher.
    Ce n'est pas ce fichier qui protège les données : ce sont nos règles RLS. Si une requête demande plus que ce qu'elles autorisent, la base la refuse.
    On n'envoie donc jamais d'identifiant d'auteur ni de pseudo : la base remplit user_id et created_by avec auth.uid(),
    et on lit le pseudo dans utilisateurs au moment d'afficher.
*/

const Data = {

  // Nombre de messages chargés à la fois : les plus récents à l'ouverture d'un salon, puis par paquets en remontant.
  TAILLE_PAQUET: 50,


  // -- Contacts --

  // Les inscrits dont le pseudo contient le texte cherché, sauf soi-même (.neq()), triés par pseudo, 20 au plus.
  // .ilike() compare sans tenir compte des majuscules. Dans son motif, % veut dire « n'importe quelle suite de caractères » et _ « n'importe quel caractère » :
  // on échappe donc les _ et les % du texte tapé (un pseudo peut contenir _), pour chercher le vrai caractère.
  async searchUsers(texte, monId) {
    const motif = "%" + texte.replace(/[\\%_]/g, "\\$&") + "%";
    return await supabaseClient
      .from("utilisateurs")
      .select("id, pseudo, derniere_activite")
      .ilike("pseudo", motif)
      .neq("id", monId)
      .order("pseudo")
      .limit(20);
  },

  // Ses propres contacts, avec le profil de chaque personne ajoutée.
  // contacts a deux liens vers utilisateurs (user_id et contact_id) : on précise !contact_id pour joindre le bon, celui de la personne ajoutée.
  // Pas besoin de filtrer sur son identifiant : la RLS ne renvoie que les lignes dont on est le propriétaire.
  async fetchContacts() {
    return await supabaseClient
      .from("contacts")
      .select("id, contact_id, personne:utilisateurs!contact_id(pseudo, derniere_activite)")
      .order("created_at");
  },

  // Ajoute quelqu'un à sa liste : on n'envoie que la personne ajoutée, la base remplit le propriétaire.
  async addContact(contactId) {
    return await supabaseClient
      .from("contacts")
      .insert({ contact_id: contactId })
      .select()
      .single();
  },

  // Retire quelqu'un de sa liste. La RLS limite la suppression à ses propres lignes.
  async removeContact(contactId) {
    return await supabaseClient
      .from("contacts")
      .delete()
      .eq("contact_id", contactId);
  },


  // -- Salons --

  // Tous les salons, triés par nom.
  async fetchChannels() {
    return await supabaseClient
      .from("salons")
      .select("id, nom")
      .order("nom");
  },

  // Crée un salon : on n'envoie que le nom, la base remplit le reste (id, date, créateur).
  async createChannel(nom) {
    return await supabaseClient
      .from("salons")
      .insert({ nom })
      .select()
      .single();
  },


  // -- Messages --

  // Les colonnes qu'on lit pour un message. utilisateurs(pseudo) suit la clé étrangère user_id, comme une jointure :
  // le pseudo arrive avec le message, sans être recopié dans la table.
  // On prend aussi la dernière activité de l'auteur : elle dit s'il est en ligne.
  COLONNES_MESSAGE: "id, texte, image, created_at, user_id, utilisateurs(pseudo, derniere_activite)",

  // Les 50 derniers messages d'un salon.
  // On trie du plus récent au plus ancien AVANT de limiter, sinon on aurait les 50 premiers ; la page remet ensuite l'ordre avec reverse().
  async fetchMessages(salonId) {
    return await supabaseClient
      .from("messages")
      .select(Data.COLONNES_MESSAGE)
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .limit(Data.TAILLE_PAQUET);
  },

  // Les 50 messages qui précèdent une date : celle du plus ancien message déjà affiché.
  // .lt() veut dire « strictement avant » : on ne recharge donc jamais un message qu'on a déjà.
  async fetchOlderMessages(salonId, avantLe) {
    return await supabaseClient
      .from("messages")
      .select(Data.COLONNES_MESSAGE)
      .eq("salon_id", salonId)
      .lt("created_at", avantLe)
      .order("created_at", { ascending: false })
      .limit(Data.TAILLE_PAQUET);
  },

  // Le pseudo d'une personne : les messages reçus en temps réel n'ont que user_id, sans le pseudo.
  async fetchPseudo(userId) {
    return await supabaseClient
      .from("utilisateurs")
      .select("pseudo, derniere_activite")
      .eq("id", userId)
      .single();
  },

  // Envoie un message : du texte, une image (son chemin dans le stockage), ou les deux.
  // Un champ vide devient null, pour que la base applique ses contraintes (message jamais vide, texte jamais blanc).
  // La base remplit user_id (auth.uid()) et la date : on ne peut pas écrire au nom de quelqu'un d'autre.
  // On redemande le message enregistré, pseudo compris : la page l'affiche tout de suite, sans attendre le temps réel.
  async sendMessage(salonId, texte, image = null) {
    return await supabaseClient
      .from("messages")
      .insert({
        salon_id: salonId,
        texte: texte || null,
        image: image || null
      })
      .select(Data.COLONNES_MESSAGE)
      .single();
  },

  // Le lien public d'une image du compartiment images, à partir du chemin gardé dans le message.
  // Les dimensions glissées dans le nom du fichier, ou null pour une image déposée sans elles.
  imageDimensions(chemin) {
    const resultat = chemin.match(/-(\d+)x(\d+)\.[a-z]+$/);
    return resultat ? { largeur: Number(resultat[1]), hauteur: Number(resultat[2]) } : null;
  },

  imageUrl(chemin) {
    return supabaseClient.storage.from("images").getPublicUrl(chemin).data.publicUrl;
  },

  // L'extension du fichier déposé, tirée de son type et non de son nom : un « photo.html » déclaré comme PNG est rangé en .png.
  EXTENSIONS_IMAGE: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" },

  /*
      Dépose une image dans le compartiment "images", dans le dossier de la personne connectée (exigé par la RLS du stockage).
      Le nom est rendu unique (date + quelques caractères au hasard) : deux « photo.png » ne s'écrasent jamais.
      On y glisse aussi la largeur et la hauteur de l'image (« -800x600 ») : à l'affichage, on les relit pour donner width et height à <img>,
      sans ajouter de colonne à la table messages.
      Renvoie { chemin, error } : le chemin est ce qu'on enregistre ensuite dans messages.image.
  */
  async uploadImage(fichier, userId, largeur, hauteur) {
    const extension = Data.EXTENSIONS_IMAGE[fichier.type];
    const chemin = userId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)
      + "-" + largeur + "x" + hauteur + "." + extension;

    const { error } = await supabaseClient.storage
      .from("images")
      .upload(chemin, fichier, { contentType: fichier.type });

    return { chemin, error };
  },

  // Supprime une image du stockage (si le message n'a pas pu être enregistré, on ne garde pas un fichier orphelin).
  async deleteImage(chemin) {
    return await supabaseClient.storage.from("images").remove([chemin]);
  },

  // Supprime un de ses messages.
  // La RLS refuse sans erreur les messages des autres : rien n'est supprimé. Avec .select("id"), on récupère les lignes vraiment supprimées,
  // et la page sait alors si la suppression a eu lieu (data vide = refusée).
  async deleteMessage(messageId) {
    return await supabaseClient
      .from("messages")
      .delete()
      .eq("id", messageId)
      .select("id");
  },


  // -- Présence

  // Enregistre maintenant comme dernière activité de la personne connectée.
  // La RLS n'autorise que cette colonne, et seulement sur sa propre ligne : on ne peut faire passer personne d'autre « en ligne ».
  async updateActivity(monId) {
    return await supabaseClient
      .from("utilisateurs")
      .update({ derniere_activite: new Date().toISOString() })
      .eq("id", monId);
  },


  // -- Lectures (statut « reçu » et « lu »)

  // Où en sont les membres d'un salon : jusqu'à quel message chacun a reçu, et lu.
  async fetchLectures(salonId) {
    return await supabaseClient
      .from("lectures")
      .select("user_id, derniere_reception, derniere_lecture")
      .eq("salon_id", salonId);
  },

  /*
      Enregistre où l'on en est dans un salon, avec upsert : la ligne est créée la première fois, puis mise à jour
      (une seule ligne par personne et par salon, grâce à la contrainte unique sur user_id et salon_id).
      On n'envoie pas user_id : la base le remplit avec auth.uid(), et la RLS refuse de toucher à la ligne de quelqu'un d'autre.
  */
  async updateLecture(salonId, champs) {
    return await supabaseClient
      .from("lectures")
      .upsert({ salon_id: salonId, ...champs }, { onConflict: "user_id,salon_id" });
  },


  // -- Temps réel --

  // Appelle onNewChannel à chaque nouveau salon créé, par n'importe qui.
  // On renvoie le canal pour que la page puisse couper l'écoute avec Data.unsubscribe().
  subscribeToChannels(onNewChannel) {
    return supabaseClient
      .channel("salons-temps-reel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "salons" },
        (payload) => onNewChannel(payload.new)
      )
      .subscribe();
  },

  // Écoute les nouveaux messages de TOUS les salons, sans filtre : c'est ce qui allume la pastille d'un salon qu'on n'a pas ouvert.
  // La RLS laisse lire tous les messages aux comptes connectés, le temps réel aussi.
  subscribeToAllMessages(onNewMessage) {
    return supabaseClient
      .channel("messages-tous-les-salons")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => onNewMessage(payload.new)
      )
      .subscribe();
  },

  // Écoute le salon ouvert : onNewMessage pour chaque nouveau message, onDeletedMessage pour chaque message supprimé.
  // Les nouveaux messages sont filtrés sur salon_id : on ne reçoit pas ceux des autres salons.
  // Supabase ne sait pas filtrer les suppressions, et ne transmet que l'id du message supprimé :
  // on reçoit donc toutes les suppressions, et la page retire la bulle seulement si elle l'affiche.
  subscribeToMessages(salonId, onNewMessage, onDeletedMessage) {
    const canal = supabaseClient
      .channel("messages-" + salonId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "salon_id=eq." + salonId },
        (payload) => onNewMessage(payload.new)
      );

    if (onDeletedMessage) {
      canal.on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => onDeletedMessage(payload.old.id)
      );
    }

    return canal.subscribe();
  },

  // Appelle onActivity(profil) à chaque mise à jour d'un profil (UPDATE sur utilisateurs) :
  // c'est ainsi qu'une page ouverte voit quelqu'un passer en ligne, sans recharger.
  subscribeToPresence(onActivity) {
    return supabaseClient
      .channel("presence-utilisateurs")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "utilisateurs" },
        (payload) => onActivity(payload.new)
      )
      .subscribe();
  },

  /*
      « En train d'écrire » : un canal de diffusion (Broadcast) propre au salon. Les signaux passent directement d'une page ouverte à l'autre,
      sans rien enregistrer dans la base. self: false : on ne reçoit pas ses propres signaux.
      On ne diffuse que l'identifiant de la personne, jamais un pseudo tapé à la main : la page qui reçoit retrouve le pseudo dans utilisateurs.
  */
  subscribeToTyping(salonId, onEcrit, onArrete) {
    return supabaseClient
      .channel("ecriture-" + salonId, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "ecrit" }, ({ payload }) => onEcrit(payload?.id))
      .on("broadcast", { event: "arrete" }, ({ payload }) => onArrete(payload?.id))
      .subscribe();
  },

  // Envoie un signal « ecrit » ou « arrete » sur le canal du salon.
  sendTyping(canal, evenement, monId) {
    return canal.send({ type: "broadcast", event: evenement, payload: { id: monId } });
  },

  // Écoute les lectures du salon ouvert (création et mise à jour), pour faire passer ses messages à « reçu » puis « lu » sans recharger.
  subscribeToLectures(salonId, onChange) {
    const filtre = { schema: "public", table: "lectures", filter: "salon_id=eq." + salonId };
    return supabaseClient
      .channel("lectures-" + salonId)
      .on("postgres_changes", { event: "INSERT", ...filtre }, (payload) => onChange(payload.new))
      .on("postgres_changes", { event: "UPDATE", ...filtre }, (payload) => onChange(payload.new))
      .subscribe();
  },

  // Coupe une écoute : en quittant un salon, on ne veut plus recevoir ses messages.
  async unsubscribe(canal) {
    if (canal) {
      return await supabaseClient.removeChannel(canal);
    }
  },
};