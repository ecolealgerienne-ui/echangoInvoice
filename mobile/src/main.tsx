import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initReactI18next } from 'react-i18next';
import { createI18n } from '@echango/shared';
import App from './App';
import './globals.css';

createI18n(initReactI18next);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Le réseau terrain est intermittent : on ne s'acharne pas, le cache
      // prendra le relais en phase 3.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
