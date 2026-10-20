import { createHash, timingSafeEqual } from "node:crypto";

const KILIT_ANAHTARI = "yanlis-sifre-kaydi";
const PENCERE_MS = 15 * 60 * 1000; // 15 dakika
const EN_FAZLA_YANLIS = 5;
const BASLIK_UZUNLUK = 150;
const METIN_UZUNLUK = 100000;
const ALTYAZI_UZUNLUK = 200;
const EN_FAZLA_BLOK = 120;
const EN_FAZLA_FOTO = 30;
const FOTO_BOYUT_SINIRI = 3 * 1024 * 1024; // sayfa fotoğrafı zaten küçültüp gönderir
const AD_DESENI = /^[a-z0-9][a-z0-9-]{0,120}$/;
const SHA_DESENI = /^[a-f0-9]{40}$/;
const FOTO_ADRES_DESENI = /^\/images\/yazi\/[a-f0-9]{16}\.jpg$/;

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

// govdeyiHtmleCevir'in tersi (yalnızca metin içeren yazılar için).
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

// ---------- Fotoğraflar ----------

// Fotoğraf dosya adı içeriğinden türer (aynı fotoğraf = aynı ad), bu yüzden hiç değişmez
// ve tarayıcılar uzun süre saklayabilir.
export function fotoAdresi(sha) {
  return `/images/yazi/${sha.slice(0, 16)}.jpg`;
}
function fotoYolu(sha) {
  return `src${fotoAdresi(sha)}`;
}

function fotoHtml(foto) {
  const alt = escapeHtml(foto.altyazi || "Fotoğraf");
  const boyut = foto.genislik && foto.yukseklik ? ` width="${foto.genislik}" height="${foto.yukseklik}"` : "";
  const alt_yazi = foto.altyazi ? `<figcaption>${escapeHtml(foto.altyazi)}</figcaption>` : "";
  return `<figure class="yazi-foto"><img src="${foto.adres}" alt="${alt}" loading="lazy"${boyut}>${alt_yazi}</figure>`;
}

const FOTO_HTML_DESENI =
  /^<figure class="yazi-foto"><img src="(\/images\/yazi\/[a-f0-9]{16}\.jpg)" alt="[^"]*" loading="lazy"(?: width="(\d+)" height="(\d+)")?>(?:<figcaption>([^<]*)<\/figcaption>)?<\/figure>$/;

// Bloklar: { tur: "metin", metin } ve { tur: "foto", adres, genislik?, yukseklik?, altyazi }
export function bloklariHtmleCevir(bloklar) {
  return bloklar
    .map((b) => (b.tur === "foto" ? fotoHtml(b) : govdeyiHtmleCevir(b.metin)))
    .filter(Boolean)
    .join("\n\n");
}

// Gövdeyi tekrar bloklara ayırır (düzenleme için). Tanınmayan (elle yazılmış) gövde
// tek bir metin bloğu olarak ve ham: true ile döner.
export function govdeyiBloklaraCevir(govde) {
  const temiz = String(govde).replace(/\r\n?/g, "\n").trim();
  if (!temiz) return { bloklar: [{ tur: "metin", metin: "" }], ham: false };

  const parcalar = temiz.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const bloklar = [];
  let tampon = [];
  const bosalt = () => {
    if (tampon.length) bloklar.push({ tur: "metin", metin: tampon.join("\n\n") });
    tampon = [];
  };

  for (const p of parcalar) {
    const f = p.match(FOTO_HTML_DESENI);
    if (f) {
      bosalt();
      bloklar.push({
        tur: "foto",
        adres: f[1],
        genislik: f[2] ? Number(f[2]) : undefined,
        yukseklik: f[3] ? Number(f[3]) : undefined,
        altyazi: f[4] ? kacisiKaldir(f[4]) : ""
      });
      continue;
    }
    if (/^<p>[\s\S]*<\/p>$/.test(p)) {
      const ic = p.slice(3, -4).split("<br>\n").join("\n");
      if (!ic.includes("<")) {
        tampon.push(p.slice(3, -4).split("<br>\n").map(kacisiKaldir).join("\n"));
        continue;
      }
    }
    return { bloklar: [{ tur: "metin", metin: temiz }], ham: true };
  }
  bosalt();
  return { bloklar, ham: false };
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

function ozetBloklardan(bloklar) {
  const ilk = bloklar.find((b) => b.tur === "metin" && b.metin.trim());
  return ilk ? ozetOlustur(ilk.metin) : "";
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
// İçerik ya düz metin (metin) ya da bloklar olarak verilir.
export function yaziDosyasiOlustur({ baslik, metin, bloklar, simdi, tarih, tarihIso }) {
  const liste = bloklar || [{ tur: "metin", metin: metin || "" }];
  const tarihYazisi = tarih || istanbulTarihleri(simdi).tarih;
  const siralamaTarihi =
    typeof tarihIso === "string" && /^[0-9T:.+\-Z]+$/.test(tarihIso) ? tarihIso : simdi.toISOString();
  const onYuz = [
    "---",
    "layout: post.njk",
    `title: ${JSON.stringify(baslik)}`,
    `tarih: ${JSON.stringify(tarihYazisi)}`,
    `date: ${siralamaTarihi}`,
    `ozet: ${JSON.stringify(ozetBloklardan(liste))}`,
    "---",
    ""
  ].join("\n");
  return onYuz + bloklariHtmleCevir(liste) + "\n";
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
  const depo = `https://api.github.com/repos/${repo}/`;
  const temel = `${depo}contents/`;
  const dalYolu = dal.split("/").map(encodeURIComponent).join("/");
  const basliklar = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "omerin-defteri"
  };
  const govdeli = { ...basliklar, "Content-Type": "application/json" };

  async function gonder(adres, metod, govde) {
    return fetch(adres, { method: metod, headers: govdeli, body: JSON.stringify(govde) });
  }

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
    },

    // Fotoğrafı depoya "blob" olarak koyar. Henüz bir kayıt (commit) oluşmaz, yani site yeniden kurulmaz.
    async blobYarat(base64) {
      const r = await gonder(`${depo}git/blobs`, "POST", { content: base64, encoding: "base64" });
      if (!r.ok) {
        console.error("GitHub fotoğraf hatası", r.status, (await r.text()).slice(0, 200));
        return { tamam: false, durum: r.status };
      }
      const j = await r.json();
      return { tamam: true, sha: j.sha };
    },

    // Birkaç dosyayı TEK kayıtta (commit) ekler/günceller: böylece site yalnızca bir kez yeniden kurulur.
    // dosyalar: [{ yol, icerik } | { yol, sha }]. beklenen: düzenlemede dosyanın okunduğu andaki sha değeri.
    async topluKaydet({ dosyalar, mesaj, beklenen }) {
      const basR = await fetch(`${depo}git/ref/heads/${dalYolu}`, { headers: basliklar });
      if (!basR.ok) throw new Error(`GitHub dal okuma hatası ${basR.status}`);
      const basSha = (await basR.json()).object.sha;

      const kayitR = await fetch(`${depo}git/commits/${basSha}`, { headers: basliklar });
      if (!kayitR.ok) throw new Error(`GitHub kayıt okuma hatası ${kayitR.status}`);
      const agacSha = (await kayitR.json()).tree.sha;

      if (beklenen) {
        const g = await fetch(`${temel}${beklenen.yol}?ref=${basSha}`, { headers: basliklar });
        if (g.status === 404) return { tamam: false, durum: 409 };
        if (!g.ok) throw new Error(`GitHub okuma hatası ${g.status}`);
        if ((await g.json()).sha !== beklenen.sha) return { tamam: false, durum: 409 };
      }

      const agacR = await gonder(`${depo}git/trees`, "POST", {
        base_tree: agacSha,
        tree: dosyalar.map((d) =>
          d.sha
            ? { path: d.yol, mode: "100644", type: "blob", sha: d.sha }
            : { path: d.yol, mode: "100644", type: "blob", content: d.icerik }
        )
      });
      if (!agacR.ok) {
        console.error("GitHub ağaç hatası", agacR.status, (await agacR.text()).slice(0, 200));
        return { tamam: false, durum: agacR.status };
      }
      const yeniAgac = (await agacR.json()).sha;

      const yeniR = await gonder(`${depo}git/commits`, "POST", { message: mesaj, tree: yeniAgac, parents: [basSha] });
      if (!yeniR.ok) {
        console.error("GitHub kayıt oluşturma hatası", yeniR.status, (await yeniR.text()).slice(0, 200));
        return { tamam: false, durum: yeniR.status };
      }
      const yeniKayit = (await yeniR.json()).sha;

      // force: false -> arada başka bir değişiklik olduysa güncelleme reddedilir (üzerine yazmaz)
      const guncelR = await gonder(`${depo}git/refs/heads/${dalYolu}`, "PATCH", { sha: yeniKayit, force: false });
      if (!guncelR.ok) {
        console.error("GitHub dal güncelleme hatası", guncelR.status, (await guncelR.text()).slice(0, 200));
        return { tamam: false, durum: guncelR.status === 422 ? 409 : guncelR.status };
      }
      return { tamam: true, durum: 200 };
    }
  };
}

function yeniFotoShalari(bloklar) {
  const liste = [];
  for (const b of bloklar) {
    if (b.tur === "foto" && b.sha && !liste.includes(b.sha)) liste.push(b.sha);
  }
  return liste;
}

// Yeni eklenen fotoğrafların hepsi sayfadan gerçekten yüklenmiş mi?
async function yuklenmemisFotoVarMi(depo, shalar) {
  for (const sha of shalar) {
    const kayit = await depo.get(`foto:${sha}`, { type: "json" });
    if (!kayit) return true;
  }
  return false;
}

// Yazıyı (ve varsa yeni fotoğrafları) tek kayıtta kaydeder.
async function yaziyiKaydet(gh, { yol, icerik, mesaj, yeniShalar, mevcutSha }) {
  if (yeniShalar.length === 0) return gh.yaz(yol, { icerik, mesaj, sha: mevcutSha });
  const dosyalar = [{ yol, icerik }].concat(yeniShalar.map((sha) => ({ yol: fotoYolu(sha), sha })));
  return gh.topluKaydet({
    dosyalar,
    mesaj,
    beklenen: mevcutSha ? { yol, sha: mevcutSha } : undefined
  });
}

function alanlariDogrula(veri) {
  const baslik = typeof veri.baslik === "string" ? veri.baslik.replace(/\s+/g, " ").trim() : "";
  if (!baslik) return { hata: "Lütfen yazının başlığını girin." };
  if (baslik.length > BASLIK_UZUNLUK) return { hata: "Başlık çok uzun." };

  let ham;
  if (Array.isArray(veri.bloklar)) ham = veri.bloklar;
  else if (typeof veri.metin === "string") ham = [{ tur: "metin", metin: veri.metin }];
  else ham = [];
  if (ham.length > EN_FAZLA_BLOK) return { hata: "Yazıda çok fazla bölüm var." };

  const bloklar = [];
  let fotoSayisi = 0;
  let toplamMetin = 0;
  const tamSayi = (x) => (Number.isInteger(x) && x >= 1 && x <= 20000 ? x : undefined);

  for (const b of ham) {
    if (!b || typeof b !== "object") return { hata: "Gönderilen bilgi okunamadı. Sayfayı yenileyip tekrar deneyin." };
    if (b.tur === "metin") {
      const m = typeof b.metin === "string" ? b.metin : "";
      toplamMetin += m.length;
      bloklar.push({ tur: "metin", metin: m });
    } else if (b.tur === "foto") {
      fotoSayisi++;
      let adres;
      let sha;
      if (typeof b.sha === "string") {
        if (!SHA_DESENI.test(b.sha)) return { hata: "Fotoğraf bilgisi geçersiz." };
        sha = b.sha;
        adres = fotoAdresi(sha);
      } else if (typeof b.adres === "string" && FOTO_ADRES_DESENI.test(b.adres)) {
        adres = b.adres;
      } else {
        return { hata: "Fotoğraf bilgisi geçersiz." };
      }
      const altyazi = typeof b.altyazi === "string" ? b.altyazi.replace(/\s+/g, " ").trim() : "";
      if (altyazi.length > ALTYAZI_UZUNLUK) return { hata: "Fotoğraf altındaki yazı çok uzun." };
      bloklar.push({ tur: "foto", adres, sha, genislik: tamSayi(b.genislik), yukseklik: tamSayi(b.yukseklik), altyazi });
    } else {
      return { hata: "Gönderilen bilgi okunamadı. Sayfayı yenileyip tekrar deneyin." };
    }
  }

  if (fotoSayisi > EN_FAZLA_FOTO) return { hata: `Bir yazıya en fazla ${EN_FAZLA_FOTO} fotoğraf eklenebilir.` };
  if (toplamMetin > METIN_UZUNLUK) return { hata: "Yazı çok uzun." };
  const metinVar = bloklar.some((b) => b.tur === "metin" && b.metin.trim());
  if (!metinVar && fotoSayisi === 0) return { hata: "Lütfen yazının metnini girin." };
  return { baslik, bloklar };
}

const KAYDEDILEMEDI = "Yazı kaydedilemedi. Biraz sonra tekrar deneyin.";
const YAZI_YOK = "Bu yazı bulunamadı. Silinmiş olabilir; listeyi yenileyin.";
const CAKISMA = "Bu yazı siz işlem yaparken başka bir yerde değişmiş. Sayfayı yenileyip tekrar deneyin.";
const FOTO_EKSIK = "Fotoğraflardan biri tam yüklenmemiş. O fotoğrafı kaldırıp yeniden ekleyin.";

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
      const eksikler = [];
      if (!ADMIN_PASSWORD) eksikler.push("ADMIN_PASSWORD");
      if (!GITHUB_TOKEN) eksikler.push("GITHUB_TOKEN");
      if (!GITHUB_REPO) eksikler.push("GITHUB_REPO");
      else if (!/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPO)) eksikler.push("GITHUB_REPO (kullaniciadi/depoadi biçiminde olmalı)");
      if (eksikler.length) {
        // Yalnızca değişkenin adı gösterilir, değeri asla
        console.error("Eksik veya hatalı ortam değişkeni: " + eksikler.join(", "));
        return json(500, { hata: "Yazı ekleme sayfası henüz tam olarak kurulmamış. Eksik ayar: " + eksikler.join(", ") + "." });
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

      if (islem === "fotoyukle") {
        const b64 = typeof veri.veri === "string" ? veri.veri : "";
        if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
          return json(400, { hata: "Fotoğraf okunamadı. Başka bir fotoğraf deneyin." });
        }
        const bayt = Buffer.from(b64, "base64");
        if (bayt.length > FOTO_BOYUT_SINIRI) return json(413, { hata: "Fotoğraf çok büyük." });
        if (!(bayt.length > 3 && bayt[0] === 0xff && bayt[1] === 0xd8 && bayt[2] === 0xff)) {
          return json(400, { hata: "Yalnızca JPEG fotoğraf kabul edilir." });
        }
        const sonuc = await gh.blobYarat(b64);
        if (!sonuc.tamam) return json(502, { hata: "Fotoğraf yüklenemedi. Biraz sonra tekrar deneyin." });
        await depo.setJSON(`foto:${sonuc.sha}`, { zaman: t });
        return json(200, { tamam: true, sha: sonuc.sha, adres: fotoAdresi(sonuc.sha) });
      }

      if (islem === "ekle") {
        const alan = alanlariDogrula(veri);
        if (alan.hata) return json(400, { hata: alan.hata });
        const { baslik, bloklar } = alan;

        const yeniShalar = yeniFotoShalari(bloklar);
        if (await yuklenmemisFotoVarMi(depo, yeniShalar)) return json(400, { hata: FOTO_EKSIK });

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

        const sonuc = await yaziyiKaydet(gh, {
          yol: `src/posts/${ad}.md`,
          icerik: yaziDosyasiOlustur({ baslik, bloklar, simdi: an }),
          mesaj: `Yeni yazı: ${baslik}`,
          yeniShalar
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
          const { bloklar, ham } = govdeyiBloklaraCevir(yazi.govde);
          return json(200, {
            ad: veri.ad,
            baslik: String(yazi.alanlar.title || ""),
            metin: bloklar.filter((b) => b.tur === "metin").map((b) => b.metin).filter(Boolean).join("\n\n"),
            bloklar,
            ham
          });
        }

        if (islem === "guncelle") {
          if (!yazi) return json(422, { hata: "Bu yazının biçimi tanınmadı, buradan düzenlenemiyor." });
          const alan = alanlariDogrula(veri);
          if (alan.hata) return json(400, { hata: alan.hata });

          const yeniShalar = yeniFotoShalari(alan.bloklar);
          if (await yuklenmemisFotoVarMi(depo, yeniShalar)) return json(400, { hata: FOTO_EKSIK });

          const sonuc = await yaziyiKaydet(gh, {
            yol,
            icerik: yaziDosyasiOlustur({
              baslik: alan.baslik,
              bloklar: alan.bloklar,
              simdi: an,
              tarih: typeof yazi.alanlar.tarih === "string" ? yazi.alanlar.tarih : undefined,
              tarihIso: typeof yazi.alanlar.date === "string" ? yazi.alanlar.date : undefined
            }),
            mesaj: `Yazı güncellendi: ${alan.baslik}`,
            yeniShalar,
            mevcutSha: mevcut.sha
          });
          if (sonuc.durum === 409 || sonuc.durum === 422) return json(409, { hata: CAKISMA });
          if (!sonuc.tamam) return json(502, { hata: KAYDEDILEMEDI });
          return json(200, { tamam: true, ad: veri.ad, baslik: alan.baslik, adres: `/posts/${veri.ad}/` });
        }

        // sil (yazıdaki fotoğraf dosyaları depoda kalır; başka yazılarda kullanılıyor olabilir)
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
