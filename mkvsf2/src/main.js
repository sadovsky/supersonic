import { parseSf2Rom } from './rom/sf2Rom.js';
import { parseMkRom } from './rom/mkRom.js';
import { filesToRoms, saveRom, loadRom, forgetRoms } from './rom/storage.js';
import { App } from './ui/app.js';
import { Input } from './ui/input.js';
import { Renderer } from './render/renderer.js';
import { VIEW_W, VIEW_H } from './game/match.js';
import { ROSTER } from './game/roster.js';
import { Audio } from './audio/audio.js';
import { StageLibrary } from './stage/library.js';

const $ = s => document.querySelector(s);
const state = { mk: null, sf2: null, raw: {} };

function setStatus(kind, ok, text) {
  const el = $(`#rom-${kind}`);
  el.classList.toggle('ok', ok);
  el.querySelector('.status').textContent = text;
}

async function accept(found, persist) {
  const errors = [];
  for (const [kind, parse] of [['mk', parseMkRom], ['sf2', parseSf2Rom]]) {
    if (!found[kind]) continue;
    try {
      state[kind] = parse(found[kind]); state.raw[kind] = found[kind];
      setStatus(kind, true, 'Loaded');
      if (persist) await saveRom(kind, found[kind]);
    } catch (e) { errors.push(e.message); setStatus(kind, false, 'Wrong file'); }
  }
  $('#rom-error').textContent = errors.join(' ');
  $('#start').disabled = !(state.mk && state.sf2);
}

async function init() {
  const pick = $('#file');
  pick.addEventListener('change', async () => {
    const found = await filesToRoms(pick.files);
    if (!found.mk && !found.sf2) $('#rom-error').textContent = 'Those files don\'t look like either ROM.';
    await accept(found, true);
    pick.value = '';
  });
  const drop = $('#loader');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('drag');
    await accept(await filesToRoms(e.dataTransfer.files), true);
  });
  $('#forget').addEventListener('click', async () => {
    await forgetRoms(); state.mk = state.sf2 = null;
    setStatus('mk', false, 'Not loaded'); setStatus('sf2', false, 'Not loaded');
    $('#start').disabled = true;
  });
  $('#start').addEventListener('click', start);
  const [mk, sf2] = await Promise.all([loadRom('mk'), loadRom('sf2')]);
  await accept({ mk, sf2 }, false);
}

const MOTIONS = {
  qcf: '↓↘→', qcb: '↓↙←', dp: '→↓↘', hcf: '←↙↓↘→', '360': 'full circle', chargeBF: 'hold ← 1s, →', chargeDU: 'hold ↓ 1s, ↑',
  mash: 'tap rapidly', all: 'both punches', bf: '←→', fb: '→←', bb: '←←', ff: '→→', df: '↓→', db: '↓←', du: '↓↑', bbf: '←←→',
};
const BUTTON = { p: 'punch', k: 'kick', lp: 'low punch', hp: 'high punch', lk: 'low kick', hk: 'high kick', any: 'any button' };

function moveList() {
  const html = ROSTER.map(e => `<h3>${e.name} <small>(${e.game === 'mk' ? 'MK' : 'SF II'})</small></h3>` +
    e.specials.map(s => `<p>${s.name}: ${MOTIONS[s.motion]} + ${BUTTON[s.button]}</p>`).join('')).join('');
  $('#movelist').innerHTML = '<p>Directions are for a fighter facing right. Throw: → + high punch up close.</p>' + html;
}

function start() {
  $('#loader').hidden = true;
  $('#game').hidden = false;
  moveList();

  const stages = new StageLibrary(state.raw);
  const app = new App({ mk: state.mk, sf2: state.sf2 }, { stages: (opp, me) => stages.get(opp, me) });
  stages.prefetch();

  const canvas = $('#screen');
  const ctx = canvas.getContext('2d');
  const r = new Renderer(VIEW_W, VIEW_H);
  const image = new ImageData(r.bytes, VIEW_W, VIEW_H);

  const input = new Input();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  input.bindTouch($('#touch'));
  const fit = () => {
    const touchH = document.body.classList.contains('touch') ? Math.min(220, innerHeight * 0.35) : 0;
    const s = Math.min(innerWidth / VIEW_W, (innerHeight - touchH) / VIEW_H);
    const k = s >= 1 ? Math.floor(s * 4) / 4 : s;
    canvas.style.width = `${VIEW_W * k}px`; canvas.style.height = `${VIEW_H * k}px`;
  };
  addEventListener('resize', fit); fit();

  const audio = new Audio();
  stages.onSamples = (name, s) => audio.addSample(name, s);
  const unlock = () => audio.resume();
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);
  $('#mute').addEventListener('click', () => { audio.toggleMute(); $('#mute').textContent = audio.muted ? '🔇' : '🔊'; });
  $('#fullscreen').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));

  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  const loop = now => {
    acc += Math.min(now - last, 100);
    last = now;
    let ran = false;
    while (acc >= STEP) {
      acc -= STEP;
      const versus = app.mode === 'versus';
      const events = app.update(input.pads(versus), input.takeStart());
      audio.handle(events);
      ran = true;
    }
    if (ran) { app.draw(r); ctx.putImageData(image, 0, 0); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.game = { app, audio, stages }; // handy for debugging from the console
}

init();
