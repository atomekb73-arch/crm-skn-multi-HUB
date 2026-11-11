import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share, PlusSquare, CheckCircle2 } from 'lucide-react';

/**
 * PwaInstallPrompt - Komponent obsługujący instalację aplikacji CRM na telefonie (PWA).
 * Obsługuje natywny prompt dla Android / Chrome / Edge oraz dedykowany poradnik dla iOS / Safari.
 */
export default function PwaInstallPrompt({ variant = 'header' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Sprawdź czy aplikacja jest już uruchomiona w trybie standalone (zainstalowana)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(standalone);

    // 2. Wykryj iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // 3. Sprawdź czy użytkownik zamknął wcześniej baner w tej sesji
    try {
      const dismissed = sessionStorage.getItem('pwa_prompt_dismissed');
      if (dismissed === 'true') {
        setIsDismissed(true);
      }
    } catch {}

    // 4. Przechwyć natywne zdarzenie instalacji dla Android/Chromium
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        sessionStorage.setItem('pwa_prompt_dismissed', 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android / Chromium: wywołaj natywny dialog instalacji
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      // iOS Safari: pokaż instrukcję "Udostępnij -> Do ekranu początkowego"
      setShowIosModal(true);
    } else {
      // Inne przeglądarki bez bezpośredniego zdarzenia promptu
      setShowIosModal(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    } catch {}
  };

  // Jeśli aplikacja jest już zainstalowana lub użytkownik odrzucił baner – nie renderujemy nic zbędnego
  if (isStandalone || isInstalled) {
    return null;
  }

  // Wariant: Przycisk w nagłówku (Header Button)
  if (variant === 'button') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200/80 text-xs font-semibold shadow-2xs transition-all cursor-pointer shrink-0"
          title="Zainstaluj CRM na ekranie telefonu jako osobną aplikację"
        >
          <Smartphone size={14} className="text-purple-700 shrink-0" />
          <span className="hidden sm:inline">Zainstaluj aplikację</span>
          <span className="sm:hidden">Zainstaluj</span>
        </button>

        {showIosModal && (
          <IosInstallModal onClose={() => setShowIosModal(false)} />
        )}
      </>
    );
  }

  // Wariant: Pływający baner na dole ekranu (Mobile Floating Banner)
  if (isDismissed) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-3 duration-300 print:hidden">
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shrink-0">
            <Smartphone size={20} className="text-purple-300" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white leading-tight">
              Zainstaluj CRM na telefonie
            </p>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              Dostęp jednym kliknięciem bez otwierania przeglądarki.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            >
              Zainstaluj
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Zamknij"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {showIosModal && (
        <IosInstallModal onClose={() => setShowIosModal(false)} />
      )}
    </>
  );
}

function IosInstallModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-5 sm:p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Smartphone size={18} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Instalacja na telefonie
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">
            Aby dodać aplikację CRM do ekranu głównego telefonu:
          </p>

          <div className="space-y-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <p>
                W przeglądarce <strong>Safari (iPhone)</strong> kliknij przycisk <strong>Udostępnij</strong>{' '}
                <Share size={13} className="inline text-purple-700 mx-0.5" /> (na dolnym pasku) lub menu w <strong>Chrome (Android)</strong>.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <p>
                Przewiń w dół i wybierz opcję <strong>„Do ekranu początkowego”</strong>{' '}
                <PlusSquare size={13} className="inline text-purple-700 mx-0.5" /> (lub „Zainstaluj aplikację”).
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <p>
                Kliknij <strong>„Dodaj”</strong> w prawym górnym rogu. Gotowe! Aplikacja pojawi się na pulpicie.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
        >
          Rozumiem
        </button>
      </div>
    </div>
  );
}
