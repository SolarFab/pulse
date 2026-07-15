"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Event, CATEGORIES } from "@/lib/types";

interface Props {
  events: Event[];
  selectedEvent: Event | null;
  highlightedEvent: Event | null;
  onSelectEvent: (event: Event | null) => void;
  onSelectVenueEvents?: (events: Event[]) => void;
  homeLocation?: { lat: number; lng: number } | null;
}

const BERLIN_CENTER: [number, number] = [13.405, 52.52];
const SOURCE_ID = "events-source";
const LAYER_ID = "events-layer";
const SELECTED_LAYER_ID = "events-selected-layer";
const PULSE_SOURCE_ID = "pulse-source";
const PULSE_LAYER_ID = "pulse-layer";

const PIN_SIZE = 30;
const PIN_SIZE_SELECTED = 40;
const PIN_SCALE = 2; // render at 2x, register with pixelRatio 2 for crisp icons

/**
 * Landing-page style pin: white disc, colored category ring, emoji inside.
 * Drawn on a canvas so MapLibre can render it as a WebGL symbol icon
 * (color emoji aren't available through SDF glyph fonts).
 */
function makePinImage(emoji: string, color: string, size: number): ImageData {
  const s = size * PIN_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const r = s / 2;
  const pad = 3.5 * PIN_SCALE; // room for ring + shadow

  // soft drop shadow
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 2.5 * PIN_SCALE;
  ctx.shadowOffsetY = 1 * PIN_SCALE;

  // white disc
  ctx.beginPath();
  ctx.arc(r, r, r - pad, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // colored ring
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2.5 * PIN_SCALE;
  ctx.strokeStyle = color;
  ctx.stroke();

  // emoji
  ctx.font = `${Math.round(size * 0.47) * PIN_SCALE}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, r, r + 1 * PIN_SCALE);

  return ctx.getImageData(0, 0, s, s);
}

function addPinImages(m: maplibregl.Map) {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (!m.hasImage(`pin-${key}`)) {
      m.addImage(`pin-${key}`, makePinImage(cat.emoji, cat.color, PIN_SIZE), {
        pixelRatio: PIN_SCALE,
      });
    }
    if (!m.hasImage(`pin-sel-${key}`)) {
      m.addImage(
        `pin-sel-${key}`,
        makePinImage(cat.emoji, cat.color, PIN_SIZE_SELECTED),
        { pixelRatio: PIN_SCALE }
      );
    }
  }
}

export default function EventMap({
  events,
  selectedEvent,
  highlightedEvent,
  onSelectEvent,
  onSelectVenueEvents,
  homeLocation,
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapReady = useRef(false);
  const pulseAnimation = useRef<number | null>(null);

  // Click handlers are registered once on init; they read the latest props
  // through these refs instead of re-registering on every render (re-adding
  // named handlers via on/off leaks — the old function reference never matches).
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const onSelectEventRef = useRef(onSelectEvent);
  onSelectEventRef.current = onSelectEvent;
  const onSelectVenueEventsRef = useRef(onSelectVenueEvents);
  onSelectVenueEventsRef.current = onSelectVenueEvents;

  const buildGeoJSON = useCallback(
    (evts: Event[]): GeoJSON.FeatureCollection => {
      // Group events by location (rounded to ~10m) to show count badges
      const locKey = (e: Event) => `${e.lat!.toFixed(4)},${e.lng!.toFixed(4)}`;
      const geoEvents = evts.filter((e) => e.lat && e.lng);
      const locCounts: Record<string, number> = {};
      for (const e of geoEvents) {
        const key = locKey(e);
        locCounts[key] = (locCounts[key] || 0) + 1;
      }
      // Only show one pin per location (first event), with count
      const seen = new Set<string>();
      const features: GeoJSON.Feature[] = [];
      for (const e of geoEvents) {
        const key = locKey(e);
        const isSelected = e.id === selectedEvent?.id;
        if (!isSelected && seen.has(key)) continue;
        if (!isSelected) seen.add(key);
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lng!, e.lat!] },
          properties: {
            id: e.id,
            title: e.title,
            venue_name: e.venue_name,
            category: e.category,
            // icon lookup key — unknown categories fall back to culture
            pin: CATEGORIES[e.category] ? e.category : "culture",
            color: (CATEGORIES[e.category] || CATEGORIES.culture).color,
            emoji: (CATEGORIES[e.category] || CATEGORIES.culture).emoji,
            selected: isSelected ? 1 : 0,
            count: locCounts[key] || 1,
          },
        });
      }
      return { type: "FeatureCollection", features };
    },
    [selectedEvent]
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: homeLocation ? [homeLocation.lng, homeLocation.lat] : BERLIN_CENTER,
      zoom: homeLocation ? 13 : 12,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 10,
    });

    m.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      "top-right"
    );

    m.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "top-right"
    );

    m.on("load", () => {
      // Landing-page style emoji pins, generated per category
      addPinImages(m);

      // Events source + layers
      m.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer({
        id: LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["==", ["get", "selected"], 0],
        layout: {
          "icon-image": ["concat", "pin-", ["get", "pin"]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      m.addLayer({
        id: SELECTED_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["==", ["get", "selected"], 1],
        layout: {
          "icon-image": ["concat", "pin-sel-", ["get", "pin"]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      // Count badge for pins with multiple events — top-right corner of the disc
      m.addLayer({
        id: "events-count-layer",
        type: "symbol",
        source: SOURCE_ID,
        filter: [">=", ["get", "count"], 2],
        layout: {
          "text-field": ["get", "count"],
          "text-size": 10,
          "text-font": ["Open Sans Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-offset": [1.15, -1.15],
        },
        paint: {
          "text-color": "#1a1a1a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      // Pulse source + layer for highlighted events
      m.addSource(PULSE_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer(
        {
          id: PULSE_LAYER_ID,
          type: "circle",
          source: PULSE_SOURCE_ID,
          paint: {
            "circle-radius": 12,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.4,
            "circle-stroke-width": 0,
          },
        },
        LAYER_ID // render below event pins
      );

      mapReady.current = true;
      map.current = m;
    });

    // Click on pin — find all events at this venue (reads latest props via refs)
    m.on("click", LAYER_ID, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id;
      const evts = eventsRef.current;
      const evt = evts.find((ev) => ev.id === id);
      if (!evt) return;
      // Find all events at the same location
      const locKey = `${evt.lat!.toFixed(4)},${evt.lng!.toFixed(4)}`;
      const venueEvents = evts.filter(
        (ev) => ev.lat && ev.lng && `${ev.lat!.toFixed(4)},${ev.lng!.toFixed(4)}` === locKey
      );
      if (venueEvents.length > 1 && onSelectVenueEventsRef.current) {
        onSelectVenueEventsRef.current(venueEvents);
      } else {
        onSelectEventRef.current(evt);
      }
    });

    m.on("click", SELECTED_LAYER_ID, () => {
      onSelectEventRef.current(null);
    });

    m.on("mouseenter", LAYER_ID, () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", LAYER_ID, () => {
      m.getCanvas().style.cursor = "";
    });
    m.on("mouseenter", SELECTED_LAYER_ID, () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", SELECTED_LAYER_ID, () => {
      m.getCanvas().style.cursor = "";
    });

    m.on("click", (e) => {
      const features = m.queryRenderedFeatures(e.point, {
        layers: [LAYER_ID, SELECTED_LAYER_ID],
      });
      if (features.length === 0) {
        onSelectEventRef.current(null);
      }
    });

    map.current = m;

    return () => {
      if (pulseAnimation.current) cancelAnimationFrame(pulseAnimation.current);
      m.remove();
      map.current = null;
      mapReady.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const update = () => {
      const source = m.getSource(SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (source) {
        source.setData(buildGeoJSON(events));
      }
    };

    if (mapReady.current) {
      update();
    } else {
      m.on("load", update);
    }
  }, [events, selectedEvent, buildGeoJSON]);

  // Fly to selected
  useEffect(() => {
    if (!map.current || !selectedEvent?.lat || !selectedEvent?.lng) return;
    map.current.flyTo({
      center: [selectedEvent.lng, selectedEvent.lat],
      zoom: Math.max(map.current.getZoom(), 14),
      duration: 500,
    });
  }, [selectedEvent]);

  // Pulse animation for highlighted event (from chat hover)
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady.current) return;

    // Cancel previous animation
    if (pulseAnimation.current) {
      cancelAnimationFrame(pulseAnimation.current);
      pulseAnimation.current = null;
    }

    const pulseSource = m.getSource(PULSE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!pulseSource) return;

    if (!highlightedEvent?.lat || !highlightedEvent?.lng) {
      pulseSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Set pulse point
    const color = (
      CATEGORIES[highlightedEvent.category] || CATEGORIES.culture
    ).color;
    pulseSource.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [highlightedEvent.lng, highlightedEvent.lat],
          },
          properties: { color },
        },
      ],
    });

    // Fly to it
    m.flyTo({
      center: [highlightedEvent.lng, highlightedEvent.lat],
      zoom: Math.max(m.getZoom(), 14),
      duration: 600,
    });

    // Animate pulse
    let start: number | null = null;
    function animate(ts: number) {
      if (!m) return;
      if (!start) start = ts;
      const elapsed = (ts - start) % 1500; // 1.5s loop
      const t = elapsed / 1500;
      const radius = 12 + t * 25; // 12 → 37
      const opacity = 0.5 * (1 - t); // fade out

      m.setPaintProperty(PULSE_LAYER_ID, "circle-radius", radius);
      m.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", opacity);

      pulseAnimation.current = requestAnimationFrame(animate);
    }

    pulseAnimation.current = requestAnimationFrame(animate);

    return () => {
      if (pulseAnimation.current) {
        cancelAnimationFrame(pulseAnimation.current);
        pulseAnimation.current = null;
      }
    };
  }, [highlightedEvent]);

  return <div ref={mapContainer} className="w-full h-full touch-none" />;
}
