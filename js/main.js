(() => {
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const photo = document.querySelector('.hero__photo');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const portraitQuery = window.matchMedia('(max-aspect-ratio: 4/5), (max-width: 640px)');

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* ------------------------------------------------------------------------
     Entrada do hero: espera a Urbanist e a foto (máx. 1,8s) para animar junto
     ------------------------------------------------------------------------ */
  const timeout = new Promise((resolve) => setTimeout(resolve, 1800));
  const assets = Promise.all([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    photo && photo.decode ? photo.decode().catch(() => {}) : Promise.resolve(),
  ]);
  Promise.race([assets, timeout]).then(() => {
    root.classList.add('is-ready');
    measure();
    runScrollTasks();
  });

  /* ------------------------------------------------------------------------
     Um único loop (rAF) para tudo que depende do scroll e do tamanho da tela
     ------------------------------------------------------------------------ */
  const scrollTasks = [];
  const resizeTasks = [];
  let ticking = false;

  function runScrollTasks() {
    ticking = false;
    scrollTasks.forEach((task) => task());
  }

  function measure() {
    resizeTasks.forEach((task) => task());
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(runScrollTasks);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    measure();
    runScrollTasks();
  }, { passive: true });

  /* ------------------------------------------------------------------------
     Nome → app bar: encolhe e sobe com o scroll até caber na barra do topo
     ------------------------------------------------------------------------ */
  const name = hero && hero.querySelector('.hero__name');
  const nameInner = hero && hero.querySelector('.hero__name-inner');
  const appbar = document.querySelector('.appbar');

  if (name && nameInner && appbar) {
    let dock = { scale: 1, y: 0, distance: 1 };

    resizeTasks.push(() => {
      const fontSize = parseFloat(getComputedStyle(name).fontSize);
      const top = parseFloat(getComputedStyle(nameInner).top) || 0;
      const height = nameInner.offsetHeight; // altura sem o scale
      const bar = appbar.getBoundingClientRect(); // barra de vidro flutuante (fixa)
      // desktop: nome em uma linha a 24px; celular: o bloco de duas linhas ocupa ~3/4 da barra
      const scale = portraitQuery.matches
        ? (bar.height * 0.74) / height
        : Math.min(24 / fontSize, (bar.height * 0.5) / height);
      const targetTop = bar.top + (bar.height - height * scale) / 2;
      dock = { scale, y: targetTop - top, distance: Math.max(160, window.innerHeight * 0.4) };
    });

    scrollTasks.push(() => {
      const raw = clamp(window.scrollY / dock.distance, 0, 1);
      const p = reduceMotion ? (raw > 0.5 ? 1 : 0) : raw;
      root.style.setProperty('--name-s', (1 + (dock.scale - 1) * p).toFixed(4));
      root.style.setProperty('--name-y', `${(dock.y * p).toFixed(2)}px`);
      root.style.setProperty('--bar', smoothstep(0.6, 1, p).toFixed(3));
      root.classList.toggle('is-docked', p >= 1);
    });
  }

  /* Foto do hero: desce um pouco mais devagar que a página */
  if (hero && !reduceMotion) {
    scrollTasks.push(() => {
      hero.style.setProperty('--sy', Math.min(window.scrollY, hero.offsetHeight).toFixed(1));
    });
  }

  /* Foto do hero acompanha levemente o mouse (o nome não se mexe) */
  if (hero && finePointer && !reduceMotion) {
    let target = 0;
    let current = 0;
    let frame = null;

    const render = () => {
      current += (target - current) * 0.08;
      hero.style.setProperty('--mx', current.toFixed(4));
      frame = Math.abs(target - current) < 0.001 ? null : requestAnimationFrame(render);
    };

    window.addEventListener('pointermove', (e) => {
      target = (e.clientX / window.innerWidth) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(render);
    }, { passive: true });

    document.addEventListener('pointerleave', () => {
      target = 0;
      if (!frame) frame = requestAnimationFrame(render);
    });
  }

  /* ------------------------------------------------------------------------
     Navegação das seções: destaca a que está no meio da tela
     ------------------------------------------------------------------------ */
  const nav = document.querySelector('.section-nav');

  if (nav) {
    const items = [...nav.querySelectorAll('a')].map((link) => ({
      link,
      target: document.querySelector(link.getAttribute('href')),
    }));

    // seções que ainda não existem ficam apagadas e sem clique
    items.filter((item) => !item.target).forEach(({ link }) => {
      link.classList.add('is-pending');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
    });

    const live = items.filter((item) => item.target);
    let activeLink = null;

    scrollTasks.push(() => {
      const middle = window.innerHeight * 0.5;
      const current = live.find(({ target }) => {
        const r = target.getBoundingClientRect();
        return r.top <= middle && r.bottom > middle;
      });
      const link = current ? current.link : null;

      if (link !== activeLink) {
        if (activeLink) {
          activeLink.classList.remove('is-active');
          activeLink.removeAttribute('aria-current');
        }
        if (link) {
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'true');
        }
        activeLink = link;
      }

      // no topo mostra os nomes; começou a rolar, vira só bolinhas
      // (no celular, onde fica escondido no hero, só aparece depois que a frase do hero subiu)
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
      const floating = portraitQuery.matches
        ? heroBottom < nav.getBoundingClientRect().top - 120
        : window.scrollY > 40;
      nav.classList.toggle('is-floating', floating);
    });
  }

  /* ------------------------------------------------------------------------
     Experiência: parallax — cada bloco recebe --p (-1 → 1) conforme cruza a tela
     ------------------------------------------------------------------------ */
  const jobs = [...document.querySelectorAll('.job')];

  if (jobs.length && !reduceMotion) {
    scrollTasks.push(() => {
      const vh = window.innerHeight;
      jobs.forEach((job) => {
        const r = job.getBoundingClientRect();
        if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) return;
        const p = clamp((vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2), -1, 1);
        job.style.setProperty('--p', p.toFixed(3));
        // espaço livre para o nome da empresa descer dentro do bloco
        const head = job.querySelector('.job__head');
        const pad = parseFloat(getComputedStyle(job).paddingTop) * 2;
        job.style.setProperty('--travel', `${Math.max(0, job.clientHeight - head.offsetHeight - pad)}px`);
      });
    });
  }

  /* ------------------------------------------------------------------------
     Elementos que animam uma vez ao entrar na tela ([data-inview] → .is-in)
     ------------------------------------------------------------------------ */
  const inView = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      inView.unobserve(entry.target);
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('[data-inview]').forEach((el) => inView.observe(el));

  /* ------------------------------------------------------------------------
     Sobre: o texto "acende" palavra por palavra conforme a rolagem
     ------------------------------------------------------------------------ */
  const text = document.querySelector('[data-reveal-words]');

  if (text && !reduceMotion) {
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.append(part);
        } else {
          const word = document.createElement('span');
          word.className = 'w';
          word.textContent = part;
          fragment.append(word);
        }
      });
      node.replaceWith(fragment);
    });

    text.setAttribute('data-split', '');
    const words = [...text.querySelectorAll('.w')];
    const marks = [...text.querySelectorAll('mark')].map((mark) => {
      const markWords = mark.querySelectorAll('.w');
      return { mark, last: markWords[markWords.length - 1] };
    });
    let shown = -1;

    scrollTasks.push(() => {
      const r = text.getBoundingClientRect();
      const vh = window.innerHeight;
      // começa quando o topo do texto chega a 90% da tela, termina quando o fim chega a 70%
      // (ou quando a página acaba, para nunca sobrar palavra apagada)
      const atBottom = window.scrollY + vh >= document.documentElement.scrollHeight - 2;
      const progress = atBottom ? 1 : clamp((vh * 0.9 - r.top) / (r.height + vh * 0.2), 0, 1);
      const count = Math.round(progress * words.length);
      if (count === shown) return;
      shown = count;
      words.forEach((word, i) => word.classList.toggle('is-on', i < count));
      marks.forEach(({ mark, last }) => mark.classList.toggle('is-on', Boolean(last) && last.classList.contains('is-on')));
    });
  }

  /* ------------------------------------------------------------------------
     Projetos: cada subseção fica presa na tela e a rolagem vertical anda com
     a linha de projetos na horizontal (1px de rolagem = 1px de linha). Quando
     a linha termina, a página volta a rolar e o painel sai para cima.
     --x (0 → 1): quanto da linha já passou · --p (-1 → 1): posição do painel
     na troca entre subseções, usada no parallax do CSS
     ------------------------------------------------------------------------ */
  const rows = [...document.querySelectorAll('[data-hscroll]')].map((block) => ({
    block,
    pin: block.querySelector('.work__pin'),
    rail: block.querySelector('.work__rail'),
    track: block.querySelector('.work__track'),
    dist: 0,
    near: false,
  }));

  if (rows.length && !reduceMotion) {
    root.classList.add('has-hscroll');

    resizeTasks.push(() => {
      rows.forEach((row) => {
        row.dist = Math.max(0, Math.round(row.track.offsetWidth - row.rail.clientWidth));
        row.block.style.height = `${row.pin.offsetHeight + row.dist}px`;
        row.block.classList.toggle('is-static', row.dist === 0);
      });
    });

    scrollTasks.push(() => {
      const vh = window.innerHeight;
      rows.forEach((row) => {
        const r = row.block.getBoundingClientRect();
        const h = row.pin.offsetHeight;

        // as imagens fora da tela (à direita) não carregariam a tempo com lazy
        if (!row.near && r.top < vh * 2) {
          row.near = true;
          row.block.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
        }
        if (r.bottom < -h || r.top > vh + h) return;

        const x = row.dist ? clamp(-r.top / row.dist, 0, 1) : 0;
        row.track.style.transform = `translate3d(${(-x * row.dist).toFixed(1)}px, 0, 0)`;
        row.block.style.setProperty('--x', x.toFixed(4));

        // topo do painel na tela: entrando (> 0), preso (0) ou saindo (< 0)
        const top = r.top > 0 ? r.top : Math.min(0, r.bottom - h);
        row.block.style.setProperty('--p', clamp(top / h, -1, 1).toFixed(4));
      });
    });

    // o tamanho dos itens vem da altura da tela: remede quando a linha muda
    const resized = new ResizeObserver(() => {
      measure();
      runScrollTasks();
    });
    rows.forEach((row) => resized.observe(row.track));

    // Tab num link fora da tela: rola até a linha mostrar o item
    rows.forEach((row) => {
      row.track.addEventListener('focusin', (e) => {
        const item = [...row.track.children].find((child) => child.contains(e.target));
        if (!item || !row.dist) return;
        const pad = parseFloat(getComputedStyle(row.track).paddingLeft);
        const shown = clamp(-row.block.getBoundingClientRect().top, 0, row.dist);
        const width = row.rail.clientWidth - pad * 2;
        if (item.offsetLeft - pad >= shown && item.offsetLeft - pad + item.offsetWidth <= shown + width) return;
        const blockTop = row.block.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: blockTop + clamp(item.offsetLeft - pad, 0, row.dist), behavior: 'instant' });
      });
    });
  }

  /* ------------------------------------------------------------------------
     Projetos: números que contam de 0 até o valor quando aparecem
     ------------------------------------------------------------------------ */
  const counters = [...document.querySelectorAll('[data-count]')];

  if (counters.length && !reduceMotion) {
    const format = (el, value) => `${el.dataset.prefix || ''}${Math.round(value)}${el.dataset.suffix || ''}`;
    counters.forEach((el) => { el.textContent = format(el, 0); });

    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        countObserver.unobserve(entry.target);
        const el = entry.target;
        const to = parseFloat(el.dataset.count);
        const start = performance.now();
        const duration = 1600;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          el.textContent = format(el, to * (1 - Math.pow(1 - t, 3)));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });

    counters.forEach((el) => countObserver.observe(el));
  }

  /* ------------------------------------------------------------------------
     Rebranding: comparador antes/depois (range invisível por cima da imagem)
     ------------------------------------------------------------------------ */
  document.querySelectorAll('.compare').forEach((compare) => {
    const range = compare.querySelector('.compare__range');
    let touched = false;
    const setPos = (value) => compare.style.setProperty('--pos', `${value}%`);

    range.addEventListener('input', () => {
      touched = true;
      setPos(range.value);
    });

    // dica de que dá para arrastar: a linha passeia uma vez quando aparece
    if (reduceMotion) return;
    const hint = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      hint.disconnect();
      const start = performance.now();
      const duration = 1800;
      const tick = (now) => {
        if (touched) return;
        const t = Math.min(1, (now - start) / duration);
        const value = 50 + Math.sin(t * Math.PI * 2) * 22 * (1 - t);
        setPos(value.toFixed(2));
        range.value = value;
        if (t < 1) requestAnimationFrame(tick);
      };
      setTimeout(() => requestAnimationFrame(tick), 500);
    }, { threshold: 0.6 });
    hint.observe(compare);
  });

  measure();
  runScrollTasks();
})();
