// Presentation only. Delivered by the existing form/theme embed before the runtime.
export function mountConsoleHero(doc = document) {
  const root = doc.querySelector('#sigil-model-console-v3');
  const shell = root?.querySelector('.smcv3-shell');
  if (!shell) return null;
  root.dataset.consoleHero = 'lv10';
  const existing = root.querySelector('[data-ca-hero]');
  if (existing) return existing;
  const hero = doc.createElement('section');
  hero.className = 'smcv3-hero';
  hero.dataset.caHero = 'lv10';
  hero.setAttribute('aria-labelledby', 'smcv3-hero-title');
  const image = doc.createElement('img');
  image.className = 'smcv3-hero__image';
  image.src = 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6abe1dcae59e7e03c06d950b_Cinematic%20Night%20Balcony%20Portrait.webp';
  image.alt = '';
  image.width = 1122;
  image.height = 1402;
  image.decoding = 'async';
  const veil = doc.createElement('span');
  veil.className = 'smcv3-hero__veil';
  veil.setAttribute('aria-hidden', 'true');
  const content = doc.createElement('div');
  content.className = 'smcv3-hero__content';
  const eyebrow = doc.createElement('span');
  eyebrow.className = 'smcv3-hero__eyebrow';
  eyebrow.textContent = 'MY MODEL · CONSOLE';
  const title = doc.createElement('h2');
  title.id = 'smcv3-hero-title';
  const description = doc.createElement('p');
  const updateCopy = () => {
    const language = doc.documentElement.lang.toLowerCase();
    const copy = language.startsWith('en')
      ? ['Your work. One clear view.', 'Your current job and next steps, together.']
      : language.startsWith('zh')
        ? ['工作进展，一目了然', '当前工作与下一步，尽在同一页面。']
        : ['ติดตามงานของคุณให้ชัดเจน', 'ดูงานปัจจุบันและขั้นตอนถัดไปในมุมมองเดียว'];
    title.textContent = copy[0];
    description.textContent = copy[1];
  };
  updateCopy();
  content.append(eyebrow, title, description);
  hero.append(image, veil, content);
  // Move the existing header intact so language/status controls keep their listeners.
  const head = shell.querySelector('.smcv3-head');
  if (head) hero.prepend(head);
  root.prepend(hero);
  // The existing language switcher owns html[lang]; this only updates Hero copy.
  const observer = new doc.defaultView.MutationObserver(updateCopy);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return hero;
}
