// engine-factory.js
// Create audio engine by implementation key

export async function createAudioEngine(impl = 'html') {
  if (impl === 'tone') {
    const mod = await import('./tone-audio-engine.js');
    return new mod.ToneAudioEngine();
  }
  const mod = await import('./audio-engine.js');
  return new mod.AudioEngine();
}
