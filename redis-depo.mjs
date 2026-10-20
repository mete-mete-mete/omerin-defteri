// Küçük bir anahtar-değer deposu. İki tür Redis bağlantısını da anlar:
//  - Upstash (REST adresi + anahtar): ek paket gerekmez
//  - Redis Cloud ve benzerleri (REDIS_URL, redis:// ile başlar): "redis" paketi kullanılır
//
// Vercel, depoyu projeye bağlayınca bu değişkenleri kendisi ekler. Adlara önek eklenmiş
// olabilir (ör. STORAGE_REDIS_URL), bu yüzden tam ad yerine sonuna bakılır.

const GUN = 24 * 60 * 60;

function degiskenBul(env, ...sonlar) {
  for (const son of sonlar) {
    for (const ad of Object.keys(env)) {
      if ((ad === son || ad.endsWith("_" + son)) && env[ad]) return env[ad];
    }
  }
  return "";
}

export function redisAyarlari(env) {
  const adres = degiskenBul(env, "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
  const anahtar = degiskenBul(env, "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
  if (/^https:\/\/[^/\s]+\/?$/.test(adres) && anahtar) {
    return { tur: "rest", adres: adres.replace(/\/$/, ""), anahtar };
  }
  const url = degiskenBul(env, "REDIS_URL");
  if (/^rediss?:\/\/\S+$/.test(url)) return { tur: "tcp", url };
  return null;
}

export function redisIstemcisi({ env, fetch, redisPaketi }) {
  const ayar = redisAyarlari(env);
  if (!ayar) {
    throw new Error("Redis ayarı eksik: REDIS_URL (veya UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN)");
  }

  if (ayar.tur === "rest") {
    return {
      async komut(...parcalar) {
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
    };
  }

  // TCP: her istekte kısa süreli bağlantı açılır (sunucusuz ortamda bağlantı saklanmaz)
  return {
    async komut(...parcalar) {
      const { createClient } = redisPaketi || (await import("redis"));
      const istemci = createClient({ url: ayar.url, socket: { connectTimeout: 5000, reconnectStrategy: false } });
      istemci.on("error", () => {});
      try {
        await istemci.connect();
        const sonuc = await istemci.sendCommand(parcalar.map(String));
        return sonuc === undefined ? null : sonuc;
      } catch (hata) {
        throw new Error(`Redis hatası: ${hata.message}`);
      } finally {
        try {
          istemci.destroy ? istemci.destroy() : await istemci.disconnect();
        } catch {
          /* kapanış hatası önemsiz */
        }
      }
    }
  };
}

// Yönetim sayfasının kullandığı arayüz (get / setJSON / delete). Anahtarlar "ad:anahtar"
// biçiminde saklanır; kayıtlar 30 gün sonra kendiliğinden silinir.
export function depoOlusturucu({ env, fetch, redisPaketi }) {
  const { komut } = redisIstemcisi({ env, fetch, redisPaketi });
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
