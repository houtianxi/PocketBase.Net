import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import 'react-quill-new/dist/quill.snow.css';
import App from './App.tsx';
import { ThemeProvider } from 'next-themes';
import { I18nProvider } from '@/lib/i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
