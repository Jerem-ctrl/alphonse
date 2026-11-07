/*
data.js — Toutes les requêtes vers les tables "channels" (salons) et "messages".
Les requêtes sont autorisées ou refusées par les règles RLS (voir docs/bdd/schema.sql).
*/

const Data = {

  // -- Lectures et écritures --

  // Tous les salons, triés par nom
  async fetchChannels() {
    return await supabaseClient
      .from("channels")
      .select("*")
      .order("name");
  },

  // Crée un salon : on n'envoie que le nom, la base remplit le reste (id, date, créateur)
  async createChannel(name) {
    return await supabaseClient
      .from("channels")
      .insert({ name })
      .select()
      .single();
  },

  // Les 50 derniers messages d'un salon.
  // On trie du plus récent au plus ancien AVANT de limiter à 50 :
  // conversation.js les remet ensuite dans l'ordre chronologique avec reverse().
  async fetchMessages(channelId) {
    return await supabaseClient
      .from("messages")
      .select("id, content, created_at, user_id, username")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(50);
  },

  // Envoie un message. On n'envoie ni l'auteur ni le pseudo :
  // la base remplit user_id (auth.uid()) et username (trigger pseudo_message)
  async sendMessage(channelId, content) {
    return await supabaseClient
      .from("messages")
      .insert({
        channel_id: channelId,
        content
      });
  },


  // -- Temps réel --

  // Appelle "onNewChannel" à chaque nouveau salon créé (par n'importe qui)
  subscribeToChannels(onNewChannel) {
    supabaseClient
      .channel("salons-temps-reel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channels" },
        (payload) => onNewChannel(payload.new)
      )
      .subscribe();
  },

  // Appelle "onNewMessage" à chaque nouveau message du salon ouvert
  // (le filtre ne garde que les messages de ce salon)
  subscribeToMessages(channelId, onNewMessage) {
    supabaseClient
      .channel("messages-" + channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "channel_id=eq." + channelId
        },
        (payload) => onNewMessage(payload.new)
      )
      .subscribe();
  },
};