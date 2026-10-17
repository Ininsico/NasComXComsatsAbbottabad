"""
Voice layer for the COMSATS Abbottabad assistant.

Three pieces, each replaceable:

  STT   Groq Whisper (whisper-large-v3-turbo) — the same key the LLM uses.
        A prompt biases the decoder toward campus vocabulary, which matters for
        names like "COMSATS" that a generic decode mangles.

  TTS   Edge neural voices when `edge-tts` is installed (best quality, needs
        network), otherwise Windows SAPI through System.Speech, which is offline
        and always present on Windows.

  VAD   Energy-based voice activity detection on 16-bit PCM WAV: an adaptive
        noise floor from the quietest frames, a speech threshold above it, and a
        hangover so short gaps do not split an utterance. Used to trim silence
        before transcription and to report where the speech actually was.

The browser also runs its own VAD (Web Audio AnalyserNode) so recording starts and
stops on speech, but the audio it uploads is 16 kHz mono WAV, which both this VAD
and Whisper can read directly.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import wave
from array import array
from pathlib import Path

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

def groq_api_key() -> str:
    """Read lazily — main.py loads .env after importing this module."""
    return os.getenv("GROQ_API_KEY", "")


STT_MODEL = os.getenv("VOICE_STT_MODEL", "whisper-large-v3-turbo")
STT_LANGUAGE = os.getenv("VOICE_STT_LANGUAGE", "en")
STT_PROMPT = os.getenv(
    "VOICE_STT_PROMPT",
    "COMSATS Abbottabad campus. Admission dates, semester fees, programmes, attendance.",
)

TTS_VOICE = os.getenv("VOICE_TTS_VOICE", "en-US-AriaNeural")
TTS_FALLBACK_VOICE = os.getenv("VOICE_TTS_FALLBACK_VOICE", "Microsoft Zira Desktop")
SAPI_VOICE = os.getenv("VOICE_SAPI_VOICE", "Microsoft Zira Desktop")

# VAD tuning
VAD_FRAME_MS = int(os.getenv("VOICE_VAD_FRAME_MS", "30"))
VAD_MIN_SPEECH_MS = int(os.getenv("VOICE_VAD_MIN_SPEECH_MS", "180"))
VAD_HANGOVER_MS = int(os.getenv("VOICE_VAD_HANGOVER_MS", "350"))
VAD_THRESHOLD_DB = float(os.getenv("VOICE_VAD_THRESHOLD_DB", "-38"))
VAD_MIN_START_DB = float(os.getenv("VOICE_VAD_MIN_START_DB", "-48"))

TARGET_SAMPLE_RATE = 16000

GROQ_TRANSCRIPTIONS = "https://api.groq.com/openai/v1/audio/transcriptions"

# Cloudflare in front of the API answers 403 (error 1010) to Python's default
# urllib User-Agent, so every outbound request identifies itself.
REQUEST_HEADERS = {"User-Agent": "comsats-voice/1.0 (+local)"}


# --------------------------------------------------------------------------- #
# WAV handling
# --------------------------------------------------------------------------- #


def read_wav(data: bytes) -> tuple[array, int, int]:
    """16-bit PCM WAV -> (samples, sample_rate, channels).

    Raises ValueError for anything it cannot read, including a container that is not
    WAV at all. wave.Error is not a ValueError, so it is normalised here: the callers
    rely on this to fall back gracefully for webm/ogg uploads instead of returning 500.
    """
    try:
        with wave.open(io.BytesIO(data), "rb") as handle:
            channels = handle.getnchannels()
            width = handle.getsampwidth()
            rate = handle.getframerate()
            frames = handle.readframes(handle.getnframes())
    except (wave.Error, EOFError, OSError) as exc:
        raise ValueError(f"not a readable WAV file: {exc}") from exc

    if width != 2:
        raise ValueError(f"need 16-bit PCM audio, got {width * 8}-bit")

    samples = array("h")
    samples.frombytes(frames)

    if channels == 2:
        samples = array(
            "h",
            [int((samples[i] + samples[i + 1]) / 2) for i in range(0, len(samples) - 1, 2)],
        )

    return samples, rate, 1


def write_wav(samples: array, rate: int) -> bytes:
    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())

    return buffer.getvalue()


def resample_to_target(samples: array, rate: int) -> tuple[array, int]:
    """Crude but adequate decimation to 16 kHz for speech."""
    if rate <= TARGET_SAMPLE_RATE:
        return samples, rate

    step = rate / TARGET_SAMPLE_RATE
    out = array("h")
    position = 0.0

    while int(position) < len(samples):
        # average the window between samples to avoid aliasing harshness
        start = int(position)
        end = min(int(position + step), len(samples))
        window = samples[start:end] or samples[start : start + 1]
        out.append(int(sum(window) / len(window)))
        position += step

    return out, TARGET_SAMPLE_RATE


# --------------------------------------------------------------------------- #
# VAD
# --------------------------------------------------------------------------- #


def _frame_db(frame: array) -> float:
    if not frame:
        return -100.0

    mean_square = sum(sample * sample for sample in frame) / len(frame)
    rms = math.sqrt(mean_square) or 1.0

    return 20.0 * math.log10(min(rms, 32767.0) / 32767.0)


def analyse_speech(samples: array, rate: int) -> dict:
    """Find speech regions using an adaptive noise floor."""
    frame_size = max(1, int(rate * VAD_FRAME_MS / 1000))
    frames = [
        (offset, _frame_db(samples[offset : offset + frame_size]))
        for offset in range(0, len(samples), frame_size)
    ]

    if not frames:
        return {"segments": [], "speech_seconds": 0.0, "noise_db": None, "threshold_db": VAD_THRESHOLD_DB}

    levels = sorted(level for _, level in frames)
    noise_db = levels[int(len(levels) * 0.1)]  # 10th percentile

    # The threshold rides above the room noise, but never drops below the
    # absolute floor (which would treat silence as speech).
    threshold_db = max(VAD_THRESHOLD_DB, noise_db + 8.0)

    min_speech_frames = max(1, int(VAD_MIN_SPEECH_MS / VAD_FRAME_MS))
    hangover_frames = max(1, int(VAD_HANGOVER_MS / VAD_FRAME_MS))

    segments: list[tuple[int, int]] = []
    start = None
    silent_run = 0

    for index, (offset, level) in enumerate(frames):
        if level >= threshold_db:
            if start is None:
                start = offset
            silent_run = 0
        elif start is not None:
            silent_run += 1
            if silent_run >= hangover_frames:
                end = offset - (silent_run - 1) * frame_size
                if end - start >= min_speech_frames * frame_size:
                    segments.append((start, end))
                start = None
                silent_run = 0

    if start is not None:
        end = len(samples)
        if end - start >= min_speech_frames * frame_size:
            segments.append((start, end))

    # A clip that is speech from end to end has no silence to calibrate against, so
    # the 10th percentile is not a noise floor and the adaptive gate can end up above
    # the signal itself. If nothing was found but the clip is plainly not silent,
    # treat the whole span as speech rather than reporting nothing.
    if not segments:
        mean_db = sum(level for _, level in frames) / len(frames)

        if mean_db >= VAD_THRESHOLD_DB:
            segments = [(0, len(samples))]

    return {
        "segments": segments,
        "speech_seconds": round(sum(end - begin for begin, end in segments) / rate, 2),
        "noise_db": round(noise_db, 1),
        "threshold_db": round(threshold_db, 1),
        "frame_ms": VAD_FRAME_MS,
    }


def trim_to_speech(samples: array, rate: int, analysis: dict, pad_ms: int = 150) -> array:
    """Keep only the speech spans, with a little padding."""
    segments = analysis["segments"]

    if not segments:
        return samples

    pad = int(rate * pad_ms / 1000)
    first = max(0, segments[0][0] - pad)
    last = min(len(samples), segments[-1][1] + pad)

    return samples[first:last]


# --------------------------------------------------------------------------- #
# Speech to text
# --------------------------------------------------------------------------- #


def _post_multipart(url: str, fields: dict[str, str], files: dict[str, tuple[str, bytes, str]], headers: dict[str, str], timeout: int = 90):
    boundary = f"----comsats{uuid.uuid4().hex}"
    body = bytearray()

    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()

    for name, (filename, content, mime) in files.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
        body += content
        body += b"\r\n"

    body += f"--{boundary}--\r\n".encode()

    request_object = urllib.request.Request(
        url,
        data=bytes(body),
        headers={
            **REQUEST_HEADERS,
            **headers,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request_object, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read()[:300].decode(errors="ignore")
        raise RuntimeError(f"Groq rejected the request ({error.code}): {detail}") from error


def transcribe(audio: bytes, filename: str = "speech.wav", mime: str = "audio/wav") -> dict:
    api_key = groq_api_key()

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set")

    started = time.time()

    payload = _post_multipart(
        GROQ_TRANSCRIPTIONS,
        {
            "model": STT_MODEL,
            "response_format": "json",
            "language": STT_LANGUAGE,
            "prompt": STT_PROMPT,
            "temperature": "0",
        },
        {"file": (filename, audio, mime)},
        {"Authorization": f"Bearer {api_key}"},
    )

    return {
        "text": (payload.get("text") or "").strip(),
        "model": STT_MODEL,
        "seconds": round(time.time() - started, 2),
    }


# --------------------------------------------------------------------------- #
# Text to speech
# --------------------------------------------------------------------------- #


def _edge_tts(text: str, voice: str) -> tuple[bytes, str, str]:
    import edge_tts  # imported lazily so the module works without it

    async def run() -> bytes:
        communicate = edge_tts.Communicate(text, voice)
        buffer = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])

        return buffer.getvalue()

    audio = asyncio.run(run())

    if not audio:
        raise RuntimeError("edge-tts returned no audio")

    return audio, "audio/mpeg", f"edge-tts:{voice}"


def _sapi_tts(text: str, voice: str) -> tuple[bytes, str, str]:
    if os.name != "nt":
        raise RuntimeError("SAPI is only available on Windows")

    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "speech.wav"
        # Base64 keeps quotes, newlines and unicode intact through PowerShell.
        encoded = base64.b64encode(text.encode("utf-8")).decode("ascii")

        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"try {{ $s.SelectVoice('{voice}') }} catch {{ }}; "
            f"$s.SetOutputToWaveFile('{target}'); "
            f"$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded}')); "
            "$s.Speak($text); $s.Dispose()"
        )

        completed = subprocess.run(  # noqa: S603 - fixed argv
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            timeout=90,
        )

        if completed.returncode != 0 or not target.exists():
            raise RuntimeError(
                f"SAPI failed: {completed.stderr.decode(errors='ignore').strip()[:200]}"
            )

        return target.read_bytes(), "audio/wav", f"sapi:{voice}"


def synthesize(text: str, voice: str | None = None, prefer: str | None = None) -> tuple[bytes, str, str]:
    """Return (audio_bytes, mime_type, engine_label)."""
    cleaned = " ".join(str(text or "").split())

    if not cleaned:
        raise ValueError("Nothing to say")

    cleaned = cleaned[:1200]
    chosen = voice or TTS_VOICE

    order = [prefer] if prefer else ["edge", "sapi"]
    errors: list[str] = []

    for engine in order:
        if engine == "edge":
            try:
                return _edge_tts(cleaned, chosen)
            except Exception as exc:  # missing package, no network, voice rejected
                errors.append(f"edge-tts: {exc}")
        elif engine == "sapi":
            try:
                return _sapi_tts(cleaned, SAPI_VOICE)
            except Exception as exc:
                errors.append(f"sapi: {exc}")

    raise RuntimeError("No TTS engine available — " + "; ".join(errors))


def tts_engine_status() -> dict:
    edge_available = False

    try:
        import edge_tts  # noqa: F401

        edge_available = True
    except Exception:
        edge_available = False

    return {
        "edge_tts": edge_available,
        "sapi": os.name == "nt" and shutil.which("powershell") is not None,
        "voice": TTS_VOICE,
        "fallback_voice": SAPI_VOICE,
    }
