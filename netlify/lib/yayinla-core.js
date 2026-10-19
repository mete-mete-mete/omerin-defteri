import { createHash, timingSafeEqual } from "node:crypto";

const KILIT_ANAHTARI = "yanlis-sifre-kaydi";
const PENCERE_MS = 15 * 60 * 1000; // 15 dakika
const EN_FAZLA_YANLIS = 5;
const BASLIK_UZUNLUK = 150;
const METIN_UZUNLUK = 100000;
const AD_DESENI = /^[a-z0-9][a-z0-9-]{0,120}$/;

const TR_HARFLER = {
  "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
  "Ç": "c", "Ğ": "g", "İ": "i", "I": "i", "Ö": "o", "Ş": "s", "Ü": "u"
};

export function slugify(metin) {
  const sade = String(metin).replace(/[çğıöşüÇĞİIÖŞÜ]/g, (h) => TR_HARFLER[h]);
  const slug = sade
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "yazi";
}

export function escapeHtml(metin) {
  return String(metin)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const KACIS_TERS = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
function kacisiKaldir(metin) {
  // Tek geçişte çevir ki "&amp;lt;" yanlışlıkla "<" olmasın
  return metin.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => KACIS_TERS[m]);
}

// Düz yazıyı paragraflara çevirir. Boş satır = yeni paragraf, tek satır sonu = satır başı
// (şiirler için). Markdown işaretleri (-, *, # vb.) özel anlam taşımaz.
export function govdeyiHtmleCevir(metin) {
  const temiz = String(metin).replace(/\r\n?/g, "\n").trim();
  return temiz
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => "<p>" + p.split("\n").map((s) => escapeHtml(s.trim())).join("<br>\n") + "</p>")
    .join("\n\n");
}

// govdeyiHtmleCevir'in tersi: düzenleme için yazıyı tekrar düz metne çevirir.
// Gövde bu sayfanın ürettiği biçimde değilse (ör. elle yazılmış markdown) olduğu gibi döndürür.
export function govdeyiMetneCevir(govde) {
  const temiz = String(govde).replace(/\r\n?/g, "\n").trim();
  const bloklar = temiz.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const bizimBicim =
    bloklar.length > 0 &&
    bloklar.every((b) => {
      if (!/^<p>[\s\S]*<\/p>$/.test(b)) return false;
      const ic = b.slice(3, -4).split("<br>\n").join("\n");
      return !ic.includes("<");
    });
  if (!bizimBicim) return temiz;
  return bloklar
    .map((b) => b.slice(3, -4).split("<br>\n").map(kacisiKaldir).join("\n"))
    .join("\n\n");
}

export function ozetOlustur(metin) {
  const ilk = String(metin).replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/)[0] || "";
  const tek = ilk.replace(/\s+/g, " ").trim();
  if (tek.length <= 140) return tek;
  const kes = tek.slice(0, 140);
  const bosluk = kes.lastIndexOf(" ");
  const parca = bosluk > 60 ? kes.slice(0, bosluk) : kes;
  return parca.replace(/[.,;:!?\-–—\s]+$/, "") + "…";
}

export function istanbulTarihleri(simdi) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(simdi);
  const tarih = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric"
  }).format(simdi);
  return { iso, tarih };
}

// tarih ve tarihIso verilirse (düzenleme) yazının ilk yayın tarihi korunur.
export function yaziDosyasiOlustur({ baslik, metin, simdi, tarih, tarihIso }) {
  const tarihYazisi = tarih || istanbulTarihleri(simdi).tarih;
  const siralamaTarihi =
    typeof tarihIso === "string" && /^[0-9T:.+\-Z]+$/.test(tarihIso) ? tarihIso : simdi.toISOString();
  const onYuz = [
    "---",
    "layout: post.njk",
    `title: ${JSON.stringify(baslik)}`,
    `tarih: ${JSON.stringify(tarihYazisi)}`,
    `date: ${siralamaTarihi}`,
    `ozet: ${JSON.stringify(ozetOlustur(metin))}`,
    "---",
    ""
  ].join("\n");
  return onYuz + govdeyiHtmleCevir(metin) + "\n";
}

// Yazı dosyasının üst bilgisini (title, tarih, date...) ve gövdesini ayırır.
export function yaziyiAyristir(icerik) {
  const m = String(icerik).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const alanlar = {};
  for (const satir of m[1].split("\n")) {
    const i = satir.indexOf(":");
    if (i < 1) continue;
    const anahtar = satir.slice(0, i).trim();
    let deger = satir.slice(i + 1).trim();
    if (deger.startsWith('"')) {
      try { deger = JSON.parse(deger); } catch { /* olduğu gibi bırak */ }
    }
    alanlar[anahtar] = deger;
  }
  return { alanlar, govde: m[2] };
}

function sifreDogruMu(girilen, beklenen) {
  const a = createHash("sha256").update(String(girilen)).digest();
  const b = createHash("sha256").update(String(beklenen)).digest();
  return timingSafeEqual(a, b);
}

function json(durum, veri) {
  return new Response(JSON.stringify(veri), {
    status: durum,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

function githubIstemcisi({ repo, token, dal, fetch }) {
  const temel = `https://api.github.com/repos/${repo}/contents/`;
  const basliklar = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "omerin-defteri"
  };
  const govdeli = { ...basliklar, "Content-Type": "application/json" };

  return {
    async oku(yol) {
      const r = await fetch(`${temel}${yol}?ref=${encodeURIComponent(dal)}`, { headers: basliklar });
      if (r.status === 404) return { yok: true };
      if (!r.ok) throw new Error(`GitHub okuma hatası ${r.status}`);
      const j = await r.json();
      const icerik = Buffer.from(String(j.content || "").replace(/\n/g, ""), "base64").toString("utf8");
      return { yok: false, sha: j.sha, icerik };
    },
    async yaz(yol, { icerik, mesaj, sha }) {
      const govde = { message: mesaj, content: Buffer.from(icerik, "utf8").toString("base64"), branch: dal };
      if (sha) govde.sha = sha;
      const r = await fetch(`${temel}${yol}`, { method: "PUT", headers: govdeli, body: JSON.stringify(govde) });
      if (!r.ok) console.error("GitHub kayıt hatası", r.status, (await r.text()).slice(0, 200));
      return { tamam: r.ok, durum: r.status };
    },
    async sil(yol, { mesaj, sha }) {
      const r = await fetch(`${temel}${yol}`, {
        method: "DELETE",
        headers: govdeli,
        body: JSON.stringify({ message: mesaj, sha, branch: dal })
      });
      if (!r.ok) console.error("GitHub silme hatası", r.status, (await r.text()).slice(0, 200));
      return { tamam: r.ok, durum: r.status };
    }
  };
}

function alanlariDogrula(veri) {
  const baslik = typeof veri.baslik === "string" ? veri.baslik.replace(/\s+/g, " ").trim() : "";
  const metin = typeof veri.metin === "string" ? veri.metin : "";
  if (!baslik) return { hata: "Lütfen yazının başlığını girin." };
  if (!metin.trim()) return { hata: "Lütfen yazının metnini girin." };
  if (baslik.length > BASLIK_UZUNLUK) return { hata: "Başlık çok uzun." };
  if (metin.length > METIN_UZUNLUK) return { hata: "Yazı çok uzun." };
  return { baslik, metin };
}

const KAYDEDILEMEDI = "Yazı kaydedilemedi. Biraz sonra tekrar deneyin.";
const YAZI_YOK = "Bu yazı bulunamadı. Silinmiş olabilir; listeyi yenileyin.";
const CAKISMA = "Bu yazı siz işlem yaparken başka bir yerde değişmiş. Sayfayı yenileyip tekrar deneyin.";

export function createHandler({ getStore, fetch, env, simdi = () => new Date() }) {
  return async function handler(req) {
    try {
      if (req.method !== "POST") {
        return json(405, { hata: "Bu adres yalnızca yazı göndermek için kullanılır." });
      }

      let veri;
      try {
        veri = await req.json();
      } catch {
        return json(400, { hata: "Gönderilen bilgi okunamadı. Sayfayı yenileyip tekrar deneyin." });
      }
      if (!veri || typeof veri !== "object") {
        return json(400, { hata: "Gönderilen bilgi okunamadı. Sayfayı yenileyip tekrar deneyin." });
      }

      const { ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_REPO } = env;
      const dal = env.GITHUB_BRANCH || "main";
      if (!ADMIN_PASSWORD || !GITHUB_TOKEN || !GITHUB_REPO || !/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPO)) {
        console.error("Eksik veya hatalı ortam değişkeni: ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_REPO");
        return json(500, { hata: "Yazı ekleme sayfası henüz tam olarak kurulmamış." });
      }

      // Yanlış şifre denemelerini sınırla (tüm işlemler için ortak)
      const depo = getStore("yonetici");
      const t = simdi().getTime();
      const kayit = await depo.get(KILIT_ANAHTARI, { type: "json" });
      const kayitGecerli = kayit && t - kayit.baslangic < PENCERE_MS;
      if (kayitGecerli && kayit.deneme >= EN_FAZLA_YANLIS) {
        return json(429, { hata: "Çok fazla yanlış şifre girildi. Lütfen 15 dakika sonra tekrar deneyin." });
      }

      if (typeof veri.sifre !== "string" || !sifreDogruMu(veri.sifre, ADMIN_PASSWORD)) {
        const yeni = kayitGecerli
          ? { deneme: kayit.deneme + 1, baslangic: kayit.baslangic }
          : { deneme: 1, baslangic: t };
        await depo.setJSON(KILIT_ANAHTARI, yeni);
        return json(401, { hata: "Şifre yanlış." });
      }
      if (kayit) await depo.delete(KILIT_ANAHTARI);

      const islem = veri.islem === undefined ? "ekle" : veri.islem;
      const gh = githubIstemcisi({ repo: GITHUB_REPO, token: GITHUB_TOKEN, dal, fetch });
      const an = simdi();

      if (islem === "ekle") {
        const alan = alanlariDogrula(veri);
        if (alan.hata) return json(400, { hata: alan.hata });
        const { baslik, metin } = alan;

        const { iso, tarih } = istanbulTarihleri(an);
        const slug = slugify(baslik);

        // Aynı gün aynı başlık varsa üzerine yazmamak için boş bir dosya adı bul
        let ad = `${iso}-${slug}`;
        for (let sayac = 2; ; sayac++) {
          const mevcut = await gh.oku(`src/posts/${ad}.md`);
          if (mevcut.yok) break;
          if (sayac > 8) return json(409, { hata: "Aynı başlıkla çok fazla yazı var. Başlığı biraz değiştirin." });
          ad = `${iso}-${slug}-${sayac}`;
        }

        const sonuc = await gh.yaz(`src/posts/${ad}.md`, {
          icerik: yaziDosyasiOlustur({ baslik, metin, simdi: an }),
          mesaj: `Yeni yazı: ${baslik}`
        });
        if (!sonuc.tamam) return json(502, { hata: KAYDEDILEMEDI });
        return json(200, { tamam: true, ad, adres: `/posts/${ad}/`, tarih });
      }

      if (islem === "getir" || islem === "guncelle" || islem === "sil") {
        if (typeof veri.ad !== "string" || !AD_DESENI.test(veri.ad)) {
          return json(400, { hata: "Yazı adı geçersiz." });
        }
        const yol = `src/posts/${veri.ad}.md`;
        const mevcut = await gh.oku(yol);
        if (mevcut.yok) return json(404, { hata: YAZI_YOK });
        const yazi = yaziyiAyristir(mevcut.icerik);

        if (islem === "getir") {
          if (!yazi) return json(422, { hata: "Bu yazının biçimi tanınmadı, buradan düzenlenemiyor." });
          return json(200, {
            ad: veri.ad,
            baslik: String(yazi.alanlar.title || ""),
            metin: govdeyiMetneCevir(yazi.govde)
          });
        }

        if (islem === "guncelle") {
          if (!yazi) return json(422, { hata: "Bu yazının biçimi tanınmadı, buradan düzenlenemiyor." });
          const alan = alanlariDogrula(veri);
          if (alan.hata) return json(400, { hata: alan.hata });
          const sonuc = await gh.yaz(yol, {
            icerik: yaziDosyasiOlustur({
              baslik: alan.baslik,
              metin: alan.metin,
              simdi: an,
              tarih: typeof yazi.alanlar.tarih === "string" ? yazi.alanlar.tarih : undefined,
              tarihIso: typeof yazi.alanlar.date === "string" ? yazi.alanlar.date : undefined
            }),
            mesaj: `Yazı güncellendi: ${alan.baslik}`,
            sha: mevcut.sha
          });
          if (sonuc.durum === 409 || sonuc.durum === 422) return json(409, { hata: CAKISMA });
          if (!sonuc.tamam) return json(502, { hata: KAYDEDILEMEDI });
          return json(200, { tamam: true, ad: veri.ad, baslik: alan.baslik, adres: `/posts/${veri.ad}/` });
        }

        // sil
        const baslik = yazi && yazi.alanlar.title ? String(yazi.alanlar.title) : veri.ad;
        const sonuc = await gh.sil(yol, { mesaj: `Yazı silindi: ${baslik}`, sha: mevcut.sha });
        if (sonuc.durum === 409 || sonuc.durum === 422) return json(409, { hata: CAKISMA });
        if (!sonuc.tamam) return json(502, { hata: "Yazı silinemedi. Biraz sonra tekrar deneyin." });
        return json(200, { tamam: true });
      }

      return json(400, { hata: "Bilinmeyen işlem." });
    } catch (hata) {
      console.error("Beklenmeyen hata", hata && hata.message);
      return json(500, { hata: "Beklenmeyen bir sorun oluştu. Biraz sonra tekrar deneyin." });
    }
  };
}
