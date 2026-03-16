import "./Footer.css";

const LINKEDIN_URL = "https://www.linkedin.com/in/gowri-shankar-554718315/";
const PORTFOLIO_URL = "https://minato-portfolio.vercel.app";
const EMAIL = "gowrishankarenugu@gmail.com";
const MINATO_IMAGE = "https://i.pinimg.com/564x/5d/86/1a/5d861a2fc9ad427aca6b493963c6fef2.jpg";

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3C4.14 3 3.25 3.9 3.25 5s.89 2 2 2 2-.9 2-2-.89-2-2-2ZM20.75 12.72c0-3.06-1.63-4.48-3.8-4.48-1.75 0-2.54.97-2.98 1.65V8.5h-3.38c.04.92 0 11.5 0 11.5h3.38v-6.42c0-.34.02-.68.13-.92.27-.68.89-1.39 1.94-1.39 1.37 0 1.92 1.04 1.92 2.56V20H21c0 0-.04-6.15-.04-7.28Z"
      />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-footer-copy">
        <p className="home-footer-kicker">Built for focused duels and sharp practice.</p>
        <h3>Stay connected outside the arena.</h3>
        <p className="home-footer-text">
          Reach out for collaboration, feedback, or product ideas. The footer stays lightweight and responsive so it fits the existing home page flow.
        </p>
        <div className="home-footer-links">
          <a
            className="home-footer-link home-footer-link-icon"
            href={LINKEDIN_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Open LinkedIn profile"
            title="LinkedIn"
          >
            <LinkedInIcon />
            <span>LinkedIn</span>
          </a>
          <a
            className="home-footer-link"
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noreferrer"
          >
            Portfolio
          </a>
          <a
            className="home-footer-link"
            href={`mailto:${EMAIL}`}
          >
            {EMAIL}
          </a>
        </div>
      </div>

      <div className="home-footer-visual">
        <div className="home-footer-image-frame">
          <img src={MINATO_IMAGE} alt="Minato from Naruto" className="home-footer-image" />
        </div>
      </div>
    </footer>
  );
}
