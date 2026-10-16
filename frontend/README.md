# Frontend — COMSATS Abbottabad

React 19 + Vite single-page app using React Router.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run lint
```

Configuration lives in `.env` (see `.env.example`):

- `VITE_API_URL` — base URL of the backend API, defaults to `http://localhost:4000`.

The Vite dev server should stay in sync with the backend `CORS_ORIGIN` setting (both default to
`http://localhost:5173`).

See the repository root `README.md` for the full project overview.
