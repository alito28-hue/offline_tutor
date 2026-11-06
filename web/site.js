// Plays the hero clip when motion is welcome, and sends the pilot form.
const video = document.getElementById('heroVideo');
if (video) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync = () => { if (calm.matches) video.pause(); else video.play().catch(() => {}); };
  sync();
  calm.addEventListener?.('change', sync);
}

const form = document.getElementById('pilotForm');
if (form) {
  const result = document.getElementById('pilotResult');
  const button = form.querySelector('button[type=submit]');
  const devices = [...form.querySelectorAll('input[name=devices]')];
  const show = (kind, text) => { result.className = `result ${kind}`; result.textContent = text; };

  // "None" can't be combined with a device.
  devices.forEach(box => box.addEventListener('change', () => {
    devices[0].setCustomValidity('');
    if (!box.checked) return;
    devices.forEach(other => { if ((box.value === 'none') !== (other.value === 'none')) other.checked = false; });
  }));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!devices.some(box => box.checked)) {
      devices[0].setCustomValidity(form.dataset.devices);
      devices[0].reportValidity();
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    data.devices = devices.filter(box => box.checked).map(box => box.value);
    data.page = document.documentElement.lang;
    button.disabled = true;
    show('', form.dataset.sending);
    try {
      const response = await fetch('/api/pilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
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
