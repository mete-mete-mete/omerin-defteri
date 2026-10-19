// Yönetim sayfasının ekranı: yazı ekle / düzenle / sil ve fotoğraf blokları.
// Mantık kısmı bloklar.js dosyasında (window.Bloklar).
(function () {
  "use strict";

  var B = window.Bloklar;
  var EN_FAZLA_FOTO = 30;
  var EN_UZUN_KENAR = 1600; // fotoğraflar bu boyuta küçültülür (hem hızlı açılır hem depoyu şişirmez)
  var TASLAK = "omerin-defteri-taslak";

  var form = document.getElementById("yazi-formu");
  var sifre = document.getElementById("sifre");
  var baslik = document.getElementById("baslik");
  var bloklarKutusu = document.getElementById("bloklar");
  var fotoSecici = document.getElementById("foto-secici");
  var gonder = document.getElementById("gonder");
  var iptal = document.getElementById("iptal");
  var kip = document.getElementById("kip");
  var mesaj = document.getElementById("mesaj");
  var liste = document.getElementById("liste");
  var listeMesaji = document.getElementById("liste-mesaji");

  // Testlerde fotoğraf hazırlama adımı değiştirilebilsin diye dışarı açık.
  var kanca = (window.omerinDefteriAdmin = window.omerinDefteriAdmin || {});

  var bloklar = [{ tur: "metin", metin: "" }];
  var duzenlenen = null; // düzenlenen yazının adı (yoksa null)
  var yeniYaziDurumu = null; // düzenlemeye geçerken yarım kalan yeni yazı burada bekler
  var sayac = 0;
  var bekleyenIndex = -1;
  var bekleyenKonum = 0;
  var yuklemeDurdu = false;
  var kuyruk = Promise.resolve();

  function yeniId() {
    sayac++;
    return "f" + Date.now().toString(36) + sayac;
  }

  function mesajGoster(yazi, tur, adres) {
    mesaj.textContent = yazi;
    mesaj.className = "form-mesaji " + (tur || "");
    if (adres) {
      mesaj.appendChild(document.createTextNode(" "));
      var a = document.createElement("a");
      a.href = adres;
      a.textContent = "Yazıya git";
      mesaj.appendChild(a);
    }
  }

  function sifreGerekli() {
    if (sifre.value) return true;
    mesajGoster("Önce şifreyi yazın.", "hata");
    sifre.focus();
    return false;
  }

  // Sunucuya istek gönder. Her zaman { ok, durum, veri } döner; bağlantı kopsa bile.
  function istek(govde) {
    govde.sifre = sifre.value;
    return fetch("/api/yayinla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(govde)
    })
      .then(function (yanit) {
        return yanit.json().catch(function () { return {}; }).then(function (veri) {
          return { ok: yanit.ok, durum: yanit.status, veri: veri };
        });
      })
      .catch(function () {
        return {
          ok: false,
          durum: 0,
          veri: { hata: "Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin. Yazınız silinmedi." }
        };
      });
  }

  // ---------- Fotoğrafı tarayıcıda küçültme ----------

  function imgIleAc(dosya) {
    return new Promise(function (coz, red) {
      var adres = URL.createObjectURL(dosya);
      var img = new Image();
      img.onload = function () {
        coz({
          kaynak: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          kapat: function () { URL.revokeObjectURL(adres); }
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(adres);
        red(new Error("Bu fotoğraf biçimi desteklenmiyor. JPG veya PNG deneyin."));
      };
      img.src = adres;
    });
  }

  function gorselAc(dosya) {
    if (window.createImageBitmap) {
      return window
        .createImageBitmap(dosya, { imageOrientation: "from-image" })
        .then(function (bmp) {
          return {
            kaynak: bmp,
            width: bmp.width,
            height: bmp.height,
            kapat: function () { if (bmp.close) bmp.close(); }
          };
        })
        .catch(function () { return imgIleAc(dosya); });
    }
    return imgIleAc(dosya);
  }

  function jpegeCevir(tuval, kalite) {
    return new Promise(function (coz, red) {
      tuval.toBlob(function (blob) {
        if (blob) coz(blob);
        else red(new Error("Fotoğraf hazırlanamadı."));
      }, "image/jpeg", kalite);
    });
  }

  // Büyük telefon fotoğraflarını küçültüp JPEG yapar: { blob, genislik, yukseklik, onizleme }
  function fotografiHazirla(dosya) {
    if (!dosya || !dosya.type || dosya.type.indexOf("image/") !== 0) {
      return Promise.reject(new Error("Bu dosya bir fotoğraf değil."));
    }
    return gorselAc(dosya).then(function (g) {
      var oran = Math.min(1, EN_UZUN_KENAR / Math.max(g.width, g.height));
      var gw = Math.max(1, Math.round(g.width * oran));
      var gh = Math.max(1, Math.round(g.height * oran));
      var tuval = document.createElement("canvas");
      tuval.width = gw;
      tuval.height = gh;
      var baglam = tuval.getContext("2d");
      baglam.fillStyle = "#ffffff"; // saydam PNG'ler JPEG'de siyah olmasın
      baglam.fillRect(0, 0, gw, gh);
      baglam.drawImage(g.kaynak, 0, 0, gw, gh);
      g.kapat();
      return jpegeCevir(tuval, 0.82)
        .then(function (blob) {
          return blob.size > 2.5 * 1024 * 1024 ? jpegeCevir(tuval, 0.6) : blob;
        })
        .then(function (blob) {
          return { blob: blob, genislik: gw, yukseklik: gh, onizleme: URL.createObjectURL(blob) };
        });
    });
  }
  kanca.fotografiHazirla = fotografiHazirla;

  function blobuBase64(blob) {
    return new Promise(function (coz, red) {
      var okuyucu = new FileReader();
      okuyucu.onload = function () {
        var s = String(okuyucu.result);
        coz(s.slice(s.indexOf(",") + 1));
      };
      okuyucu.onerror = function () { red(new Error("Fotoğraf okunamadı.")); };
      okuyucu.readAsDataURL(blob);
    });
  }

  // ---------- Fotoğraf yükleme (sırayla; şifre yanlışsa hepsini boşuna denemeyiz) ----------

  function fotoyuYukle(foto) {
    if (yuklemeDurdu) {
      foto.durum = "hata";
      foto.mesaj = "Şifre kabul edilmediği için yüklenmedi.";
      kartiGuncelle(foto);
      return Promise.resolve();
    }
    foto.durum = "yukleniyor";
    foto.mesaj = "";
    kartiGuncelle(foto);
    return blobuBase64(foto.blob)
      .then(function (b64) { return istek({ islem: "fotoyukle", veri: b64 }); })
      .then(function (s) {
        if (s.ok) {
          foto.sha = s.veri.sha;
          foto.durum = "hazir";
          foto.mesaj = "";
        } else {
          foto.durum = "hata";
          foto.mesaj = s.veri.hata || "Yüklenemedi.";
          if (s.durum === 401 || s.durum === 429) yuklemeDurdu = true;
        }
        kartiGuncelle(foto);
      })
      .catch(function (hata) {
        foto.durum = "hata";
        foto.mesaj = hata && hata.message ? hata.message : "Yüklenemedi.";
        kartiGuncelle(foto);
      });
  }

  function yuklemeyeEkle(foto) {
    kuyruk = kuyruk.then(function () { return fotoyuYukle(foto); });
  }

  // ---------- Taslak (yarım kalan yeni yazı kaybolmasın) ----------

  function taslakOku() {
    try { return JSON.parse(localStorage.getItem(TASLAK) || "null"); } catch (e) { return null; }
  }
  function taslakKaydet() {
    if (duzenlenen) return;
    try {
      localStorage.setItem(TASLAK, JSON.stringify({ baslik: baslik.value, metin: B.metinleriBirlestir(bloklar) }));
    } catch (e) { /* önemli değil */ }
  }
  function taslakSil() {
    try { localStorage.removeItem(TASLAK); } catch (e) { /* önemli değil */ }
  }
  function taslagiYukle() {
    var t = taslakOku();
    baslik.value = t && t.baslik ? t.baslik : "";
    bloklar = [{ tur: "metin", metin: t && t.metin ? t.metin : "" }];
  }

  function onizlemeleriBosalt(liste2) {
    liste2.forEach(function (b) {
      if (b.tur === "foto" && b.onizleme) {
        try { URL.revokeObjectURL(b.onizleme); } catch (e) { /* önemli değil */ }
      }
    });
  }

  // ---------- Ekrana çizim ----------

  function boyutla(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + 2 + "px";
  }

  function kartBul(id) {
    return bloklarKutusu.querySelector('[data-foto-id="' + id + '"]');
  }

  function odakla(id, tercih, karsi) {
    var kart = kartBul(id);
    if (!kart) return;
    var adaylar = [tercih, karsi];
    for (var i = 0; i < adaylar.length; i++) {
      var d = kart.querySelector('[data-eylem="' + adaylar[i] + '"]');
      if (d && !d.disabled) { d.focus(); return; }
    }
    kart.focus();
  }

  function kartiGuncelle(foto) {
    var kart = kartBul(foto.id);
    if (!kart) return;
    var durum = kart.querySelector('[data-rol="durum"]');
    var tekrar = kart.querySelector('[data-eylem="tekrar"]');
    var yazi = "";
    var tur = "";
    if (foto.durum === "yukleniyor") { yazi = "Yükleniyor..."; tur = "bekle"; }
    else if (foto.durum === "hazir") { yazi = "Yüklendi, yayınlayınca yazıya girecek."; tur = "basarili"; }
    else if (foto.durum === "hata") { yazi = foto.mesaj || "Yüklenemedi."; tur = "hata"; }
    durum.textContent = yazi;
    durum.className = "foto-durumu " + tur;
    tekrar.hidden = foto.durum !== "hata";
  }

  function metinBlokuYap(blok, i) {
    var kutu = document.createElement("div");
    kutu.className = "metin-blogu";

    var etiket = document.createElement("label");
    etiket.className = "gizli-etiket";
    etiket.htmlFor = "metin-" + i;
    etiket.textContent = bloklar.length === 1 ? "Yazı" : "Yazı bölümü " + (i / 2 + 1);

    var ta = document.createElement("textarea");
    ta.id = "metin-" + i;
    ta.className = "metin-alani";
    ta.rows = bloklar.length === 1 ? 12 : 3;
    ta.value = blok.metin;
    ta.placeholder =
      bloklar.length === 1 ? "Hikâyenizi buraya yazın..." : i === 0 ? "Yazıya buradan başlayın..." : "Devamını buraya yazın...";
    ta.addEventListener("input", function () {
      blok.metin = ta.value;
      boyutla(ta);
      taslakKaydet();
    });

    var arac = document.createElement("div");
    arac.className = "blok-araci";
    var dugme = document.createElement("button");
    dugme.type = "button";
    dugme.className = "foto-ekle-dugmesi";
    dugme.textContent = "＋ Fotoğraf ekle";
    dugme.setAttribute("aria-label", "Bu yazı bölümüne, imlecin olduğu yere fotoğraf ekle");
    var ipucu = document.createElement("span");
    ipucu.className = "foto-ekle-ipucu";
    ipucu.textContent = "Fotoğraf, yazıda imlecin olduğu yere girer.";
    dugme.addEventListener("click", function () { fotoEkleBaslat(i, ta.selectionStart); });
    arac.appendChild(dugme);
    arac.appendChild(ipucu);

    kutu.appendChild(etiket);
    kutu.appendChild(ta);
    kutu.appendChild(arac);
    return kutu;
  }

  function fotoKartiYap(foto) {
    var kart = document.createElement("div");
    kart.className = "foto-karti";
    kart.tabIndex = -1;
    kart.setAttribute("data-foto-id", foto.id);

    var gorselKutusu = document.createElement("div");
    gorselKutusu.className = "foto-gorsel";
    var gorsel = document.createElement("img");
    gorsel.src = foto.onizleme || foto.adres;
    gorsel.alt = foto.altyazi || "Yazıya eklenen fotoğraf";
    gorsel.addEventListener("error", function () {
      gorselKutusu.textContent = "Önizleme henüz hazır değil (fotoğraf yayına alınıyor).";
      gorselKutusu.className = "foto-gorsel gorsel-yok";
    });
    gorselKutusu.appendChild(gorsel);

    var durum = document.createElement("p");
    durum.className = "foto-durumu";
    durum.setAttribute("data-rol", "durum");
    durum.setAttribute("role", "status");

    var altyaziEtiketi = document.createElement("label");
    altyaziEtiketi.className = "altyazi-etiketi";
    altyaziEtiketi.textContent = "Fotoğrafın altına yazı (isteğe bağlı)";
    var altyazi = document.createElement("input");
    altyazi.type = "text";
    altyazi.maxLength = 200;
    altyazi.className = "altyazi-alani";
    altyazi.value = foto.altyazi || "";
    altyazi.addEventListener("input", function () { foto.altyazi = altyazi.value; });
    altyaziEtiketi.appendChild(altyazi);

    var durumlar = B.tasinabilirMi(bloklar, foto.id);
    var dugmeler = document.createElement("div");
    dugmeler.className = "foto-dugmeleri";

    function dugmeYap(eylem, yazi, ad, sinif) {
      var d = document.createElement("button");
      d.type = "button";
      d.className = sinif || "ikincil-dugme";
      d.textContent = yazi;
      d.setAttribute("data-eylem", eylem);
      d.setAttribute("aria-label", ad);
      return d;
    }

    var yukari = dugmeYap("yukari", "↑ Yukarı", "Fotoğrafı bir paragraf yukarı taşı");
    yukari.disabled = !durumlar.yukari;
    yukari.addEventListener("click", function () {
      bloklar = B.fotoyuTasi(bloklar, foto.id, -1);
      ciz();
      odakla(foto.id, "yukari", "asagi");
    });

    var asagi = dugmeYap("asagi", "↓ Aşağı", "Fotoğrafı bir paragraf aşağı taşı");
    asagi.disabled = !durumlar.asagi;
    asagi.addEventListener("click", function () {
      bloklar = B.fotoyuTasi(bloklar, foto.id, 1);
      ciz();
      odakla(foto.id, "asagi", "yukari");
    });

    var tekrar = dugmeYap("tekrar", "Tekrar dene", "Fotoğrafı yeniden yüklemeyi dene");
    tekrar.hidden = true;
    tekrar.addEventListener("click", function () {
      if (!sifreGerekli()) return;
      yuklemeDurdu = false;
      yuklemeyeEkle(foto);
    });

    var kaldir = dugmeYap("kaldir", "Kaldır", "Fotoğrafı yazıdan kaldır", "tehlike-dugme");
    kaldir.addEventListener("click", function () {
      if (!window.confirm("Bu fotoğraf yazıdan çıkarılsın mı?")) return;
      onizlemeleriBosalt([foto]);
      bloklar = B.fotoyuKaldir(bloklar, foto.id);
      ciz();
      taslakKaydet();
    });

    dugmeler.appendChild(yukari);
    dugmeler.appendChild(asagi);
    dugmeler.appendChild(tekrar);
    dugmeler.appendChild(kaldir);

    kart.appendChild(gorselKutusu);
    kart.appendChild(durum);
    kart.appendChild(altyaziEtiketi);
    kart.appendChild(dugmeler);
    return kart;
  }

  function ciz() {
    bloklarKutusu.textContent = "";
    bloklar.forEach(function (blok, i) {
      bloklarKutusu.appendChild(blok.tur === "foto" ? fotoKartiYap(blok) : metinBlokuYap(blok, i));
    });
    var alanlar = bloklarKutusu.querySelectorAll("textarea");
    for (var k = 0; k < alanlar.length; k++) boyutla(alanlar[k]);
    bloklar.forEach(function (b) { if (b.tur === "foto") kartiGuncelle(b); });
  }

  // ---------- Fotoğraf ekleme ----------

  function fotoEkleBaslat(index, konum) {
    if (!sifreGerekli()) return;
    if (B.fotoSayisi(bloklar) >= EN_FAZLA_FOTO) {
      mesajGoster("Bir yazıya en fazla " + EN_FAZLA_FOTO + " fotoğraf eklenebilir.", "hata");
      return;
    }
    bekleyenIndex = index;
    bekleyenKonum = konum;
    fotoSecici.value = "";
    fotoSecici.click();
  }

  function fotograflariHazirla(dosyalar) {
    var fotolar = [];
    var hatalar = [];
    return dosyalar
      .reduce(function (zincir, dosya) {
        return zincir.then(function () {
          return kanca.fotografiHazirla(dosya).then(
            function (s) {
              fotolar.push({
                tur: "foto",
                id: yeniId(),
                blob: s.blob,
                onizleme: s.onizleme,
                genislik: s.genislik,
                yukseklik: s.yukseklik,
                altyazi: "",
                durum: "yukleniyor"
              });
            },
            function (hata) {
              hatalar.push(hata && hata.message ? hata.message : "Bir fotoğraf hazırlanamadı.");
            }
          );
        });
      }, Promise.resolve())
      .then(function () { return { fotolar: fotolar, hatalar: hatalar }; });
  }

  fotoSecici.addEventListener("change", function () {
    var dosyalar = Array.prototype.slice.call(fotoSecici.files || []);
    fotoSecici.value = "";
    if (!dosyalar.length || bekleyenIndex < 0) return;

    var kalan = EN_FAZLA_FOTO - B.fotoSayisi(bloklar);
    var fazlaUyari = "";
    if (dosyalar.length > kalan) {
      fazlaUyari = "Bir yazıya en fazla " + EN_FAZLA_FOTO + " fotoğraf eklenebilir; fazlası alınmadı.";
      dosyalar = dosyalar.slice(0, Math.max(0, kalan));
    }
    if (!dosyalar.length) {
      mesajGoster(fazlaUyari, "hata");
      return;
    }

    var hedefIndex = bekleyenIndex;
    var hedefKonum = bekleyenKonum;
    mesajGoster(dosyalar.length > 1 ? "Fotoğraflar hazırlanıyor..." : "Fotoğraf hazırlanıyor...", "bekle");

    fotograflariHazirla(dosyalar).then(function (sonuc) {
      if (sonuc.fotolar.length) {
        var yeni = B.fotolariEkle(bloklar, hedefIndex, hedefKonum, sonuc.fotolar);
        if (yeni === bloklar) {
          // Bu arada yazı düzeni değişmişse fotoğrafları yazının sonuna koy
          var son = bloklar[bloklar.length - 1];
          yeni = B.fotolariEkle(bloklar, bloklar.length - 1, String(son.metin || "").length, sonuc.fotolar);
        }
        bloklar = yeni;
        ciz();
        taslakKaydet();
        var ilkKart = kartBul(sonuc.fotolar[0].id);
        if (ilkKart && ilkKart.scrollIntoView) ilkKart.scrollIntoView({ behavior: "smooth", block: "center" });
        sonuc.fotolar.forEach(yuklemeyeEkle);
      }
      var uyarilar = sonuc.hatalar.concat(fazlaUyari ? [fazlaUyari] : []);
      if (uyarilar.length) mesajGoster(uyarilar.join(" "), "hata");
      else mesajGoster("", "");
    });
  });

  // ---------- Düzenleme kipi ----------

  function bloklariDonustur(gelen) {
    return B.normallestir(
      gelen.map(function (b) {
        if (b.tur === "foto") {
          return {
            tur: "foto",
            id: yeniId(),
            adres: b.adres,
            genislik: b.genislik,
            yukseklik: b.yukseklik,
            altyazi: b.altyazi || "",
            durum: "var"
          };
        }
        return { tur: "metin", metin: b.metin || "" };
      })
    );
  }

  function duzenlemeyiBitir() {
    duzenlenen = null;
    kip.hidden = true;
    iptal.hidden = true;
    gonder.textContent = "Yayınla";
    if (yeniYaziDurumu) {
      baslik.value = yeniYaziDurumu.baslik;
      bloklar = yeniYaziDurumu.bloklar;
      yeniYaziDurumu = null;
    } else {
      taslagiYukle();
    }
    ciz();
  }

  function duzenlemeyiBaslat(ad) {
    if (!sifreGerekli()) return;
    if (
      duzenlenen &&
      !window.confirm("Şu an açık olan düzenleme kapanacak; kaydetmediğiniz değişiklikler silinecek. Devam edilsin mi?")
    ) {
      return;
    }
    mesajGoster("Yazı açılıyor...", "bekle");
    istek({ islem: "getir", ad: ad }).then(function (s) {
      if (!s.ok) {
        mesajGoster(s.veri.hata || "Yazı açılamadı. Biraz sonra tekrar deneyin.", "hata");
        return;
      }
      if (!duzenlenen) {
        yeniYaziDurumu = { baslik: baslik.value, bloklar: bloklar };
      } else {
        onizlemeleriBosalt(bloklar);
      }
      duzenlenen = ad;
      baslik.value = s.veri.baslik;
      bloklar = bloklariDonustur(s.veri.bloklar || [{ tur: "metin", metin: s.veri.metin || "" }]);
      kip.textContent =
        "Şu an düzenliyorsunuz: " + s.veri.baslik + ". Yeni yazınız silinmedi, vazgeçince geri gelir." +
        (s.veri.ham ? " Bu yazı elle yazılmış; kaydedince düz yazı biçimine çevrilir." : "");
      kip.hidden = false;
      iptal.hidden = false;
      gonder.textContent = "Değişiklikleri kaydet";
      mesajGoster("", "");
      ciz();
      window.scrollTo({ top: 0, behavior: "smooth" });
      var ilk = bloklarKutusu.querySelector("textarea");
      if (ilk) ilk.focus();
    });
  }

  iptal.addEventListener("click", function () {
    if (duzenlenen) onizlemeleriBosalt(bloklar);
    duzenlemeyiBitir();
    mesajGoster("", "");
  });

  // ---------- Yazı listesi ----------

  function adOlustur(adres) {
    return String(adres).replace(/^\/posts\//, "").replace(/\/$/, "");
  }

  function listeBosMu() {
    listeMesaji.hidden = liste.children.length > 0;
    if (!listeMesaji.hidden) listeMesaji.textContent = "Henüz yayınlanmış yazı yok.";
  }

  function satirYap(yazi, yeni) {
    var ad = adOlustur(yazi.adres);
    var li = document.createElement("li");
    li.className = "yazi-satiri";
    li.setAttribute("data-ad", ad);

    var bilgi = document.createElement("div");
    bilgi.className = "yazi-bilgi";
    var tarih = document.createElement("span");
    tarih.className = "yazi-tarihi";
    tarih.textContent = yazi.tarih || "";
    var baglanti = document.createElement("a");
    baglanti.className = "yazi-adi";
    baglanti.href = yazi.adres;
    baglanti.target = "_blank";
    baglanti.rel = "noopener";
    baglanti.textContent = yazi.baslik;
    bilgi.appendChild(tarih);
    bilgi.appendChild(baglanti);
    if (yeni) {
      var etiket = document.createElement("span");
      etiket.className = "yeni-etiket";
      etiket.textContent = "yayına alınıyor";
      bilgi.appendChild(etiket);
    }

    var dugmeler = document.createElement("div");
    dugmeler.className = "yazi-dugmeleri";
    var duzenle = document.createElement("button");
    duzenle.type = "button";
    duzenle.className = "ikincil-dugme";
    duzenle.textContent = "Düzenle";
    duzenle.setAttribute("aria-label", yazi.baslik + " yazısını düzenle");
    duzenle.addEventListener("click", function () { duzenlemeyiBaslat(ad); });
    var sil = document.createElement("button");
    sil.type = "button";
    sil.className = "tehlike-dugme";
    sil.textContent = "Sil";
    sil.setAttribute("aria-label", yazi.baslik + " yazısını sil");
    sil.addEventListener("click", function () { yaziyiSil(ad, baglanti.textContent, li, sil, duzenle); });
    dugmeler.appendChild(duzenle);
    dugmeler.appendChild(sil);

    li.appendChild(bilgi);
    li.appendChild(dugmeler);
    return li;
  }

  function yaziyiSil(ad, baslikYazisi, li, silDugmesi, duzenleDugmesi) {
    if (!sifreGerekli()) return;
    var emin = window.confirm("“" + baslikYazisi + "” yazısı siteden kaldırılsın mı?");
    if (!emin) return;
    silDugmesi.disabled = true;
    duzenleDugmesi.disabled = true;
    mesajGoster("Siliniyor...", "bekle");
    istek({ islem: "sil", ad: ad }).then(function (s) {
      if (!s.ok) {
        silDugmesi.disabled = false;
        duzenleDugmesi.disabled = false;
        mesajGoster(s.veri.hata || "Yazı silinemedi. Biraz sonra tekrar deneyin.", "hata");
        return;
      }
      li.remove();
      if (duzenlenen === ad) {
        onizlemeleriBosalt(bloklar);
        duzenlemeyiBitir();
      }
      listeBosMu();
      mesajGoster("Yazı silindi. Sitede kaybolması yaklaşık bir dakika sürer.", "basarili");
    });
  }

  function listedeBaslikGuncelle(ad, yeniBaslik) {
    var satirlar = liste.querySelectorAll(".yazi-satiri");
    for (var i = 0; i < satirlar.length; i++) {
      if (satirlar[i].getAttribute("data-ad") === ad) {
        satirlar[i].querySelector(".yazi-adi").textContent = yeniBaslik;
      }
    }
  }

  function listeyiYukle() {
    return fetch("/posts.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (yanit) {
        if (!yanit.ok) throw new Error("liste");
        return yanit.json();
      })
      .then(function (yazilar) {
        for (var i = 0; i < yazilar.length; i++) liste.appendChild(satirYap(yazilar[i], false));
        listeBosMu();
      })
      .catch(function () {
        listeMesaji.hidden = false;
        listeMesaji.textContent = "Yazı listesi şu an yüklenemedi. Sayfayı yenileyin.";
      });
  }

  // ---------- Gönder (yeni yazı veya değişiklik) ----------

  form.addEventListener("submit", function (olay) {
    olay.preventDefault();
    if (!sifreGerekli()) return;

    var hazir = B.gonderilecekBloklar(bloklar);
    if (hazir.hata) {
      mesajGoster(hazir.hata, "hata");
      return;
    }
    if (!B.icerikVarMi(bloklar)) {
      mesajGoster("Lütfen yazıyı yazın veya bir fotoğraf ekleyin.", "hata");
      return;
    }

    var duzenleme = duzenlenen;
    var baslikDegeri = baslik.value;
    gonder.disabled = true;
    mesajGoster("Gönderiliyor...", "bekle");

    var govde = duzenleme
      ? { islem: "guncelle", ad: duzenleme, baslik: baslikDegeri, bloklar: hazir.bloklar }
      : { islem: "ekle", baslik: baslikDegeri, bloklar: hazir.bloklar };

    istek(govde).then(function (s) {
      gonder.disabled = false;
      if (!s.ok) {
        mesajGoster(s.veri.hata || "Bir sorun oluştu. Biraz sonra tekrar deneyin.", "hata");
        return;
      }
      onizlemeleriBosalt(bloklar);
      if (duzenleme) {
        listedeBaslikGuncelle(duzenleme, s.veri.baslik || baslikDegeri);
        duzenlemeyiBitir();
        mesajGoster("Değişiklikler kaydedildi. Sitede görünmesi yaklaşık bir dakika sürer.", "basarili", s.veri.adres);
      } else {
        baslik.value = "";
        bloklar = [{ tur: "metin", metin: "" }];
        taslakSil();
        ciz();
        liste.insertBefore(
          satirYap({ baslik: baslikDegeri.replace(/\s+/g, " ").trim(), tarih: s.veri.tarih, adres: s.veri.adres }, true),
          liste.firstChild
        );
        listeBosMu();
        mesajGoster("Yazı kaydedildi. Sitede görünmesi yaklaşık bir dakika sürer.", "basarili", s.veri.adres);
      }
    });
  });

  baslik.addEventListener("input", taslakKaydet);

  // Henüz kaydedilmemiş fotoğraflar varken sayfa yanlışlıkla kapanmasın
  window.addEventListener("beforeunload", function (olay) {
    var bekleyen = bloklar.some(function (b) { return b.tur === "foto" && b.blob; });
    if (bekleyen) {
      olay.preventDefault();
      olay.returnValue = "";
    }
  });

  // ---------- Başlangıç ----------

  taslagiYukle();
  ciz();
  listeyiYukle();
})();
