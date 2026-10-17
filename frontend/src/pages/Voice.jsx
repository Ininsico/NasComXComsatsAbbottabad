import { AudioLines, CircleStop, Mic, MicOff, Radio, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { useToast } from '../context/toastContext.js';
import { voiceChat, voiceHealth } from '../lib/api.js';

const TARGET_RATE = 16000;
const ONSET_FRAMES = 3;
const SILENCE_MS = 900;
const MIN_RECORDING_MS = 350;
const CALIBRATION_FRAMES = 16;

const STATUS_LABELS = {
  idle: 'Microphone off',
  listening: 'Listening',
  recording: 'Hearing you',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

const STATUS_TONES = {
  idle: 'pill--neutral',
  listening: 'pill--info',
  recording: 'pill--problem',
  thinking: 'pill--pending',
  speaking: 'pill--done',
};

/** Average-window decimation — good enough for 16-bit speech. */
function downsample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;

    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor];

    output[index] = sum / Math.max(1, end - start);
  }

  return output;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function audioUrlFromBase64(base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return URL.createObjectURL(new Blob([bytes], { type: mime ?? 'audio/mpeg' }));
}

function playAudio(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

export default function Voice() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState('idle');
  const [level, setLevel] = useState(-100);
  const [threshold, setThreshold] = useState(-38);
  const [health, setHealth] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [autoListen, setAutoListen] = useState(true);
  const [error, setError] = useState('');

  const contextRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const processorRef = useRef(null);
  const rafRef = useRef(0);
  const chunksRef = useRef([]);
  const recordingRef = useRef(false);
  const listeningRef = useRef(false);
  const busyRef = useRef(false);
  const speechFramesRef = useRef(0);
  const silenceAtRef = useRef(0);
  const calibrationRef = useRef({ frames: 0, levels: [] });
  const thresholdRef = useRef(-38);
  const autoRef = useRef(true);
  const urlsRef = useRef([]);

  useEffect(() => {
    autoRef.current = autoListen;
  }, [autoListen]);

  useEffect(() => {
    let active = true;

    voiceHealth()
      .then((payload) => {
        if (active) setHealth(payload);
      })
      .catch(() => {
        if (active) setHealth(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      processorRef.current?.disconnect();
      contextRef.current?.close().catch(() => {});
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  function stopMicrophone() {
    listeningRef.current = false;
    recordingRef.current = false;
    busyRef.current = false;
    cancelAnimationFrame(rafRef.current);

    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current?.disconnect();

    if (contextRef.current) contextRef.current.close().catch(() => {});

    contextRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    processorRef.current = null;
    calibrationRef.current = { frames: 0, levels: [] };

    setStatus('idle');
    setLevel(-100);
  }

  const beginRecording = useCallback(() => {
    chunksRef.current = [];
    recordingRef.current = true;
    silenceAtRef.current = 0;
    setStatus('recording');
  }, []);

  const sendRecording = useCallback(
    async (blob) => {
      busyRef.current = true;
      setStatus('thinking');

      try {
        const payload = await voiceChat({ audio: blob, userId: user.id });
        const audioUrl = payload.audio
          ? audioUrlFromBase64(payload.audio, payload.audio_mime)
          : null;

        if (audioUrl) urlsRef.current.push(audioUrl);

        setConversation((previous) => [
          ...previous,
          { role: 'user', text: payload.transcript },
          {
            role: 'assistant',
            text: payload.answer,
            audioUrl,
            timings: payload.timings,
            sources: payload.sources ?? [],
          },
        ]);

        if (audioUrl) {
          setStatus('speaking');
          await playAudio(audioUrl);
        }

        busyRef.current = false;
        setStatus(listeningRef.current && autoRef.current ? 'listening' : 'idle');
      } catch (turnError) {
        busyRef.current = false;
        setError(turnError.message);
        showToast({ tone: 'error', title: 'Voice turn failed', message: turnError.message });
        setStatus(listeningRef.current ? 'listening' : 'idle');
      }
    },
    [showToast, user.id],
  );

  const endRecording = useCallback(() => {
    recordingRef.current = false;

    const context = contextRef.current;
    const chunks = chunksRef.current;
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

    if (!context || total < (context.sampleRate * MIN_RECORDING_MS) / 1000) {
      setStatus('listening');
      return;
    }

    const merged = new Float32Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const samples = downsample(merged, context.sampleRate, TARGET_RATE);
    void sendRecording(encodeWav(samples, TARGET_RATE));
  }, [sendRecording]);

  function startVadLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(data);

      let sum = 0;
      for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];

      const rms = Math.sqrt(sum / data.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-7));
      setLevel(db);

      if (!listeningRef.current || busyRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Learn the room noise for the first half second, then set the gate above it.
      const calibration = calibrationRef.current;

      if (calibration.frames < CALIBRATION_FRAMES) {
        calibration.levels.push(db);
        calibration.frames += 1;

        if (calibration.frames === CALIBRATION_FRAMES) {
          const quietest = [...calibration.levels].sort((a, b) => a - b)[0];
          const next = Math.min(Math.max(quietest + 10, -55), -25);
          thresholdRef.current = next;
          setThreshold(next);
        }

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const gate = thresholdRef.current;

      if (!recordingRef.current) {
        if (db > gate) {
          speechFramesRef.current += 1;

          if (speechFramesRef.current >= ONSET_FRAMES) {
            speechFramesRef.current = 0;
            beginRecording();
          }
        } else {
          speechFramesRef.current = 0;
        }
      } else if (db > gate) {
        silenceAtRef.current = 0;
      } else if (silenceAtRef.current === 0) {
        silenceAtRef.current = now;
      } else if (now - silenceAtRef.current >= SILENCE_MS) {
        endRecording();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  async function startMicrophone() {
    setError('');

    if (contextRef.current) {
      listeningRef.current = true;
      setStatus('listening');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });

      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      const context = new AudioContextClass();
      await context.resume();

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      // ScriptProcessor keeps raw PCM flowing; the muted gain means we never echo
      // the microphone back out of the speakers.
      const processor = context.createScriptProcessor(4096, 1, 1);
      const mute = context.createGain();
      mute.gain.value = 0;

      processor.onaudioprocess = (event) => {
        if (!recordingRef.current) return;
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };

      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);

      contextRef.current = context;
      streamRef.current = stream;
      analyserRef.current = analyser;
      processorRef.current = processor;
      calibrationRef.current = { frames: 0, levels: [] };

      listeningRef.current = true;
      setStatus('listening');
      startVadLoop();
    } catch (microphoneError) {
      setError('Microphone access is required. Allow it in the browser, then try again.');
      showToast({ tone: 'error', title: 'No microphone', message: microphoneError.message });
    }
  }

  function toggleMicrophone() {
    if (listeningRef.current || contextRef.current) {
      stopMicrophone();
    } else {
      void startMicrophone();
    }
  }

  const meter = Math.max(0, Math.min(100, ((level + 70) / 70) * 100));
  const active = status !== 'idle';
  const heard = conversation.filter((entry) => entry.role === 'user').length;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Voice assistant</h1>
          <p>Speak naturally — it detects when you start and stop, then answers aloud.</p>
        </div>
        <label className="voice-toggle">
          <input
            type="checkbox"
            checked={autoListen}
            onChange={(event) => setAutoListen(event.target.checked)}
          />
          Keep listening
        </label>
      </div>

      {health ? (
        <div className="btn-row" style={{ marginBottom: '1.25rem' }}>
          <span className="pill pill--info">
            <Radio size={12} aria-hidden="true" />
            STT {health.stt.model}
          </span>
          <span className="pill pill--done">
            <Volume2 size={12} aria-hidden="true" />
            {health.tts.edge_tts ? `TTS ${health.tts.voice}` : 'TTS SAPI fallback'}
          </span>
          <span className="pill pill--neutral">
            <AudioLines size={12} aria-hidden="true" />
            VAD {threshold} dBFS
          </span>
        </div>
      ) : (
        <p className="alert alert--pending" style={{ marginBottom: '1.25rem' }}>
          <Radio size={15} aria-hidden="true" />
          The voice service is not reachable. Start it with <code>npm run embed</code>.
        </p>
      )}

      {error ? (
        <p className="alert alert--error" style={{ marginBottom: '1.25rem' }}>
          {error}
        </p>
      ) : null}

      <section className="card voice-stage">
        <span className={`pill ${STATUS_TONES[status]}`}>
          {status === 'recording' || status === 'listening' ? (
            <Radio size={12} aria-hidden="true" />
          ) : null}
          {STATUS_LABELS[status]}
        </span>

        <button
          type="button"
          className={`voice-mic${active ? ' is-active' : ''}`}
          onClick={toggleMicrophone}
          aria-label={active ? 'Stop the microphone' : 'Start talking'}
        >
          {active ? <MicOff size={30} aria-hidden="true" /> : <Mic size={30} aria-hidden="true" />}
        </button>

        <div className="voice-meter" aria-hidden="true">
          <span
            style={{ width: `${meter}%` }}
            className={status === 'recording' ? 'is-hot' : ''}
          />
        </div>

        <p className="hint" style={{ margin: 0 }}>
          {active
            ? `Threshold ${threshold} dBFS · live level ${level.toFixed(0)} dBFS`
            : 'Tap the microphone and start speaking.'}
        </p>

        {status === 'recording' ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={endRecording}>
            <CircleStop size={14} aria-hidden="true" />
            Send now
          </button>
        ) : null}
      </section>

      <section className="dash-section">
        <h2 className="dash-section__title">
          <AudioLines size={17} aria-hidden="true" />
          Conversation {heard > 0 ? `· ${heard} turn(s)` : ''}
        </h2>

        {conversation.length === 0 ? (
          <p className="alert alert--info">
            Nothing yet. Ask something like “When do Fall 2026 admissions close?” or “What is the
            capital of Japan?” — both work.
          </p>
        ) : (
          <ul className="voice-log">
            {conversation.map((entry, index) => (
              <li key={`${entry.role}-${index}`} className={`voice-turn voice-turn--${entry.role}`}>
                <span className="label-micro">{entry.role === 'user' ? 'You' : 'Assistant'}</span>
                <p>{entry.text}</p>
                {entry.role === 'assistant' && entry.audioUrl ? (
                  <div className="voice-turn__meta">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void playAudio(entry.audioUrl)}
                    >
                      <Volume2 size={14} aria-hidden="true" />
                      Replay
                    </button>
                    {entry.timings ? (
                      <span className="hint">
                        stt {entry.timings.stt_ms} ms · llm {entry.timings.llm_ms} ms · tts{' '}
                        {entry.timings.tts_ms} ms
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {entry.role === 'assistant' && entry.sources.length > 0 ? (
                  <ul className="knowledge-sources">
                    {entry.sources.slice(0, 3).map((source) => (
                      <li key={`${source.title}-${source.namespace}`}>
                        <span
                          className={`pill ${source.namespace === 'shared:campus' ? 'pill--info' : 'pill--done'}`}
                        >
                          {source.namespace === 'shared:campus' ? 'campus' : 'personal'}
                        </span>
                        {source.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
