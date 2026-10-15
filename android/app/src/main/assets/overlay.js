/* Valhalla Android overlay: gamepad support (the game's own HUD handles touch), injected into the game page by MainActivity.
   Everything is translated into the keyboard / pointer events (and a little of the public Field/Online API)
   the web client already understands. Gamepad state arrives from native code through window.__vhPad(). */
(() => {
  if (window.__vhOverlay) return;
  window.__vhOverlay = true;
  const D = document, $ = id => D.getElementById(id);

  // The client calls setPointerCapture on the canvas; synthetic pointers (gamepad cursor) have no real id and would throw.
  for (const m of ['setPointerCapture', 'releasePointerCapture']) {
    const o = Element.prototype[m];
    Element.prototype[m] = function (id) { try { return o.call(this, id); } catch (e) { } };
  }

  // ---------- keyboard synthesis ----------
  const CODE = { ' ': 'Space', Escape: 'Escape', Enter: 'Enter', Shift: 'ShiftLeft', '-': 'Minus', '=': 'Equal' };
  const down = new Set();
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(D.activeElement?.tagName || '');
  function fire(type, key) {
    const code = CODE[key] || (/^\d$/.test(key) ? 'Digit' + key : 'Key' + key.toUpperCase());
    D.body.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
  }
  function kd(key) {
    if (typing() && key !== 'Escape') return;
    if (key === 'Escape' && typing()) D.activeElement.blur();
    if (down.has(key)) return; down.add(key); fire('keydown', key);
  }
  function ku(key) { if (down.delete(key)) fire('keyup', key); }
  function tap(key) { kd(key); ku(key); }

  // ---------- combat helpers ----------
  // Aim comes from the selected enemy, else the last pointer position, which is stale on a controller.
  // So before an attack or skill, make sure the nearest living enemy is selected (same calls as clicking it).
  const ACTION_KEYS = new Set([' ', 'Shift', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']);
  function enemies(range) {
    const F = window.Field; if (!F?.canAct) return [];
    const h = F.hero;
    return F.slimes.filter(s => !s.dead).map(s => [s, Math.hypot(s.x - h.x, s.y - h.y)]).filter(a => a[1] <= range).sort((a, b) => a[1] - b[1]).map(a => a[0]);
  }
  function selectEnemy(s) {
    const h = window.Field.hero;
    h.pvpTargetId = null; h.target = s; h.goal = null;
    window.Online?.send({ type: 'target', id: s.id });
  }
  function ensureTarget() {
    const h = window.Field?.hero; if (!h || (h.target && !h.target.dead)) return;
    const [s] = enemies(8); if (s) selectEnemy(s);
  }
  function targetNext() {
    const list = enemies(14); if (!list.length) return;
    const i = list.indexOf(window.Field.hero.target);
    selectEnemy(list[(i + 1) % list.length]);
  }
  function act(key) { if (ACTION_KEYS.has(key)) ensureTarget(); tap(key); }

  // ---------- pointer synthesis (controller cursor) ----------
  const cur = { x: innerWidth / 2, y: innerHeight / 2, pressed: null };
  function pev(type, el, extra) {
    el.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, composed: true, clientX: cur.x, clientY: cur.y, pointerId: 77, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, extra)));
  }
  function mev(type, el) { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cur.x, clientY: cur.y, button: 0, buttons: type === 'mouseup' ? 0 : 1 })); }
  function pressAt() {
    const el = D.elementFromPoint(cur.x, cur.y) || D.body;
    cur.pressed = el; pev('pointerdown', el); mev('mousedown', el);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus();
  }
  function releaseAt() {
    const el = cur.pressed; if (!el) return; cur.pressed = null;
    const up = D.elementFromPoint(cur.x, cur.y) || el;
    pev('pointerup', up); mev('mouseup', up);
    if (up === el || el.contains(up)) mev('click', el);
  }
  function moveCursor() {
    const el = D.elementFromPoint(cur.x, cur.y) || D.body;
    pev('pointermove', el, { buttons: cur.pressed ? 1 : 0 });
  }

  // ---------- UI ----------
  const css = D.createElement('style');
  css.textContent = `
  html,body{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none}
  #vh-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:26px;height:26px;pointer-events:none;display:none;margin:-3px 0 0 -3px;filter:drop-shadow(0 1px 2px #000)}
  #vh-hint{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;padding:6px 12px;border-radius:8px;max-width:90vw;text-align:center;
    background:rgba(0,0,0,.75);color:#f4e6b8;font:13px system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .4s}
  .vh-f{outline:4px solid #5de1ff !important;outline-offset:2px !important;box-shadow:0 0 14px #5de1ff !important}
  #vh-badges{position:fixed;left:0;top:0;z-index:14;pointer-events:none;display:none}
  body.vh-seen #vh-badges{display:block}
  body.vh-seen .hud-hint{display:none}
  .vh-badge{position:absolute;box-sizing:border-box;padding:2px 0 1px;border-radius:6px;text-align:center;line-height:1;font-family:system-ui,sans-serif;
    background:rgba(8,10,18,.9);border:1px solid rgba(244,230,184,.65);color:#f4e6b8}
  .vh-badge b{display:block;font-size:12px;font-weight:700;letter-spacing:.2px}
  .vh-badge i{display:block;font-style:normal;font-size:18px;font-weight:800;margin-top:1px}
  `;
  D.head.appendChild(css);

  const cursorEl = D.createElement('div'); cursorEl.id = 'vh-cursor';
  cursorEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l16 9-7 2 4 8-3 1-4-8-6 5z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
  D.body.appendChild(cursorEl);
  const hint = D.createElement('div'); hint.id = 'vh-hint'; D.body.appendChild(hint);
  function say(t, ms) { hint.textContent = t; hint.style.opacity = 1; clearTimeout(say.t); say.t = setTimeout(() => hint.style.opacity = 0, ms || 5000); }

  addEventListener('touchstart', () => { cursorEl.style.display = 'none'; }, { passive: true, capture: true });

  // Combo labels under the skill bar. They live in their own fixed layer (the slot buttons clip their contents)
  // and are re-aligned to the live slot rects every frame, so a moved or resized HUD keeps them attached.
  const BANK = ['LB', 'RB', 'LT'], FACE = ['A', 'B', 'X', 'Y'], FACE_COL = { A: '#7ddc6c', B: '#ff6b5e', X: '#6fb3ff', Y: '#ffd24a' };
  const badgeLayer = D.createElement('div'); badgeLayer.id = 'vh-badges'; D.body.appendChild(badgeLayer);
  const badges = [];
  function placeBadges() {
    const slots = [...($('skillbar-slots')?.children || [])];
    while (badges.length < slots.length) {
      const i = badges.length, f = FACE[i % 4], el = D.createElement('div');
      el.className = 'vh-badge'; el.innerHTML = `<b>${BANK[Math.floor(i / 4)]}</b><i style="color:${FACE_COL[f]}">${f}</i>`;
      badgeLayer.appendChild(el); badges.push(el);
    }
    const g = $('scene-game'), show = g && !g.hidden && !container();
    badges.forEach((el, i) => {
      const r = slots[i]?.getBoundingClientRect();
      if (!show || !r || !r.width) { el.style.display = 'none'; return; }
      const h = 33;
      let y = r.bottom + 3; if (y + h > innerHeight) y = r.top - h - 3;   // no room below: put it above
      el.style.cssText = `display:block;left:${r.left}px;top:${y}px;width:${r.width}px;height:${h}px`;
    });
  }

  // ---------- movement (WASD) ----------
  function setDir(x, y) {   // x,y in -1..1
    const t = .35;
    (x > t ? kd : ku)('d'); (x < -t ? kd : ku)('a'); (y > t ? kd : ku)('s'); (y < -t ? kd : ku)('w');
  }

  // ---------- menu navigation (controller) ----------
  const FOCUSABLE = 'button,a[href],input,select,textarea,[role="tab"],[tabindex]:not([tabindex="-1"])';
  const vis = e => { if (e.disabled || e.closest('[hidden],[inert]')) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden'; };
  // The open modal panel, if any (the game's panels all use .pause); otherwise the visible title / login / character scene.
  // (login/character panels also carry .pause and sit inside hidden scenes, hence the rendered-box check)
  function container() {
    const g = $('scene-game');
    if (g && !g.hidden) { const ps = [...D.querySelectorAll('.pause')].filter(p => !p.hidden && p.getClientRects().length); return ps.at(-1) || null; }
    return [...D.querySelectorAll('.scene')].filter(s => !s.hidden).at(-1) || D.body;
  }
  const cands = c => [...c.querySelectorAll(FOCUSABLE)].filter(vis);
  let focused = null;
  function setFocus(el) {
    focused?.classList.remove('vh-f'); focused = el;
    if (!el) return;
    el.focus({ preventScroll: true }); el.classList.add('vh-f');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function clearFocus() { if (focused) { focused.classList.remove('vh-f'); if (D.activeElement === focused) focused.blur(); focused = null; } }
  function navigate(dx, dy) {
    const c = container(); if (!c) return;
    const list = cands(c); if (!list.length) return;
    const from = D.activeElement;
    if (!list.includes(from)) return setFocus(list[0]);
    const a = from.getBoundingClientRect(), ac = [a.left + a.width / 2, a.top + a.height / 2];
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === from) continue;
      const r = e.getBoundingClientRect(), rc = [r.left + r.width / 2, r.top + r.height / 2];
      const vx = rc[0] - ac[0], vy = rc[1] - ac[1], along = vx * dx + vy * dy;
      if (along <= 2) continue;
      // gap between the two boxes on the perpendicular axis (0 when they overlap) keeps wide rows and narrow icons comparable
      const gap = dx ? Math.max(0, Math.max(a.top, r.top) - Math.min(a.bottom, r.bottom)) : Math.max(0, Math.max(a.left, r.left) - Math.min(a.right, r.right));
      const s = along + gap * 3 + Math.abs(dx ? vy : vx) * .3;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) setFocus(best);
  }
  function activate() {
    const c = container(), el = D.activeElement;
    if (c && el && c.contains(el) && el !== D.body && vis(el)) {
      if (el.tagName === 'SELECT') { try { el.showPicker(); } catch (e) { el.click(); } }
      else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.focus();
      else el.click();
    } else if (c) { const l = cands(c); if (l.length) setFocus(l[0]); }
  }
  function nextTab(dir) {
    const c = container(); if (!c) return;
    const tabs = [...c.querySelectorAll('[role="tab"]')].filter(vis); if (tabs.length < 2) return;
    const i = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    const t = tabs[(i + dir + tabs.length) % tabs.length]; t.click(); setFocus(t);
  }

  // ---------- gamepad ----------
  // Bit i of the mask: 0 A 1 B 2 X 3 Y 4 LB 5 RB 6 LT 7 RT 8 Select 9 Start 10 L3 11 R3 12 Up 13 Down 14 Left 15 Right
  const pad = { mask: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
  window.__vhPad = (mask, lx, ly, rx, ry) => { pad.mask = mask; pad.lx = lx; pad.ly = ly; pad.rx = rx; pad.ry = ry; };
  let prev = 0, atkTimer = 0, seen = false, lastT = performance.now(), uiMode = false, navDir = '', navAt = 0;
  const dz = v => Math.abs(v) < .25 ? 0 : v;
  const B = i => (pad.mask >> i) & 1;

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
    const edge = i => B(i) && !((prev >> i) & 1), rel = i => !B(i) && ((prev >> i) & 1);
    const moved = Math.hypot(pad.lx, pad.ly) > .3 || Math.hypot(pad.rx, pad.ry) > .3;
    if (moved || (pad.mask & ~prev)) {
      if (!seen) { seen = true; D.body.classList.add('vh-seen'); say('Controller: stick move · A attack · B talk · X next target · Y step · LB / RB / LT + A B X Y = skills 1–12', 7000); }
    }
    if (!seen) { prev = pad.mask; return; }
    placeBadges();

    const g = $('scene-game'), inGame = g && !g.hidden, panel = inGame ? container() : null;
    const inUI = !inGame || !!panel;
    if (inUI !== uiMode) {                    // entering / leaving a menu: drop movement and held attack
      uiMode = inUI; setDir(0, 0); clearInterval(atkTimer);
      if (inUI) { cursorEl.style.display = 'none'; navDir = ''; } else clearFocus();
    }

    // right stick = free cursor (both modes); RT = click
    const rx = dz(pad.rx), ry = dz(pad.ry);
    if (rx || ry) {
      const sp = 980 * dt;
      cur.x = Math.max(0, Math.min(innerWidth - 1, cur.x + rx * Math.abs(rx) * sp));
      cur.y = Math.max(0, Math.min(innerHeight - 1, cur.y + ry * Math.abs(ry) * sp));
      cursorEl.style.display = 'block'; moveCursor();
    }
    cursorEl.style.transform = `translate(${cur.x}px,${cur.y}px)`;
    if (edge(7)) { cursorEl.style.display = 'block'; pressAt(); }
    if (rel(7)) releaseAt();

    if (uiMode) {
      // left stick / d-pad moves the focus ring (with key repeat), A clicks, B backs out, LB/RB switch tabs
      const sx = Math.abs(pad.lx) > .6 && Math.abs(pad.lx) >= Math.abs(pad.ly) ? Math.sign(pad.lx) : 0;
      const sy = Math.abs(pad.ly) > .6 && Math.abs(pad.ly) > Math.abs(pad.lx) ? Math.sign(pad.ly) : 0;
      const dx = B(15) - B(14) || sx, dy = B(13) - B(12) || sy;
      const dir = dx || dy ? `${dx},${dy}` : '';
      if (dir !== navDir) { navDir = dir; navAt = t + 380; if (dir) navigate(dx, dy); }
      else if (dir && t >= navAt) { navAt = t + 120; navigate(dx, dy); }
      if (edge(0)) activate();
      if (edge(1) || edge(9)) window.__vhBack();
      if (edge(4)) nextTab(-1);
      if (edge(5)) nextTab(1);
      prev = pad.mask; return;
    }

    // ----- field -----
    setDir(dz(pad.lx), dz(pad.ly));
    const mod = B(4) ? 0 : B(5) ? 4 : B(6) ? 8 : -1;                    // LB: slots 1-4, RB: 5-8, LT: 9-12
    const SLOT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
    for (let i = 0; i < 4; i++) {
      if (!edge(i)) continue;
      if (mod >= 0) { act(SLOT[mod + i]); continue; }
      if (i === 0) { act(' '); clearInterval(atkTimer); atkTimer = setInterval(() => act(' '), 220); }
      else if (i === 1) tap('f');                                       // B  talk / interact
      else if (i === 2) targetNext();                                   // X  next target
      else if (i === 3) act('Shift');                                   // Y  step (assassin)
    }
    if (rel(0)) clearInterval(atkTimer);
    if (B(4) && B(5) && (edge(4) || edge(5))) tap('q');                 // LB+RB  quests
    if (edge(12)) tap('x');                                             // d-pad up    health potion
    if (edge(14)) tap('z');                                             // d-pad left  food
    if (edge(15)) tap('c');                                             // d-pad right mana potion
    if (edge(13)) tap('h');                                             // d-pad down  mount
    if (edge(8)) tap('m');                                              // Select world map
    if (edge(9)) tap('Escape');                                         // Start  menu
    if (edge(10)) tap('k');                                             // L3 skills
    if (edge(11)) tap('e');                                             // R3 character + bags
    prev = pad.mask;
  }
  requestAnimationFrame(loop);

  // ---------- Android back button ----------
  window.__vhBack = () => {
    const g = $('scene-game');
    if (g && !g.hidden) { tap('Escape'); return 'ok'; }
    const back = ['login-back', 'chars-back', 'back'].map($).find(b => b && b.offsetParent);
    if (back) { back.click(); return 'ok'; }
    return 'exit';
  };
})();
