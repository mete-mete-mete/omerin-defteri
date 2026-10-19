import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  // Sayfa adresi "/posts/ornek/" biçiminde gelir; Netlify Blobs anahtarı "/" ile
  // başlayamaz, bu yüzden baştaki ve sondaki eğik çizgiler atılır.
  const postId = (url.searchParams.get("post") || "").replace(/^\/+|\/+$/g, "");

  if (!postId || postId.length > 200 || !/^[a-z0-9][a-z0-9\-\/]*$/.test(postId)) {
    return new Response(JSON.stringify({ error: "post parametresi gerekli" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const store = getStore("begenmeler");

  if (req.method === "POST") {
    const current = parseInt((await store.get(postId)) || "0", 10);
    const next = current + 1;
    await store.set(postId, String(next));
    return new Response(JSON.stringify({ count: next }), {
      headers: { "content-type": "application/json" }
    });
  }

  const current = parseInt((await store.get(postId)) || "0", 10);
  return new Response(JSON.stringify({ count: current }), {
    headers: { "content-type": "application/json" }
  });
};

export const config = { path: "/api/begen" };
