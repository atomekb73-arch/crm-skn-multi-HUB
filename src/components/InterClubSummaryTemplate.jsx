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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 print:space-y-4 print:max-w-none text-slate-900 font-sans">
      {/* ── Nagłówek Urzędowy WSKZ (Dla Władz Uczelni) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 print:p-0 print:border-none print:shadow-none print:rounded-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 print:pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 print:bg-black inline-block"></span>
              <span className="text-[11px] font-bold tracking-widest uppercase text-slate-500 font-mono">
                Wyższa Szkoła Kształcenia Zawodowego • Wydział Psychologii
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
              Sprawozdanie Zbiorcze Aktywności Kół Naukowych
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Ustandaryzowane zestawienie dla Władz Uczelni (Dziekanat, Kolegium Dziekańskie, PKA)
            </p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="text-[11px] font-mono font-bold text-slate-600">
              Okres: <span className="text-indigo-600 font-black">{startDate}</span> do <span className="text-indigo-600 font-black">{endDate}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Data wygenerowania: <strong>{formattedDocDate}</strong>
            </div>
            <div className="text-[10px] text-slate-500">
              Liczba objętych kół: <strong>{selectedOrgs.length} / 14</strong>
            </div>
          </div>
        </div>

        {/* ── Kafelki Syntetyczne (KPI Podsumowanie) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-6 print:my-4">
          <div className="bg-slate-50/90 rounded-xl p-3.5 border border-slate-200/90 print:border-slate-300">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide block">
              Łącznie Wydarzeń
            </span>
            <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono">
              {summaryStats.totalEvents || 0}
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              W tym {summaryStats.jointEventsCount || 0} międzykołowych
            </span>
          </div>

          <div className="bg-emerald-50/70 rounded-xl p-3.5 border border-emerald-200/80 print:border-slate-300">
            <span className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wide block">
              Spotkania Merytoryczne
            </span>
            <div className="text-2xl font-black text-emerald-950 mt-0.5 font-mono">
              {summaryStats.substantiveEventsCount || 0}
            </div>
            <span className="text-[10px] text-emerald-700 mt-0.5 block">
              Warsztaty, prelekcje, wykłady
            </span>
          </div>

          <div className="bg-indigo-50/70 rounded-xl p-3.5 border border-indigo-200/80 print:border-slate-300">
            <span className="text-[10.5px] font-bold text-indigo-800 uppercase tracking-wide block">
              Łączna Frekwencja z Gośćmi
            </span>
            <div className="text-2xl font-black text-indigo-950 mt-0.5 font-mono">
              {summaryStats.substantiveTotalAttendees || 0} <span className="text-sm font-sans font-normal text-indigo-700">osób</span>
            </div>
            <span className="text-[10px] text-indigo-700 mt-0.5 block">
              Średnio ~{summaryStats.substantiveAvgAttendees || 0} os./spotkanie
            </span>
          </div>

          <div className="bg-cyan-50/70 rounded-xl p-3.5 border border-cyan-200/80 print:border-slate-300">
            <span className="text-[10.5px] font-bold text-cyan-800 uppercase tracking-wide block">
              Prace Projektowe & Tech.
            </span>
            <div className="text-2xl font-black text-cyan-950 mt-0.5 font-mono">
              {summaryStats.projectEventsCount || 0}
            </div>
            <span className="text-[10px] text-cyan-700 mt-0.5 block">
              Zespoły badawcze i wdrożenia
            </span>
          </div>
        </div>

        {/* ── SEKCJA 1: Spotkania Merytoryczne i Warsztaty ── */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              A. Spotkania Merytoryczne, Warsztaty i Otwarte Prelekcje ({substantiveMeetings.length})
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              Łączna frekwencja: <strong>{summaryStats.substantiveTotalAttendees}</strong> uczestników
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:rounded-none">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <th className="p-2.5 w-10 text-center">Lp.</th>
                  <th className="p-2.5 w-24">Data</th>
                  <th className="p-2.5 w-44">Koło wiodące</th>
                  <th className="p-2.5 w-48">Współorganizatorzy</th>
                  <th className="p-2.5">Temat / Tytuł spotkania</th>
                  <th className="p-2.5 w-40">Prelegent / Prowadzący</th>
                  <th className="p-2.5 w-28 text-center bg-emerald-50/70">Frekwencja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {substantiveMeetings.length > 0 ? (
                  substantiveMeetings.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">{m.date}</td>
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-900 block truncate" title={m.primaryOrg?.name}>
                          {m.primaryOrg?.shortName || m.primaryOrg?.name}
                        </span>
                      </td>
                      <td className="p-2.5">
                        {m.coOrgs && m.coOrgs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.coOrgs.map(co => (
                              <span
                                key={co.orgId}
                                className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 print:border-slate-300"
                              >
                                {co.code || co.shortName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10.5px]">—</span>
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">{m.title}</td>
                      <td className="p-2.5 text-slate-600 text-[11px]">{m.speaker}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">
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
        <div className="space-y-3 pt-6 print:pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-600"></span>
              B. Spotkania Zespołów Projektowych, Technicznych i Badawczych ({projectMeetings.length})
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              Niewliczane do mianownika frekwencji ogólnej
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:rounded-none">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <th className="p-2.5 w-10 text-center">Lp.</th>
                  <th className="p-2.5 w-24">Data</th>
                  <th className="p-2.5 w-44">Koło wiodące</th>
                  <th className="p-2.5 w-48">Współorganizatorzy</th>
                  <th className="p-2.5">Temat / Cel prac projektowych</th>
                  <th className="p-2.5 w-44">Koordynator / Prelegent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {projectMeetings.length > 0 ? (
                  projectMeetings.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">{m.date}</td>
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-900 block truncate">
                          {m.primaryOrg?.shortName || m.primaryOrg?.name}
                        </span>
                      </td>
                      <td className="p-2.5">
                        {m.coOrgs && m.coOrgs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.coOrgs.map(co => (
                              <span
                                key={co.orgId}
                                className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 print:border-slate-300"
                              >
                                {co.code || co.shortName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10.5px]">—</span>
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-slate-900">{m.title}</td>
                      <td className="p-2.5 text-slate-600 text-[11px]">{m.speaker}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-xs text-slate-500">
                      Brak zarejestrowanych spotkań projektowych/technicznych w wybranym przedziale czasowym.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SEKCJA 3: Zbiorcze Zestawienie Aktywności wg Kół Naukowych ── */}
        <div className="space-y-3 pt-6 print:pt-4 print:break-before-page">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              C. Zbiorcza Aktywność Kół Naukowych WSKZ ({byOrgStats.length} Kół)
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              Synteza statystyczna
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 print:rounded-none">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <th className="p-2.5 w-10 text-center">Lp.</th>
                  <th className="p-2.5 w-20 text-center">Kod</th>
                  <th className="p-2.5">Nazwa Koła Naukowego</th>
                  <th className="p-2.5 w-28 text-center bg-emerald-50/50">Merytoryczne</th>
                  <th className="p-2.5 w-28 text-center bg-indigo-50/50">Frekwencja</th>
                  <th className="p-2.5 w-28 text-center bg-cyan-50/50">Projektowe</th>
                  <th className="p-2.5 w-28 text-center">Wspólne</th>
                  <th className="p-2.5 w-28 text-center font-bold bg-slate-200/60">Razem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {byOrgStats.map((item, idx) => {
                  const org = item.org;
                  return (
                    <tr key={org.orgId || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-700">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                          {org.code || org.number}
                        </span>
                      </td>
                      <td className="p-2.5 font-bold text-slate-900">
                        {org.name}
                        {org.hasActiveCrm && (
                          <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            CRM
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono font-semibold text-emerald-800 bg-emerald-50/30">
                        {item.substantiveCount}
                      </td>
                      <td className="p-2.5 text-center font-mono font-semibold text-indigo-900 bg-indigo-50/30">
                        {item.substantiveAttendees > 0 ? `${item.substantiveAttendees} os.` : '—'}
                      </td>
                      <td className="p-2.5 text-center font-mono font-semibold text-cyan-800 bg-cyan-50/30">
                        {item.projectCount}
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-700">
                        {item.jointCount}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-slate-950 bg-slate-100/60">
                        {item.totalActivities}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black border-t-2 border-slate-300 text-slate-900 text-xs">
                  <td colSpan={3} className="p-2.5 text-right uppercase tracking-wider">
                    Suma łączna:
                  </td>
                  <td className="p-2.5 text-center font-mono text-emerald-900">
                    {summaryStats.substantiveEventsCount}
                  </td>
                  <td className="p-2.5 text-center font-mono text-indigo-950">
                    {summaryStats.substantiveTotalAttendees} os.
                  </td>
                  <td className="p-2.5 text-center font-mono text-cyan-900">
                    {summaryStats.projectEventsCount}
                  </td>
                  <td className="p-2.5 text-center font-mono">
                    {summaryStats.jointEventsCount}
                  </td>
                  <td className="p-2.5 text-center font-mono text-slate-950">
                    {summaryStats.totalEvents}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Stopka z Podpisami Władz Uczelni (Dla Dziekanatu) ── */}
        <div className="pt-12 mt-10 border-t border-slate-300 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center text-xs print:pt-10 print:mt-8">
          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-10 w-44 mx-auto mb-2"></div>
            <div className="font-bold text-slate-900">Koordynator ds. Kół Naukowych</div>
            <div className="text-[10px] text-slate-500">Wydział Psychologii WSKZ</div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-10 w-44 mx-auto mb-2"></div>
            <div className="font-bold text-slate-900">Opiekunowie Naukowi Kół</div>
            <div className="text-[10px] text-slate-500">Wydział Psychologii WSKZ</div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-400 h-10 w-44 mx-auto mb-2"></div>
            <div className="font-bold text-slate-900">Dziekan Wydziału Psychologii</div>
            <div className="text-[10px] text-slate-500">Wyższa Szkoła Kształcenia Zawodowego</div>
          </div>
        </div>
      </div>
    </div>
  );
}
