/*
data.js — Toutes les requêtes vers les tables "salons" et "messages".
Les requêtes sont autorisées ou refusées par les règles RLS.
*/

const Data = {

  // -- Lectures et écritures --

  // Tous les salons, triés par nom
  async fetchChannels() {
    return await supabaseClient
      .from("salons")
      .select("id, nom")
      .order("nom");
  },

  // Crée un salon : on n'envoie que le nom, la base remplit le reste (id, date, créateur)
  async createChannel(nom) {
    return await supabaseClient
      .from("salons")
      .insert({ nom })
      .select()
      .single();
  },

  // Les 50 derniers messages d'un salon, avec le pseudo de l'auteur lu dans "utilisateurs"
  // (utilisateurs(pseudo) suit la clé étrangère user_id, comme une jointure).
  // On trie du plus récent au plus ancien AVANT de limiter : conversation.js remet l'ordre avec reverse().
  async fetchMessages(salonId) {
    return await supabaseClient
      .from("messages")
      .select("id, texte, image, created_at, user_id, utilisateurs(pseudo)")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .limit(50);
  },

  // Le pseudo d'une personne (pour les messages reçus en temps réel, qui n'ont pas le pseudo)
  async fetchPseudo(userId) {
    return await supabaseClient
      .from("utilisateurs")
      .select("pseudo")
      .eq("id", userId)
      .single();
  },

  // Envoie un message : la base remplit user_id (auth.uid()) et la date
  async sendMessage(salonId, texte) {
    return await supabaseClient
      .from("messages")
      .insert({
        salon_id: salonId,
        texte
      });
  },


  // -- Temps réel --

  // Appelle "onNewChannel" à chaque nouveau salon créé (par n'importe qui)
  subscribeToChannels(onNewChannel) {
    supabaseClient
      .channel("salons-temps-reel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "salons" },
        (payload) => onNewChannel(payload.new)
      )
      .subscribe();
  },

  // Appelle "onNewMessage" à chaque nouveau message du salon ouvert
  subscribeToMessages(salonId, onNewMessage) {
    supabaseClient
      .channel("messages-" + salonId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "salon_id=eq." + salonId
        },
        (payload) => onNewMessage(payload.new)
      )
      .subscribe();
  },
};