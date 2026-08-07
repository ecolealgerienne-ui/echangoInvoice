import { Network } from '@capacitor/network';
import { API_URL } from '../config';

type Listener = (online: boolean) => void;

/**
 * Détection de connectivité (spec 17 §3).
 *
 * On est « en ligne » si **notre backend répond**, pas si l'appareil a une
 * interface réseau active : un VPS joignable en 3G dégradée reste utilisable
 * même quand l'internet global ne l'est pas.
 */
class ConnectivityService {
  /** Défaut EN LIGNE — un défaut hors ligne afficherait un bandeau rouge à
   *  chaque démarrage jusqu'à la première requête réussie. */
  private online = true;
  private listeners = new Set<Listener>();
  private probing: Promise<boolean> | null = null;

  async init(): Promise<void> {
    await Network.addListener('networkStatusChange', () => void this.probe());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.probe();
    });
    await this.probe();
  }

  isOnline(): boolean {
    return this.online;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** À appeler quand une requête échoue pour cause réseau. */
  markOffline(): void {
    this.set(false);
  }

  /** Sonde le backend. Les appels concurrents partagent la même requête. */
  probe(): Promise<boolean> {
    if (this.probing) return this.probing;

    this.probing = (async () => {
      try {
        const status = await Network.getStatus();
        if (!status.connected) return this.set(false);

        const res = await fetch(`${API_URL}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(4000),
        });
        return this.set(res.ok);
      } catch {
        return this.set(false);
      } finally {
        this.probing = null;
      }
    })();

    return this.probing;
  }

  private set(value: boolean): boolean {
    if (this.online !== value) {
      this.online = value;
      this.listeners.forEach((fn) => fn(value));
    }
    return value;
  }
}

export const connectivity = new ConnectivityService();
