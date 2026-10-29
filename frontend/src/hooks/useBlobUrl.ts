import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";

/** Pictures sit behind sign-in, so they are fetched with the access token and shown from a blob URL. One fetch per path and version. */
const cache = new Map<string, Promise<string | null>>();

function load(path: string, version: number): Promise<string | null> {
  const key = `${path}?v=${version}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = apiClient
      .get<Blob>(path, { responseType: "blob" })
      .then(({ data }) => URL.createObjectURL(data))
      .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

/** The blob URL of a stored picture, or null while loading, when there is none, or when it cannot be read. */
export function useBlobUrl(path: string | null, version: number | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path || !version) return;
    void load(path, version).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path, version]);
  return url;
}
