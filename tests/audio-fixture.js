// A valid, short PCM WAV tone: exercises decoding as well as multipart upload.
export function audioFixture() {
  const rate = 8000,
    samples = 800;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++)
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * n) / rate) * 1000),
      44 + n * 2,
    );
  return wav;
}
