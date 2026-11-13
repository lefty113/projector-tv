// Builds videos.json for the projector: Epic Gust = Shorts only, Bate Vento = every upload.
// No API key: YouTube RSS (latest 15 per playlist) + the channel's /shorts and /videos pages,
// merged with the previous list so the pool keeps growing instead of only holding the newest 15.
import { readFile, writeFile } from "node:fs/promises";

const CHANNELS = [
  { key: "epicgust",  name: "Epic Gust",  handle: "EpicGust",      mode: "shorts" }, // Shorts only
  { key: "batevento", name: "Bate Vento", handle: "batevento2942", mode: "all" },    // all uploads
];
const MAX_PER_CHANNEL = 200;
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "en", "Cookie": "CONSENT=YES+1; SOCS=CAI" };

let prev = {};
try { prev = JSON.parse(await readFile("videos.json", "utf8")); } catch {}
const prevCh = Object.fromEntries((prev.channels || []).map(c => [c.key, c]));

const get = async url => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); };
const unxml = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const unjson = s => { try { return JSON.parse(`"${s}"`); } catch { return s; } };

async function channelId(c) {
  if (prevCh[c.key]?.channelId) return prevCh[c.key].channelId;
  const html = await get(`https://www.youtube.com/@${c.handle}`);
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/);
  if (!m) throw new Error(`channel id not found for @${c.handle}`);
  return m[1];
}

// RSS of an uploads playlist: UU… = all uploads, UUSH… = Shorts only
async function rss(playlistId) {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: e.match(/<yt:videoId>([^<]+)/)[1],
    title: unxml((e.match(/<title>([^<]*)/) || [, ""])[1]),
    published: (e.match(/<published>([^<]+)/) || [, ""])[1],
  }));
}

// Channel tab page (first page, ~30–48 items) — catches older videos the 15-item RSS misses
async function tab(handle, which) {
  const html = await get(`https://www.youtube.com/@${handle}/${which}`);
  const out = new Map();
  if (which === "videos") {
    for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g))
      if (!out.has(m[1])) out.set(m[1], unjson(m[2]));
  } else {
    for (const m of html.matchAll(/"shortsLockupViewModel":\{"entityId":"shorts-shelf-item-([\w-]{11})"(.*?)"accessibilityText":"((?:[^"\\]|\\.)*)"/g))
      if (!out.has(m[1])) out.set(m[1], unjson(m[3]).replace(/,\s*[\d.,]+\s*\w*\s*views?.*$/i, "").trim());
    for (const m of html.matchAll(/"reelWatchEndpoint":\{"videoId":"([\w-]{11})"/g)) if (!out.has(m[1])) out.set(m[1], "");
  }
  return [...out].map(([id, title]) => ({ id, title, published: "" }));
}

const out = { updated: new Date().toISOString(), channels: [] };
for (const c of CHANNELS) {
  const old = prevCh[c.key];
  try {
    const id = await channelId(c);
    const tail = id.slice(2);
    const lists = [];
    const tryAdd = async (label, fn) => { try { const v = await fn(); lists.push(v); console.log(`  ${label}: ${v.length}`); } catch (e) { console.error(`  ${label}: ${e.message}`); } };
    console.log(c.name);
    if (c.mode === "shorts") {
      await tryAdd("rss shorts", () => rss("UUSH" + tail));
      await tryAdd("page shorts", () => tab(c.handle, "shorts"));
    } else {
      await tryAdd("rss all", () => rss("UU" + tail));
      await tryAdd("page videos", () => tab(c.handle, "videos"));
      await tryAdd("page shorts", () => tab(c.handle, "shorts"));
    }
    // merge: fresh results first, then the previous pool (same mode only), no duplicates
    const keepOld = old && old.mode === c.mode ? old.videos : [];
    const seen = new Map();
    for (const v of [...lists.flat(), ...keepOld]) {
      const s = seen.get(v.id);
      if (!s) seen.set(v.id, { ...v });
      else { if (!s.title && v.title) s.title = v.title; if (!s.published && v.published) s.published = v.published; }
    }
    const videos = [...seen.values()].slice(0, MAX_PER_CHANNEL);
    if (!videos.length) throw new Error("nothing found");
    out.channels.push({ key: c.key, name: c.name, mode: c.mode, channelId: id, videos });
    console.log(`  => ${videos.length} videos`);
  } catch (err) {
    console.error(`${c.name}: ${err.message} — keeping previous list`);
    if (old && old.mode === c.mode) out.channels.push(old);
  }
}
if (!out.channels.length) { console.error("nothing fetched"); process.exit(1); }
const sig = o => JSON.stringify((o.channels || []).map(c => [c.key, c.mode, c.videos.map(v => v.id)]));
if (sig(out) === sig(prev)) { console.log("no change"); process.exit(0); }
await writeFile("videos.json", JSON.stringify(out, null, 2) + "\n");
console.log("videos.json updated");
