// Arama motorlarına: her yer açık, site haritası şurada.
module.exports = class {
  data() {
    return { permalink: "/robots.txt", eleventyExcludeFromCollections: true };
  }

  render(data) {
    return `User-agent: *\nAllow: /\n\nSitemap: ${data.seo.url}/sitemap.xml\n`;
  }
};
