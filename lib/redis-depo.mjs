// Küçük bir anahtar-değer deposu: Upstash Redis'in REST adresini kullanır
// (Vercel'de Storage > Upstash Redis ile kurulur, ek paket gerekmez).
//
// Vercel, Redis'i projeye bağlayınca adres ve anahtarı ortam değişkeni olarak ekler.
// İsimler kuruluma göre değişebildiği için bilinen ikisi de denenir.

const GUN = 24 * 60 * 60;

export function redisAyarlari(env) {
  const adres = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "";
  const anahtar = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "";
  if (!/^https:\/\/[^/\s]+\/?$/.test(adres) || !anahtar) return null;
  return { adres: adres.replace(/\/$/, ""), anahtar };
}

export function redisIstemcisi({ env, fetch }) {
  const ayar = redisAyarlari(env);
  if (!ayar) throw new Error("Redis ayarı eksik: UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN (veya KV_REST_API_URL ve KV_REST_API_TOKEN)");

  async function komut(...parcalar) {
    const yanit = await fetch(ayar.adres, {
      method: "POST",
      headers: { Authorization: `Bearer ${ayar.anahtar}`, "Content-Type": "application/json" },
      body: JSON.stringify(parcalar)
    });
    let govde = null;
    try {
      govde = await yanit.json();
    } catch {
      /* aşağıda hata verilir */
    }
    if (!yanit.ok || !govde || govde.error) {
      throw new Error(`Redis hatası (${yanit.status}): ${govde && govde.error ? govde.error : "yanıt okunamadı"}`);
    }
    return govde.result;
  }
  return { komut };
}

// Yönetim sayfasının kullandığı arayüz (get / setJSON / delete). Anahtarlar "ad:anahtar"
// biçiminde saklanır; kayıtlar 30 gün sonra kendiliğinden silinir.
export function depoOlusturucu({ env, fetch }) {
  const { komut } = redisIstemcisi({ env, fetch });
  return function getStore(ad) {
    const k = (anahtar) => `${ad}:${anahtar}`;
    return {
      async get(anahtar) {
        const ham = await komut("GET", k(anahtar));
        if (ham === null || ham === undefined) return null;
        try {
          return JSON.parse(ham);
        } catch {
          return null;
        }
      },
      async setJSON(anahtar, deger) {
        await komut("SET", k(anahtar), JSON.stringify(deger), "EX", String(30 * GUN));
      },
      async delete(anahtar) {
        await komut("DEL", k(anahtar));
      }
    };
  };
}
