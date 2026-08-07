import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatCurrency, resolveApiError } from '@echango/shared';
import { authApi, customersApi, tokenStorage, setSessionExpiredHandler } from './services/api';
import { connectivity } from './services/connectivity';
import { API_URL } from './config';

/** Bandeau de connectivité (spec 17 §8.1) — persistant, ambre, contraste 11:1. */
function ConnectivityBanner({ online }: { online: boolean }) {
  const [justReconnected, setJustReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      return;
    }
    if (!wasOffline) return;
    setJustReconnected(true);
    setWasOffline(false);
    const t = setTimeout(() => setJustReconnected(false), 2000);
    return () => clearTimeout(t);
  }, [online, wasOffline]);

  if (online && !justReconnected) return null;

  return (
    <div
      className={`flex h-10 w-full items-center justify-center text-sm font-medium ${
        online ? 'bg-emerald-500 text-neutral-900' : 'bg-amber-500 text-neutral-900'
      }`}
    >
      {online ? '✓ Reconnecté' : '⚠ Hors ligne'}
    </div>
  );
}

function LoginScreen({ onLogged }: { onLogged: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('admin@chambre-froide.dz');
  const [password, setPassword] = useState('admin1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await authApi.login(email, password);
      await tokenStorage.setTokens(data.accessToken, data.refreshToken);
      onLogged();
    } catch (err) {
      setError(resolveApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">Echango Invoice</h1>
      <p className="text-sm text-neutral-700">{API_URL}</p>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-900">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 rounded border-2 border-neutral-400 px-3 text-base text-neutral-900"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-900">Mot de passe</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 rounded border-2 border-neutral-400 px-3 text-base text-neutral-900"
        />
      </label>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="h-14 rounded bg-neutral-900 text-base font-semibold text-white disabled:opacity-50"
      >
        {busy ? '…' : 'Se connecter'}
      </button>
    </form>
  );
}

function CustomersScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersApi.list({ limit: 20 }),
  });

  if (isLoading) return <p className="p-6 text-neutral-700">Chargement…</p>;
  if (error) return <p className="p-6 text-red-700">{String(error)}</p>;

  return (
    <div>
      <h2 className="px-4 py-3 text-lg font-bold text-neutral-900">
        Clients · {data?.pagination?.total ?? 0}
      </h2>
      <ul>
        {(data?.data ?? []).map((c: any) => (
          // 72 dp de hauteur d'item (spec §8.2)
          <li key={c.id} className="flex h-[72px] flex-col justify-center border-b border-neutral-300 px-4">
            <span className="font-semibold text-neutral-900">{c.name}</span>
            <span className="text-sm text-neutral-700">
              {c.city ?? '—'} · {formatCurrency(c.balance ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState(connectivity.isOnline());
  const [logged, setLogged] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionExpiredHandler(() => setLogged(false));
    const unsubscribe = connectivity.subscribe(setOnline);
    void connectivity.init().then(() => setOnline(connectivity.isOnline()));
    void tokenStorage.getAccessToken().then((tok) => {
      setLogged(Boolean(tok));
      setReady(true);
    });
    return unsubscribe;
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-white">
      <ConnectivityBanner online={online} />
      {logged ? <CustomersScreen /> : <LoginScreen onLogged={() => setLogged(true)} />}
    </div>
  );
}
