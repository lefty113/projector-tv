// Builds videos.json for projector.html: latest uploads from each channel (via YouTube RSS, no API key).
import { readFile, writeFile } from "node:fs/promises";

const CHANNELS = [
  { key: "epicgust",  name: "Epic Gust",      handle: "EpicGust" },
  { key: "batevento", name: "Bate Vento",     handle: "batevento2942" },
  { key: "newgen",    name: "New Generation", handle: "New_Generation_KiteContent" },
];
const PER_CHANNEL = 7;
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "en", "Cookie": "CONSENT=YES+1; SOCS=CAI" };

let prev = {};
try { prev = JSON.parse(await readFile("videos.json", "utf8")); } catch {}
const prevIds = Object.fromEntries((prev.channels || []).map(c => [c.key, c.channelId]));

async function channelId(c) {
  if (prevIds[c.key]) return prevIds[c.key];
  const html = await (await fetch(`https://www.youtube.com/@${c.handle}`, { headers: UA })).text();
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/);
  if (!m) throw new Error(`channel id not found for @${c.handle}`);
  return m[1];
}
const unxml = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const out = { updated: new Date().toISOString(), channels: [] };
for (const c of CHANNELS) {
  try {
    const id = await channelId(c);
    const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA })).text();
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, PER_CHANNEL).map(([, e]) => ({
      id: e.match(/<yt:videoId>([^<]+)/)[1],
      title: unxml((e.match(/<title>([^<]*)/) || [, ""])[1]),
      published: (e.match(/<published>([^<]+)/) || [, ""])[1],
    }));
    if (!videos.length) throw new Error("feed empty");
    out.channels.push({ key: c.key, name: c.name, channelId: id, videos });
    console.log(`${c.name}: ${videos.length} videos`);
  } catch (err) {
    console.error(`${c.name}: ${err.message} — keeping previous list`);
    const old = (prev.channels || []).find(p => p.key === c.key);
    if (old) out.channels.push(old);
  }
}
if (!out.channels.length) { console.error("nothing fetched"); process.exit(1); }
// only rewrite if the video lists changed (keeps commit history quiet)
const sig = o => JSON.stringify((o.channels || []).map(c => [c.key, c.videos.map(v => v.id)]));
if (sig(out) === sig(prev)) { console.log("no change"); process.exit(0); }
await writeFile("videos.json", JSON.stringify(out, null, 2) + "\n");
console.log("videos.json updated");
