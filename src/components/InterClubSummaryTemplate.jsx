import React from 'react';
import {
  Calendar,
  Users,
  Award,
  Sparkles,
  Building2,
  FileSpreadsheet,
  Printer,
  Wrench,
  CheckCircle2,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

/**
 * Pomocnik usuwający początkowy numer porządkowy z nazwy koła (np. "10 SKN Seksuologii" -> "SKN Seksuologii")
 */
function cleanOrgName(name) {
  return String(name || '').replace(/^\d+\s+/, '').trim();
}

/**
 * Poprawna polska odmiana rzeczownika "osoba" (1 osoba, 2..4 osoby, 5..21 osób, 22..24 osoby, itd.)
 */
export function getOsobaSuffix(count) {
  const n = Math.abs(Number(count) || 0);
  if (n === 1) return 'osoba';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'osoby';
  }
  return 'osób';
}

export function pluralizeOsoba(count) {
  const n = Number(count) || 0;
  return `${n} ${getOsobaSuffix(n)}`;
}

export default function InterClubSummaryTemplate({
  startDate = '2026-10-01',
  endDate = '2027-09-30',
  selectedOrgs = [],
  allProcessedEvents = [],
  substantiveMeetings = [],
  projectMeetings = [],
  summaryStats = {},
  byOrgStats = [],
  docDate = new Date(),
  onExportExcel = null,
  onPrint = null,
}) {
  const formattedDocDate = docDate instanceof Date
    ? docDate.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })
    : String(docDate);

  const rawActiveOrgName = selectedOrgs.length > 0
    ? (selectedOrgs[0]?.name || selectedOrgs[0]?.shortName || 'Koła Naukowego')
    : 'Koła Naukowego';
  const activeOrgName = cleanOrgName(rawActiveOrgName);

  // Obliczenie łącznej frekwencji i średniej na spotkaniach merytorycznych (Tabela A)
  const substantiveTotalAttendees = substantiveMeetings.reduce(
    (acc, m) => acc + (Number(m.totalParticipants) || 0),
    0
  );
  const substantiveAvgAttendees = substantiveMeetings.length > 0
    ? (Math.round((substantiveTotalAttendees / substantiveMeetings.length) * 10) / 10).toFixed(1)
    : '0.0';

  // Obliczenie łącznej frekwencji i średniej na spotkaniach projektowych (Tabela B)
  const projectTotalAttendees = projectMeetings.reduce(
    (acc, m) => acc + (Number(m.totalParticipants) || 0),
    0
  );
  const projectAvgAttendees = projectMeetings.length > 0
    ? (Math.round((projectTotalAttendees / projectMeetings.length) * 10) / 10).toFixed(1)
    : '0.0';

  // Całkowita frekwencja z obu tabel (Tabela A + Tabela B) dla kafelka "Łączna frekwencja z gośćmi"
  const totalAllAttendees = substantiveTotalAttendees + projectTotalAttendees;
  const totalAllMeetingsCount = substantiveMeetings.length + projectMeetings.length;
  const totalAllAvgAttendees = totalAllMeetingsCount > 0
    ? (Math.round((totalAllAttendees / totalAllMeetingsCount) * 10) / 10).toFixed(1)
    : '0.0';

  return (
    <div className="w-full space-y-4 text-slate-900 font-sans select-text relative inter-club-report-print">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          .inter-club-report-print {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            padding: 0 !important;
          }
          .inter-club-report-print table {
            table-layout: fixed !important;
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9.5px !important;
          }
          .inter-club-report-print th,
          .inter-club-report-print td {
            padding: 5px 6px !important;
            word-break: normal !important;
            overflow-wrap: break-word !important;
            font-size: 9.5px !important;
            line-height: 1.25 !important;
          }
          .inter-club-report-print .whitespace-nowrap,
          .inter-club-report-print th.whitespace-nowrap,
          .inter-club-report-print td.whitespace-nowrap {
            white-space: nowrap !important;
            word-break: keep-all !important;
            overflow-wrap: normal !important;
          }
          .inter-club-report-print tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .inter-club-kpi-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            padding: 6px 8px !important;
          }
          .inter-club-signatures {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .inter-club-report-print .border,
          .inter-club-report-print .rounded-xl,
          .inter-club-report-print .rounded-2xl {
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* ── Nagłówek Urzędowy WSKZ (Dla Władz Uczelni) ── */}
      <div className="w-full text-slate-900 font-sans">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 print:bg-black inline-block"></span>
              <span className="text-[10.5px] font-bold tracking-widest uppercase text-slate-500 font-mono">
                Wyższa Szkoła Kształcenia Zawodowego • Wydział Psychologii
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 leading-tight">
              <div>Sprawozdanie Zbiorcze Aktywności</div>
              <div className="text-indigo-800 font-extrabold">{activeOrgName}</div>
            </h1>
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
              <div>Ustandaryzowane zestawienie dla Władz Uczelni</div>
              <div>(Dziekanat, Kolegium Dziekańskie, PKA)</div>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="text-[11px] font-mono font-bold text-slate-600">
              Okres: <span className="text-indigo-600 font-black">{startDate}</span> do <span className="text-indigo-600 font-black">{endDate}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Data wygenerowania: <strong>{formattedDocDate}</strong>
            </div>
            <div className="text-[10px] text-slate-500">
              Koło sprawozdawcze: <strong>{activeOrgName}</strong>
            </div>
          </div>
        </div>

        {/* ── Kafelki Syntetyczne (KPI Podsumowanie - Kompaktowy pasek, kolejność: 1. Merytoryczne, 2. Projektowe, 3. Łącznie, 4. Frekwencja) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 print:my-2.5">
          {/* KAFELEK 1: Spotkania Merytoryczne */}
          <div className="inter-club-kpi-card bg-emerald-50/70 rounded-xl px-2.5 py-2 border border-emerald-200/80 print:border-slate-300">
            <span className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide block leading-tight">
              Spotkania Merytoryczne
            </span>
            <div className="text-[19px] leading-tight font-bold text-emerald-950 mt-0.5 font-mono">
              {summaryStats.substantiveEventsCount || 0}
            </div>
            <span className="text-[9px] text-emerald-700 mt-0.5 block leading-tight">
              Warsztaty, prelekcje, wykłady
            </span>
          </div>

          {/* KAFELEK 2: Prace Projektowe */}
          <div className="inter-club-kpi-card bg-cyan-50/70 rounded-xl px-2.5 py-2 border border-cyan-200/80 print:border-slate-300">
            <span className="text-[9.5px] font-bold text-cyan-800 uppercase tracking-wide block leading-tight">
              Prace Projektowe &amp; Tech.
            </span>
            <div className="text-[19px] leading-tight font-bold text-cyan-950 mt-0.5 font-mono">
              {summaryStats.projectEventsCount || 0}
            </div>
            <span className="text-[9px] text-cyan-700 mt-0.5 block leading-tight">
              Zespoły badawcze i wdrożenia
            </span>
          </div>

          {/* KAFELEK 3: Łącznie Wydarzeń */}
          <div className="inter-club-kpi-card bg-slate-50/90 rounded-xl px-2.5 py-2 border border-slate-200/90 print:border-slate-300">
            <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wide block leading-tight">
              Łącznie Wydarzeń
            </span>
            <div className="text-[19px] leading-tight font-bold text-slate-900 mt-0.5 font-mono">
              {summaryStats.totalEvents || 0}
            </div>
            <span className="text-[9px] text-slate-500 mt-0.5 block leading-tight">
              w tym {summaryStats.jointEventsCount || 0} międzykołowe
            </span>
          </div>

          {/* KAFELEK 4: Łączna Frekwencja z Gośćmi */}
          <div className="inter-club-kpi-card bg-indigo-50/70 rounded-xl px-2.5 py-2 border border-indigo-200/80 print:border-slate-300">
            <span className="text-[9.5px] font-bold text-indigo-800 uppercase tracking-wide block leading-tight">
              Łączna Frekwencja z Gośćmi
            </span>
            <div className="text-[19px] leading-tight font-bold text-indigo-950 mt-0.5 font-mono">
              {totalAllAttendees} <span className="text-xs font-sans font-normal text-indigo-700">{getOsobaSuffix(totalAllAttendees)}</span>
            </div>
            <span className="text-[9px] text-indigo-700 mt-0.5 block leading-tight font-medium">
              średnia: {substantiveMeetings.length > 0 ? Math.round(substantiveTotalAttendees / substantiveMeetings.length) : 0} os. / spotkanie merytoryczne
            </span>
          </div>
        </div>

        {/* ── SEKCJA 1: Spotkania Merytoryczne i Warsztaty ── */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              A. Spotkania Merytoryczne, Warsztaty i Otwarte Prelekcje ({substantiveMeetings.length})
            </h2>
            <span className="text-[10.5px] font-mono text-slate-500">
              Łączna frekwencja: <strong>{substantiveTotalAttendees}</strong> uczestników
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[10px]">
                  <th className="p-2 text-center whitespace-nowrap">Lp.</th>
                  <th className="p-2 text-center whitespace-nowrap">Data</th>
                  <th className="p-2 whitespace-nowrap">Koło wiodące</th>
                  <th className="p-2 text-center whitespace-nowrap">Współorganizatorzy</th>
                  <th className="p-2">Temat / Tytuł spotkania</th>
                  <th className="p-2">Prelegent / Prowadzący</th>
                  <th className="p-2 text-center whitespace-nowrap bg-emerald-50/70">Frekwencja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {substantiveMeetings.length > 0 ? (
                  substantiveMeetings.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50/80 transition-colors break-inside-avoid print:break-inside-avoid">
                      <td className="p-2 text-center font-mono text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="p-2 text-center text-slate-700 whitespace-nowrap text-[10px]">{m.date}</td>
                      <td className="p-2">
                        <span className="font-semibold text-slate-900 block break-words" title={m.primaryOrg?.name}>
                          {cleanOrgName(m.primaryOrg?.shortName || m.primaryOrg?.name)}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        {m.coOrgs && m.coOrgs.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {m.coOrgs.map(co => (
                              <span
                                key={co.orgId}
                                className="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 print:border-slate-300"
                              >
                                {co.code || co.shortName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="p-2 font-medium text-slate-900 break-words">{m.title}</td>
                      <td className="p-2 text-slate-600 text-[10.5px] break-words">{m.speaker}</td>
                      <td className="p-2 text-center whitespace-nowrap font-mono font-bold text-emerald-800 bg-emerald-50/40">
                        {m.totalParticipants > 0 ? `${m.totalParticipants} os.` : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                      Brak zarejestrowanych spotkań merytorycznych w wybranym przedziale czasowym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SEKCJA 2: Spotkania Zespołów Projektowych i Technicznych ── */}
        <div className="space-y-2.5 pt-5 print:pt-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-600"></span>
              B. Spotkania Zespołów Projektowych, Technicznych i Badawczych ({projectMeetings.length})
            </h2>
            <span className="text-[10.5px] font-mono text-slate-500">
              Niewliczane do mianownika frekwencji ogólnej
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[10px]">
                  <th className="p-2 text-center whitespace-nowrap">Lp.</th>
                  <th className="p-2 text-center whitespace-nowrap">Data</th>
                  <th className="p-2 whitespace-nowrap">Koło wiodące</th>
                  <th className="p-2 text-center whitespace-nowrap">Współorganizatorzy</th>
                  <th className="p-2">Temat / Cel prac projektowych</th>
                  <th className="p-2">Koordynator / Prelegent</th>
                  <th className="p-2 text-center whitespace-nowrap bg-cyan-50/70">Frekwencja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {projectMeetings.length > 0 ? (
                  projectMeetings.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50/80 transition-colors break-inside-avoid print:break-inside-avoid">
                      <td className="p-2 text-center font-mono text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="p-2 text-center text-slate-700 whitespace-nowrap text-[10px]">{m.date}</td>
                      <td className="p-2">
                        <span className="font-semibold text-slate-900 block break-words">
                          {cleanOrgName(m.primaryOrg?.shortName || m.primaryOrg?.name)}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        {m.coOrgs && m.coOrgs.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {m.coOrgs.map(co => (
                              <span
                                key={co.orgId}
                                className="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 print:border-slate-300"
                              >
                                {co.code || co.shortName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="p-2 font-medium text-slate-900 break-words">{m.title}</td>
                      <td className="p-2 text-slate-600 text-[10.5px] break-words">{m.speaker}</td>
                      <td className="p-2 text-center whitespace-nowrap font-mono font-bold text-cyan-800 bg-cyan-50/40">
                        {m.totalParticipants > 0 ? `${m.totalParticipants} os.` : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-xs text-slate-500">
                      Brak zarejestrowanych spotkań projektowych/technicznych w wybranym przedziale czasowym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pastylka / Pasek podsumowujący frekwencję projektową */}
          <div className="mt-2 px-3 py-1.5 rounded-xl bg-cyan-50/80 border border-cyan-200/90 text-cyan-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 print:py-1 print:px-2.5 print:text-[9.5px] print:bg-slate-50 print:border-slate-300 break-inside-avoid print:break-inside-avoid">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-600 print:bg-slate-700 shrink-0"></span>
              <span>
                Łączna frekwencja na spotkaniach grup projektowych: <strong className="font-bold text-cyan-900 print:text-slate-900">{projectTotalAttendees}</strong> uczestników (średnio <strong className="font-bold text-cyan-900 print:text-slate-900">{projectAvgAttendees}</strong> os./spotkanie)
              </span>
            </div>
            <span className="text-[10px] text-cyan-700 print:text-slate-600 font-medium">
              Osobny wskaźnik zaangażowania
            </span>
          </div>
        </div>

        {/* ── SEKCJA 3: Zbiorcze Zestawienie Aktywności wg Kół Naukowych ── */}
        <div className="space-y-2.5 pt-5 print:pt-3.5 print:break-before-page">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              C. Zbiorcza Aktywność Kół Naukowych WSKZ ({byOrgStats.length} Kół)
            </h2>
            <span className="text-[10.5px] font-mono text-slate-500">
              Synteza statystyczna
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '37%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[10px]">
                  <th className="p-2 text-center whitespace-nowrap">Lp.</th>
                  <th className="p-2 text-center whitespace-nowrap">Kod</th>
                  <th className="p-2 whitespace-nowrap">Nazwa Koła Naukowego</th>
                  <th className="p-2 text-center whitespace-nowrap bg-emerald-50/50">Merytoryczne</th>
                  <th className="p-2 text-center whitespace-nowrap bg-indigo-50/50">Frekwencja</th>
                  <th className="p-2 text-center whitespace-nowrap bg-cyan-50/50">Projektowe</th>
                  <th className="p-2 text-center whitespace-nowrap">Wspólne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {byOrgStats.map((item, idx) => {
                  const org = item.org;
                  return (
                    <tr key={org.orgId || idx} className="hover:bg-slate-50/80 transition-colors break-inside-avoid print:break-inside-avoid">
                      <td className="p-2 text-center font-mono text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="p-2 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                          {org.code || org.number}
                        </span>
                      </td>
                      <td className="p-2 font-bold text-slate-900 break-words">
                        {cleanOrgName(org.name)}
                        {org.hasActiveCrm && (
                          <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                            CRM
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold text-emerald-800 bg-emerald-50/30">
                        {item.substantiveCount}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold text-indigo-900 bg-indigo-50/30 whitespace-nowrap">
                        {item.substantiveAttendees > 0 ? `${item.substantiveAttendees} os.` : '—'}
                      </td>
                      <td className="p-2 text-center font-mono font-semibold text-cyan-800 bg-cyan-50/30">
                        {item.projectCount}
                      </td>
                      <td className="p-2 text-center font-mono text-slate-700">
                        {item.jointCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black border-t-2 border-slate-300 text-slate-900 text-xs">
                  <td colSpan={3} className="p-2 text-right uppercase tracking-wider text-[10px]">
                    Suma łączna:
                  </td>
                  <td className="p-2 text-center font-mono text-emerald-900">
                    {summaryStats.substantiveEventsCount || 0}
                  </td>
                  <td className="p-2 text-center font-mono text-indigo-950 whitespace-nowrap">
                    {substantiveTotalAttendees} os.
                  </td>
                  <td className="p-2 text-center font-mono text-cyan-900">
                    {summaryStats.projectEventsCount || 0}
                  </td>
                  <td className="p-2 text-center font-mono">
                    {summaryStats.jointEventsCount || 0}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Stopka z Podpisami Władz Uczelni (Dla Dziekanatu) ── */}
        <div className="inter-club-signatures pt-6 mt-5 border-t border-slate-300 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs print:pt-5 print:mt-4 print:break-inside-avoid break-inside-avoid">
          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-8 w-40 mx-auto mb-1.5"></div>
            <div className="font-bold text-slate-900 text-[11px]">Koordynator ds. Kół Naukowych</div>
            <div className="text-[10px] text-slate-500">Wydział Psychologii WSKZ</div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-8 w-40 mx-auto mb-1.5"></div>
            <div className="font-bold text-slate-900 text-[11px]">Opiekunowie Naukowi Kół</div>
            <div className="text-[10px] text-slate-500">Wydział Psychologii WSKZ</div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-8 w-40 mx-auto mb-1.5"></div>
            <div className="font-bold text-slate-900 text-[11px]">Dziekan Wydziału Psychologii</div>
            <div className="text-[10px] text-slate-500">Wyższa Szkoła Kształcenia Zawodowego</div>
          </div>
        </div>
      </div>
    </div>
  );
}
