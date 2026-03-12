export const COMPETITIVE_LANGUAGES = [
  "Java",
  "Python",
  "C++",
  "C",
  "C#",
  "Go",
  "Rust",
  "Kotlin",
  "Swift",
  "JavaScript",
  "TypeScript",
  "Scala",
  "Ruby",
  "PHP"
];

const LANGUAGE_ALIAS_MAP = new Map(
  COMPETITIVE_LANGUAGES.map(name => [name.toLowerCase(), name])
);

LANGUAGE_ALIAS_MAP.set("cpp", "C++");
LANGUAGE_ALIAS_MAP.set("c++", "C++");
LANGUAGE_ALIAS_MAP.set("csharp", "C#");
LANGUAGE_ALIAS_MAP.set("cs", "C#");
LANGUAGE_ALIAS_MAP.set("golang", "Go");
LANGUAGE_ALIAS_MAP.set("js", "JavaScript");
LANGUAGE_ALIAS_MAP.set("ts", "TypeScript");
LANGUAGE_ALIAS_MAP.set("py", "Python");

export function normalizeCompetitiveLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  return LANGUAGE_ALIAS_MAP.get(key) || "";
}

export function validateCompetitiveLanguages(values) {
  const invalid = [];
  const normalized = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach(item => {
    const resolved = normalizeCompetitiveLanguage(item);
    if (!resolved) {
      const raw = String(item || "").trim();
      if (raw) invalid.push(raw);
      return;
    }
    if (seen.has(resolved)) return;
    seen.add(resolved);
    normalized.push(resolved);
  });
  return {
    valid: invalid.length === 0,
    invalid,
    languages: normalized
  };
}