import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";
import {
  COMPETITIVE_LANGUAGES,
  validateCompetitiveLanguages
} from "../constants/competitiveLanguages";
import "../styles/auth.css";

const PASSWORD_POLICY_HINT = "Use at least 8 characters with upper, lower, number and special character.";

function parseLanguagesInput(value) {
  return String(value || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

function Register() {
  const navigate = useNavigate();
  const [institutes, setInstitutes] = useState([]);
  const [loadingInstitutes, setLoadingInstitutes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    languages: "",
    collegeName: "",
    collegeCode: ""
  });

  const allowedLanguagesText = useMemo(
    () => COMPETITIVE_LANGUAGES.join(", "),
    []
  );

  useEffect(() => {
    API.get("/institution/list")
      .then(res => {
        setInstitutes(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setInstitutes([]);
      })
      .finally(() => {
        setLoadingInstitutes(false);
      });
  }, []);

  const submitHandler = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const password = form.password;

    if (!name || !email || !password) {
      setError("Name, email and password are required.");
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(password)) {
      setError(PASSWORD_POLICY_HINT);
      return;
    }

    const parsedLanguages = parseLanguagesInput(form.languages);
    const languageCheck = validateCompetitiveLanguages(parsedLanguages);
    if (!languageCheck.valid) {
      setError(`Invalid language(s): ${languageCheck.invalid.join(", ")}. Allowed: ${allowedLanguagesText}.`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await API.post("/auth/register", {
        name,
        email,
        password,
        institution: form.collegeName || "",
        institutionCode: form.collegeCode || "",
        collegeName: form.collegeName || "",
        collegeCode: form.collegeCode || "",
        languages: languageCheck.languages
      });
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-glow auth-glow-left" aria-hidden="true" />
      <div className="auth-glow auth-glow-right" aria-hidden="true" />

      <div className="auth-card auth-card-entrance">
        <div className="auth-head">
          <p className="auth-eyebrow">Code Arena</p>
          <h2>Create Account</h2>
          <p className="auth-sub">Set up your profile and start solving challenges.</p>
        </div>

        <div className="auth-form">
          <label>
            <span>Name</span>
            <input
              placeholder="Enter your name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              placeholder="Create password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <p className="auth-sub">{PASSWORD_POLICY_HINT}</p>

          <label>
            <span>Languages</span>
            <input
              list="competitive-languages"
              placeholder="Python, Java"
              value={form.languages}
              onChange={e => setForm({ ...form, languages: e.target.value })}
            />
          </label>
          <datalist id="competitive-languages">
            {COMPETITIVE_LANGUAGES.map(lang => (
              <option key={lang} value={lang} />
            ))}
          </datalist>
          <p className="auth-sub">Allowed: {allowedLanguagesText}</p>

          <label>
            <span>College / Institution (Optional)</span>
            <input
              placeholder="Institution name"
              value={form.collegeName}
              onChange={e => setForm({ ...form, collegeName: e.target.value })}
            />
          </label>

          <label>
            <span>College Code (Optional)</span>
            <select
              value={form.collegeCode}
              onChange={e => {
                const code = e.target.value;
                const selected = institutes.find(i => i.code === code);
                setForm({
                  ...form,
                  collegeCode: code,
                  collegeName: selected?.name || form.collegeName
                });
              }}
              disabled={loadingInstitutes}
            >
              <option value="">Skip Institution Mode</option>
              {institutes.map(i => (
                <option key={i.code} value={i.code}>
                  {i.name} ({i.code})
                </option>
              ))}
            </select>
          </label>
          <p className="auth-sub">No college code? You can still use Solo, Random and Room modes normally.</p>

          {!!error && <p className="auth-error">{error}</p>}

          <button className="auth-primary" onClick={submitHandler} disabled={submitting}>
            {submitting ? "Creating..." : "Create Account"}
          </button>
        </div>

        <div className="auth-row-links">
          <p>
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
