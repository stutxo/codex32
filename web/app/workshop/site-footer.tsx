import { BookOpen } from 'lucide-react';
import { wheelData } from '@/lib/workshop';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href={wheelData.sources.paper} target="_blank" rel="noreferrer">
        <BookOpen size={15} aria-hidden="true" /> Read the original codex ↗
      </a>
      <nav className="footer-resources" aria-label="Project and resources">
        <p className="footer-resources-heading">Project &amp; resources</p>
        <ul className="footer-resource-links">
          <li>
            <a
              href="https://github.com/stutxo/codex32"
              target="_blank"
              rel="noreferrer"
            >
              This website’s GitHub ↗
            </a>
          </li>
          <li>
            <a
              href="https://secretcodex32.com/"
              target="_blank"
              rel="noreferrer"
            >
              Secret Codex32 ↗
            </a>
          </li>
          <li>
            <a
              href="https://github.com/apoelstra/volvelle-website"
              target="_blank"
              rel="noreferrer"
            >
              Secret Codex32’s GitHub ↗
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
