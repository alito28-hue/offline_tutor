// Plays the hero clip when motion is welcome, and sends the site's forms.
const video = document.getElementById('heroVideo');
if (video) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => { if (calm.matches) video.pause(); else video.play().catch(() => {}); };
  sync();
  calm.addEventListener?.('change', sync);
}

// check() may stop the send; extend() adds fields that a plain form can't express.
function connect(form, result, endpoint, { check = () => true, extend = () => {} } = {}) {
  const button = form.querySelector('button[type=submit]');
  const show = (kind, text) => { result.className = `result ${kind}`; result.textContent = text; };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!check()) return;
    const data = Object.fromEntries(new FormData(form));
    extend(data);
    data.page = document.documentElement.lang;
    button.disabled = true;
    show('', form.dataset.sending);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error(String(response.status));
      form.reset();
      show('ok', form.dataset.ok);
    } catch {
      show('error', form.dataset.error);
    } finally {
      button.disabled = false;
    }
  });
}

const pilot = document.getElementById('pilotForm');
if (pilot) {
  const devices = [...pilot.querySelectorAll('input[name=devices]')];
  // "None" can't be combined with a device.
  devices.forEach(box => box.addEventListener('change', () => {
    devices[0].setCustomValidity('');
    if (!box.checked) return;
    devices.forEach(other => { if ((box.value === 'none') !== (other.value === 'none')) other.checked = false; });
  }));
  connect(pilot, document.getElementById('pilotResult'), '/api/pilot', {
    check: () => {
      if (devices.some(box => box.checked)) return true;
      devices[0].setCustomValidity(pilot.dataset.devices);
      devices[0].reportValidity();
      return false;
    },
    extend: data => { data.devices = devices.filter(box => box.checked).map(box => box.value); },
  });
}

const feedback = document.getElementById('feedbackForm');
if (feedback) connect(feedback, document.getElementById('feedbackResult'), '/api/feedback');
