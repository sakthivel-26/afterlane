import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultUrl = 'https://afterlane.onrender.com/healthz';
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

/** Load key=value pairs from .env without overriding existing process env vars. */
export function loadEnvFile(envPath = resolve(rootDir, '.env')) {
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/** Parse and validate comma-separated http/https service URLs. */
export function parseUrls(raw = defaultUrl) {
  const entries = String(raw || defaultUrl).split(',').map(s => s.trim()).filter(Boolean);
  if (entries.length === 0) return [defaultUrl];
  const valid = [];
  for (const entry of entries) {
    const parsed = new URL(entry);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol for URL "${entry}": ${parsed.protocol}`);
    }
    valid.push(parsed.href);
  }
  return valid;
}

/** Return true when current local hour falls inside an optional "START-END" window. */
export function inActiveHours(spec, now = new Date()) {
  const text = String(spec || '').trim();
  if (!text) return true;
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return true;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 24 || start === end) return true;
  const hour = now.getHours();
  return start < end ? (hour >= start && hour < end) : (hour >= start || hour < end);
}

/** Ping a single target URL with timeout, draining body cleanly. */
export async function pingUrl(targetUrl, timeoutMs = 35_000) {
  const started = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    return { url: targetUrl, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { url: targetUrl, ok: false, status: 0, ms: Date.now() - started, error: err?.message || String(err) };
  }
}

async function pingAll(urls, activeHours) {
  const stamp = new Date().toLocaleTimeString();
  if (!inActiveHours(activeHours)) {
    console.log(`[${stamp}] Skipped — outside ACTIVE_HOURS (${activeHours})`);
    return true;
  }
  const results = await Promise.all(urls.map(url => pingUrl(url)));
  let allOk = true;
  for (const r of results) {
    if (r.ok) {
      console.log(`[${stamp}] OK ${r.status} (${r.ms}ms) -> ${r.url}`);
    } else {
      allOk = false;
      const reason = r.status ? `HTTP ${r.status}` : r.error;
      console.error(`[${stamp}] FAIL (${r.ms}ms) -> ${r.url}: ${reason}`);
    }
  }
  return allOk;
}

async function main() {
  loadEnvFile();
  const once = process.argv.includes('--once');
  const urls = parseUrls(process.env.URLS);
  const rawMinutes = Number(process.env.INTERVAL_MINUTES || 14);
  const minutes = Number.isFinite(rawMinutes) ? Math.min(60, Math.max(1, rawMinutes)) : 14;
  const activeHours = process.env.ACTIVE_HOURS || '';

  console.log(`Keep-alive watching ${urls.length} URL(s) every ${minutes} min${activeHours ? ` (ACTIVE_HOURS=${activeHours})` : ''}`);
  const ok = await pingAll(urls, activeHours);
  if (once) {
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const timer = setInterval(() => {
    void pingAll(urls, activeHours);
  }, minutes * 60_000);

  const stop = () => {
    clearInterval(timer);
    console.log('Keep-alive stopped.');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main().catch(err => {
    console.error('Keep-alive error:', err?.message || err);
    process.exit(1);
  });
}
