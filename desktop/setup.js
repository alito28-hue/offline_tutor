// Setup screen: shows what the app is doing, in the computer's language.
const TEXTS = {
  en: {
    starting: 'Getting ready…', loading: 'Opening the tutor. This can take a few minutes the first time.',
    needs: gb => `Amara needs to download ${gb} GB, only this once. After that it works without internet.`, download: 'Download',
    downloading: 'Downloading. Keep this window open and stay connected.',
    failed: 'The download stopped. Check your internet connection and try again.', retry: 'Try again',
    space: 'There isn\'t enough free disk space. Free up at least 4 GB and try again.',
    broken: 'Amara couldn\'t open on this computer.', close: 'Close',
  },
  es: {
    starting: 'Preparando…', loading: 'Abriendo el tutor. La primera vez puede tardar unos minutos.',
    needs: gb => `Amara necesita descargar ${gb} GB, solo esta vez. Después funciona sin internet.`, download: 'Descargar',
    downloading: 'Descargando. Dejá esta ventana abierta y seguí con internet.',
    failed: 'La descarga se interrumpió. Revisá tu conexión e intentá de nuevo.', retry: 'Intentar de nuevo',
    space: 'No hay suficiente espacio en el disco. Liberá al menos 4 GB e intentá de nuevo.',
    broken: 'Amara no pudo abrirse en esta computadora.', close: 'Cerrar',
  },
  pt: {
    starting: 'Preparando…', loading: 'Abrindo o tutor. Na primeira vez, pode levar alguns minutos.',
    needs: gb => `A Amara precisa baixar ${gb} GB, só desta vez. Depois funciona sem internet.`, download: 'Baixar',
    downloading: 'Baixando. Deixe esta janela aberta e continue conectado.',
    failed: 'O download foi interrompido. Verifique sua conexão e tente de novo.', retry: 'Tentar de novo',
    space: 'Não há espaço suficiente no disco. Libere pelo menos 4 GB e tente de novo.',
    broken: 'A Amara não conseguiu abrir neste computador.', close: 'Fechar',
  },
};
const $ = id => document.getElementById(id);
let text = TEXTS.en;

function show({ message, percent, button, onClick }) {
  $('message').textContent = message;
  $('bar').hidden = $('percent').hidden = percent === undefined;
  if (percent !== undefined) { $('fill').style.width = `${percent}%`; $('percent').textContent = `${percent}%`; }
  $('action').hidden = !button;
  if (button) { $('action').textContent = button; $('action').onclick = onClick; }
}

const startDownload = () => { show({ message: text.downloading, percent: 0 }); window.amara.download(); };

window.amara.onSetup(({ state, gigabytes, percent, detail }) => {
  if (state === 'loading') show({ message: text.loading });
  if (state === 'needs-download') show({ message: text.needs(gigabytes), button: text.download, onClick: startDownload });
  if (state === 'downloading') show({ message: text.downloading, percent });
  if (state === 'download-failed') show({ message: text.failed, button: text.retry, onClick: startDownload });
  if (state === 'no-space') show({ message: text.space, button: text.retry, onClick: startDownload });
  if (state === 'failed') show({ message: `${text.broken} ${detail || ''}`, button: text.close, onClick: () => window.amara.quit() });
});

(async () => {
  const locale = (await window.amara.locale()).slice(0, 2);
  text = TEXTS[locale] || TEXTS.en;
  document.documentElement.lang = TEXTS[locale] ? locale : 'en';
  show({ message: text.starting });
  window.amara.ready();
})();
