import axios from "axios";
import { setupCache, buildWebStorage } from "axios-cache-interceptor";

const origin =
  typeof window !== "undefined" && window.location
    ? window.location.origin
    : "";

export const api = setupCache(
  axios.create({
    baseURL: origin, // full current host, no trailing slash
    headers: { "Content-Type": "application/json" },
  }),
  {
    ttl: 1000,
    ...(typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
      ? { storage: buildWebStorage(window.localStorage, "axios-cache") }
      : {}),
  }
);

export default api;
