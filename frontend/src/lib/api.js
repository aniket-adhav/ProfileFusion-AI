// Self-contained browser-side transform that mirrors the Python backend.
// No server required — the UI runs entirely in the browser.
//
// Supported sources: CSV, ATS JSON, PDF, TXT.

import Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Bundle worker via Vite so it works offline and matches the pdfjs version.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY = {
  ats_json: 5,
  resume_pdf: 4,
  github_api: 4,
  resume_txt: 3,
  recruiter_csv: 3,
  linkedin_url: 2,
};

const SKILL_ALIASES = {
  js: "JavaScript", javascript: "JavaScript", ecmascript: "JavaScript",
  ts: "TypeScript", typescript: "TypeScript",
  py: "Python", python: "Python", python3: "Python",
  node: "Node.js", nodejs: "Node.js", "node.js": "Node.js",
  react: "React", reactjs: "React", "react.js": "React",
  next: "Next.js", nextjs: "Next.js", "next.js": "Next.js",
  vue: "Vue.js", vuejs: "Vue.js",
  ng: "Angular", angular: "Angular",
  express: "Express.js", expressjs: "Express.js",
  fastapi: "FastAPI", flask: "Flask", django: "Django",
  springboot: "Spring Boot", "spring boot": "Spring Boot",
  firebase: "Firebase", room: "Room Database", "room database": "Room Database",
  gradle: "Gradle", maven: "Maven", postman: "Postman", vercel: "Vercel",
  keras: "Keras", "sentence-bert": "Sentence-BERT", sbert: "Sentence-BERT",
  tf: "TensorFlow", tensorflow: "TensorFlow",
  pytorch: "PyTorch", torch: "PyTorch",
  sklearn: "scikit-learn", "scikit-learn": "scikit-learn",
  numpy: "NumPy", np: "NumPy",
  pandas: "pandas", pd: "pandas",
  sql: "SQL", mysql: "MySQL", postgres: "PostgreSQL", postgresql: "PostgreSQL",
  mongo: "MongoDB", mongodb: "MongoDB", redis: "Redis",
  aws: "AWS", gcp: "GCP", azure: "Azure",
  docker: "Docker", k8s: "Kubernetes", kubernetes: "Kubernetes",
  git: "Git", github: "GitHub", gitlab: "GitLab",
  linux: "Linux", bash: "Bash", shell: "Shell",
  html: "HTML", css: "CSS", tailwind: "Tailwind CSS",
  rest: "REST APIs", graphql: "GraphQL",
  java: "Java", "c++": "C++", cpp: "C++", "c#": "C#", go: "Go", golang: "Go",
  rust: "Rust", ruby: "Ruby", php: "PHP", kotlin: "Kotlin", swift: "Swift",
  ml: "Machine Learning", "machine learning": "Machine Learning",
  nlp: "NLP", llm: "LLMs", llms: "LLMs",
};

const COUNTRY_ALPHA2 = {
  usa: "US", us: "US", "united states": "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", "united kingdom": "GB", england: "GB",
  india: "IN", bharat: "IN",
  canada: "CA", australia: "AU", germany: "DE", france: "FR",
  spain: "ES", italy: "IT", netherlands: "NL", brazil: "BR",
  japan: "JP", china: "CN", singapore: "SG", uae: "AE",
  mexico: "MX", "south africa": "ZA", ireland: "IE",
};

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA",
  "MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

const COUNTRY_DIAL = {
  US: "1", CA: "1", GB: "44", IN: "91", AU: "61", DE: "49", FR: "33", ES: "34", IT: "39",
  NL: "31", BR: "55", JP: "81", CN: "86", SG: "65", AE: "971", MX: "52", ZA: "27", IE: "353",
};

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeEmail(value) {
  if (!value) return null;
  const cleaned = String(value).trim().toLowerCase();
  const m = cleaned.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/);
  if (!m) return null;
  const addr = m[0];
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(addr) ? addr : null;
}

function toAlpha2(token) {
  if (!token) return null;
  const t = token.trim();
  if (t.length === 2 && /^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_ALPHA2[t.toLowerCase()] || null;
}

function normalizeLocation(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    const city = value.city || null;
    const region = value.region || value.state || null;
    const country = toAlpha2(value.country) || value.country || null;
    if (!city && !region && !country) return null;
    return { city, region, country };
  }
  const s = String(value).trim();
  if (!s) return null;
  const parts = s.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  let city = null, region = null, country = null;

  if (parts.length === 1) {
    const only = parts[0];
    const alpha = toAlpha2(only);
    if (alpha) country = alpha;
    else city = only;
  } else if (parts.length === 2) {
    city = parts[0];
    if (US_STATES.has(parts[1].toUpperCase())) {
      region = parts[1].toUpperCase();
      country = "US";
    } else {
      const alpha = toAlpha2(parts[1]);
      country = alpha || null;
      region = alpha ? null : parts[1];
    }
  } else {
    city = parts[0];
    region = parts[1];
    country = toAlpha2(parts[parts.length - 1]) || parts[parts.length - 1];
    if (US_STATES.has(region.toUpperCase()) && !country) country = "US";
  }
  return { city, region, country };
}

function normalizePhone(value, countryHint) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }

  const cc = COUNTRY_DIAL[(countryHint || "").toUpperCase()];
  if (cc) {
    let d = digits.startsWith("0") ? digits.replace(/^0+/, "") : digits;
    if (!d.startsWith(cc)) d = cc + d;
    if (d.length < 8 || d.length > 15) return null;
    return "+" + d;
  }
  if (digits.length === 10) {
    return "+1" + digits;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return "+" + digits;
  }
  return null;
}

function normalizeSkills(raw) {
  if (raw == null) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[,;|\/\n]+/);
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (item == null) continue;
    const s = String(item).trim();
    if (!s) continue;
    const canonical = SKILL_ALIASES[s.toLowerCase()] || s;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

function normalizeMonth(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || /^(present|current|now)$/i.test(s)) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
  }
  m = s.match(/^([A-Za-z]{3,9})[\s,]+(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${String(parseInt(m[2], 10)).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
  }
  m = s.match(/(19|20)\d{2}/);
  return m ? m[0] : null;
}

function normalizeYear(value) {
  if (value == null) return null;
  const m = String(value).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s.\-]?)?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}/g;
const LINKEDIN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_\-]+/gi;
const GITHUB_RE = /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_\-]+/gi;
const URL_RE = /https?:\/\/[\w.\-]+\.[A-Za-z]{2,}(?:\/[\w./?&=%\-]*)?/g;
const HEADLINE_HINT = /(engineer|developer|intern|manager|designer|scientist|analyst|consultant|lead|architect|student)/i;
const EXP_YEARS_RE = /(\d+(?:\.\d+)?)\s*\+?\s*years?\s+(?:of\s+)?experience/i;

function uniq(seq) {
  const seen = new Set();
  const out = [];
  for (const v of seq) {
    if (!v) continue;
    const key = typeof v === "string" ? v.toLowerCase() : v;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function skillsFromText(text, source) {
  const found = [];
  const seen = new Set();
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
    const safe = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-z0-9])${safe}(?:[^a-z0-9]|$)`);
    if (re.test(lower)) {
      const key = canonical.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ name: canonical, source, method: "keyword_match" });
    }
  }
  return found;
}

function nameFromText(text) {
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6)) {
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line)) return line;
  }
  return null;
}

function headlineFromText(text) {
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8)) {
    if (line.length >= 6 && line.length <= 90 && !/@|http|\d{3,}/.test(line) && HEADLINE_HINT.test(line)) {
      return line;
    }
  }
  return null;
}

function locationFromText(text) {
  const m = text.match(/\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s*,\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\b/);
  return m ? normalizeLocation(`${m[1]}, ${m[2]}`) : null;
}

function linksFromText(text) {
  const linkedin = (text.match(LINKEDIN_RE) || [])[0] || null;
  const github = (text.match(GITHUB_RE) || [])[0] || null;
  const other = [];
  for (const u of text.match(URL_RE) || []) {
    const clean = u.replace(/[.,;]$/, "");
    if (clean === linkedin || clean === github) continue;
    if (!other.includes(clean)) other.push(clean);
  }
  return { linkedin, github, portfolio: null, other };
}

// ---------------------------------------------------------------------------
// Record builders (mirror Python extractors)
// ---------------------------------------------------------------------------

function recordFromCsvRow(row, source = "recruiter_csv") {
  const location = normalizeLocation(row.location || row.city || row.address);
  const country = location?.country;
  const emails = uniq(
    ["email", "email_address", "primary_email"]
      .map((k) => normalizeEmail(row[k]))
      .filter(Boolean)
  );
  const phones = uniq(
    ["phone", "phone_number", "mobile"]
      .map((k) => normalizePhone(row[k], country))
      .filter(Boolean)
  );
  const rawSkills = row.skills || row.technologies || row.tech_stack || "";
  const skills = normalizeSkills(rawSkills).map((s) => ({ name: s, source, method: "csv_field" }));
  let yrs = row.years_of_experience || row.experience_years;
  try { yrs = yrs != null && yrs !== "" ? parseFloat(yrs) : null; } catch { yrs = null; }

  return {
    source,
    kind: "structured",
    method: "csv_field",
    full_name: row.name || row.full_name || row.candidate_name || null,
    emails,
    phones,
    location,
    links: {
      linkedin: row.linkedin || null,
      github: row.github || null,
      portfolio: row.portfolio || row.website || null,
      other: [],
    },
    headline: row.title || row.current_role || row.role || row.headline || null,
    years_experience: yrs,
    skills,
    experience: [],
    education: [],
  };
}

function recordFromAts(data, source = "ats_json") {
  const root = Array.isArray(data) && data.length ? data[0] : data;
  if (!root || typeof root !== "object") return null;
  const c = typeof root.candidate === "object" ? root.candidate : root;

  const fullName =
    c.fullName ||
    c.full_name ||
    [c.firstName || c.first_name, c.lastName || c.last_name].filter(Boolean).join(" ").trim() ||
    c.name ||
    null;

  const rawEmails = [];
  for (const src of [c.emailAddresses, c.emails]) {
    if (Array.isArray(src)) {
      for (const e of src) rawEmails.push(typeof e === "object" ? e.value || e.email : e);
    }
  }
  if (c.email) rawEmails.push(c.email);

  const rawPhones = [];
  for (const src of [c.phoneNumbers, c.phones]) {
    if (Array.isArray(src)) {
      for (const p of src) rawPhones.push(typeof p === "object" ? p.value || p.number : p);
    }
  }
  if (c.phone) rawPhones.push(c.phone);

  const location = normalizeLocation(c.location || c.address);
  const country = location?.country;
  const emails = uniq(rawEmails.map(normalizeEmail).filter(Boolean));
  const phones = uniq(rawPhones.map((p) => normalizePhone(p, country)).filter(Boolean));

  let rawSkills = c.skills || c.skillSet || c.tags || [];
  if (typeof rawSkills === "string") rawSkills = rawSkills.split(/[,;|]+/);
  const flat = rawSkills.map((s) => (typeof s === "object" ? s.name || s.skill : s));
  const skills = normalizeSkills(flat).map((s) => ({ name: s, source, method: "json_field" }));

  const experience = [];
  for (const e of c.experience || c.workHistory || c.positions || []) {
    if (!e || typeof e !== "object") continue;
    const item = {
      company: e.company || e.employer || e.organization || null,
      title: e.title || e.position || e.role || null,
      start: normalizeMonth(e.start || e.startDate || e.from),
      end: normalizeMonth(e.end || e.endDate || e.to),
      summary: e.summary || e.description || null,
    };
    if (item.company || item.title) experience.push(item);
  }

  const education = [];
  for (const e of c.education || c.schools || []) {
    if (!e || typeof e !== "object") continue;
    const item = {
      institution: e.institution || e.school || e.university || null,
      degree: e.degree || null,
      field: e.field || e.fieldOfStudy || e.major || null,
      end_year: normalizeYear(e.end || e.endDate || e.graduationYear || e.endYear),
    };
    if (item.institution) education.push(item);
  }

  let yrs = c.yearsOfExperience || c.experienceYears || c.years_experience;
  try { yrs = yrs != null ? parseFloat(yrs) : null; } catch { yrs = null; }

  return {
    source,
    kind: "structured",
    method: "json_field",
    full_name: fullName,
    emails,
    phones,
    location,
    links: {
      linkedin: c.linkedin || c.linkedinUrl || null,
      github: c.github || c.githubUrl || null,
      portfolio: c.portfolio || c.website || null,
      other: [],
    },
    headline: c.headline || c.title || c.currentTitle || null,
    years_experience: yrs,
    skills,
    experience,
    education,
  };
}

function recordFromText(text, source) {
  if (!text || !text.trim()) return null;
  const location = locationFromText(text);
  const country = location?.country;
  return {
    source,
    kind: "unstructured",
    method: "regex_extract",
    full_name: nameFromText(text),
    emails: uniq(Array.from(text.matchAll(EMAIL_RE), (m) => normalizeEmail(m[0])).filter(Boolean)),
    phones: uniq(Array.from(text.matchAll(PHONE_RE), (m) => normalizePhone(m[0], country)).filter(Boolean)),
    location,
    links: linksFromText(text),
    headline: headlineFromText(text),
    years_experience: (() => {
      const m = text.match(EXP_YEARS_RE);
      return m ? parseFloat(m[1]) : null;
    })(),
    skills: skillsFromText(text, source),
    experience: [],
    education: [],
  };
}

// ---------------------------------------------------------------------------
// Merge engine
// ---------------------------------------------------------------------------

function pri(source) {
  return SOURCE_PRIORITY[source] || 0;
}

function stableId(seed) {
  // Simple deterministic hash -> uuid-like string.
  let h = 0;
  const s = String(seed || "candidate");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `cand-${hex}-${Date.now().toString(36).slice(-4)}`;
}

function pickScalar(field, records) {
  const contribs = records
    .filter((r) => r[field] != null && r[field] !== "" && r[field].length !== 0)
    .map((r) => ({ source: r.source, method: r.method, value: r[field] }));
  if (!contribs.length) return { value: null, contributors: [], winner: null };
  const winner = contribs.reduce((a, b) => (pri(a.source) >= pri(b.source) ? a : b));
  return { value: winner.value, contributors: contribs, winner };
}

function pickLocation(records) {
  const contribs = records
    .filter((r) => r.location && (r.location.city || r.location.region || r.location.country))
    .map((r) => ({ source: r.source, method: r.method, value: r.location }));
  if (!contribs.length) return { value: null, contributors: [], winner: null };
  const sorted = [...contribs].sort((a, b) => pri(b.source) - pri(a.source));
  const merged = { city: null, region: null, country: null };
  for (const f of ["city", "region", "country"]) {
    for (const c of sorted) {
      if (c.value[f]) {
        merged[f] = c.value[f];
        break;
      }
    }
  }
  return { value: merged, contributors: contribs, winner: sorted[0] };
}

function mergeStringList(records, field) {
  const items = [];
  const seen = new Set();
  const byValue = {};
  for (const r of records) {
    for (const v of r[field] || []) {
      const key = String(v).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push(v);
      }
      byValue[key] = byValue[key] || [];
      if (!byValue[key].includes(r.source)) byValue[key].push(r.source);
    }
  }
  return [items, byValue];
}

function mergeLinks(records) {
  const merged = { linkedin: null, github: null, portfolio: null, other: [] };
  const sorted = [...records].sort((a, b) => pri(b.source) - pri(a.source));
  for (const r of sorted) {
    const links = r.links || {};
    for (const f of ["linkedin", "github", "portfolio"]) {
      if (!merged[f] && links[f]) merged[f] = links[f];
    }
    for (const u of links.other || []) {
      if (u && u !== merged.linkedin && u !== merged.github && u !== merged.portfolio && !merged.other.includes(u)) {
        merged.other.push(u);
      }
    }
  }
  return merged;
}

function mergeSkills(records) {
  const byName = new Map();
  for (const r of records) {
    for (const s of r.skills || []) {
      const key = s.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, { name: s.name, sources: [] });
      const entry = byName.get(key);
      if (!entry.sources.includes(r.source)) entry.sources.push(r.source);
    }
  }
  const out = [];
  for (const e of byName.values()) {
    const conf = Math.min(1, Math.round((0.5 + 0.2 * (e.sources.length - 1) + 0.1) * 1000) / 1000);
    out.push({ name: e.name, confidence: conf, sources: e.sources });
  }
  return out;
}

function mergeListByKey(records, field, keyFn) {
  const seen = new Map();
  for (const r of records) {
    for (const item of r[field] || []) {
      const k = keyFn(item);
      if (!k) continue;
      if (!seen.has(k)) {
        seen.set(k, { ...item, _sources: [r.source] });
      } else if (!seen.get(k)._sources.includes(r.source)) {
        seen.get(k)._sources.push(r.source);
      }
    }
  }
  return Array.from(seen.values()).map(({ _sources, ...rest }) => rest);
}

function serialize(v) {
  return JSON.stringify(v, Object.keys(v || {}).sort());
}

function confidenceFor(pick) {
  if (!pick || !pick.contributors.length) return 0;
  const winnerJson = JSON.stringify(pick.value);
  const agree = pick.contributors.filter((c) => JSON.stringify(c.value) === winnerJson).length;
  const total = pick.contributors.length;
  const base = 0.55 + 0.1 * (pri(pick.winner.source) / 5);
  return Math.min(1, Math.round((base + 0.25 * (agree / total) + 0.05 * (agree - 1)) * 1000) / 1000);
}

function mergeRecords(records) {
  if (!records.length) throw new Error("merge_records called with no records");

  const name = pickScalar("full_name", records);
  const headline = pickScalar("headline", records);
  const yearsExp = pickScalar("years_experience", records);
  const location = pickLocation(records);

  const [allEmails, emailContribs] = mergeStringList(records, "emails");
  const [allPhones, phoneContribs] = mergeStringList(records, "phones");
  // Spec: keep a single canonical email and phone. Pick the value with the
  // most agreeing sources; tie-break by first occurrence (already ordered).
  const pickBest = (items, contribs) => {
    if (!items.length) return [];
    let best = items[0];
    let bestCount = (contribs[String(best).toLowerCase()] || []).length;
    for (const it of items.slice(1)) {
      const c = (contribs[String(it).toLowerCase()] || []).length;
      if (c > bestCount) { best = it; bestCount = c; }
    }
    return [best];
  };
  const emails = pickBest(allEmails, emailContribs);
  const phones = pickBest(allPhones, phoneContribs);
  const links = mergeLinks(records);
  const skills = mergeSkills(records);
  const experience = mergeListByKey(
    records,
    "experience",
    (e) => `${(e.company || "").toLowerCase()}|${(e.title || "").toLowerCase()}|${e.start || ""}`
  );
  const education = mergeListByKey(
    records,
    "education",
    (e) => `${(e.institution || "").toLowerCase()}|${(e.degree || "").toLowerCase()}`
  );

  const provenance = [];
  for (const [field, pick] of [
    ["full_name", name],
    ["headline", headline],
    ["years_experience", yearsExp],
    ["location", location],
  ]) {
    for (const c of pick.contributors) {
      provenance.push({ field, source: c.source, method: c.method });
    }
  }
  for (const r of records) {
    for (const field of ["emails", "phones", "skills", "experience", "education"]) {
      if (r[field] && r[field].length) provenance.push({ field, source: r.source, method: r.method });
    }
    const linksR = r.links || {};
    if (linksR.linkedin || linksR.github || linksR.portfolio || (linksR.other && linksR.other.length)) {
      provenance.push({ field: "links", source: r.source, method: r.method });
    }
  }

  const fieldConfs = [
    confidenceFor(name),
    confidenceFor(headline),
    confidenceFor(yearsExp),
    confidenceFor(location),
  ];
  if (emails.length) {
    const firstSources = emailContribs[Object.keys(emailContribs)[0]] || [];
    fieldConfs.push(Math.min(1, 0.6 + 0.1 * firstSources.length));
  }
  if (phones.length) {
    const firstSources = phoneContribs[Object.keys(phoneContribs)[0]] || [];
    fieldConfs.push(Math.min(1, 0.6 + 0.1 * firstSources.length));
  }
  if (skills.length) {
    fieldConfs.push(skills.reduce((a, s) => a + s.confidence, 0) / skills.length);
  }
  const validConfs = fieldConfs.filter((c) => c > 0);
  const overall = validConfs.length ? Math.round((validConfs.reduce((a, b) => a + b, 0) / validConfs.length) * 1000) / 1000 : 0;

  const candidateId = stableId(name.value || (emails[0] || links.linkedin || "candidate"));

  const profile = {
    candidate_id: candidateId,
    full_name: name.value,
    emails,
    phones,
    location: location.value,
    links,
    headline: headline.value,
    years_experience: yearsExp.value,
    skills,
    experience,
    education,
    provenance,
    overall_confidence: overall,
  };

  const mergeReport = {
    record_count: records.length,
    sources: records.map((r) => r.source),
    field_decisions: {
      full_name: name,
      headline,
      years_experience: yearsExp,
      location,
      emails: { items: emails, contributors: emailContribs },
      phones: { items: phones, contributors: phoneContribs },
    },
    skill_count: skills.length,
    experience_count: experience.length,
    education_count: education.length,
    generated_at: new Date().toISOString(),
  };

  return [profile, mergeReport];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_VALID_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const E164_RE = /^\+\d{8,15}$/;

function validateProfile(profile) {
  const errors = [];
  const warnings = [];

  if (!profile.candidate_id) errors.push({ field: "candidate_id", code: "missing" });
  if (!profile.full_name) warnings.push({ field: "full_name", code: "missing" });

  for (const e of profile.emails || []) {
    if (!EMAIL_VALID_RE.test(e || "")) errors.push({ field: "emails", code: "invalid_format", value: e });
  }
  for (const p of profile.phones || []) {
    if (!E164_RE.test(p || "")) errors.push({ field: "phones", code: "not_e164", value: p });
  }

  const loc = profile.location;
  if (loc && loc.country && !/^[A-Z]{2}$/.test(String(loc.country))) {
    warnings.push({ field: "location.country", code: "not_iso_alpha2", value: loc.country });
  }

  const oc = profile.overall_confidence;
  if (typeof oc !== "number" || oc < 0 || oc > 1) {
    errors.push({ field: "overall_confidence", code: "out_of_range", value: oc });
  }

  return {
    valid: !errors.length,
    errors,
    warnings,
    checked_fields: ["candidate_id", "full_name", "emails", "phones", "location.country", "overall_confidence"],
  };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function getByPath(obj, expr) {
  if (!expr) return null;
  const tokens = [];
  const re = /\[(\d*)\]|([A-Za-z_][\w]*)/g;
  let m;
  while ((m = re.exec(expr))) {
    if (m[2]) tokens.push({ kind: "name", val: m[2] });
    else tokens.push({ kind: "idx", val: m[1] });
  }
  let cur = obj;
  for (let i = 0; i < tokens.length; i++) {
    if (cur == null) return null;
    const { kind, val } = tokens[i];
    if (kind === "name") {
      if (typeof cur !== "object") return null;
      cur = cur[val];
    } else {
      if (val === "") {
        const rest = tokens.slice(i + 1);
        if (!Array.isArray(cur)) return null;
        const out = [];
        for (const el of cur) {
          let sub = el;
          for (const { kind: k2, val: v2 } of rest) {
            if (sub == null) break;
            if (k2 === "name") sub = sub[v2];
            else sub = Array.isArray(sub) && Number(v2) < sub.length ? sub[Number(v2)] : null;
          }
          if (sub != null) out.push(sub);
        }
        return out;
      }
      cur = Array.isArray(cur) && Number(val) < cur.length ? cur[Number(val)] : null;
    }
  }
  return cur;
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    cur[p] = cur[p] || {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function applyNormalize(value, kind) {
  if (value == null) return null;
  if (kind === "E164") return Array.isArray(value) ? value.map((v) => normalizePhone(v)).filter(Boolean) : normalizePhone(value);
  if (kind === "email") return Array.isArray(value) ? value.map((v) => normalizeEmail(v)).filter(Boolean) : normalizeEmail(value);
  if (kind === "canonical") return Array.isArray(value) ? normalizeSkills(value) : value;
  if (kind === "lower") return Array.isArray(value) ? value.map((v) => String(v).toLowerCase()) : String(value).toLowerCase();
  return value;
}

function checkType(value, typeStr) {
  if (value == null) return typeStr.endsWith("?");
  const base = typeStr.replace(/\?$/, "");
  if (base === "string") return typeof value === "string";
  if (base === "number") return typeof value === "number" && !isNaN(value);
  if (base === "boolean") return typeof value === "boolean";
  if (base === "object") return typeof value === "object" && !Array.isArray(value);
  if (base === "string[]") return Array.isArray(value) && value.every((v) => typeof v === "string");
  if (base === "number[]") return Array.isArray(value) && value.every((v) => typeof v === "number");
  if (base === "object[]") return Array.isArray(value) && value.every((v) => typeof v === "object" && !Array.isArray(v));
  return true;
}

function project(profile, config) {
  if (!config || !config.fields || !config.fields.length) {
    return { output: profile, errors: [], applied: false };
  }
  const onMissing = config.on_missing || "null";
  const out = {};
  const errors = [];
  for (const f of config.fields) {
    const src = f.from || f.path;
    let value = getByPath(profile, src);
    if (f.normalize) value = applyNormalize(value, f.normalize);
    const missing = value == null || (Array.isArray(value) && !value.length);
    if (missing) {
      if (f.required) errors.push({ field: f.path, code: "missing_required", from: src });
      if (onMissing === "omit") continue;
      value = null;
    }
    if (f.type && value != null && !checkType(value, f.type)) {
      errors.push({ field: f.path, code: "type_mismatch", expected: f.type, got: typeof value });
    }
    setByPath(out, f.path, value);
  }
  if (config.include_confidence) out._overall_confidence = profile.overall_confidence;
  if (config.include_provenance) out._provenance = profile.provenance;
  return { output: out, errors, applied: true };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

async function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.map((row) => {
          const out = {};
          for (const [k, v] of Object.entries(row)) {
            const key = k.trim().toLowerCase().replace(/\s+/g, "_");
            out[key] = v === "" || v === undefined || v === null ? null : v;
          }
          return out;
        });
        resolve(rows);
      },
      error: reject,
    });
  });
}

async function parseAts(file) {
  const text = await file.text();
  return JSON.parse(text);
}

async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text;
}

async function parseTxt(file) {
  return file.text();
}

// ---------------------------------------------------------------------------
// GitHub + LinkedIn URL sources
// ---------------------------------------------------------------------------

const GITHUB_URL_FULL_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/?$/i;
const LINKEDIN_URL_FULL_RE = /^https?:\/\/(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9_\-]{3,100})\/?(?:\?.*)?$/i;

function extractGithubUser(url) {
  if (!url) return null;
  const s = String(url).trim();
  const m = s.match(GITHUB_URL_FULL_RE);
  if (m) return m[1];
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(s) ? s : null;
}

function extractLinkedinSlug(url) {
  if (!url) return null;
  const m = String(url).trim().match(LINKEDIN_URL_FULL_RE);
  return m ? m[1] : null;
}

function nameFromSlug(slug) {
  if (!slug) return null;
  const parts = slug.split(/[-_]+/).filter((p) => p && !/^\d+$/.test(p));
  if (!parts.length) return null;
  const trimmed = parts.slice(0, 4).filter((p) => p.length >= 2);
  if (!trimmed.length) return null;
  return trimmed.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

async function parseGithub(url) {
  const user = extractGithubUser(url);
  if (!user) return null;
  const profileUrl = `https://github.com/${user}`;
  const result = {
    username: user, url: profileUrl, name: null, bio: null,
    location: null, blog: null, languages: [],
  };
  try {
    const res = await fetch(`https://api.github.com/users/${user}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.ok) {
      const data = await res.json();
      result.name = data.name || null;
      result.bio = data.bio || null;
      result.location = data.location || null;
      result.blog = data.blog || null;
    }
    const r2 = await fetch(`https://api.github.com/users/${user}/repos?per_page=30&sort=updated`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (r2.ok) {
      const repos = await r2.json();
      const freq = {};
      for (const r of repos || []) {
        if (!r || r.fork) continue;
        if (r.language) freq[r.language] = (freq[r.language] || 0) + 1;
      }
      result.languages = Object.entries(freq)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([lang]) => lang);
    }
  } catch {
    /* degrade gracefully — URL is still useful */
  }
  return result;
}

function parseLinkedin(url) {
  const slug = extractLinkedinSlug(url);
  if (!slug) return null;
  return {
    slug,
    url: `https://www.linkedin.com/in/${slug}`,
    name_guess: nameFromSlug(slug),
  };
}

function recordFromGithub(gh, source = "github_api") {
  if (!gh || !gh.username) return null;
  let blog = gh.blog || null;
  if (blog && !/^https?:\/\//i.test(blog)) blog = "https://" + blog;
  return {
    source, kind: "unstructured", method: "github_api",
    full_name: gh.name || null,
    emails: [], phones: [],
    location: normalizeLocation(gh.location),
    links: { linkedin: null, github: gh.url, portfolio: blog, other: [] },
    headline: gh.bio || null,
    years_experience: null,
    skills: (gh.languages || []).map((lang) => ({
      name: lang, source, method: "github_languages",
    })),
    experience: [], education: [],
  };
}

function recordFromLinkedin(li, source = "linkedin_url") {
  if (!li || !li.url) return null;
  return {
    source, kind: "unstructured", method: "linkedin_url",
    full_name: li.name_guess || null,
    emails: [], phones: [], location: null,
    links: { linkedin: li.url, github: null, portfolio: null, other: [] },
    headline: null, years_experience: null,
    skills: [], experience: [], education: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function transformCandidates({ csv, ats, pdf, txt, github, linkedin }) {
  const records = [];

  if (csv) {
    const rows = await parseCsv(csv);
    for (const row of rows) {
      const rec = recordFromCsvRow(row);
      if (rec) records.push(rec);
    }
  }

  if (ats) {
    const data = await parseAts(ats);
    const rec = recordFromAts(data);
    if (rec) records.push(rec);
  }

  if (pdf) {
    const text = await parsePdf(pdf);
    const rec = recordFromText(text, "resume_pdf");
    if (rec) records.push(rec);
  }

  if (txt) {
    const text = await parseTxt(txt);
    const rec = recordFromText(text, "resume_txt");
    if (rec) records.push(rec);
  }

  if (github) {
    const gh = await parseGithub(github);
    const rec = recordFromGithub(gh);
    if (rec) records.push(rec);
  }

  if (linkedin) {
    const rec = recordFromLinkedin(parseLinkedin(linkedin));
    if (rec) records.push(rec);
  }

  if (!records.length) throw new Error("No valid sources provided");

  const [profile, mergeReport] = mergeRecords(records);
  const validationReport = validateProfile(profile);
  const projection = { output: profile, errors: [], applied: false };

  return {
    profile,
    merge_report: mergeReport,
    validation_report: validationReport,
    projection,
  };
}
