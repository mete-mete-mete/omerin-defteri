// Yazı düzenleyicinin mantığı (ekrandan bağımsız, test edilebilir).
// Bir yazı "bloklar" listesidir: metin blokları ve fotoğraf blokları.
//   { tur: "metin", metin: "..." }
//   { tur: "foto", id, adres?, sha?, genislik, yukseklik, altyazi, durum, ... }
// Kural: listenin ilk ve son bloğu her zaman metindir, iki fotoğrafın arasında da
// (boş olsa bile) bir metin bloğu bulunur. Böylece her yerde yazı yazılabilir.
(function (kok) {
  "use strict";

  function paragraflar(metin) {
    return String(metin || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean);
  }

  // Blokları düz bir listeye çevirir: her paragraf ve her fotoğraf ayrı bir öğedir.
  function duzles(bloklar) {
    var ogeler = [];
    bloklar.forEach(function (b) {
      if (b.tur === "foto") {
        ogeler.push(b);
      } else {
        paragraflar(b.metin).forEach(function (p) { ogeler.push({ tur: "p", metin: p }); });
      }
    });
    return ogeler;
  }

  // Düz listeden bloklara geri döner (kuralları uygulayarak).
  function topla(ogeler) {
    var bloklar = [];
    var tampon = [];
    function bosalt() {
      bloklar.push({ tur: "metin", metin: tampon.join("\n\n") });
      tampon = [];
    }
    ogeler.forEach(function (o) {
      if (o.tur === "foto") {
        bosalt();
        bloklar.push(o);
      } else {
        tampon.push(o.metin);
      }
    });
    bosalt();
    return bloklar;
  }

  function normallestir(bloklar) {
    return topla(duzles(bloklar));
  }

  // index numaralı metin bloğunu imlecin olduğu yerden ikiye böler, araya fotoğrafları koyar.
  function fotolariEkle(bloklar, index, konum, fotolar) {
    var hedef = bloklar[index];
    if (!hedef || hedef.tur !== "metin") return bloklar;
    var metin = hedef.metin || "";
    var sinir = Math.max(0, Math.min(metin.length, konum));
    var yeni = bloklar.slice(0, index);
    yeni.push({ tur: "metin", metin: metin.slice(0, sinir) });
    fotolar.forEach(function (f) { yeni.push(f); });
    yeni.push({ tur: "metin", metin: metin.slice(sinir) });
    return topla(duzles(yeni.concat(bloklar.slice(index + 1))));
  }

  // Fotoğrafı bir paragraf yukarı (yon = -1) veya aşağı (yon = 1) taşır.
  function fotoyuTasi(bloklar, fotoId, yon) {
    var ogeler = duzles(bloklar);
    var i = -1;
    ogeler.forEach(function (o, k) { if (o.tur === "foto" && o.id === fotoId) i = k; });
    var j = i + yon;
    if (i < 0 || j < 0 || j >= ogeler.length) return bloklar;
    var gecici = ogeler[i];
    ogeler[i] = ogeler[j];
    ogeler[j] = gecici;
    return topla(ogeler);
  }

  function tasinabilirMi(bloklar, fotoId) {
    var ogeler = duzles(bloklar);
    var i = -1;
    ogeler.forEach(function (o, k) { if (o.tur === "foto" && o.id === fotoId) i = k; });
    return { yukari: i > 0, asagi: i >= 0 && i < ogeler.length - 1 };
  }

  // Fotoğrafı kaldırır; iki yanındaki yazılar tek bölümde birleşir.
  function fotoyuKaldir(bloklar, fotoId) {
    return topla(duzles(bloklar.filter(function (b) { return !(b.tur === "foto" && b.id === fotoId); })));
  }

  function fotoSayisi(bloklar) {
    return bloklar.filter(function (b) { return b.tur === "foto"; }).length;
  }

  // Taslak için: yalnızca yazıların birleşimi (fotoğraflar taslakla saklanmaz).
  function metinleriBirlestir(bloklar) {
    var parcalar = [];
    bloklar.forEach(function (b) {
      if (b.tur === "metin") parcalar = parcalar.concat(paragraflar(b.metin));
    });
    return parcalar.join("\n\n");
  }

  function icerikVarMi(bloklar) {
    return bloklar.some(function (b) {
      return b.tur === "foto" || (b.tur === "metin" && String(b.metin || "").trim() !== "");
    });
  }

  // Sunucuya gidecek listeyi hazırlar. Yüklenmemiş fotoğraf varsa { hata } döner.
  function gonderilecekBloklar(bloklar) {
    var cikti = [];
    for (var i = 0; i < bloklar.length; i++) {
      var b = bloklar[i];
      if (b.tur === "metin") {
        cikti.push({ tur: "metin", metin: b.metin });
        continue;
      }
      if (b.durum === "yukleniyor") return { hata: "Fotoğraflar hâlâ yükleniyor, lütfen biraz bekleyin." };
      if (b.durum === "hata") return { hata: "Bir fotoğraf yüklenemedi. Yeniden deneyin veya fotoğrafı kaldırın." };
      var foto = { tur: "foto", genislik: b.genislik, yukseklik: b.yukseklik, altyazi: b.altyazi || "" };
      if (b.sha) foto.sha = b.sha;
      else foto.adres = b.adres;
      cikti.push(foto);
    }
    return { bloklar: cikti };
  }

  var api = {
    paragraflar: paragraflar,
    duzles: duzles,
    topla: topla,
    normallestir: normallestir,
    fotolariEkle: fotolariEkle,
    fotoyuTasi: fotoyuTasi,
    tasinabilirMi: tasinabilirMi,
    fotoyuKaldir: fotoyuKaldir,
    fotoSayisi: fotoSayisi,
    metinleriBirlestir: metinleriBirlestir,
    icerikVarMi: icerikVarMi,
    gonderilecekBloklar: gonderilecekBloklar
  };

  kok.Bloklar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
