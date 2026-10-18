import { API_BASE_URL } from '../lib/api.js';

/**
 * "Continue with Google" is a plain link to the backend's OAuth entry point: it is a
 * browser redirect, not a fetch, so no token or client secret touches this page.
 */
export default function GoogleSignInButton({ label = 'Continue with Google' }) {
  return (
    <a className="btn btn-google btn-block" href={`${API_BASE_URL}/api/auth/google`}>
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.2 17.7 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.7 6.9l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.3z"
        />
        <path
          fill="#FBBC05"
          d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.2 0 19.9 0 24s.9 7.8 2.6 10.8l7.9-6.1z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-3.7-13.5-9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
        />
      </svg>
      {label}
    </a>
  );
}
