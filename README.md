# Golden Template CRM – Studenckie Koła Naukowe WSKZ

Czysty, uniwersalny szablon systemu CRM dla Kół Naukowych WSKZ.
Zawiera kompletną architekturę ewidencji członków, punktacji aktywności, integracji z Google Sheets i Google Apps Script, generowania certyfikatów i protokołów A4, dorobku naukowego oraz zarządzania uprawnieniami.

## 🚀 Szybki start dla Nowego Koła

1. Skonfiguruj zmienne środowiskowe w pliku `.env` (skopiuj z `.env.example`):
   ```env
   VITE_GOOGLE_SHEET_ID=
   VITE_APPS_SCRIPT_URL=
   VITE_TEAMUP_API_KEY=
   VITE_TEAMUP_CALENDAR_ID=
   VITE_SUBCALENDAR_ID=
   VITE_ACCESS_PASSWORD=
   ```
2. Skonfiguruj arkusz Google Sheets oraz wklej kod backendowy `Code.gs` do Google Apps Script.
3. Zainstaluj zależności i uruchom środowisko lokalne:
   ```bash
   npm install
   npm run dev
   ```
4. Zbuduj wersję produkcyjną:
   ```bash
   npm run build
   ```

## 🛠️ Funkcjonalności
- Ewidencja członków i statusów (Aktywny, Gość, Nieaktywny, Kwarantanna, Archiwum)
- Automatyczne naliczanie punktów aktywności i frekwencji
- Generator oficjalnych certyfikatów członkowskich, dyplomów prelegenta oraz sprawozdań rocznych
- Repozytorium dokumentacji i dorobku naukowego (publikacje, konferencje, projekty)
- Kancelaria korespondencji i rejestr pism
- Moduł uprawnień i bezpieczeństwa wielopoziomowego (Master Admin, Zarząd, Opiekun, Audytor)

