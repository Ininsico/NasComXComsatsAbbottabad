"""Unit tests for the voice layer: the VAD, WAV handling and the queue's spool.

Run from the AI directory:

    python -m unittest discover -s tests -v

Nothing here needs a broker, a model download or a microphone.
"""

import os
import tempfile
import time
import unittest
from array import array

import voice
from audio_queue import AudioQueue

RATE = 16000


def silence(seconds=0.5):
    return array("h", [0] * int(RATE * seconds))


def speech(seconds=1.0):
    frames = int(RATE * seconds / 2)
    return array("h", [12000, -12000] * frames)


class WavRoundTrip(unittest.TestCase):
    def test_samples_survive_a_write_and_read(self):
        original = array("h", [100, -100, 500, -500, 0])
        data = voice.write_wav(original, RATE)

        samples, rate, channels = voice.read_wav(data)

        self.assertEqual(rate, RATE)
        self.assertEqual(channels, 1)
        self.assertEqual(list(samples), list(original))

    def test_garbage_is_rejected(self):
        with self.assertRaises(ValueError):
            voice.read_wav(b"this is not a wav file")


class Resampling(unittest.TestCase):
    def test_halves_the_rate_and_the_sample_count(self):
        samples = array("h", list(range(0, 32000, 10)))

        resampled, rate = voice.resample_to_target(samples, 32000)

        self.assertEqual(rate, voice.TARGET_SAMPLE_RATE)
        self.assertAlmostEqual(len(resampled), len(samples) / 2, delta=2)

    def test_leaves_a_16k_signal_alone(self):
        samples = array("h", [1, 2, 3, 4])

        resampled, rate = voice.resample_to_target(samples, RATE)

        self.assertEqual(rate, RATE)
        self.assertEqual(list(resampled), list(samples))


class VoiceActivityDetection(unittest.TestCase):
    def test_silence_contains_no_speech(self):
        result = voice.analyse_speech(silence(1.0), RATE)

        self.assertEqual(result["segments"], [])
        self.assertEqual(result["speech_seconds"], 0.0)

    def test_a_single_utterance_is_found_once(self):
        clip = silence(0.5) + speech(1.0) + silence(1.0)

        result = voice.analyse_speech(clip, RATE)

        self.assertEqual(len(result["segments"]), 1)
        self.assertGreaterEqual(result["speech_seconds"], 0.9)
        self.assertLessEqual(result["speech_seconds"], 1.2)

        begin, end = result["segments"][0]
        self.assertLessEqual(abs(begin / RATE - 0.5), 0.1, "the utterance should start near 0.5s")
        self.assertGreaterEqual(end / RATE, 1.0)

    def test_speech_that_never_stops_is_still_detected(self):
        # No silence to calibrate against: the adaptive gate can land above the signal,
        # so analyse_speech falls back to treating the whole span as speech.
        result = voice.analyse_speech(speech(1.0), RATE)

        self.assertEqual(len(result["segments"]), 1)
        self.assertAlmostEqual(result["speech_seconds"], 1.0, delta=0.1)

    def test_trimming_keeps_the_utterance_and_drops_the_padding(self):
        clip = silence(1.0) + speech(1.0) + silence(1.0)
        analysis = voice.analyse_speech(clip, RATE)

        trimmed = voice.trim_to_speech(clip, RATE, analysis)

        self.assertLess(len(trimmed), len(clip))
        self.assertGreater(len(trimmed), int(RATE * 1.0))


class QueueSpool(unittest.TestCase):
    def test_a_queue_without_a_url_is_disabled(self):
        queue = AudioQueue("")
        self.assertFalse(queue.enabled)
        self.assertFalse(queue.stats()["enabled"])

    def test_the_spool_round_trips_and_cleans_up(self):
        with tempfile.TemporaryDirectory() as folder:
            queue = AudioQueue("", spool_dir=folder)
            payload = b"\x00\x01\x02binary audio"

            queue._spool_write("job-1", payload)

            self.assertEqual(queue._spool_read("job-1"), payload)
            self.assertEqual(queue._spool_count(), 1)

            queue._spool_delete("job-1")

            self.assertEqual(queue._spool_count(), 0)
            self.assertFalse(os.path.exists(os.path.join(folder, "job-1.bin")))

    def test_the_sweep_only_removes_old_files(self):
        with tempfile.TemporaryDirectory() as folder:
            queue = AudioQueue("", spool_dir=folder)

            queue._spool_write("old", b"x")
            queue._spool_write("new", b"y")

            old_path = os.path.join(folder, "old.bin")
            two_days_ago = time.time() - 2 * 24 * 3600
            os.utime(old_path, (two_days_ago, two_days_ago))

            removed = queue._sweep(max_age_hours=24)

            self.assertEqual(removed, 1)
            self.assertEqual(queue._spool_count(), 1)
            self.assertTrue(os.path.exists(os.path.join(folder, "new.bin")))


if __name__ == "__main__":
    unittest.main()
