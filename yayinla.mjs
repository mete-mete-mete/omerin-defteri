import { createHandler } from "../lib/yayinla-core.mjs";
import { depoOlusturucu, redisAyarlari } from "../lib/redis-depo.mjs";

const jsonYanit = (durum, govde) =>
  new Response(JSON.stringify(govde), { status: durum, headers: { "content-type": "application/json" } });

export default {
  async fetch(istek) {
    if (!redisAyarlari(process.env)) {
      console.error("Redis bağlı değil: Vercel > Storage bölümünden bir Redis veritabanını bu projeye bağlayın.");
      return jsonYanit(500, { hata: "Yazı ekleme sayfası henüz tam olarak kurulmamış. Eksik ayar: Redis veritabanı bu projeye bağlı değil veya REDIS_URL değişkeni yok (Vercel > Storage)." });
    }
    const fetchIstegi = (...args) => fetch(...args);
    const isle = createHandler({
      getStore: depoOlusturucu({ env: process.env, fetch: fetchIstegi }),
      fetch: fetchIstegi,
      env: process.env
    });
    return isle(istek);
  }
};
