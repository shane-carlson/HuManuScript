const assert = require('node:assert/strict');
const test = require('node:test');
const {
  joinNames,
  keyboardsFromIoreg,
  keyboardsFromNameList,
  keyboardsFromProcInput,
  microphoneFromArecord,
  microphoneFromAudioProfile,
  microphoneFromPactl,
  microphonesFromEndpointNames,
  probeInputDevices,
} = require('./inputDevices.cjs');

const PROC = `I: Bus=0011 Vendor=0001 Product=0001 Version=ab41
N: Name="AT Translated Set 2 keyboard"
P: Phys=isa0060/serio0/input0
H: Handlers=sysrq kbd event2 leds

I: Bus=0003 Vendor=046d Product=c52b Version=0111
N: Name="Logitech USB Keyboard"
H: Handlers=sysrq kbd event5 leds

I: Bus=0019 Vendor=0000 Product=0001 Version=0000
N: Name="Power Button"
H: Handlers=kbd event0
`;

test('linux input devices keep real keyboards and drop the power button', () => {
  assert.deepEqual(keyboardsFromProcInput(PROC), ['AT Translated Set 2 keyboard', 'Logitech USB Keyboard']);
  assert.equal(joinNames(keyboardsFromProcInput(PROC)), 'AT Translated Set 2 keyboard, Logitech USB Keyboard');
});

test('ioreg keeps a keyboard usage and skips the mouse', () => {
  const text = `+-o Apple Internal Keyboard / Trackpad@1  <class IOHIDDevice>
  |   "Product" = "Apple Internal Keyboard / Trackpad"
  |   "PrimaryUsagePage" = 1
  |   "PrimaryUsage" = 6
+-o Magic Mouse@2  <class IOHIDDevice>
  |   "Product" = "Magic Mouse"
  |   "PrimaryUsagePage" = 1
  |   "PrimaryUsage" = 2
`;
  assert.deepEqual(keyboardsFromIoreg(text), ['Apple Internal Keyboard / Trackpad']);
});

test('pactl uses the default source description and skips monitors', () => {
  const list = `Source #0
	State: IDLE
	Name: alsa_output.pci.analog-stereo.monitor
	Description: Monitor of Built-in Audio Analog Stereo

Source #1
	State: RUNNING
	Name: alsa_input.pci.analog-stereo
	Description: Built-in Audio Analog Stereo
`;
  assert.equal(microphoneFromPactl(list, 'alsa_input.pci.analog-stereo'), 'Built-in Audio Analog Stereo');
  assert.equal(microphoneFromPactl(list, 'alsa_output.pci.analog-stereo.monitor'), 'Built-in Audio Analog Stereo');
});

test('arecord names the capture card', () => {
  const text = `**** List of CAPTURE Hardware Devices ****
card 0: PCH [HDA Intel PCH], device 0: ALC295 Analog [ALC295 Analog]
  Subdevices: 1/1
`;
  assert.equal(microphoneFromArecord(text), 'HDA Intel PCH');
});

test('mac audio profile prefers the default input', () => {
  const text = `Audio:

    Devices:

        MacBook Pro Microphone:

          Input Channels: 1
          Default Input Device: Yes

        MacBook Pro Speakers:

          Output Channels: 2
          Input Channels: 0
          Default Output Device: Yes
`;
  assert.equal(microphoneFromAudioProfile(text), 'MacBook Pro Microphone');
});

test('windows lists keyboard names and microphone endpoints', () => {
  assert.equal(joinNames(keyboardsFromNameList('HID Keyboard Device\r\n\r\nHID Keyboard Device\r\n')), 'HID Keyboard Device');
  assert.equal(
    microphonesFromEndpointNames('Speakers (Realtek)\r\nMicrophone (Realtek High Definition Audio)\r\nHeadphones\r\n'),
    'Microphone (Realtek High Definition Audio)',
  );
});

test('the OS probe returns a keyboard and microphone field', async () => {
  const devices = await probeInputDevices();
  assert.equal(typeof devices, 'object');
  assert.ok(devices);
  assert.equal('keyboard' in devices, true);
  assert.equal('microphone' in devices, true);
  assert.ok(devices.keyboard === null || typeof devices.keyboard === 'string');
  assert.ok(devices.microphone === null || typeof devices.microphone === 'string');
});
