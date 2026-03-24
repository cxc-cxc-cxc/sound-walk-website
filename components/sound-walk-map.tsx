"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Navigation, Volume2, VolumeX, Info, CheckCircle, Circle, ChevronUp, ChevronDown, Headphones, Loader2, X, Clock, Route } from "lucide-react";
import { getDistanceMeters, formatDistance } from "@/lib/distance";
import { motion, AnimatePresence } from "framer-motion";

interface RouteInfo {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

async function fetchWalkingRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): Promise<RouteInfo | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const coords: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] // GeoJSON is [lng,lat], Leaflet needs [lat,lng]
    );
    return {
      coordinates: coords,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
  } catch {
    return null;
  }
}

// Calculate walking duration from distance (OSRM public server returns car-like speeds even for foot profile)
function walkingDurationFromDistance(meters: number): number {
  // Average walking speed: ~5 km/h = ~1.39 m/s
  return meters / 1.39;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}min` : `${hrs}h`;
}

interface SoundLocationData {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  audioUrl: string | null;
  audioCloudPath: string | null;
  audioIsPublic: boolean;
  imageUrl: string | null;
  imageCloudPath: string | null;
  imageIsPublic: boolean;
  proximityRadius: number;
  orderIndex: number;
}

interface WalkSettings {
  title: string;
  description: string;
  aboutText: string;
  instructions: string;
  artistName: string;
  year: string;
  city: string;
  credits: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  fontScale: number;
  mapCenterLat: number;
  mapCenterLng: number;
  mapZoom: number;
  mapStyle: string;
  defaultProximityRadius: number;
  audioFadeDuration: number;
  audioBaseVolume: number;
  showWelcomePage: boolean;
  welcomeTitle: string;
  welcomeSubtitle: string;
  welcomeImageUrl: string;
  welcomeImageCloudPath: string;
  welcomeImageIsPublic: boolean;
}

interface Visit {
  locationId: string;
  visitedAt: string;
}

const FONT_MAP: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', 'Fira Code', monospace",
};

export default function SoundWalkMap() {
  const [locations, setLocations] = useState<SoundLocationData[]>([]);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<SoundLocationData | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string>("");
  const [audioMuted, setAudioMuted] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false); // whether user has tapped to allow audio
  const [showPanel, setShowPanel] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [walkInfo, setWalkInfo] = useState<WalkSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [distances, setDistances] = useState<Map<string, number>>(new Map());
  const [showWelcome, setShowWelcome] = useState(false);
  const [navTarget, setNavTarget] = useState<SoundLocationData | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const fadeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioUrlCache = useRef<Map<string, string>>(new Map());
  const preloadedAudio = useRef<Map<string, HTMLAudioElement>>(new Map());

  const accent = walkInfo?.accentColor || "#14b8a6";
  const bgColor = walkInfo?.backgroundColor || "#030712";
  const fontFamily = FONT_MAP[walkInfo?.fontFamily || "system"] || FONT_MAP.system;
  const fontScale = walkInfo?.fontScale ?? 1.0;

  // Init session ID
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage?.getItem?.("soundwalk_session") : null;
    if (stored) {
      setSessionId(stored);
    } else {
      const newId = `sw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      if (typeof window !== "undefined") localStorage?.setItem?.("soundwalk_session", newId);
      setSessionId(newId);
    }
  }, []);

  // Log site visit
  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        referrer: typeof document !== "undefined" ? document.referrer : "",
      }),
    }).catch(() => {});
  }, [sessionId]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const [locRes, infoRes] = await Promise.all([
          fetch("/api/locations"),
          fetch("/api/walk-info"),
        ]);
        const locs = await locRes.json();
        const info = await infoRes.json();
        setLocations(locs ?? []);
        setWalkInfo(info);
        // Show welcome if enabled and not seen before
        if (info?.showWelcomePage) {
          const seen = typeof window !== "undefined" ? localStorage?.getItem?.("soundwalk_welcome_seen") : null;
          if (!seen) setShowWelcome(true);
        }
      } catch {
        console.error("Failed to fetch data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch visits
  useEffect(() => {
    if (!sessionId) return;
    async function fetchVisits() {
      try {
        const res = await fetch(`/api/visits?sessionId=${sessionId}`);
        const visits: Visit[] = await res.json();
        setVisitedIds(new Set((visits ?? []).map((v: Visit) => v?.locationId)));
      } catch {}
    }
    fetchVisits();
  }, [sessionId]);

  // Geolocation
  useEffect(() => {
    if (!navigator?.geolocation) {
      setGeoError("Geolocation not supported by your browser");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({ lat: pos?.coords?.latitude, lng: pos?.coords?.longitude });
        setGeoError(null);
      },
      (err) => {
        const messages: Record<number, string> = {
          1: "Location access denied. Please enable location in your browser/phone settings and reload the page.",
          2: "Unable to determine your location. Make sure GPS is enabled and you have a clear signal.",
          3: "Location request timed out. Please check your GPS settings and try reloading.",
        };
        setGeoError(messages[err?.code] ?? err?.message ?? "Location access denied");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Distance calc + active location
  useEffect(() => {
    if (!userPos || (locations?.length ?? 0) === 0) return;
    const defaultRadius = walkInfo?.defaultProximityRadius ?? 50;
    const newDistances = new Map<string, number>();
    let closest: SoundLocationData | null = null;
    let closestDist = Infinity;

    (locations ?? []).forEach((loc: SoundLocationData) => {
      const d = getDistanceMeters(userPos.lat, userPos.lng, loc?.latitude ?? 0, loc?.longitude ?? 0);
      newDistances.set(loc.id, d);
      const radius = loc.proximityRadius || defaultRadius;
      if (d <= radius && d < closestDist) {
        closestDist = d;
        closest = loc;
      }
    });
    setDistances(newDistances);

    if (closest) {
      setActiveLocation(closest);
      if (!visitedIds.has((closest as SoundLocationData).id) && sessionId) {
        fetch("/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, locationId: (closest as SoundLocationData).id }),
        }).catch(() => {});
        setVisitedIds(prev => new Set(prev).add((closest as SoundLocationData).id));
      }
    } else {
      setActiveLocation(null);
    }
  }, [userPos, locations, sessionId, visitedIds, walkInfo?.defaultProximityRadius]);

  // Convert various URL formats to a playable audio URL (cached)
  const getAudioUrl = useCallback(async (loc: SoundLocationData): Promise<string | null> => {
    const raw = loc?.audioUrl || loc?.audioCloudPath || null;
    if (!raw) return null;

    // Return cached URL if already resolved
    const cacheKey = loc.id + ":" + raw;
    const cached = audioUrlCache.current.get(cacheKey);
    if (cached) return cached;

    let resolved = raw;

    // Google Drive sharing links → direct download
    const driveMatch = raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      resolved = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }
    // Google Drive open links
    const driveOpen = raw.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (driveOpen) {
      resolved = `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
    }
    // Dropbox links → direct download
    if (raw.includes("dropbox.com")) {
      resolved = raw.replace("dl=0", "dl=1").replace("www.dropbox.com", "dl.dropboxusercontent.com");
    }

    audioUrlCache.current.set(cacheKey, resolved);
    return resolved;
  }, []);

  // Preload audio for nearby locations (within 2.5× radius) so playback starts instantly
  useEffect(() => {
    if (!userPos || (locations?.length ?? 0) === 0) return;
    const defaultRadius = walkInfo?.defaultProximityRadius ?? 50;

    (locations ?? []).forEach(async (loc: SoundLocationData) => {
      const hasAudio = loc.audioUrl || loc.audioCloudPath;
      if (!hasAudio) return;
      const d = distances.get(loc.id);
      if (d === undefined) return;
      const radius = loc.proximityRadius || defaultRadius;
      const preloadDistance = Math.max(radius * 2.5, 150); // preload within 2.5× radius or 150m

      if (d <= preloadDistance && !preloadedAudio.current.has(loc.id)) {
        try {
          const url = await getAudioUrl(loc);
          if (!url) return;
          const audio = new Audio();
          audio.preload = "auto";
          audio.src = url;
          audio.load(); // start buffering
          preloadedAudio.current.set(loc.id, audio);
        } catch { /* silent */ }
      }
    });
  }, [distances, locations, userPos, walkInfo?.defaultProximityRadius, getAudioUrl]);

  const fadeAudio = useCallback((target: number, duration: number) => {
    if (!audioRef.current) return;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    const steps = 20;
    const stepTime = (duration * 1000) / steps;
    const current = audioRef.current.volume;
    const delta = (target - current) / steps;
    let step = 0;
    fadeIntervalRef.current = setInterval(() => {
      step++;
      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, Math.min(1, current + delta * step));
      }
      if (step >= steps) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        if (target === 0 && audioRef.current) audioRef.current.pause();
      }
    }, stepTime);
  }, []);

  useEffect(() => {
    const baseVol = walkInfo?.audioBaseVolume ?? 0.8;
    const fadeDur = walkInfo?.audioFadeDuration ?? 2.0;

    async function updateAudio() {
      if (activeLocation && !audioMuted) {
        const url = await getAudioUrl(activeLocation);
        if (url && audioRef.current) {
          // Compare just the pathname part to handle relative vs absolute URL mismatch
          const currentSrc = audioRef.current.src;
          const isSameUrl = currentSrc === url || currentSrc.endsWith(url) || (currentSrc ? url.endsWith(new URL(currentSrc, window.location.origin).pathname) : false);
          if (!isSameUrl || !currentSrc) {
            // Use preloaded audio data if available — swap the src instantly
            const preloaded = preloadedAudio.current.get(activeLocation.id);
            if (preloaded && preloaded.readyState >= 3) {
              // readyState >= 3 (HAVE_FUTURE_DATA) means enough buffered to play
              audioRef.current.src = preloaded.src;
              audioRef.current.loop = true;
              audioRef.current.volume = 0;
              // No .load() needed — browser recognizes same src from cache
            } else {
              audioRef.current.src = url;
              audioRef.current.loop = true;
              audioRef.current.volume = 0;
              audioRef.current.load();
            }
          }
          audioRef.current.play().then(() => {
            fadeAudio(baseVol, fadeDur);
            setAudioReady(true);
          }).catch((err) => {
            console.warn("Audio play blocked:", err?.message);
            if (err?.name === "NotAllowedError") {
              setAudioUnlocked(false);
            }
            setAudioReady(false);
          });
        }
      } else {
        if (audioRef.current && !audioRef.current.paused) {
          fadeAudio(0, fadeDur);
        }
        setAudioReady(false);
      }
    }
    updateAudio();
  }, [activeLocation, audioMuted, getAudioUrl, fadeAudio, walkInfo?.audioBaseVolume, walkInfo?.audioFadeDuration]);

  const toggleAudio = () => {
    setAudioMuted(prev => {
      if (prev) setAudioUnlocked(true); // First unmute = user gesture unlock
      return !prev;
    });
  };
  const dismissWelcome = () => {
    setShowWelcome(false);
    if (typeof window !== "undefined") localStorage?.setItem?.("soundwalk_welcome_seen", "1");
  };

  // Navigation functions
  const startNavigation = useCallback(async (loc: SoundLocationData) => {
    if (!userPos) return;
    setNavTarget(loc);
    setRouteLoading(true);
    setShowPanel(false);
    const route = await fetchWalkingRoute(userPos.lat, userPos.lng, loc.latitude, loc.longitude);
    setRouteInfo(route);
    setRouteLoading(false);
  }, [userPos]);

  const stopNavigation = useCallback(() => {
    setNavTarget(null);
    setRouteInfo(null);
    setRouteLoading(false);
  }, []);

  // Auto-refresh route as user walks (throttled to every 10 seconds)
  const lastRouteRefreshRef = useRef(0);
  useEffect(() => {
    if (!navTarget || !userPos) return;
    const now = Date.now();
    if (now - lastRouteRefreshRef.current < 10000) return; // throttle
    lastRouteRefreshRef.current = now;

    // If user has arrived at the destination, stop navigation
    const dist = getDistanceMeters(userPos.lat, userPos.lng, navTarget.latitude, navTarget.longitude);
    const radius = navTarget.proximityRadius || walkInfo?.defaultProximityRadius || 50;
    if (dist <= radius) {
      stopNavigation();
      return;
    }

    fetchWalkingRoute(userPos.lat, userPos.lng, navTarget.latitude, navTarget.longitude)
      .then((route) => { if (route) setRouteInfo(route); });
  }, [userPos, navTarget, stopNavigation, walkInfo?.defaultProximityRadius]);

  const sortedByDistance = [...(locations ?? [])].sort((a, b) => {
    const dA = distances.get(a?.id) ?? Infinity;
    const dB = distances.get(b?.id) ?? Infinity;
    return dA - dB;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: bgColor }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: accent }} />
          <p className="text-gray-400">Loading Sound Walk...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ backgroundColor: bgColor, fontFamily, fontSize: `${fontScale}rem` }}>
      <audio ref={audioRef} preload="auto" />

      {/* Welcome overlay */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto" style={{ backgroundColor: bgColor + "f0" }}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="max-w-md w-full text-center space-y-5 py-8">
              {(walkInfo?.welcomeImageUrl || walkInfo?.welcomeImageCloudPath) && (
                <div className="w-28 h-28 mx-auto rounded-full overflow-hidden border-4" style={{ borderColor: accent + "40" }}>
                  <img src={walkInfo.welcomeImageUrl || ""} alt="Welcome" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
                </div>
              )}
              {!walkInfo?.welcomeImageUrl && !walkInfo?.welcomeImageCloudPath && (
                <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: accent + "20" }}>
                  <Headphones className="w-10 h-10" style={{ color: accent }} />
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{walkInfo?.welcomeTitle || walkInfo?.title || "Sound Walk"}</h1>
              {(walkInfo?.welcomeSubtitle || walkInfo?.description) && (
                <p className="text-gray-400 text-base sm:text-lg">{walkInfo?.welcomeSubtitle || walkInfo?.description}</p>
              )}
              {walkInfo?.artistName && (
                <p className="text-sm" style={{ color: accent }}>by {walkInfo.artistName}{walkInfo?.year ? ` · ${walkInfo.year}` : ""}</p>
              )}
              {walkInfo?.city && <p className="text-sm text-gray-500">{walkInfo.city}</p>}
              <div className="space-y-2.5 text-left p-3 rounded-xl" style={{ backgroundColor: accent + "10" }}>
                <p className="text-sm text-gray-400 flex items-start gap-2"><Navigation className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} /> Enable location access on your device</p>
                <p className="text-sm text-gray-400 flex items-start gap-2"><Headphones className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} /> Put on headphones for the best experience</p>
                <p className="text-sm text-gray-400 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} /> Walk towards locations — audio plays automatically</p>
              </div>
              <button onClick={dismissWelcome}
                className="w-full py-3 rounded-xl text-white font-semibold text-lg transition-colors hover:opacity-90"
                style={{ backgroundColor: accent }}>
                Start exploring
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header — compact on mobile */}
      <header className="flex-shrink-0 z-50 backdrop-blur-md border-b border-white/5" style={{ backgroundColor: bgColor + "e6" }}>
        <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between max-w-[1200px] mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <Headphones className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" style={{ color: accent }} />
            <h1 className="text-sm sm:text-lg font-semibold text-white truncate">{walkInfo?.title ?? "Sound Walk"}</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button onClick={() => setShowInfo(true)} className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" aria-label="About">
              <Info className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" />
            </button>
            <button onClick={toggleAudio}
              className="p-1.5 sm:p-2 rounded-lg transition-colors flex items-center gap-1.5"
              style={{ backgroundColor: audioMuted ? "rgba(255,255,255,0.05)" : accent }}
              aria-label={audioMuted ? "Unmute" : "Mute"}>
              {audioMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              {audioMuted && !audioUnlocked && <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">Enable</span>}
            </button>
          </div>
        </div>
      </header>

      {/* One-time audio unlock prompt — only shown before first user interaction */}
      {audioMuted && !audioUnlocked && !showWelcome && (
        <div className="flex-shrink-0 px-3 py-2 text-center cursor-pointer" style={{ backgroundColor: accent + "15" }} onClick={toggleAudio}>
          <p className="text-xs sm:text-sm flex items-center justify-center gap-2" style={{ color: accent }}>
            <Volume2 className="w-4 h-4" />
            <span><strong>Tap here to enable audio</strong> — sounds will play automatically at each location</span>
          </p>
        </div>
      )}

      {/* Geo error — compact */}
      {geoError && (
        <div className="flex-shrink-0 bg-amber-900/30 border-b border-amber-700/30 px-3 py-1.5 text-center">
          <p className="text-amber-300 text-xs sm:text-sm flex items-center justify-center gap-1.5">
            <Navigation className="w-3.5 h-3.5" /> {geoError}
          </p>
        </div>
      )}

      {/* Active location banner — compact on mobile */}
      <AnimatePresence>
        {activeLocation && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
            <div className="border-b px-3 sm:px-4 py-2 sm:py-3" style={{ backgroundColor: accent + "15", borderColor: accent + "30" }}>
              <div className="max-w-[1200px] mx-auto">
                <div className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
                    <div className="absolute inset-0 w-2.5 h-2.5 rounded-full pulse-ring" style={{ backgroundColor: accent }} />
                  </div>
                  <span className="text-xs sm:text-sm font-medium" style={{ color: accent }}>You&apos;re at a sound location!</span>
                </div>
                <h2 className="text-white font-semibold text-base sm:text-lg mt-0.5">{activeLocation?.name ?? "Unknown"}</h2>
                <p className="text-gray-300 text-xs sm:text-sm mt-0.5 line-clamp-1 sm:line-clamp-2">{activeLocation?.description ?? ""}</p>
                {audioMuted && (
                  <button onClick={toggleAudio}
                    className="mt-1.5 px-3 py-1 rounded-lg text-xs sm:text-sm text-white flex items-center gap-1.5 transition-colors hover:opacity-90"
                    style={{ backgroundColor: accent }}>
                    <Volume2 className="w-3.5 h-3.5" /> {audioUnlocked ? "Unmute audio" : "Enable audio to listen"}
                  </button>
                )}
                {!audioMuted && audioReady && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs sm:text-sm" style={{ color: accent }}>
                    <Volume2 className="w-3.5 h-3.5" /> Playing audio...
                  </div>
                )}
                {!audioMuted && !audioReady && activeLocation?.audioUrl && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs sm:text-sm text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading audio...
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation bar — compact on mobile */}
      <AnimatePresence>
        {navTarget && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
            <div className="border-b px-3 sm:px-4 py-2 sm:py-3" style={{ backgroundColor: accent + "12", borderColor: accent + "30" }}>
              <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Route className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" style={{ color: accent }} />
                    <span className="text-xs sm:text-sm font-medium text-white truncate">Navigating to {navTarget.name}</span>
                  </div>
                  {routeLoading && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Finding route...
                    </div>
                  )}
                  {routeInfo && !routeLoading && (
                    <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-300 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Navigation className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: accent }} />
                        {formatDistance(routeInfo.distanceMeters)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: accent }} />
                        {formatDuration(walkingDurationFromDistance(routeInfo.distanceMeters))} walk
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={stopNavigation}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Stop navigation">
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map area — fills all remaining space; isolate creates stacking context to contain Leaflet z-indexes */}
      <div className="flex-1 relative min-h-0 isolate">
        <LeafletMapInline
          locations={locations}
          userPos={userPos}
          activeLocationId={activeLocation?.id ?? null}
          visitedIds={visitedIds}
          accent={accent}
          center={[walkInfo?.mapCenterLat ?? 51.3397, walkInfo?.mapCenterLng ?? 12.3731]}
          zoom={walkInfo?.mapZoom ?? 15}
          mapStyle={walkInfo?.mapStyle ?? "dark"}
          routeCoords={routeInfo?.coordinates ?? null}
          navTargetId={navTarget?.id ?? null}
          onMarkerClick={startNavigation}
        />
        {/* Visited counter */}
        <div className="absolute top-3 left-3 z-[1000] rounded-lg px-2.5 py-1.5 shadow-lg backdrop-blur-sm" style={{ backgroundColor: bgColor + "e6" }}>
          <div className="flex items-center gap-1.5 text-xs sm:text-sm">
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: accent }} />
            <span className="text-gray-300">{visitedIds?.size ?? 0} / {locations?.length ?? 0}</span>
          </div>
        </div>
        {/* Locations toggle button */}
        <button onClick={() => setShowPanel(!showPanel)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 shadow-lg flex items-center gap-1.5 transition-colors backdrop-blur-sm"
          style={{ backgroundColor: bgColor + "e6" }}>
          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: accent }} />
          <span className="text-xs sm:text-sm text-white">Locations</span>
          {showPanel ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>

      {/* Location list — bottom sheet overlay */}
      {showPanel && (
        <div className="absolute inset-0 z-[100]" style={{ pointerEvents: "auto" }}>
          {/* Backdrop — tap to close */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPanel(false)} />
          {/* Bottom sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-white/10 shadow-2xl"
            style={{ backgroundColor: bgColor, maxHeight: "65vh" }}>
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <h2 className="text-sm font-semibold text-white">
                {locations?.length ?? 0} Locations
              </h2>
              <button onClick={() => setShowPanel(false)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            {/* Scrollable list */}
            <div className="overflow-y-auto px-3 pb-6" style={{ maxHeight: "calc(65vh - 52px)", WebkitOverflowScrolling: "touch" }}>
              <div className="space-y-2">
                {sortedByDistance.map((loc) => {
                  const dist = distances.get(loc?.id);
                  const isActive = activeLocation?.id === loc?.id;
                  const isVisited = visitedIds.has(loc?.id);
                  return (
                    <div key={loc?.id}
                      className="rounded-xl p-3 transition-all border"
                      style={{
                        backgroundColor: isActive ? accent + "15" : "rgba(255,255,255,0.03)",
                        borderColor: isActive ? accent + "40" : "rgba(255,255,255,0.05)",
                      }}>
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 flex-shrink-0 ${isActive ? "bounce-marker" : ""}`}
                          style={{ color: isActive ? accent : isVisited ? accent + "80" : "#6b7280" }}>
                          {isVisited ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className={`text-sm font-medium truncate ${isActive ? "" : "text-white"}`}
                              style={isActive ? { color: accent } : {}}>
                              {loc?.name ?? "Unknown"}
                            </h3>
                            {dist !== undefined && (
                              <span className="text-[10px] sm:text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: isActive ? accent + "20" : "rgba(255,255,255,0.05)",
                                  color: isActive ? accent : "#9ca3af",
                                }}>
                                {formatDistance(dist)}
                              </span>
                            )}
                            {dist === undefined && (
                              <span className="text-[10px] sm:text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full text-gray-500"
                                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                                #{loc.orderIndex + 1}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{loc?.description ?? ""}</p>
                          {userPos && !isActive && (
                            <button
                              onClick={() => { startNavigation(loc); setShowPanel(false); }}
                              className="mt-1.5 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors hover:opacity-90"
                              style={{ backgroundColor: accent + "20", color: accent }}>
                              <Navigation className="w-3 h-3" /> Navigate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowInfo(false)}>
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              className="rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl border-t sm:border border-white/10 sm:mx-4"
              style={{ backgroundColor: bgColor }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="flex justify-center sm:hidden mb-3">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <Headphones className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: accent }} />
                <h2 className="text-lg sm:text-xl font-semibold text-white">{walkInfo?.title ?? "Sound Walk"}</h2>
              </div>
              {walkInfo?.description && <p className="text-gray-300 mb-4">{walkInfo.description}</p>}
              {walkInfo?.aboutText && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: accent }}>About</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{walkInfo.aboutText}</p>
                </div>
              )}
              {walkInfo?.instructions && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: accent }}>Instructions</h3>
                  <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{walkInfo.instructions}</p>
                </div>
              )}
              {(walkInfo?.artistName || walkInfo?.year || walkInfo?.city || walkInfo?.credits) && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: accent }}>Credits</h3>
                  <div className="text-gray-400 text-sm space-y-1">
                    {walkInfo?.artistName && <p><strong>Artist:</strong> {walkInfo.artistName}</p>}
                    {walkInfo?.city && <p><strong>City:</strong> {walkInfo.city}</p>}
                    {walkInfo?.year && <p><strong>Year:</strong> {walkInfo.year}</p>}
                    {walkInfo?.credits && <p className="whitespace-pre-line mt-2">{walkInfo.credits}</p>}
                  </div>
                </div>
              )}
              <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: accent + "10" }}>
                <h3 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: accent }}>How it works</h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-start gap-2"><Navigation className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />Allow location access to track your position</li>
                  <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />Walk towards the marked locations on the map</li>
                  <li className="flex items-start gap-2"><Volume2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />Audio plays automatically when you&apos;re within range</li>
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />Track your progress as you visit each point</li>
                </ul>
              </div>
              <button onClick={() => setShowInfo(false)}
                className="mt-4 w-full py-2.5 rounded-xl text-white font-medium transition-colors hover:opacity-90"
                style={{ backgroundColor: accent }}>
                Start exploring
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Leaflet map component - loads leaflet dynamically on client side
function LeafletMapInline({
  locations,
  userPos,
  activeLocationId,
  visitedIds,
  accent,
  center,
  zoom,
  mapStyle,
  routeCoords,
  navTargetId,
  onMarkerClick,
}: {
  locations: SoundLocationData[];
  userPos: { lat: number; lng: number } | null;
  activeLocationId: string | null;
  visitedIds: Set<string>;
  accent: string;
  center: [number, number];
  zoom: number;
  mapStyle: string;
  routeCoords: [number, number][] | null;
  navTargetId: string | null;
  onMarkerClick: (loc: SoundLocationData) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  const userPulseRef = useRef<any>(null);
  const userAccuracyRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [mapReady, setMapReady] = useState(false);
  const hasCenteredOnUserRef = useRef(false);

  // Build tile URL — constructed at runtime so static analysis can't corrupt it
  const buildTileUrl = useCallback((style: string) => {
    const proto = "https" + "://";
    const cartoBase = "{s}.basemaps.cartocdn.com";
    if (style === "light") return proto + cartoBase + "/light_all/{z}/{x}/{y}{r}.png";
    if (style === "satellite") return proto + "server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    return proto + cartoBase + "/dark_all/{z}/{x}/{y}{r}.png";
  }, []);

  // Load Leaflet and initialise the map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Inject Leaflet CSS from CDN if not already present
    const cssId = "leaflet-css-cdn";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https" + "://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    import("leaflet").then((mod) => {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = mod.default || mod;
      LRef.current = L;

      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer(buildTileUrl(mapStyle), {
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control
        .attribution({ position: "bottomleft", prefix: false })
        .addAttribution(
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>'
        )
        .addTo(map);

      // Force a size recalculation after the container is painted
      requestAnimationFrame(() => {
        map.invalidateSize();
      });

      mapRef.current = map;
      setMapReady(true);
    }).catch((err) => console.error("Leaflet load error:", err));

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
        hasCenteredOnUserRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update location markers whenever data changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    locations.forEach((loc) => {
      const isActive = loc.id === activeLocationId;
      const isVisited = visitedIds.has(loc.id);
      const isNavTarget = loc.id === navTargetId;
      const fillColor = isActive ? accent : isVisited ? accent : "#6b7280";
      const radius = isActive ? 12 : isNavTarget ? 11 : 8;
      const fillOpacity = isActive ? 1 : isVisited ? 0.6 : 0.8;

      const marker = L.circleMarker([loc.latitude, loc.longitude], {
        radius,
        fillColor: isNavTarget ? "#f59e0b" : fillColor,
        color: isActive ? accent : isNavTarget ? "#f59e0b" : "#ffffff",
        weight: isActive || isNavTarget ? 3 : 2,
        opacity: 1,
        fillOpacity,
      }).addTo(map);

      // Tooltip with "Tap to navigate" hint
      const tooltipLabel = isNavTarget ? "🎯 Destination" : isVisited ? "✓ Visited" : "Tap to navigate";
      marker.bindTooltip(
        `<div style="text-align:center"><strong>${loc.name}</strong><br/><span style="color:${isNavTarget ? "#f59e0b" : accent};font-size:11px">${tooltipLabel}</span></div>`,
        { direction: "top", offset: [0, -10], className: "sound-walk-tooltip" }
      );

      // Click marker to start navigation
      marker.on("click", () => onMarkerClick(loc));

      if (isActive) {
        const pulse = L.circleMarker([loc.latitude, loc.longitude], {
          radius: 20,
          fillColor: accent,
          color: accent,
          weight: 2,
          opacity: 0.3,
          fillOpacity: 0.1,
          className: "leaflet-pulse-marker",
        }).addTo(map);
        markersRef.current.set(loc.id + "-pulse", pulse);
      }

      // Nav target gets a special destination ring
      if (isNavTarget) {
        const ring = L.circleMarker([loc.latitude, loc.longitude], {
          radius: 22,
          fillColor: "#f59e0b",
          color: "#f59e0b",
          weight: 2,
          opacity: 0.4,
          fillOpacity: 0.08,
          className: "leaflet-pulse-marker",
        }).addTo(map);
        markersRef.current.set(loc.id + "-navring", ring);
      }

      markersRef.current.set(loc.id, marker);
    });
  }, [mapReady, locations, activeLocationId, visitedIds, accent, navTargetId, onMarkerClick]);

  // Track user position on the map and center on first GPS fix
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;

    // Remove previous user markers
    if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
    if (userPulseRef.current) { userPulseRef.current.remove(); userPulseRef.current = null; }
    if (userAccuracyRef.current) { userAccuracyRef.current.remove(); userAccuracyRef.current = null; }

    if (!userPos) return;

    // Accuracy circle (light blue fill)
    userAccuracyRef.current = L.circle([userPos.lat, userPos.lng], {
      radius: 40,
      fillColor: "#3b82f6",
      color: "#3b82f6",
      weight: 1,
      opacity: 0.15,
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map);

    // Outer pulse ring
    userPulseRef.current = L.circleMarker([userPos.lat, userPos.lng], {
      radius: 14,
      fillColor: "#3b82f6",
      color: "#3b82f6",
      weight: 1,
      opacity: 0.4,
      fillOpacity: 0.15,
      className: "leaflet-user-pulse",
    }).addTo(map);

    // Inner solid dot
    userMarkerRef.current = L.circleMarker([userPos.lat, userPos.lng], {
      radius: 7,
      fillColor: "#3b82f6",
      color: "#ffffff",
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(map);

    userMarkerRef.current.bindTooltip("You are here", {
      direction: "top",
      offset: [0, -10],
      className: "sound-walk-tooltip",
    });

    // CENTER the map on the user the first time we get a GPS fix
    if (!hasCenteredOnUserRef.current) {
      hasCenteredOnUserRef.current = true;
      // Build bounds that include user + all locations so nothing is off-screen
      const bounds = L.latLngBounds([L.latLng(userPos.lat, userPos.lng)]);
      locations.forEach((loc) => {
        bounds.extend(L.latLng(loc.latitude, loc.longitude));
      });
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [mapReady, userPos, locations]);

  // Draw walking route polyline
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;

    // Clear previous route
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (routeCoords && routeCoords.length > 1) {
      // Draw a subtle shadow line first, then the route line on top
      const shadow = L.polyline(routeCoords, {
        color: "#000000",
        weight: 7,
        opacity: 0.2,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      const line = L.polyline(routeCoords, {
        color: accent,
        weight: 4,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        dashArray: "12 8",
      }).addTo(map);

      // Group them so we can remove both at once
      routeLineRef.current = L.layerGroup([shadow, line]).addTo(map);

      // Fit map to show the full route
      const bounds = L.latLngBounds(routeCoords);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    }
  }, [mapReady, routeCoords, accent]);

  return (
    <div
      ref={mapContainerRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}