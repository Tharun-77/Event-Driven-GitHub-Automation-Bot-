import { apiUrl } from '@/lib/api';

export default function LandingPage(): React.JSX.Element {
  return (
    <main>
      <h1>GitHub Automation Bot</h1>
      <p className="muted">
        Sign in with GitHub, connect a repository, and let the bot react to
        issues and pull requests &mdash; adding labels, posting comments,
        notifying Slack, and triaging with AI.
      </p>
      <p style={{ marginTop: '2rem' }}>
        <a className="btn" href={apiUrl('/auth/github/login')}>
          Sign in with GitHub
        </a>
      </p>
    </main>
  );
}
