/* Valhalla Android overlay: touch controls + gamepad, injected into the game page by MainActivity.
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
  #vh-ui{position:fixed;inset:0;z-index:15;pointer-events:none;display:none;-webkit-tap-highlight-color:transparent;
    --l:env(safe-area-inset-left,0px);--r:env(safe-area-inset-right,0px);--b:env(safe-area-inset-bottom,0px)}
  #vh-ui.on{display:block}
  #vh-ui.off .vh-c{display:none}
  body.vh-gp #vh-ui .vh-c{display:none}
  .vh-c,.vh-eye{position:absolute;pointer-events:auto;touch-action:none}
  .vh-b{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#f4e6b8;font:700 15px/1 system-ui,sans-serif;
    background:rgba(24,18,38,.55);border:2px solid rgba(224,184,74,.55);box-shadow:0 2px 8px rgba(0,0,0,.5);text-shadow:0 1px 2px #000;transition:transform .05s}
  .vh-b.p{transform:scale(.9);background:rgba(224,184,74,.55)}
  .vh-b small{display:block;font-size:10px;font-weight:600;opacity:.8}
  #vh-stick{left:calc(26px + var(--l));bottom:calc(26px + var(--b));width:150px;height:150px;border-radius:50%;
    background:rgba(24,18,38,.35);border:2px solid rgba(224,184,74,.45)}
  #vh-knob{position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;
    background:rgba(224,184,74,.55);border:2px solid rgba(255,235,170,.8);pointer-events:none}
  #vh-atk{right:calc(28px + var(--r));bottom:calc(28px + var(--b));width:96px;height:96px;font-size:18px}
  #vh-int{right:calc(142px + var(--r));bottom:calc(30px + var(--b));width:58px;height:58px}
  #vh-dodge{right:calc(132px + var(--r));bottom:calc(98px + var(--b));width:54px;height:54px}
  #vh-pot{right:calc(40px + var(--r));bottom:calc(136px + var(--b));width:52px;height:52px}
  #vh-food{right:calc(96px + var(--r));bottom:calc(160px + var(--b));width:46px;height:46px}
  #vh-mana{right:calc(148px + var(--r));bottom:calc(168px + var(--b));width:46px;height:46px}
  #vh-side{right:calc(10px + var(--r));top:236px;display:flex;flex-direction:column;gap:8px}
  #vh-side .vh-b{position:static;width:42px;height:42px;font-size:13px;pointer-events:auto}
  .vh-eye{right:calc(10px + var(--r));top:186px;width:36px;height:36px;font-size:16px;opacity:.7}
  #vh-cursor{position:fixed;left:0;top:0;z-index:2147483647;width:26px;height:26px;pointer-events:none;display:none;margin:-3px 0 0 -3px;filter:drop-shadow(0 1px 2px #000)}
  #vh-hint{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;padding:6px 12px;border-radius:8px;max-width:90vw;text-align:center;
    background:rgba(0,0,0,.75);color:#f4e6b8;font:13px system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .4s}
  .vh-f{outline:4px solid #5de1ff !important;outline-offset:2px !important;box-shadow:0 0 14px #5de1ff !important}
  .skill-slot{position:relative}
  .vh-badge{display:none;position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);z-index:3;padding:1px 5px;border-radius:6px;
    font:700 10px/1.2 system-ui,sans-serif;color:#10131c;background:#f4e6b8;border:1px solid #000;pointer-events:none;white-space:nowrap}
  body.vh-seen .vh-badge{display:block}
  `;
  D.head.appendChild(css);

  const ui = D.createElement('div'); ui.id = 'vh-ui';
  ui.innerHTML = `
    <div class="vh-c" id="vh-stick"><div id="vh-knob"></div></div>
    <div class="vh-c vh-b" id="vh-atk" data-hold="1">Attack</div>
    <div class="vh-c vh-b" id="vh-int" data-k="f">Talk<small>F</small></div>
    <div class="vh-c vh-b" id="vh-dodge" data-k="Shift">Step<small>Shift</small></div>
    <div class="vh-c vh-b" id="vh-pot" data-k="x">HP<small>X</small></div>
    <div class="vh-c vh-b" id="vh-food" data-k="z">Food<small>Z</small></div>
    <div class="vh-c vh-b" id="vh-mana" data-k="c">MP<small>C</small></div>
    <div class="vh-c" id="vh-side">
      <div class="vh-b" data-k="Escape">Menu</div>
      <div class="vh-b" data-k="q">Quest</div>
      <div class="vh-b" data-k="Enter">Chat</div>
      <div class="vh-b" data-k="h">Ride</div>
    </div>
    <div class="vh-eye vh-b" id="vh-eye">◉</div>`;
  D.body.appendChild(ui);
  const cursorEl = D.createElement('div'); cursorEl.id = 'vh-cursor';
  cursorEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l16 9-7 2 4 8-3 1-4-8-6 5z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
  D.body.appendChild(cursorEl);
  const hint = D.createElement('div'); hint.id = 'vh-hint'; D.body.appendChild(hint);
  function say(t, ms) { hint.textContent = t; hint.style.opacity = 1; clearTimeout(say.t); say.t = setTimeout(() => hint.style.opacity = 0, ms || 5000); }

  // touch controls show only while a character is in the field
  const sync = () => { const g = $('scene-game'); ui.classList.toggle('on', !!g && !g.hidden); };
  setInterval(sync, 400); sync();
  $('vh-eye').addEventListener('pointerdown', e => { e.preventDefault(); ui.classList.toggle('off'); });
  addEventListener('touchstart', () => { D.body.classList.remove('vh-gp'); cursorEl.style.display = 'none'; }, { passive: true, capture: true });

  // skill-slot badges that tell you which controller combo fires each slot
  const BANK = ['LB', 'RB', 'LT'], FACE = ['A', 'B', 'X', 'Y'];
  function badge() {
    const bar = $('skillbar-slots'); if (!bar) return;
    [...bar.children].forEach((b, i) => {
      if (b.querySelector('.vh-badge')) return;
      const t = D.createElement('i'); t.className = 'vh-badge'; t.textContent = BANK[Math.floor(i / 4)] + '+' + FACE[i % 4]; b.appendChild(t);
    });
  }
  const bar = $('skillbar-slots');
  if (bar) { new MutationObserver(badge).observe(bar, { childList: true }); badge(); }

  // ---------- touch: buttons ----------
  for (const b of ui.querySelectorAll('[data-k],[data-hold]')) {
    let timer = 0;
    const key = b.dataset.k || ' ';
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('p');
      act(key);
      if (b.dataset.hold) timer = setInterval(() => act(key), 220);   // hold to keep swinging
    });
    const end = e => { e.stopPropagation(); b.classList.remove('p'); clearInterval(timer); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  }

  // ---------- touch: joystick (WASD) ----------
  const stick = $('vh-stick'), knob = $('vh-knob');
  let sid = null;
  function setDir(x, y) {   // x,y in -1..1
    const t = .35;
    (x > t ? kd : ku)('d'); (x < -t ? kd : ku)('a'); (y > t ? kd : ku)('s'); (y < -t ? kd : ku)('w');
  }
  function stickMove(e) {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    setDir(dx / R, dy / R);
  }
  stick.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); sid = e.pointerId; stick.setPointerCapture(sid); stickMove(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === sid) stickMove(e); });
  const stickEnd = e => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; setDir(0, 0); };
  stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);

  // ---------- menu navigation (controller) ----------
  const FOCUSABLE = 'button,a[href],input,select,textarea,[role="tab"],[tabindex]:not([tabindex="-1"])';
  const vis = e => { if (e.disabled || e.closest('[hidden],[inert]')) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden'; };
  // The open modal panel, if any (the game's panels all use .pause); otherwise the visible title / login / character scene.
  function container() {
    const g = $('scene-game');
    if (g && !g.hidden) { const ps = [...D.querySelectorAll('.pause')].filter(p => !p.hidden); return ps.at(-1) || null; }
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
      D.body.classList.add('vh-gp');
    }
    if (!seen) { prev = pad.mask; return; }

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
