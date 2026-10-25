/**
 * Image source adapters, ported from sorty/core/sources.py
 *
 * Only sources whose API and image hosts send CORS headers work from a browser:
 * iNaturalist, Openverse, and Wikimedia Commons. Bing and DuckDuckGo are left out
 * Each record carries the original image URL (the item id and source link) and a
 * download URL, which differs for Openverse since most of its origin hosts block
 * cross-origin reads but its thumbnail proxy allows them
 */

export interface SourceRecord {
  source: string;
  url: string;
  download_url: string;
  title: string;
}

type FetchFn = (
  subject: string,
  limit: number,
  offset: number,
) => Promise<SourceRecord[]>;

const INATURALIST_MAX_PER_PAGE = 200;
const OPENVERSE_MAX_PAGE_SIZE = 20;
const WIKIMEDIA_MAX_RESULTS = 50;

async function getJson(url: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  const resp = await fetch(`${url}?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  return resp.json();
}

const fetchInaturalist: FetchFn = async (subject, limit, offset) => {
  // fetch offset + limit, then slice, so offset advances into deeper results
  const want = offset + limit;
  let data;
  try {
    data = await getJson("https://api.inaturalist.org/v1/observations", {
      q: subject,
      quality_grade: "research",
      photos: "true",
      // licensed photos are in the open-data bucket, which sends CORS headers
      // All-rights-reserved ones are on static.inaturalist.org, which doesn't
      photo_licensed: "true",
      per_page: Math.min(want, INATURALIST_MAX_PER_PAGE),
      order: "votes",
      order_by: "votes",
    });
  } catch (e) {
    console.warn(`iNaturalist failed for '${subject}'`, e);
    return [];
  }
  const out: SourceRecord[] = [];
  for (const obs of data.results ?? []) {
    const photo = obs.photos?.find(
      (ph: { license_code?: string | null }) => ph.license_code,
    );
    const url = (photo?.url ?? "").replace("/square.", "/medium.");
    if (!url) continue;
    out.push({
      source: "inaturalist",
      url,
      download_url: url,
      title: obs.taxon?.preferred_common_name || obs.taxon?.name || "",
    });
    if (out.length >= want) break;
  }
  return out.slice(offset);
};

const fetchOpenverse: FetchFn = async (subject, limit, offset) => {
  // page_size caps at 20, so walk whole pages from the first and slice the window
  const want = offset + limit;
  const lastPage = Math.ceil(want / OPENVERSE_MAX_PAGE_SIZE);
  const out: SourceRecord[] = [];
  for (let page = 1; page <= lastPage; page++) {
    let data;
    try {
      data = await getJson("https://api.openverse.org/v1/images/", {
        q: subject,
        license_type: "commercial,modification",
        page_size: OPENVERSE_MAX_PAGE_SIZE,
        page,
      });
    } catch (e) {
      console.warn(`Openverse failed for '${subject}'`, e);
      break;
    }
    const results = data.results ?? [];
    for (const img of results) {
      if (!img.url || !img.thumbnail) continue;
      out.push({
        source: "openverse",
        url: wikimediaFullToThumb(img.url),
        download_url: img.thumbnail,
        title: img.title ?? "",
      });
    }
    if (results.length < OPENVERSE_MAX_PAGE_SIZE) break;
  }
  return out.slice(offset, offset + limit);
};

/** A full-res upload.wikimedia.org URL as a scaled thumbnail, matching sources.py */
function wikimediaFullToThumb(url: string, width = 960): string {
  const m = url.match(
    /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/)([0-9a-f]\/[0-9a-f]{2})\/(.+)$/,
  );
  if (!m) return url;
  const [, base, hash, file] = m;
  return `${base}thumb/${hash}/${file}/${width}px-${file}`;
}

const fetchWikimedia: FetchFn = async (subject, limit, offset) => {
  let data;
  try {
    data = await getJson("https://commons.wikimedia.org/w/api.php", {
      action: "query",
      generator: "search",
      gsrsearch: subject,
      gsrnamespace: 6,
      gsrlimit: Math.min(limit, WIKIMEDIA_MAX_RESULTS),
      gsroffset: offset,
      prop: "imageinfo",
      iiprop: "url|mime",
      // a scaled thumbnail, per Wikimedia's guidance for API consumers
      iiurlwidth: 800,
      format: "json",
      // anonymous CORS on the MediaWiki API needs origin=*
      origin: "*",
    });
  } catch (e) {
    console.warn(`Wikimedia Commons failed for '${subject}'`, e);
    return [];
  }
  const out: SourceRecord[] = [];
  for (const page of Object.values<{
    title?: string;
    imageinfo?: { thumburl?: string; url?: string; mime?: string }[];
  }>(data.query?.pages ?? {})) {
    const info = page.imageinfo?.[0] ?? {};
    let url = info.thumburl || info.url || "";
    if (!url || info.mime === "image/svg+xml") continue;
    // strip the UTM params Wikimedia appends to thumburls, they cause CDN 403s
    url = url.split("?")[0];
    out.push({
      source: "wikimedia_commons",
      url,
      download_url: url,
      title: (page.title ?? "").replace(/^File:/, ""),
    });
    if (out.length >= limit) break;
  }
  return out;
};

export const REGISTRY: Record<string, FetchFn> = {
  inaturalist: fetchInaturalist,
  openverse: fetchOpenverse,
  wikimedia_commons: fetchWikimedia,
};

/** Fetch every source for one subject concurrently, keyed by source name */
export async function fetchAll(
  subject: string,
  sources: string[],
  limit: number,
  offset: number,
): Promise<SourceRecord[][]> {
  return Promise.all(
    sources
      .filter((s) => s in REGISTRY)
      .map((s) => REGISTRY[s](subject, limit, offset)),
  );
}
