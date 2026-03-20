export type SoundCue = 'event' | 'dialogue' | 'relationship' | 'report'

interface AudioEngine {
  context: AudioContext
  master: GainNode
}

function applyEnvelope(
  gain: GainNode,
  context: AudioContext,
  attackSeconds: number,
  sustainLevel: number,
  releaseSeconds: number,
): number {
  const now = context.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0002), now + attackSeconds)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attackSeconds + releaseSeconds)
  return now + attackSeconds + releaseSeconds
}

function createVoice(engine: AudioEngine, type: OscillatorType, frequency: number): {
  oscillator: OscillatorNode
  gain: GainNode
} {
  const oscillator = engine.context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, engine.context.currentTime)

  const gain = engine.context.createGain()
  oscillator.connect(gain)
  gain.connect(engine.master)

  return { oscillator, gain }
}

function playEventKick(engine: AudioEngine): void {
  const { oscillator, gain } = createVoice(engine, 'sine', 82)
  const now = engine.context.currentTime
  oscillator.frequency.setValueAtTime(94, now)
  oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.28)
  const endAt = applyEnvelope(gain, engine.context, 0.02, 0.9, 0.32)
  oscillator.start(now)
  oscillator.stop(endAt + 0.04)
}

function playDialogueBell(engine: AudioEngine): void {
  const primary = createVoice(engine, 'triangle', 880)
  const shimmer = createVoice(engine, 'sine', 1320)
  const now = engine.context.currentTime
  primary.oscillator.frequency.setValueAtTime(880, now)
  shimmer.oscillator.frequency.setValueAtTime(1320, now)

  const primaryEnd = applyEnvelope(primary.gain, engine.context, 0.01, 0.18, 0.7)
  const shimmerEnd = applyEnvelope(shimmer.gain, engine.context, 0.01, 0.08, 0.55)

  primary.oscillator.start(now)
  shimmer.oscillator.start(now)
  primary.oscillator.stop(primaryEnd + 0.04)
  shimmer.oscillator.stop(shimmerEnd + 0.04)
}

function playRelationshipGliss(engine: AudioEngine): void {
  const main = createVoice(engine, 'sawtooth', 220)
  const harmonics = createVoice(engine, 'triangle', 330)
  const now = engine.context.currentTime
  main.oscillator.frequency.setValueAtTime(220, now)
  main.oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.42)
  harmonics.oscillator.frequency.setValueAtTime(330, now)
  harmonics.oscillator.frequency.exponentialRampToValueAtTime(554, now + 0.42)

  const mainEnd = applyEnvelope(main.gain, engine.context, 0.02, 0.16, 0.58)
  const harmonicEnd = applyEnvelope(harmonics.gain, engine.context, 0.02, 0.08, 0.52)

  main.oscillator.start(now)
  harmonics.oscillator.start(now)
  main.oscillator.stop(mainEnd + 0.04)
  harmonics.oscillator.stop(harmonicEnd + 0.04)
}

function createNoiseBuffer(context: AudioContext, durationSeconds: number): AudioBuffer {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const channel = buffer.getChannelData(0)

  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }

  return buffer
}

function playReportRustle(engine: AudioEngine): void {
  const source = engine.context.createBufferSource()
  source.buffer = createNoiseBuffer(engine.context, 0.22)

  const bandPass = engine.context.createBiquadFilter()
  bandPass.type = 'bandpass'
  bandPass.frequency.setValueAtTime(1800, engine.context.currentTime)
  bandPass.Q.setValueAtTime(0.7, engine.context.currentTime)

  const gain = engine.context.createGain()
  source.connect(bandPass)
  bandPass.connect(gain)
  gain.connect(engine.master)

  const endAt = applyEnvelope(gain, engine.context, 0.01, 0.24, 0.3)
  source.start(engine.context.currentTime)
  source.stop(endAt + 0.04)
}

export function playSoundCue(engine: AudioEngine, cue: SoundCue): void {
  switch (cue) {
    case 'event':
      playEventKick(engine)
      return
    case 'dialogue':
      playDialogueBell(engine)
      return
    case 'relationship':
      playRelationshipGliss(engine)
      return
    case 'report':
      playReportRustle(engine)
      return
    default:
      return
  }
}
