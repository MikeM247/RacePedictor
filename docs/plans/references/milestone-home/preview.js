const copy = {
  coach: { eyebrow: 'MY AI COACH', title: 'ORBIT', body: 'The conversation opens here, with your next milestone as its context. On a phone, this becomes a full-screen coach view with a clear return to Home.', note: 'Design preview only · No message is sent and no plan is changed.' },
  milestone: { eyebrow: 'NEXT MILESTONE · SAMPLE CONTENT', title: 'SA Home Loans Oldies 10 km', body: 'Sunday, 1 November 2026 · 10 km · Target: sub-60. In the finished app, this opens the saved milestone and its approved race plan.', note: 'Illustrative data for comparing layouts; this is not a live race plan.' },
  plan: { eyebrow: 'THE BIGGER GOAL · SAMPLE CONTENT', title: 'Comrades 2027 Down Run', body: '13 June 2027 · 89 km · Target: sub-11. The full goal stays one step away while the next milestone leads the homepage.', note: 'Illustrative data for comparing layouts; no approved records are modified.' },
  today: { eyebrow: 'TRAINING CONTEXT', title: 'Today’s session', body: 'In the finished app, this opens the exact session in Calendar. The homepage keeps this summary small so your next milestone remains the first thing you see.', note: 'Design preview only · This page does not load your calendar.' },
  'last-run': { eyebrow: 'LAST RUN · SAMPLE CONTENT', title: 'Morning run', body: 'Thursday, 29 October 2026 · 5.1 km · 39:18. In the finished app, View run opens this recorded activity with its full metrics and review.', note: 'Prototype only · These are illustrative activity details, not a live training record.' },
  'next-plan': { eyebrow: 'NEXT IN YOUR PLAN · SAMPLE CONTENT', title: 'Easy run · Keep it comfortable', body: 'Saturday, 31 October 2026 · 40 min · Easy effort. In the finished app, View session opens this next planned session in Calendar.', note: 'Prototype only · This is an illustrative session, not a new prescription or change to your plan.' },
  navigation: { eyebrow: 'NAVIGATION PREVIEW', title: 'Your familiar destinations', body: 'Home, Coach, Calendar, Readiness and Settings keep their existing routes. These concepts show the homepage layout only.', note: 'Use the concept selector above the preview to compare the three options.' }
};
const dialog = document.querySelector('dialog');
document.querySelectorAll('[data-preview]').forEach(el => el.addEventListener('click', event => {
  event.preventDefault();
  const item = copy[el.dataset.preview] || copy.navigation;
  dialog.querySelector('[data-eyebrow]').textContent = item.eyebrow;
  dialog.querySelector('h2').textContent = item.title;
  dialog.querySelector('[data-body]').textContent = item.body;
  dialog.querySelector('[data-note]').textContent = item.note;
  dialog.querySelector('.dialog-avatar').hidden = el.dataset.preview !== 'coach';
  dialog.showModal();
}));
dialog.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => { if(event.target === dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();} });
