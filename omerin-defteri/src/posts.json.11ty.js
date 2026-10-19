// Yazı listesini herkese açık bir dosya olarak üretir (/posts.json).
// Yönetim sayfası "Yayındaki yazılar" listesini buradan okur. İçinde zaten
// ana sayfada görünen bilgiler var: başlık, tarih, adres.
module.exports = class {
  data() {
    return {
      permalink: "/posts.json",
      eleventyExcludeFromCollections: true
    };
  }

  render(data) {
    const liste = (data.collections.yazilar || []).map((yazi) => ({
      baslik: yazi.data.title,
      tarih: yazi.data.tarih,
      adres: yazi.url
    }));
    return JSON.stringify(liste);
  }
};
