import { getStore } from "@netlify/blobs";
import { createHandler } from "../lib/yayinla-core.js";

export default createHandler({
  getStore,
  fetch: (...args) => fetch(...args),
  env: process.env
});

export const config = { path: "/api/yayinla" };
