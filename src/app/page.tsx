"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/* ─────────────────────────────────────────────
   Pulse — landing page
   Self-contained client component: hero with a live phone demo
   (real MapLibre map + scripted concierge conversation),
   stats, features, freshness band, CTA.
────────────────────────────────────────────── */

const CAT: Record<string, { emoji: string; color: string }> = {
  music: { emoji: "🎵", color: "#e85d75" },
  nightlife: { emoji: "🌙", color: "#8b5cf6" },
  culture: { emoji: "🎨", color: "#06b6d4" },
  food: { emoji: "🍜", color: "#f59e0b" },
  markets: { emoji: "🛍️", color: "#1e3a5f" },
  workshops: { emoji: "🛠️", color: "#10b981" },
  meetups: { emoji: "🤝", color: "#f97316" },
  family: { emoji: "👶", color: "#ec4899" },
};

interface DemoEvent {
  t: string;
  v: string;
  lat: number;
  lng: number;
  c: string;
  star?: number;
}

const EVENTS: DemoEvent[] = [
  // jazz picks used by the chat demo (star: 1)
  { t: "Ernies Mittwochscocktail", v: "Yorckschlösschen", lat: 52.493, lng: 13.381, c: "music", star: 1 },
  { t: "La Foot Creole: New Orleans Jazz", v: "Zosch", lat: 52.526, lng: 13.3938, c: "music", star: 1 },
  { t: "Robins Nest — Jamsession", v: "b-flat", lat: 52.5228, lng: 13.4094, c: "music", star: 1 },
  { t: "UniBigband Berlin", v: "Kunstfabrik Schlot", lat: 52.532, lng: 13.377, c: "music" },
  // the rest of a typical day
  { t: "WOCHENMITTE", v: "Klunkerkranich", lat: 52.4836, lng: 13.4302, c: "nightlife" },
  { t: "100 Gramm Bar Nights", v: "100 Gramm Bar", lat: 52.5306, lng: 13.4017, c: "nightlife" },
  { t: "English Stand-up", v: "Göttin der Weisheit", lat: 52.49, lng: 13.4254, c: "nightlife" },
  { t: "Sternstunde", v: "Zeiss-Großplanetarium", lat: 52.5431, lng: 13.4279, c: "culture" },
  { t: "Museum Führung", v: "Museum für Kommunikation", lat: 52.5099, lng: 13.3873, c: "culture" },
  { t: "Carnivale Royale", v: "Chamäleon Theater", lat: 52.524, lng: 13.4021, c: "culture" },
  { t: "STOMP", v: "Staatsoper Unter den Linden", lat: 52.5167, lng: 13.3947, c: "culture" },
  { t: "SIX The Musical", v: "Admiralspalast", lat: 52.5208, lng: 13.3889, c: "culture" },
  { t: "Open-Air Kino", v: "Filmrauschpalast Moabit", lat: 52.5344, lng: 13.3596, c: "culture" },
  { t: "Elefantin", v: "DOCK 11", lat: 52.5367, lng: 13.4081, c: "culture" },
  { t: "Berlin Musical", v: "Theater des Westens", lat: 52.5059, lng: 13.329, c: "culture" },
  { t: "Sake Market", v: "Markthalle Neun", lat: 52.5022, lng: 13.4315, c: "food" },
  { t: "Kolonnaden-Bar", v: "Museumsinsel", lat: 52.518, lng: 13.3994, c: "food" },
  { t: "Upcycling-Workshop", v: "Schiller-Bibliothek", lat: 52.5464, lng: 13.3573, c: "workshops" },
  { t: "Aromatherapy Workshop", v: "Weltraum Salon", lat: 52.5416, lng: 13.4132, c: "workshops" },
  { t: "Video-Workshop", v: "SAE Institute", lat: 52.5, lng: 13.4459, c: "workshops" },
  { t: "Sprachcafé", v: "Heinrich-Böll-Bibliothek", lat: 52.5418, lng: 13.4408, c: "meetups" },
  { t: "KI & Foresight LAB", v: "Schaltzeit", lat: 52.5355, lng: 13.4384, c: "meetups" },
  { t: "Run Club Intervals", v: "Tiergarten", lat: 52.5064, lng: 13.3324, c: "meetups" },
  { t: "Game Maker Lounge", v: "Bibliothek am Luisenbad", lat: 52.5536, lng: 13.3795, c: "family" },
  { t: "Familiencafé", v: "Zukunftshaus Wedding", lat: 52.5543, lng: 13.3471, c: "family" },
];

const OVERVIEW = { center: [13.395, 52.516] as [number, number], zoom: 11.0 };
const CLOSEUP = { center: [13.398, 52.514] as [number, number], zoom: 12.1 };
const JAZZ = { center: [13.394, 52.51] as [number, number], zoom: 11.9 };
const QUESTION = "Best jazz tonight? 🎷";

function PulseLogo({ size = 30, gid }: { size?: number; gid: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#e85d75" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gid})`} />
      <circle cx="32" cy="32" r="6.5" fill="#fff" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#fff" strokeWidth="3.5" opacity="0.55" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#fff" strokeWidth="3.5" opacity="0.22" />
    </svg>
  );
}

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`);
    const sheet = $("ld-sheet")!;
    const bUser = $("ld-bUser")!;
    const bTyping = $("ld-bTyping")!;
    const bReply = $("ld-bReply")!;
    const cap = $("ld-cap")!;
    const fab = $("ld-chatFab")!;
    const pill = $("ld-countPill")!;
    const cards = [$("ld-c1")!, $("ld-c2")!, $("ld-c3")!];
    const dots = [$("ld-d0")!, $("ld-d1")!, $("ld-d2")!];

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let map: maplibregl.Map | null = null;
    let mapOK = false;
    let disposed = false;
    const markers: { el: HTMLElement; ev: DemoEvent }[] = [];
    let timers: ReturnType<typeof setTimeout>[] = [];
    let running = false;

    function makePinEl(ev: DemoEvent) {
      const el = document.createElement("div");
      el.className = "ld-pin";
      el.style.setProperty("--pc", CAT[ev.c].color);
      el.textContent = CAT[ev.c].emoji;
      return el;
    }

    function after(ms: number, fn: () => void) {
      timers.push(setTimeout(fn, ms));
    }
    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }
    function setStep(n: number) {
      dots.forEach((d, i) => d.classList.toggle("on", i === n));
    }
    function setCaption(text: string, step: number) {
      cap.style.opacity = "0";
      setTimeout(() => {
        if (disposed) return;
        cap.textContent = text;
        cap.style.opacity = "1";
        setStep(step);
      }, 250);
    }

    function resetDemo() {
      clearTimers();
      sheet.classList.remove("open");
      fab.classList.remove("pulse");
      bUser.classList.remove("show");
      bUser.textContent = "";
      bTyping.classList.remove("show");
      bReply.classList.remove("show");
      cards.forEach((c) => c.classList.remove("show", "hot"));
      markers.forEach(({ el }) => el.classList.remove("dim", "star", "bounce"));
      pill.style.opacity = "1";
      if (mapOK && map) map.jumpTo(OVERVIEW);
    }

    function startDemo() {
      if (running || disposed) return;
      running = true;

      if (reduced) {
        sheet.classList.add("open");
        bUser.textContent = QUESTION;
        bUser.classList.add("show");
        bReply.classList.add("show");
        cards.forEach((c) => c.classList.add("show"));
        setCaption("Ask the concierge — answers land on the map", 1);
        running = false;
        return;
      }

      setCaption("Every event in Berlin, live on one map", 0);

      after(2200, () => {
        if (mapOK && map) map.flyTo({ ...CLOSEUP, duration: 2600, essential: true });
      });

      after(4200, () => fab.classList.add("pulse"));
      after(5200, () => {
        fab.classList.remove("pulse");
        sheet.classList.add("open");
        setCaption("Ask the concierge in plain language", 1);
      });
      after(5900, () => {
        bUser.classList.add("show");
        let i = 0;
        const tick = () => {
          if (disposed) return;
          if (i <= QUESTION.length) {
            bUser.textContent = QUESTION.slice(0, i);
            i++;
            timers.push(setTimeout(tick, 45));
          }
        };
        tick();
      });
      after(7300, () => bTyping.classList.add("show"));
      after(8900, () => {
        bTyping.classList.remove("show");
        bReply.classList.add("show");
      });
      cards.forEach((c, i) => after(9400 + i * 350, () => c.classList.add("show")));

      after(10800, () => {
        setCaption("Recommendations light up on the map", 2);
        markers.forEach(({ el, ev }) => {
          if (ev.star) el.classList.add("star");
          else el.classList.add("dim");
        });
        pill.style.opacity = "0";
        if (mapOK && map) map.flyTo({ ...JAZZ, duration: 1800, essential: true });
      });
      after(12600, () => {
        cards[0].classList.add("hot");
        const star = markers.find((m) => m.ev.star);
        if (star) star.el.classList.add("bounce");
      });

      after(16500, () => {
        sheet.classList.remove("open");
        markers.forEach(({ el }) => el.classList.remove("dim", "star"));
        pill.style.opacity = "1";
        if (mapOK && map) map.flyTo({ ...OVERVIEW, duration: 2200, essential: true });
      });
      after(19500, () => {
        running = false;
        resetDemo();
        after(600, startDemo);
      });
    }

    function addPins(m: maplibregl.Map) {
      EVENTS.forEach((ev, i) => {
        const el = makePinEl(ev);
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([ev.lng, ev.lat])
          .addTo(m);
        markers.push({ el, ev });
        setTimeout(() => el.classList.add("in"), 350 + i * 55);
      });
    }

    function fallbackMode() {
      if (mapOK || disposed) return;
      const mapDiv = $("ld-map");
      const fb = $("ld-mapFallback");
      if (mapDiv) mapDiv.style.display = "none";
      if (!fb) return;
      fb.style.display = "block";
      const B = { latMin: 52.455, latMax: 52.575, lngMin: 13.28, lngMax: 13.5 };
      EVENTS.forEach((ev, i) => {
        const el = makePinEl(ev);
        el.style.position = "absolute";
        el.style.left = ((ev.lng - B.lngMin) / (B.lngMax - B.lngMin)) * 92 + 4 + "%";
        el.style.top = ((B.latMax - ev.lat) / (B.latMax - B.latMin)) * 88 + 4 + "%";
        fb.appendChild(el);
        markers.push({ el, ev });
        setTimeout(() => el.classList.add("in"), 350 + i * 55);
      });
      startDemo();
    }

    try {
      map = new maplibregl.Map({
        container: $("ld-map")!,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: OVERVIEW.center,
        zoom: OVERVIEW.zoom,
        attributionControl: { compact: true },
        // Pure showcase: not touchable, so mobile scrolling is never
        // hijacked and the scripted demo can't be interrupted.
        interactive: false,
      });
      map.on("load", () => {
        if (disposed || !map) return;
        mapOK = true;
        addPins(map);
        startDemo();
      });
      setTimeout(() => fallbackMode(), 6000);
    } catch {
      setTimeout(() => fallbackMode(), 0);
    }

    const replayBtn = $("ld-replayBtn");
    const onReplay = () => {
      running = false;
      resetDemo();
      setTimeout(startDemo, 300);
    };
    replayBtn?.addEventListener("click", onReplay);

    return () => {
      disposed = true;
      clearTimers();
      replayBtn?.removeEventListener("click", onReplay);
      if (map) map.remove();
    };
  }, []);

  return (
    <div className="ld" ref={rootRef}>
      <style>{LANDING_CSS}</style>

      <nav className="ld-nav">
        <div className="ld-wrap ld-nav-inner">
          <a className="ld-logo" href="/">
            <PulseLogo size={30} gid="plg-nav" />
            Pulse
          </a>
          <div className="ld-nav-links">
            <a href="#features">Features</a>
            <a href="#fresh">How it works</a>
          </div>
          <a className="ld-btn" href="/map">Open the map</a>
        </div>
      </nav>

      <header className="ld-wrap ld-hero">
        <div>
          <span className="ld-eyebrow">
            <span className="ld-dot" /> Live in Berlin · fresh every morning
          </span>
          <h1>
            Every event in Berlin.
            <br />
            <span className="ld-grad">One map.</span>
          </h1>
          <p className="ld-sub">
            Pulse tracks every concert, market, kids event and pop-up in Berlin — live on an
            interactive map, with an AI concierge you can simply ask.
          </p>
          <div className="ld-cta-row">
            <a className="ld-btn" href="/map">Open the map ↗</a>
            <a className="ld-btn ld-ghost" href="#features">See what it does</a>
          </div>
          <p className="ld-trust">
            <b>73,000+</b> events indexed · <b>hundreds</b> new every day · <b>free</b>
          </p>
        </div>

        <div className="ld-demo-col">
          <div className="ld-phone" id="ld-phone">
            <div className="ld-screen">
              <div className="ld-map-area">
                <div id="ld-map" />
                <div className="ld-map-fallback" id="ld-mapFallback" />

                <div className="ld-chips">
                  <div className="ld-chip-row">
                    <span className="ld-chip on">Today</span>
                    <span className="ld-chip">Tonight</span>
                    <span className="ld-chip">Tomorrow</span>
                    <span className="ld-chip">Weekend</span>
                  </div>
                  <div className="ld-chip-row">
                    <span className="ld-chip">🎵 Music</span>
                    <span className="ld-chip">🌙 Nightlife</span>
                    <span className="ld-chip">🎨 Culture</span>
                    <span className="ld-chip">🍜 Food</span>
                    <span className="ld-chip">🛍️ Markets</span>
                  </div>
                </div>
                <div className="ld-count-pill" id="ld-countPill">512 events today</div>

                <div className="ld-fab left" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="ld-fab right" id="ld-chatFab" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>

                <div className="ld-sheet" id="ld-sheet">
                  <div className="ld-sheet-handle" />
                  <div className="ld-sheet-head">
                    <span>Ask AI</span>
                    <span className="x">✕</span>
                  </div>
                  <div className="ld-chat-body">
                    <div className="ld-bubble user" id="ld-bUser" />
                    <div className="ld-bubble ai" id="ld-bTyping">
                      <span className="ld-typing"><i /><i /><i /></span>
                    </div>
                    <div className="ld-bubble ai" id="ld-bReply">Great jazz tonight 🎷 — here are my picks:</div>
                    <div className="ld-ev-card" id="ld-c1">
                      <div className="ld-ev-emoji">🎵</div>
                      <div>
                        <div className="ld-ev-t">Ernies Mittwochscocktail</div>
                        <div className="ld-ev-m">Yorckschlösschen · Kreuzberg · 21:00</div>
                      </div>
                    </div>
                    <div className="ld-ev-card" id="ld-c2">
                      <div className="ld-ev-emoji">🎵</div>
                      <div>
                        <div className="ld-ev-t">La Foot Creole — New Orleans Jazz</div>
                        <div className="ld-ev-m">Zosch · Mitte · 21:00</div>
                      </div>
                    </div>
                    <div className="ld-ev-card" id="ld-c3">
                      <div className="ld-ev-emoji">🎵</div>
                      <div>
                        <div className="ld-ev-t">Robins Nest — Jam Session</div>
                        <div className="ld-ev-m">b-flat · Mitte · 22:00</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ld-appnav">
                <div className="ld-appnav-item on">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                  Map
                </div>
                <div className="ld-appnav-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  Events
                </div>
                <div className="ld-appnav-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Profile
                </div>
              </div>
            </div>
          </div>
          <div className="ld-demo-caption">
            <span className="ld-step-dots">
              <span className="ld-sd on" id="ld-d0" />
              <span className="ld-sd" id="ld-d1" />
              <span className="ld-sd" id="ld-d2" />
            </span>
            <span id="ld-cap">Every event in Berlin, live on one map</span>
            <button className="ld-replay" id="ld-replayBtn" title="Replay demo" aria-label="Replay demo">⟳</button>
          </div>
        </div>
      </header>

      <div className="ld-wrap ld-stats">
        <div className="ld-stat-grid">
          <div className="ld-stat"><div className="v">73K+</div><div className="l">Events indexed</div></div>
          <div className="ld-stat"><div className="v">Daily</div><div className="l">Hundreds of new events every morning</div></div>
          <div className="ld-stat"><div className="v">9</div><div className="l">Categories, 40+ subgenres</div></div>
          <div className="ld-stat"><div className="v">Free</div><div className="l">No account needed to browse</div></div>
        </div>
      </div>

      <section className="ld-wrap" id="features">
        <div className="ld-sec-eyebrow">Features</div>
        <h2>Ask for a day out.<br />Get pins on a map.</h2>
        <p className="ld-sec-sub">
          No feeds, no scrolling through ten ticket sites. One map, smart filters, and a
          concierge that understands &quot;something chill with live music near me&quot;.
        </p>
        <div className="ld-feat-grid">
          <div className="ld-feat">
            <div className="ic" style={{ background: "rgba(139,92,246,0.13)" }}>💬</div>
            <h3>AI concierge</h3>
            <p>Ask in plain language — &quot;best jazz tonight?&quot;, &quot;free stuff with kids tomorrow?&quot; — and the best matches light up directly on the map.</p>
          </div>
          <div className="ld-feat">
            <div className="ic" style={{ background: "rgba(232,93,117,0.13)" }}>📸</div>
            <h3>Flyer scanner</h3>
            <p>See a poster on a lamppost? Photograph it and Pulse turns it into an event on your map — title, venue, date and price included.</p>
          </div>
          <div className="ld-feat">
            <div className="ic" style={{ background: "rgba(6,182,212,0.13)" }}>🎛️</div>
            <h3>Time × category filters</h3>
            <p>Today, Tonight, Tomorrow, Weekend — crossed with 9 categories and 40+ subgenres, from jazz to flea markets to kids programs.</p>
          </div>
          <div className="ld-feat">
            <div className="ic" style={{ background: "rgba(34,197,94,0.13)" }}>⭐</div>
            <h3>Taste profiles</h3>
            <p>Sign in with email or Google to bookmark events and build a taste profile that learns from what you ask and save — the map slowly becomes yours.</p>
          </div>
        </div>
      </section>

      <section className="ld-wrap" id="fresh">
        <div className="ld-fresh">
          <div className="ld-sec-eyebrow">How it works</div>
          <h2>Fresh every morning.</h2>
          <p>
            Berlin never sits still — and neither does Pulse. While the city sleeps, it sweeps
            venues, ticket platforms and cultural calendars, so when you wake up, today&apos;s
            map is already today&apos;s Berlin. No stale listings, no last month&apos;s
            exhibitions.
          </p>
        </div>
      </section>

      <div className="ld-wrap">
        <div className="ld-final">
          <h2>Feel the city&apos;s pulse.</h2>
          <p>Free to use, live right now.</p>
          <a className="ld-btn ld-inv" href="/map">Open Pulse ↗</a>
        </div>
      </div>

      <footer className="ld-footer">
        <div className="ld-wrap ld-foot-inner">
          <span className="ld-foot-brand">
            <PulseLogo size={20} gid="plg-foot" /> Pulse
          </span>
          <span style={{ display: "inline-flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <a href="/impressum">Impressum</a>
            <a href="/datenschutz">Datenschutz</a>
            <span>© 2026 Pulse · Made in Berlin</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

const LANDING_CSS = `
.ld {
  --bg: #faf9f6;
  --ink: #1a1a1a;
  --ink-2: #55524c;
  --ink-3: #8a867e;
  --card: #ffffff;
  --line: rgba(0,0,0,0.07);
  --accent-a: #8b5cf6;
  --accent-b: #e85d75;
  --radius: 20px;
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  scroll-behavior: smooth;
}
.ld a { text-decoration: none; }
.ld h1, .ld h2, .ld p { margin: 0; }
.ld-wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }

.ld-nav {
  position: sticky; top: 0; z-index: 200;
  background: rgba(250,249,246,0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
  padding-top: env(safe-area-inset-top);
}
.ld-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.ld-logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; letter-spacing: -0.02em; }
.ld-nav-links { display: flex; gap: 26px; font-size: 14px; font-weight: 500; color: var(--ink-2); }
.ld-nav-links a:hover { color: var(--ink); }
.ld-btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--ink); color: #fff;
  padding: 10px 20px; border-radius: 999px;
  font-size: 14px; font-weight: 600;
  transition: transform .15s ease, box-shadow .15s ease;
}
.ld-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
.ld-ghost { background: transparent; color: var(--ink); border: 1.5px solid rgba(0,0,0,0.14); }
.ld-ghost:hover { border-color: rgba(0,0,0,0.3); box-shadow: none; }
.ld-inv { background: #fff; color: var(--ink); }
/* Anchor buttons must not inherit surrounding text color */
.ld a.ld-btn { color: #fff; }
.ld a.ld-ghost, .ld a.ld-inv { color: var(--ink); }
@media (max-width: 720px) { .ld-nav-links { display: none; } }

/* padding-block, not the padding shorthand: a shorthand with 0 for the inline
   sides also cancels .ld-wrap's 24px gutters. Invisible on desktop, where
   max-width centres the content, but edge-to-edge text on any screen narrower
   than 1120px. */
.ld-hero { padding-block: 72px 40px; display: grid; grid-template-columns: 1fr 400px; gap: 48px; align-items: center; }
@media (max-width: 920px) { .ld-hero { grid-template-columns: 1fr; padding-top: 48px; } }
.ld-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em;
  color: var(--ink-2);
  background: #fff; border: 1px solid var(--line);
  padding: 6px 14px; border-radius: 999px; margin-bottom: 22px;
}
.ld-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }
.ld h1 {
  font-size: clamp(38px, 5.2vw, 58px);
  line-height: 1.05; letter-spacing: -0.035em; font-weight: 800;
  margin-bottom: 20px;
}
.ld-grad {
  background: linear-gradient(100deg, var(--accent-a), var(--accent-b));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.ld-sub { font-size: 17.5px; color: var(--ink-2); max-width: 460px; margin-bottom: 30px; }
.ld-cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 26px; }
.ld-trust { font-size: 13px; color: var(--ink-3); font-weight: 500; }
.ld-trust b { color: var(--ink-2); font-weight: 600; }

.ld-demo-col { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.ld-phone {
  width: 330px; height: 660px;
  background: #111;
  border-radius: 48px;
  padding: 10px;
  box-shadow: 0 30px 80px -20px rgba(26,26,26,0.45), 0 0 0 1px rgba(0,0,0,0.4);
  position: relative;
  flex-shrink: 0;
}
.ld-phone::after {
  content: ""; position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
  width: 110px; height: 24px; background: #111; border-radius: 999px; z-index: 60;
}
.ld-screen {
  width: 100%; height: 100%;
  border-radius: 40px; overflow: hidden;
  background: var(--bg);
  position: relative;
  display: flex; flex-direction: column;
}
.ld-map-area { position: relative; flex: 1; overflow: hidden; pointer-events: none; }
#ld-map { position: absolute; inset: 0; }
#ld-map .maplibregl-ctrl-attrib { font-size: 8px; opacity: 0.7; }
.ld-map-fallback {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 60% 40%, #eef2ec 0%, transparent 55%),
    radial-gradient(circle at 30% 70%, #eceff3 0%, transparent 50%),
    linear-gradient(#f2f1ec, #f2f1ec);
  display: none;
}

.ld-chips { position: absolute; top: 52px; left: 0; right: 0; z-index: 40; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.ld-chip-row { display: flex; gap: 6px; padding: 0 10px; overflow: hidden; }
.ld-chip {
  background: rgba(255,255,255,0.94); border: 1px solid var(--line);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border-radius: 999px; padding: 6px 12px;
  font-size: 11px; font-weight: 600; color: var(--ink-2); white-space: nowrap;
}
.ld-chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.ld-count-pill {
  position: absolute; top: 132px; left: 50%; transform: translateX(-50%); z-index: 40;
  background: rgba(255,255,255,0.94); border: 1px solid var(--line);
  border-radius: 999px; padding: 4px 12px; font-size: 10.5px; font-weight: 600; color: var(--ink-3);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: opacity .3s;
}

.ld-pin {
  width: 30px; height: 30px; border-radius: 50%;
  background: #fff;
  display: grid; place-items: center;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.22);
  border: 2.5px solid var(--pc, #999);
  transform: scale(0);
  transition: transform .35s cubic-bezier(.34,1.56,.64,1), opacity .4s ease;
  pointer-events: none;
  position: relative;
}
.ld-pin.in { transform: scale(1); }
.ld-pin.dim { opacity: 0.14; }
.ld-pin.star { z-index: 50; }
.ld-pin.star::before {
  content: ""; position: absolute; inset: -7px; border-radius: 50%;
  border: 2.5px solid var(--pc, #e85d75);
  animation: ld-halo 1.5s ease-out infinite;
}
@keyframes ld-halo {
  0% { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}
.ld-pin.bounce { animation: ld-bounce .5s ease; }
@keyframes ld-bounce { 0%,100% { transform: scale(1);} 40% { transform: scale(1.35);} }

.ld-fab {
  position: absolute; bottom: 14px; z-index: 45;
  width: 46px; height: 46px; border-radius: 50%;
  background: var(--ink); color: #fff;
  display: grid; place-items: center;
  box-shadow: 0 6px 18px rgba(0,0,0,0.28);
  transition: transform .2s;
}
.ld-fab.right { right: 12px; }
.ld-fab.left { left: 12px; }
.ld-fab.pulse { animation: ld-fabpulse 1s ease infinite; }
@keyframes ld-fabpulse { 0%,100% { transform: scale(1);} 50% { transform: scale(1.12);} }

.ld-sheet {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 55;
  height: 65%;
  background: #fff; border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.14);
  transform: translateY(105%);
  transition: transform .4s cubic-bezier(.32,.72,.33,1);
  display: flex; flex-direction: column;
}
.ld-sheet.open { transform: translateY(0); }
.ld-sheet-handle { width: 36px; height: 4px; background: #d9d6d0; border-radius: 999px; margin: 8px auto 4px; }
.ld-sheet-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 14px 8px; border-bottom: 1px solid var(--line);
  font-size: 12.5px; font-weight: 700;
}
.ld-sheet-head .x { color: #b5b1a9; font-size: 15px; font-weight: 400; }
.ld-chat-body { flex: 1; overflow: hidden; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.ld-bubble {
  max-width: 82%; padding: 8px 12px; border-radius: 16px;
  font-size: 12px; line-height: 1.45;
  opacity: 0; transform: translateY(8px);
  transition: opacity .3s, transform .3s;
}
.ld-bubble.show { opacity: 1; transform: none; }
.ld-bubble.user { align-self: flex-end; background: var(--ink); color: #fff; border-bottom-right-radius: 5px; }
.ld-bubble.ai { align-self: flex-start; background: #f4f2ee; color: var(--ink); border-bottom-left-radius: 5px; }
.ld-typing { display: inline-flex; gap: 4px; padding: 4px 2px; }
.ld-typing i { width: 6px; height: 6px; border-radius: 50%; background: #b5b1a9; animation: ld-blink 1.2s infinite; }
.ld-typing i:nth-child(2) { animation-delay: .2s; }
.ld-typing i:nth-child(3) { animation-delay: .4s; }
@keyframes ld-blink { 0%,80%,100% { opacity: .25;} 40% { opacity: 1;} }
.ld-ev-card {
  display: flex; gap: 9px; align-items: center;
  background: #fff; border: 1px solid var(--line);
  border-radius: 14px; padding: 8px 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  opacity: 0; transform: translateY(10px);
  transition: opacity .35s, transform .35s, border-color .3s, box-shadow .3s;
}
.ld-ev-card.show { opacity: 1; transform: none; }
.ld-ev-card.hot { border-color: var(--accent-b); box-shadow: 0 3px 14px rgba(232,93,117,0.25); }
.ld-ev-emoji {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  display: grid; place-items: center; font-size: 15px;
  background: rgba(232,93,117,0.13);
}
.ld-ev-t { font-size: 11.5px; font-weight: 600; line-height: 1.25; }
.ld-ev-m { font-size: 10px; color: var(--ink-3); margin-top: 1px; }

.ld-appnav {
  height: 54px; background: #fff; border-top: 1px solid var(--line);
  display: flex; align-items: center; justify-content: space-around;
  z-index: 46; position: relative;
  font-size: 8.5px; font-weight: 600; color: #b5b1a9;
}
.ld-appnav-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ld-appnav-item.on { color: var(--ink); }
.ld-appnav svg { width: 18px; height: 18px; }

.ld-demo-caption {
  font-size: 13.5px; color: var(--ink-2); font-weight: 500;
  min-height: 22px; text-align: center; transition: opacity .3s;
  display: flex; align-items: center; gap: 8px;
}
.ld-step-dots { display: inline-flex; gap: 5px; }
.ld-sd { width: 6px; height: 6px; border-radius: 50%; background: #d9d6d0; transition: background .3s; }
.ld-sd.on { background: var(--ink); }
.ld-replay {
  background: #fff; border: 1px solid var(--line);
  width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
  display: grid; place-items: center; color: var(--ink-2);
}
.ld-replay:hover { color: var(--ink); }

.ld-stats { padding-block: 56px 8px; }   /* keep .ld-wrap's inline gutters */
.ld-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 800px) { .ld-stat-grid { grid-template-columns: repeat(2, 1fr); } }
.ld-stat {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 22px 24px;
}
.ld-stat .v { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; }
.ld-stat .l { font-size: 13px; color: var(--ink-3); font-weight: 500; margin-top: 2px; }

/* Root cause of the mobile edge-to-edge text: the .ld-section selector (0,1,1)
   outranks .ld-wrap (0,1,0), so the shorthand's 0 stripped the inline gutters
   from every section on the page. padding-block leaves them alone.
   NOTE: this whole stylesheet is a JS template literal — no backticks in here. */
.ld section { display: block; padding-block: 72px; }
.ld-sec-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-a); margin-bottom: 12px; }
.ld h2 { font-size: clamp(28px, 3.4vw, 38px); letter-spacing: -0.03em; font-weight: 800; line-height: 1.12; margin-bottom: 14px; }
.ld-sec-sub { font-size: 16px; color: var(--ink-2); max-width: 560px; margin-bottom: 40px; }

.ld-feat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
@media (max-width: 800px) { .ld-feat-grid { grid-template-columns: 1fr; } }
.ld-feat {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 28px;
  transition: transform .2s, box-shadow .2s;
}
.ld-feat:hover { transform: translateY(-3px); box-shadow: 0 14px 40px -14px rgba(26,26,26,0.16); }
.ld-feat .ic {
  width: 44px; height: 44px; border-radius: 13px;
  display: grid; place-items: center; font-size: 20px; margin-bottom: 16px;
}
.ld-feat h3 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 7px; }
.ld-feat p { font-size: 14px; color: var(--ink-2); }

.ld-fresh {
  background: var(--card); border: 1px solid var(--line); border-radius: 28px;
  padding: 48px 40px; text-align: center;
}
.ld-fresh p { font-size: 16px; color: var(--ink-2); max-width: 620px; margin: 0 auto; }
.ld-fresh h2 { margin-bottom: 12px; }
.ld-fresh .ld-sec-eyebrow { margin-bottom: 10px; }

.ld-final {
  background: var(--ink); color: #fff;
  border-radius: 28px; padding: 64px 40px; text-align: center;
  margin-bottom: 72px;
}
.ld-final h2 { color: #fff; margin-bottom: 10px; }
.ld-final p { color: rgba(255,255,255,0.65); margin-bottom: 28px; font-size: 16px; }
.ld-footer { border-top: 1px solid var(--line); padding: 28px 0 40px; }
.ld-foot-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--ink-3); }
.ld-foot-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--ink-2); }

@media (prefers-reduced-motion: reduce) {
  .ld *, .ld *::before, .ld *::after { animation: none !important; transition: none !important; }
}
`;
