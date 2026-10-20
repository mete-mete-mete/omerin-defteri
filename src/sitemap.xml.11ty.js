// Arama motorları için site haritası (/sitemap.xml): ana sayfa ve tüm yazılar.
module.exports = class {
  data() {
    return { permalink: "/sitemap.xml", eleventyExcludeFromCollections: true };
  }

  render(data) {
    const taban = data.seo.url;
    const kacis = (m) => String(m).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const yazilar = data.collections.yazilar || [];
    const satir = (adres, tarih) =>
      `  <url>\n    <loc>${kacis(taban + adres)}</loc>\n` + (tarih ? `    <lastmod>${tarih}</lastmod>\n` : "") + "  </url>";
    const girisler = [satir("/", yazilar[0] && tarihYaz(yazilar[0].date))];
    for (const y of yazilar) girisler.push(satir(y.url, tarihYaz(y.date)));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${girisler.join("\n")}\n</urlset>\n`;
  }
};

function tarihYaz(d) {
  return d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : "";
}
