import { parseSmbRom } from './rom/smbRom.js';
import { parseSonicRom } from './rom/sonicRom.js';
import { filesToRoms, saveRom, loadRom, forgetRoms } from './rom/storage.js';
import { SmbCore } from './game/core.js';
import { SonicPlugin } from './game/sonic.js';
import { Screen } from './render/screen.js';
import { Input } from './input.js';
import { Audio } from './audio/audio.js';

const $ = s => document.querySelector(s);
const NES_FPS = 60.0988;

const state = { smb: null, sonic: null };

function setStatus(kind, ok, text) {
  const el = $(`#rom-${kind}`);
  el.classList.toggle('ok', ok);
  el.querySelector('.status').textContent = text;
}

async function accept(found, persist) {
  const errors = [];
  if (found.smb) {
    try { state.smb = await parseSmbRom(found.smb); setStatus('smb', true, 'Loaded'); if (persist) await saveRom('smb', found.smb); }
    catch (e) { errors.push(e.message); setStatus('smb', false, 'Wrong file'); }
  }
  if (found.sonic) {
    try { state.sonic = await parseSonicRom(found.sonic); setStatus('sonic', true, 'Loaded'); if (persist) await saveRom('sonic', found.sonic); }
    catch (e) { errors.push(e.message); setStatus('sonic', false, 'Wrong file'); }
  }
  $('#rom-error').textContent = errors.join(' ');
  $('#start').disabled = !(state.smb && state.sonic);
}

async function init() {
  const pick = $('#file');
  pick.addEventListener('change', async () => {
    const found = await filesToRoms(pick.files);
    if (!found.smb && !found.sonic) $('#rom-error').textContent = 'Those files don\'t look like either ROM.';
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
    await forgetRoms(); state.smb = state.sonic = null;
    setStatus('smb', false, 'Not loaded'); setStatus('sonic', false, 'Not loaded');
    $('#start').disabled = true;
  });
  $('#start').addEventListener('click', start);

  const [smb, sonic] = await Promise.all([loadRom('smb'), loadRom('sonic')]);
  await accept({ smb, sonic }, false);
}

function start() {
  $('#loader').hidden = true;
  $('#game').hidden = false;

  const core = new SmbCore(state.smb.prg, state.smb.chr);
  const sonic = new SonicPlugin();
  core.use(sonic);
  core.boot();

  const canvas = $('#screen');
  const screen = new Screen(canvas, state.smb.chr, state.sonic);
  const fit = () => {
    const touchH = document.body.classList.contains('touch') ? Math.min(220, innerHeight * 0.35) : 0;
    screen.resize(innerWidth, innerHeight - touchH);
  };
  addEventListener('resize', fit);

  const input = new Input();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  input.bindTouch($('#touch'));
  fit();

  const audio = new Audio();
  const unlock = () => audio.resume();
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);
  $('#mute').addEventListener('click', () => { audio.toggleMute(); $('#mute').textContent = audio.muted ? '🔇' : '🔊'; });
  $('#fullscreen').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));

  let acc = 0, last = performance.now();
  const frameMs = 1000 / NES_FPS;
  const loop = (now) => {
    acc += Math.min(now - last, 100);
    last = now;
    let ran = 0;
    while (acc >= frameMs) {
      acc -= frameMs;
      core.frame(input.state());
      audio.frame(core.m.apuWrites, sonic.events);
      sonic.events.length = 0;
      ran++;
    }
    if (ran) screen.draw(core.m, sonic.display);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.game = { core, sonic, screen, audio }; // handy for debugging from the console
}

init();
