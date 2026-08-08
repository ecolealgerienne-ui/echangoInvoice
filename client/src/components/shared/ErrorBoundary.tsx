import { Component, ErrorInfo, ReactNode } from 'react';
import i18n from '@/i18n';

/**
 * Seul écran traduit sans `useTranslation` : une frontière d'erreur doit être
 * une classe, et un hook n'y a pas sa place. On passe donc par l'instance i18n
 * directement.
 *
 * Le repli en français est délibéré : si le module i18n est lui-même la cause
 * du plantage, cet écran doit malgré tout s'afficher. Une page blanche est le
 * pire des messages d'erreur.
 */
function traduire(cle: string, repli: string): string {
  try {
    const texte = i18n.t(cle);
    return texte === cle ? repli : texte;
  } catch {
    return repli;
  }
}

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-2xl font-bold text-foreground">{traduire('errors.boundaryTitle', 'Une erreur est survenue')}</h1>
            <p className="text-muted-foreground text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              {traduire('errors.boundaryReload', 'Recharger la page')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
