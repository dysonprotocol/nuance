import { useAxiosRepo } from "@pinia-orm/axios";
import { useRepo } from "pinia-orm";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";

function normalizePath(path?: string): string {
  const s = String(path || "/").trim();
  if (!s) return "/";
  return s.startsWith("/") ? s : "/" + s;
}

async function resolveAddress(input: string): Promise<string> {
  const name = String(input || "").trim();
  if (!name) return "";
  await useAxiosRepo(NameResolution).api().resolve(name);
  const repo = useRepo(NameResolution);
  const rec = repo.find(name) as any;
  return String(rec?.address || "");
}

export async function authorLink(
  author: string,
  path: string = "/"
): Promise<string> {
  const [authorAddr, nuanceAddr] = await Promise.all([
    resolveAddress(author),
    resolveAddress("nuance.dys"),
  ]);

  const p = normalizePath(path);

  if (authorAddr && nuanceAddr && authorAddr === nuanceAddr) {
    const res = await fetch(
      `/redirect-to-dwapp/${encodeURIComponent(author)}/host.json`
    );
    const data: any = await res.json();
    const host = String(data?.HTTP_HOST || "");
    if (!host) return p;
    return `//${host}${p}`;
  }

  const base = `/authors/${encodeURIComponent(author)}`;
  return p === "/" ? base : `${base}${p}`;
}

export default authorLink;
