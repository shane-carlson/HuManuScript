/**
 * Keyboard and microphone names from the OS.
 * Electron can ask; a browser cannot. Failure returns nulls and the seal still stands.
 */

const { execFile } = require('node:child_process');
const fs = require('node:fs');

const CACHE_MS = 20_000;
let cache = null;
let pending = null;

function stripControls(value) {
  let out = '';
  for (const char of String(value ?? '')) {
    if (char.charCodeAt(0) >= 32) out += char;
  }
  return out;
}

function stripNulls(value) {
  let out = '';
  for (const char of String(value ?? '')) {
    if (char !== '\0') out += char;
  }
  return out;
}

function joinNames(names) {
  const clean = [];
  const seen = new Set();
  for (const raw of names) {
    const name = stripControls(raw).replace(/\s+/g, ' ').trim();
    if (!name || name.length > 160) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(name);
    if (clean.length === 4) break;
  }
  return clean.length ? clean.join(', ') : null;
}

function isJunkInput(name) {
  return /video bus|power button|sleep button|lid switch|pc speaker|gpio-keys|consumer control|system control/i.test(name);
}

function keyboardsFromProcInput(text) {
  const names = [];
  for (const block of String(text ?? '').split(/\n\s*\n/)) {
    const name = /N: Name="([^"]+)"/.exec(block)?.[1]?.trim() ?? '';
    const handlers = /H: Handlers=(.*)/.exec(block)?.[1] ?? '';
    if (!name || isJunkInput(name)) continue;
    if (!/\bkbd\b/.test(handlers) && !/keyboard/i.test(name)) continue;
    names.push(name);
  }
  return names;
}

function productName(chunk) {
  const quoted = /"Product"\s*=\s*"([^"]+)"/.exec(chunk)?.[1]?.trim();
  if (quoted) return quoted;
  const first = (chunk.split('\n')[0] ?? '').replace(/@.*/, '').replace(/<.*/, '').trim();
  if (!first || /IOHID|AppleHID/i.test(first)) return '';
  return first;
}

function keyboardsFromIoreg(text) {
  const names = [];
  for (const chunk of String(text ?? '').split(/\n?\+-o /).slice(1)) {
    const name = productName(chunk);
    if (!name || isJunkInput(name)) continue;
    const page = /"PrimaryUsagePage"\s*=\s*(\d+)/.exec(chunk)?.[1];
    const usage = /"PrimaryUsage"\s*=\s*(\d+)/.exec(chunk)?.[1];
    const pair = /"UsagePage"\s*=\s*1\b/.test(chunk) && /"Usage"\s*=\s*6\b/.test(chunk);
    const keyboardUsage = (page === '1' && usage === '6') || pair;
    const namedKeyboard = /keyboard/i.test(name) && !/\bmouse\b/i.test(name);
    if (!keyboardUsage && !namedKeyboard) continue;
    if (/trackpad/i.test(name) && !/keyboard/i.test(name)) continue;
    names.push(name);
  }
  return names;
}

function keyboardsFromNameList(text) {
  return stripNulls(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isJunkInput(line) && !/^name$/i.test(line));
}

function microphoneFromPactl(listText, defaultName) {
  const sources = [];
  for (const block of String(listText ?? '').split(/\n(?=Source #)/)) {
    const name = /^\tName: ([^\n]+)/m.exec(block)?.[1]?.trim();
    const description = /^\tDescription: ([^\n]+)/m.exec(block)?.[1]?.trim();
    if (!name || !description) continue;
    if (/\.monitor(?:$|\s)/.test(name) || /monitor of /i.test(description)) continue;
    sources.push({ name, description });
  }
  const wanted = String(defaultName ?? '').trim();
  if (wanted) {
    const match = sources.find((source) => source.name === wanted);
    if (match) return match.description;
  }
  return joinNames(sources.map((source) => source.description));
}

function microphoneFromArecord(text) {
  const names = [];
  const re = /^card\s+\d+:\s+\S+\s+\[([^\]]+)\]/gm;
  let match = re.exec(String(text ?? ''));
  while (match) {
    names.push(match[1]);
    match = re.exec(String(text ?? ''));
  }
  return joinNames(names);
}

function microphoneFromAudioProfile(text) {
  const devices = [];
  let current = null;
  const flush = () => {
    if (current?.name && current.input) devices.push(current);
    current = null;
  };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const header = /^(\s*)(.+):\s*$/.exec(line);
    if (!header) {
      if (!current) continue;
      if (/Default Input Device:\s*Yes/i.test(line)) {
        current.input = true;
        current.defaultInput = true;
      } else if (/Input Channels:\s*[1-9]/i.test(line) || /^\s*Input Source:/i.test(line)) {
        current.input = true;
      }
      continue;
    }
    const indent = header[1].length;
    const label = header[2].trim();
    if (indent > 8) continue;
    if (/^(Audio|Devices|Inputs|Outputs)$/i.test(label)) continue;
    flush();
    current = { name: label, input: false, defaultInput: false };
  }
  flush();
  const preferred = devices.find((device) => device.defaultInput);
  if (preferred) return preferred.name;
  return joinNames(devices.map((device) => device.name));
}

function microphonesFromEndpointNames(text) {
  const lines = stripNulls(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const mics = lines.filter((line) => /microphone|\bmic\b|headset/i.test(line) && !/speaker|headphone/i.test(line));
  return joinNames(mics);
}

function execText(command, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 2_000_000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout ?? '');
      resolve(text.replace(/^\uFEFF/, ''));
    });
  });
}

async function readLinuxMicrophone() {
  const [list, fallback] = await Promise.all([
    execText('pactl', ['list', 'sources'], 1500),
    execText('pactl', ['get-default-source'], 1500),
  ]);
  const described = microphoneFromPactl(list, fallback);
  if (described) return described;
  return microphoneFromArecord(await execText('arecord', ['-l'], 1500));
}

function readProcKeyboards() {
  try {
    return joinNames(keyboardsFromProcInput(fs.readFileSync('/proc/bus/input/devices', 'utf8')));
  } catch {
    return null;
  }
}

async function probeLinux() {
  const [keyboard, microphone] = await Promise.all([Promise.resolve(readProcKeyboards()), readLinuxMicrophone()]);
  return { keyboard, microphone };
}

async function probeDarwin() {
  const [ioreg, audio] = await Promise.all([
    execText('/usr/sbin/ioreg', ['-c', 'IOHIDDevice', '-r', '-d', '1'], 2000),
    execText('/usr/sbin/system_profiler', ['SPAudioDataType'], 2500),
  ]);
  return {
    keyboard: joinNames(keyboardsFromIoreg(ioreg)),
    microphone: microphoneFromAudioProfile(audio),
  };
}

async function probeWindows() {
  const [keyboards, endpoints] = await Promise.all([
    execText(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance -ClassName Win32_Keyboard | Select-Object -ExpandProperty Name'],
      2500,
    ),
    execText(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "Get-PnpDevice -Class AudioEndpoint -Status OK | Select-Object -ExpandProperty FriendlyName"],
      2500,
    ),
  ]);
  return {
    keyboard: joinNames(keyboardsFromNameList(keyboards)),
    microphone: microphonesFromEndpointNames(endpoints),
  };
}

async function probeInputDevices() {
  try {
    if (process.platform === 'darwin') return await probeDarwin();
    if (process.platform === 'win32') return await probeWindows();
    return await probeLinux();
  } catch {
    return { keyboard: null, microphone: null };
  }
}

function readInputDevices() {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.value);
  if (!pending) {
    pending = probeInputDevices()
      .then((value) => {
        const next = {
          keyboard: typeof value?.keyboard === 'string' ? value.keyboard : null,
          microphone: typeof value?.microphone === 'string' ? value.microphone : null,
        };
        cache = { at: Date.now(), value: next };
        return next;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

module.exports = {
  joinNames,
  keyboardsFromProcInput,
  keyboardsFromIoreg,
  keyboardsFromNameList,
  microphoneFromPactl,
  microphoneFromArecord,
  microphoneFromAudioProfile,
  microphonesFromEndpointNames,
  probeInputDevices,
  readInputDevices,
};
