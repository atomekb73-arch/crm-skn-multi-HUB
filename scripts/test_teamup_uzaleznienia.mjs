const calId = 'ks9aiux4jiza1ronpd';
const token = '20dc4242d0d74be314e5ee108dc618cf3f6fbcb7647865568775fe4d9a89c112';
const subId = '15520561';

async function testTeamup() {
  console.log(`Testing Teamup API with calendar: ${calId}, subcalendar: ${subId}`);

  // 1. Sprawdź subcalendars
  const subRes = await fetch(`https://api.teamup.com/${calId}/subcalendars`, {
    headers: { 'Teamup-Token': token }
  });
  console.log('Subcalendars status:', subRes.status);
  const subData = await subRes.json();
  console.log('Subcalendars count:', subData?.subcalendars?.length);
  const target = subData?.subcalendars?.find(s => String(s.id) === String(subId));
  console.log('Target subcalendar (15520561):', target);

  // 2. Sprawdź events dla subkalendarza 15520561
  const eventsUrl = `https://api.teamup.com/${calId}/events?startDate=2025-10-01&endDate=2027-09-30&subcalendarId[]=${subId}`;
  console.log('Fetching events from:', eventsUrl);
  const evRes = await fetch(eventsUrl, {
    headers: { 'Teamup-Token': token }
  });
  console.log('Events status:', evRes.status);
  const evData = await evRes.json();
  console.log('Events count for Uzależnienia:', evData?.events?.length);
  if (evData?.events?.length > 0) {
    console.log('Sample event:', {
      id: evData.events[0].id,
      title: evData.events[0].title,
      start_dt: evData.events[0].start_dt,
      subcalendar_ids: evData.events[0].subcalendar_ids
    });
  }
}

testTeamup().catch(console.error);
