import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Upload, FileSpreadsheet, Code2, Download, RefreshCw,
  AlertCircle, Sparkles, X, CheckCircle2, Copy,
  Mail, Phone, MapPin, Github, Linkedin,
  Database, GitMerge, ShieldCheck, Gauge, Cpu, Trophy, FileJson,
} from "lucide-react";
import { transformCandidates } from "../lib/api.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCES = {
  csv: { label: "Recruiter CSV", accept: ".csv",            icon: FileSpreadsheet, hint: "Tabular recruiter export" },
  ats: { label: "ATS JSON",      accept: ".json",           icon: Code2,           hint: "Applicant tracking export" },
  pdf: { label: "Resume PDF",    accept: ".pdf",            icon: FileText,        hint: "Parsed in-browser via PDF.js" },
  txt: { label: "Resume TXT",    accept: ".txt,text/plain", icon: FileText,        hint: "Plain-text resume" },
};
const SOURCE_KEY_MAP = { recruiter_csv: "csv", ats_json: "ats", resume_pdf: "pdf", resume_txt: "txt" };
const INITIAL = { csv: null, ats: null, pdf: null, txt: null };
const INITIAL_URLS = { github: "", linkedin: "" };

const PIPELINE_STAGES = [
  { id: "parse",     label: "Parsing",                       icon: Database    },
  { id: "normalize", label: "Normalization",                 icon: Cpu         },
  { id: "merge",     label: "Merge",                         icon: GitMerge    },
  { id: "validate",  label: "Validation",                    icon: ShieldCheck },
  { id: "score",     label: "Confidence Scoring",            icon: Gauge       },
  { id: "done",      label: "Canonical Profile Generated",   icon: Trophy     },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pct = (n) => Math.round((n || 0) * 100);
const fmtLocation = (loc) => (!loc ? "—" : [loc.city, loc.region, loc.country].filter(Boolean).join(", ") || "—");
const initials = (name) =>
  !name ? "?" : name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
function download(name, data, mime = "application/json") {
  const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function CandidateTransformer() {
  const [files, setFiles] = useState(INITIAL);
  const [urls, setUrls] = useState(INITIAL_URLS);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const inputs = useRef({});

  const setFile = useCallback((k, f) => { setFiles((p) => ({ ...p, [k]: f })); setError(""); }, []);
  const setUrl = useCallback((k, v) => { setUrls((p) => ({ ...p, [k]: v })); setError(""); }, []);
  const clearFile = useCallback((k) => {
    setFiles((p) => ({ ...p, [k]: null }));
    if (inputs.current[k]) inputs.current[k].value = "";
  }, []);
  const reset = useCallback(() => {
    setFiles(INITIAL); setUrls(INITIAL_URLS); setResult(null); setError(""); setStageIdx(-1);
    Object.values(inputs.current).forEach((el) => { if (el) el.value = ""; });
  }, []);

  const hasStructured = files.csv || files.ats;
  const hasUnstructured = files.pdf || files.txt || urls.github.trim() || urls.linkedin.trim();

  const run = useCallback(async () => {
    setError(""); setResult(null); setStageIdx(-1);
    if (!hasStructured) return setError("Add at least one structured source (CSV or ATS JSON).");
    if (!hasUnstructured) return setError("Add at least one unstructured source (PDF, TXT, GitHub or LinkedIn URL).");
    setLoading(true);
    try {
      for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
        setStageIdx(i);
        await new Promise((r) => setTimeout(r, 220));
      }
      const data = await transformCandidates({
        ...files,
        github: urls.github.trim() || null,
        linkedin: urls.linkedin.trim() || null,
      });
      setStageIdx(PIPELINE_STAGES.length - 1);
      setResult(data);
    } catch (e) {
      setError(e.message || "Pipeline failed");
    } finally {
      setLoading(false);
    }
  }, [files, urls, hasStructured, hasUnstructured]);

  return (
    <div className="relative max-w-5xl mx-auto px-6">
      <Hero />
      <UploadSection files={files} setFile={setFile} clearFile={clearFile} inputs={inputs} urls={urls} setUrl={setUrl} />
      <GenerateBar onRun={run} onReset={reset} loading={loading} hasResult={!!result} />
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}
      <Pipeline stageIdx={stageIdx} loading={loading} done={!!result} />
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            id="results"
          >
            <ProfileCard profile={result.profile} validation={result.validation_report} />
            <SkillsSection profile={result.profile} />
            <ValidationChecklist vr={result.validation_report} profile={result.profile} />
            <ProvenanceTable profile={result.profile} />
            <JsonViewer profile={result.profile} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <header className="relative pt-16 pb-10 text-center">
      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-indigo-200 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> ProfileFusion AI
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] mb-4">
          ProfileFusion <span className="grad-text">AI</span>
        </h1>
        <p className="max-w-2xl mx-auto text-white/55 text-base leading-relaxed">
          Merge structured and unstructured candidate data into a single canonical profile
          with confidence scoring and provenance tracking.
        </p>
      </motion.div>
    </header>
  );
}


// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function UploadSection({ files, setFile, clearFile, inputs, urls, setUrl }) {
  return (
    <section id="upload" className="pb-8">
      <SectionHeader title="Upload Sources" subtitle="At least one structured (CSV / ATS) and one unstructured (PDF / TXT / GitHub / LinkedIn) source." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.keys(SOURCES).map((k) => (
          <FileSlot key={k} k={k} file={files[k]} setFile={setFile} clearFile={clearFile} inputs={inputs} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <UrlSlot
          k="github" label="GitHub Profile URL" icon={Github}
          placeholder="https://github.com/username"
          value={urls.github} onChange={(v) => setUrl("github", v)}
        />
        <UrlSlot
          k="linkedin" label="LinkedIn Profile URL" icon={Linkedin}
          placeholder="https://www.linkedin.com/in/username"
          value={urls.linkedin} onChange={(v) => setUrl("linkedin", v)}
        />
      </div>
    </section>
  );
}

function UrlSlot({ label, icon: Icon, placeholder, value, onChange }) {
  const filled = !!value.trim();
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
      filled ? "border-indigo-400/40 bg-indigo-500/[0.06]" : "border-white/10 bg-white/[0.02]"
    }`}>
      <div className={`w-10 h-10 rounded-lg grid place-items-center ${
        filled ? "bg-indigo-500/15 text-indigo-300" : "bg-white/5 text-white/55"
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {filled && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-300" />}
        </div>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-0.5 w-full bg-transparent text-xs text-white/80 placeholder:text-white/30 focus:outline-none"
        />
      </div>
      {filled && (
        <button type="button" onClick={() => onChange("")} className="btn-white p-1.5 rounded-md" title="Clear">
          <X className="w-4 h-4 text-black" />
        </button>
      )}
    </div>
  );
}

function AnimatedCheck() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-indigo-300" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5l5 5 11-11" className="check-draw" />
    </svg>
  );
}

function FileSlot({ k, file, setFile, clearFile, inputs }) {
  const meta = SOURCES[k];
  const Icon = meta.icon;
  const [drag, setDrag] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const ref = useRef(null);
  const prevFile = useRef(file);

  useEffect(() => {
    if (file && file !== prevFile.current) {
      setJustAdded(true);
      const t = setTimeout(() => setJustAdded(false), 900);
      prevFile.current = file;
      return () => clearTimeout(t);
    }
    prevFile.current = file;
  }, [file]);

  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-py * 6).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 8).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.setProperty("--rx", `0deg`);
    el.style.setProperty("--ry", `0deg`);
  };

  return (
    <label
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) setFile(k, f);
      }}
      style={{ transform: "perspective(700px) rotateX(var(--rx,0)) rotateY(var(--ry,0))" }}
      className={`tilt-card group relative flex items-center gap-3 rounded-xl border px-4 py-3.5 cursor-pointer overflow-hidden transition-all duration-200 will-change-transform ${
        drag ? "drag-active border-transparent scale-[1.02]"
             : file ? "border-indigo-400/40 bg-indigo-500/[0.06]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
      } ${justAdded ? "accepted-pop" : ""}`}
    >
      {/* cursor spotlight */}
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: "radial-gradient(220px circle at var(--mx,50%) var(--my,50%), rgba(139,92,246,0.18), transparent 60%)",
        }}
      />
      {/* animated dashed border on drag */}
      {drag && (
        <span aria-hidden className="dashed-glow pointer-events-none absolute inset-0 rounded-xl" />
      )}

      <div className={`relative w-10 h-10 rounded-lg grid place-items-center transition ${
        file ? "bg-indigo-500/15 text-indigo-300" : drag ? "bg-violet-500/20 text-violet-200" : "bg-white/5 text-white/55"
      } ${drag ? "animate-bounce-soft" : ""}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{meta.label}</span>
          {file && <AnimatedCheck />}
        </div>
        <div className="text-xs text-white/45 truncate">
          {drag ? <span className="text-violet-200">Drop to ingest…</span> : file ? file.name : meta.hint}
        </div>
      </div>
      <input
        ref={(el) => (inputs.current[k] = el)}
        type="file" accept={meta.accept} className="hidden"
        onChange={(e) => e.target.files?.[0] && setFile(k, e.target.files[0])}
      />
      {file ? (
        <button type="button" onClick={(e) => { e.preventDefault(); clearFile(k); }}
          className="relative btn-white p-1.5 rounded-md" title="Replace file">
          <X className="w-4 h-4 text-black" />
        </button>
      ) : (
        <Upload className={`relative w-4 h-4 transition ${drag ? "text-violet-200 -translate-y-0.5" : "text-white/40"}`} />
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

function GenerateBar({ onRun, onReset, loading, hasResult }) {
  return (
    <section className="py-6 flex flex-wrap items-center justify-center gap-3">
      <button
        onClick={onRun} disabled={loading}
        className="btn-white px-7 py-3.5 text-sm gap-2 disabled:opacity-60"
      >
        {loading
          ? <RefreshCw className="w-4 h-4 animate-spin text-black" />
          : <Sparkles className="w-4 h-4 text-black" />}
        <span className="text-black">{loading ? "Processing…" : "Generate Candidate Profile"}</span>
      </button>
      {hasResult && (
        <button onClick={onReset} className="btn-white-outline px-4 py-3.5 text-sm gap-2">
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pipeline (6 steps)
// ---------------------------------------------------------------------------

function Pipeline({ stageIdx, loading, done }) {
  return (
    <section id="pipeline" className="pb-10">
      <SectionHeader title="Processing Pipeline" subtitle="" />
      <div className="card p-5">
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PIPELINE_STAGES.map((s, i) => {
            const active = stageIdx >= i;
            const current = stageIdx === i && loading && !done;
            const Icon = s.icon;
            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0.6 }} animate={{ opacity: active ? 1 : 0.5 }}
                className={`relative rounded-xl border px-3 py-3 flex items-center gap-2.5 transition-colors ${
                  active ? "border-indigo-400/40 bg-indigo-500/[0.08]" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <motion.div
                  animate={current ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={current ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
                  className={`w-7 h-7 rounded-md grid place-items-center shrink-0 ${
                    active ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "bg-white/5 text-white/40"
                  }`}
                >
                  {active && !current ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </motion.div>
                <span className={`text-xs font-medium leading-tight ${active ? "text-white" : "text-white/50"}`}>
                  {s.label}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile card + Confidence
// ---------------------------------------------------------------------------

function ProfileCard({ profile, validation }) {
  return (
    <section className="pb-8">
      <SectionHeader title="Candidate Profile" subtitle="" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center text-xl font-semibold">
              {initials(profile.full_name)}
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-tight truncate">{profile.full_name || "Unknown"}</div>
              <div className="text-sm text-white/55 truncate">{profile.headline || "—"}</div>
            </div>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <InfoRow icon={Mail}     label="Email"    value={(profile.emails || []).join(", ")} />
            <InfoRow icon={Phone}    label="Phone"    value={(profile.phones || []).join(", ")} />
            <InfoRow icon={MapPin}   label="Location" value={fmtLocation(profile.location)} />
            <InfoRow icon={Linkedin} label="LinkedIn" value={profile.links?.linkedin} link />
            <InfoRow icon={Github}   label="GitHub"   value={profile.links?.github} link />
          </dl>
        </div>
        <div className="card p-6 flex flex-col items-center justify-center">
          <CircularGauge value={profile.overall_confidence || 0} />
          <div className="mt-3 text-[10px] uppercase tracking-wider text-white/45">Overall Confidence</div>
          <div className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            validation?.valid
              ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-200"
              : "border-amber-400/30 bg-amber-500/10 text-amber-200"
          }`}>
            {validation?.valid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {validation?.valid ? "Validation Passed" : `${validation?.errors?.length || 0} issue(s)`}
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoRow({ icon: Icon, label, value, link }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
        {link && value ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 font-mono text-xs break-all">{value}</a>
        ) : (
          <div className="font-mono text-xs text-white/85 break-all">{value || "—"}</div>
        )}
      </div>
    </div>
  );
}

function CircularGauge({ value }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 700);
      setV(value * p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const r = 56, c = 2 * Math.PI * r;
  return (
    <div className="relative w-36 h-36">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="12" fill="none" />
        <circle
          cx="70" cy="70" r={r} strokeWidth="12" fill="none" strokeLinecap="round"
          stroke="url(#cgrad)"
          strokeDasharray={c} strokeDashoffset={c - c * v}
        />
        <defs>
          <linearGradient id="cgrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-3xl font-semibold">
          {Math.round(v * 100)}<span className="text-sm text-white/40">%</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

function SkillsSection({ profile }) {
  if (!profile.skills?.length) return null;
  return (
    <section className="pb-8">
      <SectionHeader title={`Skills (${profile.skills.length})`} subtitle="" />
      <div className="card p-5">
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((s) => {
            const sources = (s.sources || []).map((x) => SOURCE_KEY_MAP[x] || x).join(" | ").toUpperCase();
            return (
              <span
                key={s.name}
                title={sources || "—"}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 hover:bg-violet-500/15 transition"
              >
                <span className="text-sm font-medium text-white">{s.name}</span>
                <span className="text-[10px] font-mono text-violet-200">{pct(s.confidence)}%</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Validation checklist
// ---------------------------------------------------------------------------

function ValidationChecklist({ vr, profile }) {
  if (!vr) return null;
  const checks = [
    { label: "Email Normalized",        ok: (profile.emails || []).every((e) => e === e.toLowerCase()) },
    { label: "Phone Standardized",      ok: (profile.phones || []).every((p) => /^\+\d{8,15}$/.test(p)) },
    { label: "Duplicate Skills Removed", ok: new Set((profile.skills || []).map((s) => s.name)).size === (profile.skills || []).length },
    { label: "Validation Passed",       ok: !!vr.valid },
  ];
  return (
    <section className="pb-8">
      <SectionHeader title="Validation" subtitle="" />
      <div className="card p-5">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-sm">
              {c.ok
                ? <CheckCircle2 className="w-4 h-4 text-indigo-300 shrink-0" />
                : <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
              <span className={c.ok ? "text-white/85" : "text-amber-200"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

function ProvenanceTable({ profile }) {
  const rows = profile.provenance || [];
  if (!rows.length) return null;
  return (
    <section className="pb-8">
      <SectionHeader title="Provenance" subtitle="" />
      <div className="card overflow-hidden">
        <div className="max-h-80 overflow-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/50 sticky top-0">
              <tr>
                <th className="text-left px-5 py-3">Field</th>
                <th className="text-left px-5 py-3">Source</th>
                <th className="text-left px-5 py-3">Method</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-5 py-2.5 font-mono text-white/85">{p.field}</td>
                  <td className="px-5 py-2.5 text-indigo-300 uppercase text-xs">{SOURCE_KEY_MAP[p.source] || p.source}</td>
                  <td className="px-5 py-2.5 text-white/55 text-xs">{p.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// JSON Viewer
// ---------------------------------------------------------------------------

function JsonViewer({ profile }) {
  const [copied, setCopied] = useState(false);
  const txt = JSON.stringify(profile, null, 2);
  const onCopy = () => {
    navigator.clipboard.writeText(txt);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <section className="pb-12">
      <SectionHeader title="Canonical JSON" subtitle="" />
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-xs text-white/55">
            <FileJson className="w-4 h-4 text-indigo-300" />
            <span className="font-mono">profile.json</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCopy} className="btn-white text-xs px-2.5 py-1.5 rounded-md gap-1.5">
              <Copy className="w-3.5 h-3.5 text-black" /> <span className="text-black">{copied ? "Copied" : "Copy"}</span>
            </button>
            <button onClick={() => download("profile.json", profile)} className="btn-white text-xs px-2.5 py-1.5 rounded-md gap-1.5">
              <Download className="w-3.5 h-3.5 text-black" /> <span className="text-black">Download</span>
            </button>
          </div>
        </div>
        <pre className="p-5 overflow-auto text-xs leading-relaxed bg-black/40 max-h-[480px] font-mono scrollbar-thin">
          <Highlighted text={txt} />
        </pre>
      </div>
    </section>
  );
}

function Highlighted({ text }) {
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span style="color:#a5b4fc">$1</span>$2')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span style="color:#c4b5fd">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span style="color:#f59e0b">$1</span>')
    .replace(/\b(-?\d+\.?\d*)\b/g, '<span style="color:#f0abfc">$1</span>');
  return <code dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
    </div>
  );
}
