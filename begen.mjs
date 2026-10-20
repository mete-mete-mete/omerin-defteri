import { redisAyarlari, redisIstemcisi } from "../lib/redis-depo.mjs";

const jsonYanit = (durum, govde) =>
  new Response(JSON.stringify(govde), { status: durum, headers: { "content-type": "application/json" } });

export default {
  async fetch(istek) {
    const url = new URL(istek.url);
    // Sayfa adresi "/posts/ornek/" biçiminde gelir; baştaki ve sondaki eğik çizgiler atılır.
    const yaziId = (url.searchParams.get("post") || "").replace(/^\/+|\/+$/g, "");
    if (!yaziId || yaziId.length > 200 || !/^[a-z0-9][a-z0-9\-/]*$/.test(yaziId)) {
      return jsonYanit(400, { error: "post parametresi gerekli" });
    }
    if (istek.method !== "GET" && istek.method !== "POST") {
      return jsonYanit(405, { error: "Desteklenmeyen işlem" });
    }
    if (!redisAyarlari(process.env)) {
      console.error("Redis bağlı değil: Vercel > Storage bölümünden bir Redis veritabanını bu projeye bağlayın.");
      return jsonYanit(500, { error: "Beğeni sayacı kurulmamış" });
    }

    try {
      const { komut } = redisIstemcisi({ env: process.env, fetch: (...args) => fetch(...args) });
      const anahtar = `begenmeler:${yaziId}`;
      if (istek.method === "POST") {
        // INCR tek adımda artırır; aynı anda gelen iki beğeni birbirini ezmez
        return jsonYanit(200, { count: Number(await komut("INCR", anahtar)) });
      }
      return jsonYanit(200, { count: Number((await komut("GET", anahtar)) || 0) });
    } catch (hata) {
      console.error(hata.message);
      return jsonYanit(500, { error: "Beğeni şu an alınamadı" });
    }
  }
};
