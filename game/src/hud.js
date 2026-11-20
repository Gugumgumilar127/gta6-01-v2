// hud.js — one job: everything the player reads. Cash, wanted stars, the
// objective line, banners, toasts, phone calls from Vidal, the bust meter
// and the full-screen states (title, pause, busted, wasted, complete).
// It touches only the DOM elements declared in index.html.

export function createHud() {
  const el = (id) => document.getElementById(id);
  const refs = {
    cash: el('hud-cash'),
    debt: el('hud-debt'),
    stars: el('hud-stars'),
    objective: el('hud-objective'),
    objectiveText: el('hud-objective-text'),
    objectiveSub: el('hud-objective-sub'),
    district: el('hud-district'),
    speed: el('hud-speed'),
    healthFill: el('hud-health-fill'),
    carFill: el('hud-car-fill'),
    carRow: el('hud-car-row'),
    banner: el('banner'),
    bannerTitle: el('banner-title'),
    bannerSub: el('banner-sub'),
    toast: el('toast'),
    dialogue: el('dialogue'),
    dialogueFrom: el('dialogue-from'),
    dialogueText: el('dialogue-text'),
    prompt: el('prompt'),
    bust: el('bust'),
    bustFill: el('bust-fill'),
    screen: el('screen'),
    screenTitle: el('screen-title'),
    screenBody: el('screen-body'),
    screenButtons: el('screen-buttons'),
    flash: el('damage-flash'),
    minimap: el('minimap'),
  };

  let bannerTimer = null;
  let toastTimer = null;
  let dialogueQueue = [];
  let dialogueTimer = null;

  function showBanner() {
    refs.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => refs.banner.classList.remove('show'), 2700);
  }

  function nextDialogue() {
    clearTimeout(dialogueTimer);
    const line = dialogueQueue.shift();
    if (!line) {
      refs.dialogue.classList.remove('show');
      return;
    }
    refs.dialogueFrom.textContent = line[0];
    refs.dialogueText.textContent = line[1];
    refs.dialogue.classList.add('show');
    dialogueTimer = setTimeout(nextDialogue, 3600);
  }

  return {
    refs,

    setCash(cash, storyEarned, debt) {
      refs.cash.textContent = '$' + cash.toLocaleString('en-US');
      refs.debt.textContent = 'DEBT PAID $' + storyEarned.toLocaleString('en-US') + ' / $' + debt.toLocaleString('en-US');
    },

    setStars(n) {
      let out = '';
      for (let i = 0; i < 5; i++) out += i < n ? '★' : '☆';
      refs.stars.textContent = out;
      refs.stars.classList.toggle('hot', n >= 3);
    },

    setObjective(objective, distanceText) {
      if (!objective) {
        refs.objective.classList.remove('show');
        return;
      }
      refs.objective.classList.add('show');
      refs.objectiveText.textContent = objective.text;
      refs.objectiveSub.textContent = (objective.sub || '') + (distanceText ? '  ·  ' + distanceText : '');
    },

    setDistrict(name) {
      refs.district.textContent = name;
    },

    setSpeed(kmh) {
      refs.speed.textContent = kmh === null ? '' : Math.round(kmh) + ' km/h';
    },

    setHealth(frac) {
      refs.healthFill.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
      refs.healthFill.style.background = frac > 0.35 ? '#7dd069' : '#e5533d';
    },

    setCarHealth(frac) {
      if (frac === null) {
        refs.carRow.style.display = 'none';
        return;
      }
      refs.carRow.style.display = 'flex';
      refs.carFill.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
      refs.carFill.style.background = frac > 0.3 ? '#e8b93c' : '#e5533d';
    },

    banner(title, sub, color) {
      refs.bannerTitle.textContent = title;
      refs.bannerSub.textContent = sub || '';
      refs.bannerTitle.style.color = color || '#ffd76a';
      showBanner();
    },

    toast(text) {
      refs.toast.textContent = text;
      refs.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 3200);
    },

    phone(lines) {
      dialogueQueue = dialogueQueue.concat(lines);
      if (!refs.dialogue.classList.contains('show')) nextDialogue();
    },

    prompt(text) {
      if (text) {
        refs.prompt.textContent = text;
        refs.prompt.classList.add('show');
      } else {
        refs.prompt.classList.remove('show');
      }
    },

    setBust(frac) {
      if (frac === null || frac <= 0) {
        refs.bust.classList.remove('show');
        return;
      }
      refs.bust.classList.add('show');
      refs.bustFill.style.width = Math.min(100, frac * 100) + '%';
    },

    damageFlash() {
      refs.flash.classList.remove('go');
      void refs.flash.offsetWidth;
      refs.flash.classList.add('go');
    },

    showScreen(kind, bodyHtml, buttons) {
      if (!kind) {
        refs.screen.classList.remove('show');
        return;
      }
      refs.screenTitle.textContent = {
        title: 'PALMARIS HEAT',
        pause: 'PAUSED',
        busted: 'BUSTED',
        wasted: 'WASTED',
        complete: 'DEBT PAID',
      }[kind] || '';
      refs.screenTitle.className = 'screen-title ' + kind;
      refs.screenBody.innerHTML = bodyHtml || '';
      refs.screenButtons.innerHTML = '';
      for (const b of buttons || []) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        btn.addEventListener('click', b.onClick);
        refs.screenButtons.appendChild(btn);
      }
      refs.screen.classList.add('show');
    },
  };
}
