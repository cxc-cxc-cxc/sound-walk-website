"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Headphones, Plus, MapPin, Trash2, Edit3, Save, X, Upload, LogOut, Settings,
  Volume2, ArrowLeft, Loader2, ToggleLeft, ToggleRight, GripVertical,
  Palette, Map, Music, Layout, User, Image as ImageIcon, Radius,
  BarChart3, Users, Eye, TrendingUp, Clock, Activity
} from "lucide-react";

interface LocationData {
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
  isActive: boolean;
}

interface WalkInfo {
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

const DEFAULT_WALK_INFO: WalkInfo = {
  title: "", description: "", aboutText: "", instructions: "",
  artistName: "", year: "", city: "", credits: "",
  accentColor: "#14b8a6", backgroundColor: "#030712", fontFamily: "system", fontScale: 1.0,
  mapCenterLat: 0, mapCenterLng: 0, mapZoom: 15, mapStyle: "dark",
  defaultProximityRadius: 50, audioFadeDuration: 2.0, audioBaseVolume: 0.8,
  showWelcomePage: true, welcomeTitle: "", welcomeSubtitle: "",
  welcomeImageUrl: "", welcomeImageCloudPath: "", welcomeImageIsPublic: true,
};

const FONT_OPTIONS = [
  { value: "system", label: "System Default" },
  { value: "serif", label: "Serif (Georgia)" },
  { value: "mono", label: "Monospace" },
];

const MAP_STYLES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "satellite", label: "Satellite" },
];

interface AnalyticsData {
  totalVisitors: number;
  totalVisits: number;
  todayVisitors: number;
  weekVisitors: number;
  dailyBreakdown: { date: string; visitors: number; visits: number }[];
  locationStats: { name: string; visits: number }[];
  totalWalkers: number;
  completedWalkers: number;
  completionRate: number;
  recentVisits: { sessionId: string; userAgent: string; visitedAt: string; referrer: string }[];
  activeNow: number;
}

type Tab = "analytics" | "locations" | "info" | "theme" | "map" | "audio" | "welcome" | "metadata";

export default function AdminDashboard() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [walkInfo, setWalkInfo] = useState<WalkInfo>(DEFAULT_WALK_INFO);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LocationData>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<Partial<LocationData>>({ name: "", description: "", latitude: 0, longitude: 0, audioUrl: "", proximityRadius: 50, isActive: true });
  const [tab, setTab] = useState<Tab>("analytics");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/analytics");
      if (res.ok) setAnalytics(await res.json());
    } catch {} finally { setAnalyticsLoading(false); }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [locRes, infoRes] = await Promise.all([
        fetch("/api/locations/all"),
        fetch("/api/walk-info"),
      ]);
      if (locRes.ok) setLocations((await locRes.json()) ?? []);
      if (infoRes.ok) {
        const info = await infoRes.json();
        setWalkInfo({ ...DEFAULT_WALK_INFO, ...info });
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
      fetchAnalytics();
    }
  }, [status, fetchData, fetchAnalytics]);

  const showSaved = () => {
    setSaveMsg("Saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleUploadFile = async (locationId: string, file: File, type: "audio" | "image") => {
    if (!file) return;
    setUploading(`${type}-${locationId}`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await fetch("/api/upload/local", { method: "POST", body: formData });
      const { url } = await res.json();
      if (!url) throw new Error("Upload failed");

      const updateData: any = type === "audio"
        ? { audioUrl: url, audioCloudPath: null }
        : { imageUrl: url, imageCloudPath: null };
      await fetch(`/api/locations/${locationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      await fetchData();
    } catch (err) { console.error("Upload failed:", err); }
    finally { setUploading(null); }
  };

  const handleUploadWelcomeImage = async (file: File) => {
    if (!file) return;
    setUploading("welcome-image");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "image");
      const res = await fetch("/api/upload/local", { method: "POST", body: formData });
      const { url } = await res.json();
      if (!url) throw new Error("Upload failed");
      await handleSaveInfo({ welcomeImageUrl: url, welcomeImageCloudPath: "", welcomeImageIsPublic: true });
      await fetchData();
    } catch (err) { console.error("Upload failed:", err); }
    finally { setUploading(null); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newForm,
          latitude: Number(newForm?.latitude ?? 0),
          longitude: Number(newForm?.longitude ?? 0),
          proximityRadius: Number(newForm?.proximityRadius ?? 50),
          orderIndex: locations?.length ?? 0,
        }),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewForm({ name: "", description: "", latitude: 0, longitude: 0, audioUrl: "", proximityRadius: 50, isActive: true });
        await fetchData();
      }
    } catch {} finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      await fetch(`/api/locations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          latitude: Number(editForm?.latitude ?? 0),
          longitude: Number(editForm?.longitude ?? 0),
          proximityRadius: Number(editForm?.proximityRadius ?? 50),
        }),
      });
      setEditingId(null);
      await fetchData();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    try {
      await fetch(`/api/locations/${id}`, { method: "DELETE" });
      await fetchData();
    } catch {}
  };

  const handleToggleActive = async (loc: LocationData) => {
    try {
      await fetch(`/api/locations/${loc?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !loc?.isActive }),
      });
      await fetchData();
    } catch {}
  };

  const handleSaveInfo = async (overrides?: Partial<WalkInfo>) => {
    setSaving(true);
    try {
      const payload = { ...walkInfo, ...overrides };
      const res = await fetch("/api/walk-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setWalkInfo({ ...DEFAULT_WALK_INFO, ...updated });
        showSaved();
      }
    } catch {} finally { setSaving(false); }
  };

  const handleAutoCenter = () => {
    if (locations.length === 0) return;
    const lats = locations.map(l => l.latitude);
    const lngs = locations.map(l => l.longitude);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    setWalkInfo(prev => ({ ...prev, mapCenterLat: parseFloat(centerLat.toFixed(6)), mapCenterLng: parseFloat(centerLng.toFixed(6)) }));
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
      </div>
    );
  }

  if ((session?.user as any)?.role !== "admin") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">Access denied. Admin privileges required.</p>
          <a href="/" className="text-teal-400 hover:underline">Back to Sound Walk</a>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "locations", label: "Locations", icon: <MapPin className="w-4 h-4" /> },
    { id: "info", label: "Walk Info", icon: <Headphones className="w-4 h-4" /> },
    { id: "metadata", label: "Metadata", icon: <User className="w-4 h-4" /> },
    { id: "theme", label: "Theme", icon: <Palette className="w-4 h-4" /> },
    { id: "map", label: "Map", icon: <Map className="w-4 h-4" /> },
    { id: "audio", label: "Audio", icon: <Music className="w-4 h-4" /> },
    { id: "welcome", label: "Welcome", icon: <Layout className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur-md border-b border-gray-800/50">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"><ArrowLeft className="w-5 h-5 text-gray-400" /></a>
            <Settings className="w-5 h-5 text-teal-400" />
            <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
            {saveMsg && <span className="text-sm text-teal-400 animate-pulse">{saveMsg}</span>}
          </div>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                tab === t.id ? "bg-teal-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ANALYTICS TAB */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {analyticsLoading && !analytics ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
              </div>
            ) : analytics ? (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon={<Activity className="w-5 h-5 text-green-400" />} label="Active Now" value={analytics.activeNow} accent="green" />
                  <StatCard icon={<Eye className="w-5 h-5 text-blue-400" />} label="Today" value={analytics.todayVisitors} accent="blue" />
                  <StatCard icon={<Users className="w-5 h-5 text-teal-400" />} label="This Week" value={analytics.weekVisitors} accent="teal" />
                  <StatCard icon={<TrendingUp className="w-5 h-5 text-purple-400" />} label="All Time" value={analytics.totalVisitors} accent="purple" />
                </div>

                {/* Walk completion */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-medium flex items-center gap-2 mb-4"><MapPin className="w-4 h-4 text-teal-400" /> Walk Completion</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-white">{analytics.totalWalkers}</p>
                      <p className="text-xs text-gray-400 mt-1">Total Walkers</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-teal-400">{analytics.completedWalkers}</p>
                      <p className="text-xs text-gray-400 mt-1">Completed All</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-400">{analytics.completionRate}%</p>
                      <p className="text-xs text-gray-400 mt-1">Completion Rate</p>
                    </div>
                  </div>
                </div>

                {/* Daily chart (last 30 days) */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-medium flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-teal-400" /> Visitors (Last 30 Days)</h3>
                  <div className="h-40 flex items-end gap-[2px]">
                    {analytics.dailyBreakdown.map((day, i) => {
                      const maxVal = Math.max(...analytics.dailyBreakdown.map(d => d.visitors), 1);
                      const heightPct = (day.visitors / maxVal) * 100;
                      const dateObj = new Date(day.date + "T12:00:00");
                      const isToday = i === analytics.dailyBreakdown.length - 1;
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center justify-end group relative">
                          <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap z-10 shadow-lg">
                            {dateObj.toLocaleDateString("en", { month: "short", day: "numeric" })}: {day.visitors} visitor{day.visitors !== 1 ? "s" : ""}
                          </div>
                          <div
                            className={`w-full rounded-t transition-all ${
                              isToday ? "bg-teal-400" : day.visitors > 0 ? "bg-teal-600 hover:bg-teal-500" : "bg-gray-800"
                            }`}
                            style={{ height: `${Math.max(heightPct, 2)}%`, minHeight: "2px" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>{new Date(analytics.dailyBreakdown[0]?.date + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                    <span>Today</span>
                  </div>
                </div>

                {/* Location popularity */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-medium flex items-center gap-2 mb-4"><MapPin className="w-4 h-4 text-teal-400" /> Location Popularity</h3>
                  <div className="space-y-2">
                    {analytics.locationStats.map((loc, i) => {
                      const maxVisits = Math.max(...analytics.locationStats.map(l => l.visits), 1);
                      const pct = (loc.visits / maxVisits) * 100;
                      return (
                        <div key={loc.name} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-6 text-right">#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-white truncate">{loc.name}</span>
                              <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{loc.visits} visit{loc.visits !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {analytics.locationStats.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No location visits recorded yet.</p>
                    )}
                  </div>
                </div>

                {/* Recent visitors */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-medium flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-teal-400" /> Recent Visitors</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {analytics.recentVisits.map((v, i) => {
                      const isMobile = /mobile|android|iphone|ipad/i.test(v.userAgent);
                      const timeAgo = getTimeAgo(v.visitedAt);
                      return (
                        <div key={`${v.sessionId}-${i}`} className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/40">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isMobile ? "bg-blue-900/30" : "bg-gray-700/50"}`}>
                            <Users className={`w-4 h-4 ${isMobile ? "text-blue-400" : "text-gray-400"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{v.sessionId.substring(0, 20)}...</p>
                            <p className="text-xs text-gray-500">{isMobile ? "Mobile" : "Desktop"}{v.referrer ? ` • from ${v.referrer}` : ""}</p>
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo}</span>
                        </div>
                      );
                    })}
                    {analytics.recentVisits.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No visitors recorded yet.</p>
                    )}
                  </div>
                </div>

                <button onClick={fetchAnalytics} disabled={analyticsLoading}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 flex items-center gap-2 transition-colors">
                  {analyticsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Refresh Analytics
                </button>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No analytics data available yet.</p>
              </div>
            )}
          </div>
        )}

        {/* LOCATIONS TAB */}
        {tab === "locations" && (
          <>
            <button onClick={() => setShowAddForm(true)}
              className="mb-4 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 rounded-xl text-white text-sm font-medium flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" /> Add Location
            </button>

            {showAddForm && (
              <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <h3 className="text-white font-medium flex items-center gap-2"><Plus className="w-4 h-4 text-teal-400" /> New Location</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField label="Name" value={newForm?.name ?? ""} onChange={v => setNewForm({ ...newForm, name: v })} placeholder="Location name" />
                  <InputField label="Audio URL (optional)" value={newForm?.audioUrl ?? ""} onChange={v => setNewForm({ ...newForm, audioUrl: v })} placeholder="Direct link to .mp3/.wav/.ogg or Google Drive link" />
                  <InputField label="Latitude" type="number" value={newForm?.latitude ?? 0} onChange={v => setNewForm({ ...newForm, latitude: parseFloat(v || "0") })} />
                  <InputField label="Longitude" type="number" value={newForm?.longitude ?? 0} onChange={v => setNewForm({ ...newForm, longitude: parseFloat(v || "0") })} />
                  <InputField label="Proximity Radius (m)" type="number" value={newForm?.proximityRadius ?? 50} onChange={v => setNewForm({ ...newForm, proximityRadius: parseInt(v || "50") })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <textarea value={newForm?.description ?? ""} onChange={e => setNewForm({ ...newForm, description: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 h-20 resize-none" placeholder="Describe this location..." />
                </div>
                <div className="flex gap-2">
                  <SaveButton saving={saving} onClick={handleCreate} />
                  <CancelButton onClick={() => setShowAddForm(false)} />
                </div>
              </div>
            )}

            <div className="space-y-3">
              {(locations ?? []).map((loc, idx) => (
                <div key={loc.id} className={`bg-gray-900 border rounded-xl p-4 transition-all ${loc.isActive ? "border-gray-800" : "border-gray-800/50 opacity-60"}`}>
                  {editingId === loc.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InputField label="Name" value={editForm?.name ?? ""} onChange={v => setEditForm({ ...editForm, name: v })} />
                        <InputField label="Audio URL" value={editForm?.audioUrl ?? ""} onChange={v => setEditForm({ ...editForm, audioUrl: v })} placeholder="Direct .mp3/.wav/.ogg link or Google Drive sharing link" />
                        <InputField label="Latitude" type="number" value={editForm?.latitude ?? 0} onChange={v => setEditForm({ ...editForm, latitude: parseFloat(v || "0") })} />
                        <InputField label="Longitude" type="number" value={editForm?.longitude ?? 0} onChange={v => setEditForm({ ...editForm, longitude: parseFloat(v || "0") })} />
                        <InputField label="Proximity Radius (m)" type="number" value={editForm?.proximityRadius ?? 50} onChange={v => setEditForm({ ...editForm, proximityRadius: parseInt(v || "50") })} />
                        <InputField label="Image URL" value={editForm?.imageUrl ?? ""} onChange={v => setEditForm({ ...editForm, imageUrl: v })} placeholder="https://upload.wikimedia.org/wikipedia/commons/a/a9/Buick_Terraza_--_09-26-2009_Exif.png or upload" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Description</label>
                        <textarea value={editForm?.description ?? ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 h-20 resize-none" />
                      </div>
                      <div className="flex gap-2">
                        <SaveButton saving={saving} onClick={() => handleUpdate(loc.id)} />
                        <CancelButton onClick={() => setEditingId(null)} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1"><GripVertical className="w-4 h-4 text-gray-600" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">#{idx + 1}</span>
                          <h3 className="text-white font-medium truncate">{loc.name || "Unnamed"}</h3>
                          {!loc.isActive && <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded-full">Hidden</span>}
                        </div>
                        <p className="text-gray-400 text-sm line-clamp-1 mb-1">{loc.description || "No description"}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {loc.latitude?.toFixed?.(6) ?? "0"}, {loc.longitude?.toFixed?.(6) ?? "0"}</span>
                          <span className="flex items-center gap-1"><Radius className="w-3 h-3" /> {loc.proximityRadius}m</span>
                          {(loc.audioUrl || loc.audioCloudPath) && <span className="flex items-center gap-1"><Volume2 className="w-3 h-3" /> Audio</span>}
                          {(loc.imageUrl || loc.imageCloudPath) && <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <UploadBtn id={`audio-${loc.id}`} uploading={uploading === `audio-${loc.id}`} accept="audio/*" icon={<Upload className="w-4 h-4 text-gray-400" />} onChange={f => handleUploadFile(loc.id, f, "audio")} title="Upload audio" />
                        <UploadBtn id={`image-${loc.id}`} uploading={uploading === `image-${loc.id}`} accept="image/*" icon={<ImageIcon className="w-4 h-4 text-gray-400" />} onChange={f => handleUploadFile(loc.id, f, "image")} title="Upload image" />
                        <button onClick={() => handleToggleActive(loc)} className="p-2 rounded-lg hover:bg-gray-800 transition-colors" title={loc.isActive ? "Deactivate" : "Activate"}>
                          {loc.isActive ? <ToggleRight className="w-4 h-4 text-teal-400" /> : <ToggleLeft className="w-4 h-4 text-gray-500" />}
                        </button>
                        <button onClick={() => { setEditingId(loc.id); setEditForm(loc); }} className="p-2 rounded-lg hover:bg-gray-800 transition-colors">
                          <Edit3 className="w-4 h-4 text-gray-400" />
                        </button>
                        <button onClick={() => handleDelete(loc.id)} className="p-2 rounded-lg hover:bg-gray-800 transition-colors">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {locations.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No locations yet. Add your first sound location above.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* WALK INFO TAB */}
        {tab === "info" && (
          <SettingsCard title="Walk Information" icon={<Headphones className="w-4 h-4 text-teal-400" />}>
            <InputField label="Title" value={walkInfo.title} onChange={v => setWalkInfo({ ...walkInfo, title: v })} />
            <TextareaField label="Short Description" value={walkInfo.description} onChange={v => setWalkInfo({ ...walkInfo, description: v })} rows={3} />
            <TextareaField label="About Text" value={walkInfo.aboutText} onChange={v => setWalkInfo({ ...walkInfo, aboutText: v })} rows={5} />
            <TextareaField label="Instructions" value={walkInfo.instructions} onChange={v => setWalkInfo({ ...walkInfo, instructions: v })} rows={5} placeholder="Step-by-step instructions for walkers..." />
            <SaveButton saving={saving} onClick={() => handleSaveInfo()} />
          </SettingsCard>
        )}

        {/* METADATA TAB */}
        {tab === "metadata" && (
          <SettingsCard title="Walk Metadata" icon={<User className="w-4 h-4 text-teal-400" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Artist / Creator Name" value={walkInfo.artistName} onChange={v => setWalkInfo({ ...walkInfo, artistName: v })} placeholder="Your name or collective" />
              <InputField label="Year" value={walkInfo.year} onChange={v => setWalkInfo({ ...walkInfo, year: v })} placeholder="2025" />
              <InputField label="City" value={walkInfo.city} onChange={v => setWalkInfo({ ...walkInfo, city: v })} placeholder="Leipzig" />
            </div>
            <TextareaField label="Credits / Attribution" value={walkInfo.credits} onChange={v => setWalkInfo({ ...walkInfo, credits: v })} rows={4} placeholder="Sound recordings by...\nSupported by...\nSpecial thanks to..." />
            <SaveButton saving={saving} onClick={() => handleSaveInfo()} />
          </SettingsCard>
        )}

        {/* THEME TAB */}
        {tab === "theme" && (
          <SettingsCard title="Theme & Branding" icon={<Palette className="w-4 h-4 text-teal-400" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={walkInfo.accentColor} onChange={e => setWalkInfo({ ...walkInfo, accentColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  <input value={walkInfo.accentColor} onChange={e => setWalkInfo({ ...walkInfo, accentColor: e.target.value })}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Background Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={walkInfo.backgroundColor} onChange={e => setWalkInfo({ ...walkInfo, backgroundColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  <input value={walkInfo.backgroundColor} onChange={e => setWalkInfo({ ...walkInfo, backgroundColor: e.target.value })}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Font Family</label>
                <select value={walkInfo.fontFamily} onChange={e => setWalkInfo({ ...walkInfo, fontFamily: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500">
                  {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">
                  Text Size — <span className="text-teal-400 font-medium">{Math.round((walkInfo.fontScale ?? 1.0) * 100)}%</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">A</span>
                  <input type="range" min="0.8" max="1.5" step="0.05"
                    value={walkInfo.fontScale ?? 1.0}
                    onChange={e => setWalkInfo({ ...walkInfo, fontScale: parseFloat(e.target.value) })}
                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-700 accent-teal-500" />
                  <span className="text-base text-gray-500 font-bold">A</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Adjusts text size across the entire visitor-facing app (80% – 150%)</p>
              </div>
            </div>
            <div className="mt-4 p-4 rounded-xl border border-gray-700" style={{ backgroundColor: walkInfo.backgroundColor, fontSize: `${walkInfo.fontScale ?? 1.0}rem` }}>
              <p className="text-sm text-gray-400 mb-2">Preview:</p>
              <h3 className="text-lg font-semibold" style={{ color: walkInfo.accentColor }}>{walkInfo.title || "Sound Walk"}</h3>
              <p className="text-sm" style={{ color: walkInfo.accentColor + "99" }}>Sample description text</p>
            </div>
            <SaveButton saving={saving} onClick={() => handleSaveInfo()} />
          </SettingsCard>
        )}

        {/* MAP TAB */}
        {tab === "map" && (
          <SettingsCard title="Map Settings" icon={<Map className="w-4 h-4 text-teal-400" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Center Latitude" type="number" value={walkInfo.mapCenterLat} onChange={v => setWalkInfo({ ...walkInfo, mapCenterLat: parseFloat(v || "0") })} />
              <InputField label="Center Longitude" type="number" value={walkInfo.mapCenterLng} onChange={v => setWalkInfo({ ...walkInfo, mapCenterLng: parseFloat(v || "0") })} />
              <InputField label="Default Zoom Level" type="number" value={walkInfo.mapZoom} onChange={v => setWalkInfo({ ...walkInfo, mapZoom: parseFloat(v || "15") })} />
              <div>
                <label className="block text-xs text-gray-400 mb-1">Map Style</label>
                <select value={walkInfo.mapStyle} onChange={e => setWalkInfo({ ...walkInfo, mapStyle: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500">
                  {MAP_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleAutoCenter}
              className="mt-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
              Auto-center from locations
            </button>
            <SaveButton saving={saving} onClick={() => handleSaveInfo()} />
          </SettingsCard>
        )}

        {/* AUDIO TAB */}
        {tab === "audio" && (
          <SettingsCard title="Audio Settings" icon={<Music className="w-4 h-4 text-teal-400" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Default Proximity Radius (m)" type="number" value={walkInfo.defaultProximityRadius}
                onChange={v => setWalkInfo({ ...walkInfo, defaultProximityRadius: parseInt(v || "50") })} />
              <InputField label="Audio Fade Duration (seconds)" type="number" value={walkInfo.audioFadeDuration}
                onChange={v => setWalkInfo({ ...walkInfo, audioFadeDuration: parseFloat(v || "2") })} />
              <div>
                <label className="block text-xs text-gray-400 mb-1">Base Volume: {(walkInfo.audioBaseVolume * 100).toFixed(0)}%</label>
                <input type="range" min="0" max="1" step="0.05" value={walkInfo.audioBaseVolume}
                  onChange={e => setWalkInfo({ ...walkInfo, audioBaseVolume: parseFloat(e.target.value) })}
                  className="w-full accent-teal-500" />
              </div>
            </div>
            <div className="mt-2 p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400">
              <p><strong>Per-location radius:</strong> Each location can override the default proximity radius in the Locations tab.</p>
              <p className="mt-1"><strong>Fade duration:</strong> How many seconds the audio fades in/out when entering or leaving a zone.</p>
            </div>
            <SaveButton saving={saving} onClick={() => handleSaveInfo()} />
          </SettingsCard>
        )}

        {/* WELCOME TAB */}
        {tab === "welcome" && (
          <SettingsCard title="Welcome / Landing Page" icon={<Layout className="w-4 h-4 text-teal-400" />}>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-gray-300">Show welcome page on first visit</label>
              <button onClick={() => setWalkInfo({ ...walkInfo, showWelcomePage: !walkInfo.showWelcomePage })}
                className={`p-1 rounded-lg transition-colors ${walkInfo.showWelcomePage ? "text-teal-400" : "text-gray-500"}`}>
                {walkInfo.showWelcomePage ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
            </div>
            <InputField label="Welcome Title" value={walkInfo.welcomeTitle} onChange={v => setWalkInfo({ ...walkInfo, welcomeTitle: v })} placeholder="Welcome to the Sound Walk" />
            <InputField label="Welcome Subtitle" value={walkInfo.welcomeSubtitle} onChange={v => setWalkInfo({ ...walkInfo, welcomeSubtitle: v })} placeholder="An immersive audio experience" />
            <div>
              <label className="block text-xs text-gray-400 mb-1">Welcome Image</label>
              <div className="flex items-center gap-3">
                <InputField label="" value={walkInfo.welcomeImageUrl} onChange={v => setWalkInfo({ ...walkInfo, welcomeImageUrl: v })} placeholder="Image URL or upload" />
                <label className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors flex-shrink-0">
                  {uploading === "welcome-image" ? <Loader2 className="w-5 h-5 text-teal-400 animate-spin" /> : <Upload className="w-5 h-5 text-gray-400" />}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadWelcomeImage(f); }} />
                </label>
              </div>
            </div>
            <SaveButton saving={saving} onClick={() => handleSaveInfo()} />
          </SettingsCard>
        )}
      </div>
    </div>
  );
}

// Reusable components
function InputField({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      {label && <label className="block text-xs text-gray-400 mb-1">{label}</label>}
      <input type={type} step={type === "number" ? "any" : undefined} value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500"
        placeholder={placeholder} />
    </div>
  );
}

function TextareaField({ label, value, onChange, rows = 3, placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={rows}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 resize-none"
        placeholder={placeholder} />
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-lg text-white text-sm flex items-center gap-2 transition-colors">
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
    </button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm flex items-center gap-2 transition-colors">
      <X className="w-4 h-4" /> Cancel
    </button>
  );
}

function SettingsCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="text-white font-medium flex items-center gap-2">{icon} {title}</h3>
      {children}
    </div>
  );
}

function UploadBtn({ id, uploading, accept, icon, onChange, title }: {
  id: string; uploading: boolean; accept: string; icon: React.ReactNode; onChange: (f: File) => void; title: string;
}) {
  return (
    <label className="p-2 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer" title={title}>
      {uploading ? <Loader2 className="w-4 h-4 text-teal-400 animate-spin" /> : icon}
      <input type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
    </label>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-400">{label}</span></div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}