import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AlertTriangle, CheckCircle2, Database, Eye, FileUp, KeyRound, Loader2,
  MapPinned, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X,
} from "lucide-react";
import {
  type AdminDashboard, type AdminDestination, type Circular, type DestinationWrite,
  deleteAdminCircular, deleteAdminDestination, fetchAdminCirculars,
  fetchAdminDashboard, fetchAdminDestinations, getAdminAuthStatus, loginAdmin,
  runAdminSync, saveAdminDestination, setupAdmin, getAdminSession, logoutAdmin, ADMIN_SESSION_MARKER,
} from "@/lib/api";

const CATEGORIES = ["nature", "culture", "adventure", "pilgrimage", "wildlife"];

const emptyDestination = (): DestinationWrite => ({
  name: "", slug: "", category: "nature", description: "", location: "", district: "",
  altitude: null, best_time: "", entry_fee: null, permit_required: false, permit_info: null,
  how_to_reach: "", highlights: [], tags: [], image_placeholder: "#888888", image_url: null,
  latitude: null, longitude: null,
});

const toList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const errorMessage = (error: unknown) => error instanceof Error ? error.message.replace(/^API error \d+: /, "") : "Something went wrong. Please try again.";
const passwordRequirements = (password: string) => [
  { label: "At least 12 characters", met: password.length >= 12 },
  { label: "At least one letter", met: /[A-Za-z]/.test(password) },
  { label: "At least one number", met: /\d/.test(password) },
];

const adminAccessSlides = [
  { image: "/images/Gurudongmar_Lake.jpeg", title: "Gurudongmar Lake", detail: "North Sikkim" },
  { image: "/images/Pelling.jpeg", title: "Pelling", detail: "West Sikkim" },
  { image: "/images/Tsomgo_Lake.jpeg", title: "Tsomgo Lake", detail: "East Sikkim" },
];

export default function Admin() {
  // The browser stores only an HTTP-only signed session cookie. Passwords
  // never enter localStorage, sessionStorage, or JavaScript-accessible state.
  const [key, setKey] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [setupKeyDraft, setSetupKeyDraft] = useState("");
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [destinations, setDestinations] = useState<AdminDestination[]>([]);
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [tab, setTab] = useState<"overview" | "destinations" | "circulars">("overview");
  const [loading, setLoading] = useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminDestination | null | "new">(null);
  const [previewingCircular, setPreviewingCircular] = useState<Circular | null>(null);
  const [processingUpload, setProcessingUpload] = useState(false);
  const [form, setForm] = useState<DestinationWrite>(emptyDestination);
  const [upload, setUpload] = useState<{ file: File | null; title: string; category: string; district: string }>({ file: null, title: "", category: "road_status", district: "" });
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accessSlide, setAccessSlide] = useState(0);

  useEffect(() => () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
  }, [filePreviewUrl]);

  useEffect(() => {
    if (key) return;
    const interval = window.setInterval(() => setAccessSlide((current) => (current + 1) % adminAccessSlides.length), 6_500);
    return () => window.clearInterval(interval);
  }, [key]);

  useEffect(() => {
    getAdminAuthStatus()
      .then((status) => setSetupRequired(status.setup_required))
      .catch(() => setError("The admin sign-in service is unavailable. Please try again."));
    getAdminSession().then(() => setKey(ADMIN_SESSION_MARKER)).catch(() => undefined);
  }, []);

  const load = async (retryAttempt = 0) => {
    if (!key) return;
    setLoading(true); setError(null);
    try {
      // Load in order: a cold local MySQL pool can reject simultaneous first
      // connections, while these small operations complete quickly in sequence.
      const summary = await fetchAdminDashboard(key);
      const destinationRows = await fetchAdminDestinations(key);
      const circularRows = await fetchAdminCirculars(key);
      setDashboard(summary); setDestinations(destinationRows); setCirculars(circularRows);
      if (!hasCompletedInitialLoad) { setHasCompletedInitialLoad(true); setShowReady(true); }
    } catch (err) {
      if (String(err).includes("401")) {
        setKey("");
      } else if (retryAttempt === 0) {
        window.setTimeout(() => { void load(1); }, 650);
      } else {
        setError(errorMessage(err));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [key]);
  useEffect(() => {
    if (!showReady) return;
    const timeout = window.setTimeout(() => setShowReady(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [showReady]);
  const sortedDestinations = useMemo(() => [...destinations].sort((a, b) => a.name.localeCompare(b.name)), [destinations]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (setupRequired === null) return;
    const username = usernameDraft.trim().toLowerCase();
    if (!username || !passwordDraft) return;
    if (setupRequired && passwordDraft !== confirmPasswordDraft) {
      setError("The password confirmation does not match.");
      return;
    }
    setLoading(true); setError(null); setHasCompletedInitialLoad(false); setShowReady(false);
    try {
      await (setupRequired
        ? await setupAdmin(username, passwordDraft, setupKeyDraft)
        : await loginAdmin(username, passwordDraft));
      setKey(ADMIN_SESSION_MARKER);
      window.dispatchEvent(new Event("admin-session-changed"));
      setPasswordDraft(""); setConfirmPasswordDraft(""); setSetupKeyDraft("");
      if (setupRequired) setSetupRequired(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try { await logoutAdmin(); } finally { setKey(""); setDashboard(null); setDestinations([]); setCirculars([]); window.dispatchEvent(new Event("admin-session-changed")); }
  };

  const openEditor = (destination: AdminDestination | "new") => {
    setEditing(destination);
    setForm(destination === "new" ? emptyDestination() : { ...destination });
  };

  const saveDestination = async (event: FormEvent) => {
    event.preventDefault(); if (!key) return;
    setLoading(true); setError(null);
    try {
      const saved = await saveAdminDestination(key, form, editing === "new" ? undefined : editing?.id);
      setDestinations((rows) => editing === "new" ? [...rows, saved] : rows.map((row) => row.id === saved.id ? saved : row));
      setEditing(null); setNotice(`${saved.name} has been saved. Run Destination sync to update AI search.`);
      const summary = await fetchAdminDashboard(key); setDashboard(summary);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };

  const removeDestination = async (destination: AdminDestination) => {
    if (!key || !confirm(`Delete ${destination.name}? This cannot be undone.`)) return;
    setLoading(true); setError(null);
    try { await deleteAdminDestination(key, destination.id); setDestinations((rows) => rows.filter((row) => row.id !== destination.id)); setNotice(`${destination.name} was deleted. Run Destination sync to remove it from AI search.`); }
    catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  };

  const removeCircular = async (circular: Circular) => {
    if (!key || !confirm(`Delete “${circular.title}”? This cannot be undone.`)) return;
    setLoading(true); setError(null);
    try { await deleteAdminCircular(key, circular.id); setCirculars((rows) => rows.filter((row) => row.id !== circular.id)); setNotice("Circular deleted."); }
    catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  };

  const sync = async (type: "destinations" | "circulars") => {
    if (!key) return; setLoading(true); setError(null);
    try { const result = await runAdminSync(key, type); setNotice(type === "destinations" ? `AI search synced: ${result.indexed ?? 0} destinations indexed.` : `Circular sync finished: ${result.new ?? 0} new, ${result.failed ?? 0} failed.`); await load(); }
    catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  };

  const uploadCircular = async (event: FormEvent) => {
    event.preventDefault(); if (!key || !upload.file) return;
    setLoading(true); setProcessingUpload(true); setError(null);
    try {
      const body = new FormData(); body.append("file", upload.file); body.append("title", upload.title); body.append("category", upload.category); if (upload.district) body.append("district", upload.district);
      const response = await fetch("/api/admin/upload-circular", { method: "POST", credentials: "same-origin", headers: key === ADMIN_SESSION_MARKER ? {} : { Authorization: `Basic ${key}` }, body });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail ?? "Upload failed.");
      const uploadedTitle = upload.title;
      clearSelectedFile(); setUpload({ file: null, title: "", category: "road_status", district: "" }); setNotice(`${uploadedTitle} uploaded and processed successfully.`); await load();
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); setProcessingUpload(false); }
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(file ? URL.createObjectURL(file) : null);
    setUpload((current) => ({
      ...current,
      file,
      title: current.title || (file ? file.name.replace(/\.[^.]+$/, "") : ""),
    }));
  };

  const clearSelectedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUpload((current) => ({ ...current, file: null }));
  };

  if (!key) return <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12"><motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-[0_28px_80px_rgba(15,23,42,0.18)] lg:grid-cols-[1.08fr_0.92fr]">
    <aside className="relative min-h-[17rem] overflow-hidden lg:min-h-[39rem]" aria-label="Sikkim tourism imagery">
      <AnimatePresence mode="wait"><motion.img key={adminAccessSlides[accessSlide].image} src={adminAccessSlides[accessSlide].image} alt={`${adminAccessSlides[accessSlide].title}, Sikkim`} initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.85, ease: "easeOut" }} className="absolute inset-0 h-full w-full object-cover" /></AnimatePresence>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,25,21,0.08)_0%,rgba(6,25,21,0.38)_45%,rgba(6,25,21,0.88)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(233,169,59,0.28),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(39,122,107,0.32),transparent_42%)]" />
      <div className="relative flex h-full flex-col justify-between p-6 text-white sm:p-8 lg:p-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-slate-950/75 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-amber-100 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md"><ShieldCheck className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />Secure department workspace</div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Tourism &amp; Civil Aviation</p><h2 className="mt-2 max-w-sm font-serif text-3xl font-bold leading-tight sm:text-4xl">Supporting official travel information for Sikkim.</h2><div className="mt-6 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold">{adminAccessSlides[accessSlide].title}</p><p className="mt-0.5 text-xs text-white/70">{adminAccessSlides[accessSlide].detail}</p></div><div className="flex gap-1.5" aria-label={`Slide ${accessSlide + 1} of ${adminAccessSlides.length}`}>{adminAccessSlides.map((slide, index) => <button key={slide.image} type="button" onClick={() => setAccessSlide(index)} aria-label={`Show ${slide.title}`} className={`h-1.5 rounded-full transition-all ${index === accessSlide ? "w-7 bg-white" : "w-1.5 bg-white/45 hover:bg-white/75"}`} />)}</div></div></div>
      </div>
    </aside>
    <motion.form initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }} onSubmit={unlock} className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
      <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(39,122,107,0.24)]"><ShieldCheck className="h-6 w-6" /></div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Restricted operations</p><h1 className="mt-2 font-serif text-3xl font-bold">{setupRequired ? "Register first administrator" : "Administrator sign-in"}</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{setupRequired ? "No administrator account exists yet. Authorised department staff may register the first account only with the server-held one-time setup key; this is not public registration." : "This restricted console is for authorised Tourism & Civil Aviation Department administrators only. Public visitors cannot sign in or create accounts."}</p>
      {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <label className="mt-7 block text-sm font-semibold">Username<input autoFocus required minLength={3} value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 outline-none ring-primary transition-shadow focus:ring-2" placeholder="e.g. tourism.admin" autoComplete="username" /></label>
      <label className="mt-4 block text-sm font-semibold">Password<input required type="password" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 outline-none ring-primary transition-shadow focus:ring-2" placeholder={setupRequired ? "At least 12 characters" : "Enter your password"} autoComplete={setupRequired ? "new-password" : "current-password"} aria-describedby={setupRequired ? "password-requirements" : undefined} /></label>
      {setupRequired && <><ul id="password-requirements" className="mt-2 space-y-1 text-xs" aria-live="polite">{passwordRequirements(passwordDraft).map(({ label, met }) => <li key={label} className={met ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>{met ? "✓" : "○"} {label}</li>)}</ul><label className="mt-4 block text-sm font-semibold">Confirm password<input required type="password" value={confirmPasswordDraft} onChange={(event) => setConfirmPasswordDraft(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 outline-none ring-primary transition-shadow focus:ring-2" autoComplete="new-password" /></label><label className="mt-4 block text-sm font-semibold">One-time setup key<input required type="password" value={setupKeyDraft} onChange={(event) => setSetupKeyDraft(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 outline-none ring-primary transition-shadow focus:ring-2" placeholder="ADMIN_API_KEY" autoComplete="off" /></label></>}
      <button disabled={loading || setupRequired === null} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_10px_22px_rgba(39,122,107,0.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(39,122,107,0.28)] disabled:cursor-not-allowed disabled:opacity-50"><KeyRound className="h-4 w-4" />{loading ? "Please wait…" : setupRequired ? "Register first administrator" : "Sign in securely"}</button>
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Your secure session stays active on this browser until you select Logout.</p>
    </motion.form>
  </motion.section></main>;

  if (loading && !hasCompletedInitialLoad) return <AdminLoadingScreen />;

  return <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><section className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#103e35,#247969_55%,#cf8f2f)] p-6 text-white shadow-2xl sm:p-10"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" /><div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">Tourism & Civil Aviation Department</p><h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Operations Console</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">Live data management for destinations, official circulars, and AI search.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl bg-white/12 p-3 transition hover:bg-white/20" aria-label="Refresh"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></button><button onClick={logout} className="rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">Logout</button></div></div></section>

  <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{([ ["overview", Activity, "Overview"], ["destinations", MapPinned, "Destinations"], ["circulars", FileUp, "Circulars"] ] as const).map(([value, Icon, label]) => <button key={value} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === value ? "bg-primary text-primary-foreground shadow" : "border border-border bg-card hover:bg-muted"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
  {error && <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="h-5 w-5 shrink-0" />{error}</motion.div>}{notice && <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary"><CheckCircle2 className="h-5 w-5 shrink-0" />{notice}<button className="ml-auto" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button></motion.div>}

  {tab === "overview" && <div className="mt-6 grid gap-5 lg:grid-cols-3"><Stat icon={MapPinned} label="Live destinations" value={dashboard?.destination_count ?? destinations.length} detail="Stored in Aiven MySQL" /><Stat icon={FileUp} label="Recent circulars" value={circulars.length} detail="Official notices in database" /><Stat icon={Database} label="AI search" value={dashboard?.qdrant_mode ?? "—"} detail={`${dashboard?.db_mode ?? "—"} database mode`} /><section className="lg:col-span-3 rounded-[1.5rem] border border-border bg-card p-6 shadow-sm"><h2 className="font-serif text-xl font-bold">Operational actions</h2><p className="mt-1 text-sm text-muted-foreground">Synchronize only after changing the related live data.</p><div className="mt-5 flex flex-wrap gap-3"><ActionButton icon={RefreshCw} label="Sync destinations to AI" onClick={() => sync("destinations")} disabled={loading} /><ActionButton icon={RefreshCw} label="Fetch latest circulars" onClick={() => sync("circulars")} disabled={loading} secondary /></div></section></div>}

  {tab === "destinations" && <section className="mt-6 rounded-[1.5rem] border border-border bg-card p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-2xl font-bold">Destinations</h2><p className="mt-1 text-sm text-muted-foreground">Create, edit, preview, or remove the live tourism catalog.</p></div><ActionButton icon={Plus} label="Add destination" onClick={() => openEditor("new")} /></div><div className="mt-6 grid gap-3 md:grid-cols-2">{sortedDestinations.map((destination) => <article key={destination.id} className="group rounded-2xl border border-border p-4 transition hover:border-primary/40 hover:shadow-sm"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">{destination.category}</p><h3 className="mt-1 font-serif text-lg font-bold">{destination.name}</h3><p className="mt-1 text-sm text-muted-foreground">{destination.district} · {destination.best_time}</p></div><div className="flex gap-1"><a href={`/destinations?preview=${destination.id}`} target="_blank" rel="noreferrer" aria-label={`Preview ${destination.name}`} title="Preview on public site" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"><Eye className="h-4 w-4" /></a><IconButton icon={Pencil} label="Edit" onClick={() => openEditor(destination)} /><IconButton icon={Trash2} label="Delete" onClick={() => removeDestination(destination)} danger /></div></div></article>)}</div></section>}

  {tab === "circulars" && <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><section className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-serif text-2xl font-bold">Official circulars</h2><p className="mt-1 text-sm text-muted-foreground">Live records from the scraper or manual uploads.</p></div><ActionButton icon={RefreshCw} label="Sync" onClick={() => sync("circulars")} disabled={loading} /></div><div className="mt-5 space-y-3">{circulars.map((circular) => <article key={circular.id} className="rounded-2xl border border-border p-4"><div className="flex gap-3"><button type="button" onClick={() => setPreviewingCircular(circular)} className="min-w-0 flex-1 text-left"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{circular.category.replace("_", " ")} · {circular.issue_date}</p><h3 className="mt-1 font-semibold transition-colors hover:text-primary">{circular.title}</h3><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{circular.extracted_text}</p></button><div className="flex shrink-0 gap-1"><IconButton icon={Eye} label="Preview circular" onClick={() => setPreviewingCircular(circular)} /><IconButton icon={Trash2} label="Delete circular" onClick={() => removeCircular(circular)} danger /></div></div></article>)}{!circulars.length && <p className="py-12 text-center text-sm text-muted-foreground">No circulars stored yet.</p>}</div></section><section className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm sm:p-6"><h2 className="font-serif text-2xl font-bold">Upload a road-status report</h2><p className="mt-1 text-sm text-muted-foreground">PDF, JPG, PNG, or WebP. The original file is retained so visitors can preview or download it.</p><form className="mt-5 space-y-4" onSubmit={uploadCircular}><Field label="Title"><input required value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} className="input" /></Field><Field label="Category"><select value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value })} className="input"><option value="road_status">Road status</option><option value="cancellation_order">Cancellation order</option><option value="tender">Tender & bid</option></select></Field><Field label="District (optional)"><input value={upload.district} onChange={(e) => setUpload({ ...upload, district: e.target.value })} className="input" /></Field><Field label="File"><input ref={fileInputRef} required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={selectFile} className="sr-only" /><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"><FileUp className="h-4 w-4" />Choose file</button>{upload.file ? <><span className="max-w-full truncate text-sm text-muted-foreground" title={upload.file.name}>{upload.file.name}</span><button type="button" onClick={clearSelectedFile} className="text-sm font-semibold text-destructive hover:underline">Remove</button></> : <span className="text-sm text-muted-foreground">No file chosen</span>}</div></Field>{filePreviewUrl && <div className="flex gap-2"><a href={filePreviewUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"><Eye className="h-4 w-4" />Preview file</a></div>}<ActionButton icon={FileUp} label={loading ? "Uploading…" : "Upload and ingest"} type="submit" disabled={loading || !upload.file} /></form></section></div>}
  </div><AnimatePresence>{processingUpload && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"><motion.section initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-sm rounded-[2rem] border border-border bg-card p-8 text-center shadow-2xl"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div><h2 className="mt-6 font-serif text-2xl font-bold">Processing circular…</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Reading the document, extracting text, and saving it securely.</p><div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div initial={{ x: "-100%" }} animate={{ x: "100%" }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} className="h-full w-1/2 rounded-full bg-primary" /></div></motion.section></motion.div>}{showReady && <motion.div initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} className="fixed left-1/2 top-24 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-primary/30 bg-card px-5 py-4 text-sm shadow-xl backdrop-blur-xl"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckCircle2 className="h-5 w-5" /></span><span><strong className="block">Console ready</strong><span className="text-muted-foreground">Live data loaded successfully.</span></span></motion.div>}{editing && <DestinationEditor form={form} setForm={setForm} editing={editing} onClose={() => setEditing(null)} onSubmit={saveDestination} loading={loading} />}{previewingCircular && <CircularPreview circular={previewingCircular} onClose={() => setPreviewingCircular(null)} />}</AnimatePresence></main>;
}

function AdminLoadingScreen() {
  return <main className="flex flex-1 items-center justify-center px-4 py-16"><motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md overflow-hidden rounded-[2rem] border border-border bg-card p-8 text-center shadow-xl"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div><p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Secure workspace</p><h1 className="mt-2 font-serif text-3xl font-bold">Loading console</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Retrieving live destinations, circulars, and AI search status.</p><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div initial={{ x: "-100%" }} animate={{ x: "100%" }} transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }} className="h-full w-1/2 rounded-full bg-primary" /></div></motion.section></main>;
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail: string }) { return <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.5rem] border border-border bg-card p-6 shadow-sm"><Icon className="h-5 w-5 text-primary" /><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 font-serif text-3xl font-bold capitalize">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></motion.section>; }
function ActionButton({ icon: Icon, label, onClick, disabled, secondary = false, type = "button" }: { icon: typeof Plus; label: string; onClick?: () => void; disabled?: boolean; secondary?: boolean; type?: "button" | "submit" }) { return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 ${secondary ? "border border-border bg-background hover:bg-muted" : "bg-primary text-primary-foreground hover:-translate-y-0.5"}`}><Icon className="h-4 w-4" />{label}</button>; }
function IconButton({ icon: Icon, label, onClick, danger = false }: { icon: typeof Plus; label: string; onClick: () => void; danger?: boolean }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${danger ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="h-4 w-4" /></button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold">{label}<div className="mt-1.5">{children}</div></label>; }

function CircularPreview({ circular, onClose }: { circular: Circular; onClose: () => void }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={onClose}><motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="circular-preview-title" className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-card shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-border p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{circular.category.replace("_", " ")} · {circular.issue_date}</p><h2 id="circular-preview-title" className="mt-2 font-serif text-2xl font-bold">{circular.title}</h2>{circular.district && <p className="mt-1 text-sm text-muted-foreground">{circular.district}</p>}</div><IconButton icon={X} label="Close preview" onClick={onClose} /></div><div className="max-h-[calc(88vh-11rem)] overflow-y-auto p-6"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Extracted circular text</p><div className="whitespace-pre-wrap rounded-2xl border border-border bg-background/60 p-4 text-sm leading-7 text-foreground">{circular.extracted_text || "No text could be extracted from this circular."}</div></div></motion.section></motion.div>;
}

function DestinationEditor({ form, setForm, editing, onClose, onSubmit, loading }: { form: DestinationWrite; setForm: (form: DestinationWrite) => void; editing: AdminDestination | "new"; onClose: () => void; onSubmit: (event: FormEvent) => void; loading: boolean }) {
  const set = <K extends keyof DestinationWrite>(field: K, value: DestinationWrite[K]) => setForm({ ...form, [field]: value });
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] overflow-y-auto bg-black/55 p-4 backdrop-blur-sm"><motion.form initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={onSubmit} className="mx-auto my-6 max-w-4xl rounded-[2rem] bg-card p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Live MySQL record</p><h2 className="mt-1 font-serif text-2xl font-bold">{editing === "new" ? "Add destination" : `Edit ${editing.name}`}</h2></div><IconButton icon={X} label="Close" onClick={onClose} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Name"><input required value={form.name} onChange={(e) => set("name", e.target.value)} className="input" /></Field><Field label="URL slug"><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className="input" placeholder="e.g. gangtok" /></Field><Field label="Category"><select value={form.category} onChange={(e) => set("category", e.target.value)} className="input">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="District"><input required value={form.district} onChange={(e) => set("district", e.target.value)} className="input" /></Field><Field label="Location"><input required value={form.location} onChange={(e) => set("location", e.target.value)} className="input" /></Field><Field label="Best time to visit"><input required value={form.best_time} onChange={(e) => set("best_time", e.target.value)} className="input" /></Field><Field label="Altitude"><input value={form.altitude ?? ""} onChange={(e) => set("altitude", e.target.value || null)} className="input" /></Field><Field label="Entry fee"><input value={form.entry_fee ?? ""} onChange={(e) => set("entry_fee", e.target.value || null)} className="input" /></Field><Field label="Latitude"><input type="number" step="any" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))} className="input" /></Field><Field label="Longitude"><input type="number" step="any" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))} className="input" /></Field><Field label="Image URL"><input value={form.image_url ?? ""} onChange={(e) => set("image_url", e.target.value || null)} className="input" /></Field><Field label="Fallback color"><input value={form.image_placeholder} onChange={(e) => set("image_placeholder", e.target.value)} className="input" /></Field><Field label="Highlights (comma separated)"><input value={form.highlights.join(", ")} onChange={(e) => set("highlights", toList(e.target.value))} className="input" /></Field><Field label="Tags (comma separated)"><input value={form.tags.join(", ")} onChange={(e) => set("tags", toList(e.target.value))} className="input" /></Field><label className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={form.permit_required} onChange={(e) => set("permit_required", e.target.checked)} />Permit required</label><Field label="Description"><textarea required value={form.description} onChange={(e) => set("description", e.target.value)} className="input min-h-28 resize-y" /></Field><Field label="How to reach"><textarea required value={form.how_to_reach} onChange={(e) => set("how_to_reach", e.target.value)} className="input min-h-28 resize-y" /></Field>{form.permit_required && <div className="sm:col-span-2"><Field label="Permit information"><textarea value={form.permit_info ?? ""} onChange={(e) => set("permit_info", e.target.value || null)} className="input min-h-24 resize-y" /></Field></div>}</div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-muted">Cancel</button><ActionButton icon={CheckCircle2} label={loading ? "Saving…" : "Save live record"} type="submit" disabled={loading} /></div></motion.form></motion.div>;
}
