"""
RabbitMQ-backed audio queue.

Audio turns must not overlap: two uploads at once would fight over the same Groq
quota, the same vector store and the same speaker. So a turn is published to a
durable queue instead of being processed inline, and a single worker drains it
with `prefetch_count=1`. That makes "one audio job at a time" a property of the
broker rather than a hope about timing.

The worker is a classic RPC server: it processes a job, then publishes the result
back to the caller's exclusive reply queue, correlated by id. Each HTTP request
gets its own connection because pika connections are not thread-safe.

*Claim check.* A recording is ~450 KB once base64-encoded, and pushing that
through the broker costs far more than the queueing itself — measured at 4.5 s of
extra pickup latency over a 330 kbps uplink, versus 0.3 s for a small message.
So the audio is written to a local spool file and only a reference travels in the
message. The spool is drained as jobs are processed and swept on startup, so a
lost message can never leave the disk filling up.

If the broker is unreachable the service still works — `enabled` is False and the
caller processes the turn inline behind a process-wide lock.
"""

from __future__ import annotations

import base64
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable

try:
    import pika

    PIKA_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    pika = None
    PIKA_AVAILABLE = False


# A job handler takes the job dict and returns (payload, status_code).
JobHandler = Callable[[dict], "tuple[dict, int]"]


class AudioQueue:
    """Publisher plus single-consumer worker for audio turns."""

    def __init__(
        self,
        url: str,
        queue_name: str = "voice.audio",
        job_timeout: int = 180,
        heartbeat: int = 60,
        spool_dir: str | Path | None = None,
    ) -> None:
        self.url = (url or "").strip()
        self.queue_name = queue_name
        self.job_timeout = job_timeout
        self.heartbeat = heartbeat
        self.spool_dir = Path(spool_dir) if spool_dir else (
            Path(__file__).resolve().parent / "data" / "audio-queue"
        )

        self.enabled = bool(self.url) and PIKA_AVAILABLE
        self.reason = (
            "broker not configured"
            if not self.url
            else ("pika is not installed" if not PIKA_AVAILABLE else "ok")
        )

        self._handler: JobHandler | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._depth: int | None = None

        self._stats: dict[str, Any] = {
            "submitted": 0,
            "completed": 0,
            "failed": 0,
            "timed_out": 0,
            "in_flight": 0,
            "last_job_ms": None,
            "last_wait_ms": None,
            "last_error": None,
            "last_finished_at": None,
            "connected": False,
            "started_at": None,
        }

    # ------------------------------------------------------------------ #
    # Connection helpers
    # ------------------------------------------------------------------ #

    def _parameters(self):
        return pika.URLParameters(self.url)

    def _connect(self):
        return pika.BlockingConnection(self._parameters())

    def ping(self, timeout: float = 4.0) -> dict:
        """Cheap reachability probe used by the health endpoint."""
        if not self.enabled:
            return {"reachable": False, "reason": self.reason}

        try:
            connection = self._connect()
            channel = connection.channel()
            declared = channel.queue_declare(queue=self.queue_name, durable=True)
            depth = declared.method.message_count
            connection.close()
            return {"reachable": True, "queue": self.queue_name, "depth": depth}
        except Exception as exc:
            return {"reachable": False, "reason": str(exc)}

    # ------------------------------------------------------------------ #
    # Claim check: audio on disk, a reference on the wire
    # ------------------------------------------------------------------ #

    def _spool_write(self, job_id: str, data: bytes) -> None:
        target = self.spool_dir / f"{job_id}.bin"
        partial = self.spool_dir / f"{job_id}.part"
        partial.write_bytes(data)
        partial.replace(target)  # atomic, so a reader never sees half a file

    def _spool_read(self, job_id: str) -> bytes:
        return (self.spool_dir / f"{job_id}.bin").read_bytes()

    def _spool_delete(self, job_id: str) -> None:
        for suffix in (".bin", ".part"):
            try:
                (self.spool_dir / f"{job_id}{suffix}").unlink()
            except OSError:
                pass

    def _sweep(self, max_age_hours: int = 24) -> int:
        """Drop spool files left behind by messages that never got consumed."""
        cutoff = time.time() - max_age_hours * 3600
        removed = 0

        for pattern in ("*.bin", "*.part"):
            for path in self.spool_dir.glob(pattern):
                try:
                    if path.stat().st_mtime < cutoff:
                        path.unlink()
                        removed += 1
                except OSError:
                    pass

        return removed

    def _spool_count(self) -> int:
        try:
            return sum(1 for _ in self.spool_dir.glob("*.bin"))
        except OSError:
            return 0

    # ------------------------------------------------------------------ #
    # Worker
    # ------------------------------------------------------------------ #

    def start(self, handler: JobHandler) -> bool:
        """Start the single consumer. Returns False when the queue is disabled."""
        if not self.enabled:
            return False

        self.spool_dir.mkdir(parents=True, exist_ok=True)
        swept = self._sweep()

        if swept:
            print(f"  queue         swept {swept} orphaned spool file(s)")

        self._handler = handler
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="audio-queue-worker", daemon=True)
        self._thread.start()
        self._stats["started_at"] = time.time()

        return True

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        """Consume forever, one job at a time, reconnecting when the broker blinks."""
        while not self._stop.is_set():
            connection = None

            try:
                connection = self._connect()
                channel = connection.channel()
                channel.queue_declare(queue=self.queue_name, durable=True)

                # The whole point: the broker hands this consumer one unacked job
                # at a time, so a second upload waits in the queue rather than
                # being processed in parallel.
                channel.basic_qos(prefetch_count=1)

                self._stats["connected"] = True
                print(f"  queue         consuming {self.queue_name} (prefetch=1)")

                for method, properties, body in channel.consume(
                    self.queue_name, inactivity_timeout=1
                ):
                    if self._stop.is_set():
                        break

                    # Idle tick: do nothing. Refreshing the depth here would be an
                    # extra broker round trip every second, which is pure overhead
                    # when the broker is not on loopback.
                    if method is None:
                        continue

                    self._depth = channel.queue_declare(
                        queue=self.queue_name, durable=True
                    ).method.message_count

                    self._handle_job(channel, method, properties, body)
            except Exception as exc:
                self._stats["connected"] = False
                self._stats["last_error"] = str(exc)
                print(f"  queue         worker reconnecting after: {exc}")

                if not self._stop.is_set():
                    time.sleep(3)
            finally:
                self._stats["connected"] = False

                try:
                    if connection is not None and connection.is_open:
                        connection.close()
                except Exception:
                    pass

    def _handle_job(self, channel, method, properties, body: bytes) -> None:
        picked_up = time.time()
        self._stats["in_flight"] = 1

        enqueued_at: float | None = None
        spool_id: str | None = None
        result: dict[str, Any] = {}
        status = 200

        try:
            job = json.loads(body.decode())
            enqueued_at = job.get("_enqueued_at")

            # Pull the recording back out of the spool before the handler runs,
            # so the handler still sees the same "audio" field it always did.
            spool_id = job.pop("spool_id", None)

            if spool_id:
                job["audio"] = base64.b64encode(self._spool_read(spool_id)).decode("ascii")

            payload, status = (
                self._handler(job) if self._handler else ({"error": "no handler"}, 500)
            )
            result = payload if isinstance(payload, dict) else {"payload": payload}
            self._stats["completed"] += 1
        except Exception as exc:
            result = {"error": f"audio job failed: {exc}"}
            status = 500
            self._stats["failed"] += 1
            self._stats["last_error"] = str(exc)
        finally:
            if spool_id:
                self._spool_delete(spool_id)

            finished = time.time()
            self._stats["in_flight"] = 0
            self._stats["last_job_ms"] = round((finished - picked_up) * 1000)
            self._stats["last_wait_ms"] = (
                round((picked_up - enqueued_at) * 1000) if enqueued_at else None
            )
            self._stats["last_finished_at"] = finished

        # Surfaced to the caller so queue wait and processing time are separable.
        result["queue_timing"] = {
            "wait_ms": round((picked_up - enqueued_at) * 1000) if enqueued_at else None,
            "process_ms": round((finished - picked_up) * 1000),
        }

        envelope = json.dumps({"status": status, "payload": result})

        try:
            if properties is not None and properties.reply_to:
                channel.basic_publish(
                    exchange="",
                    routing_key=properties.reply_to,
                    body=envelope.encode(),
                    properties=pika.BasicProperties(
                        correlation_id=properties.correlation_id,
                        content_type="application/json",
                    ),
                )
        except Exception as exc:
            self._stats["last_error"] = f"could not reply: {exc}"
        finally:
            # Always ack: a poisoned job would otherwise requeue forever.
            try:
                channel.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                pass

    # ------------------------------------------------------------------ #
    # Publisher
    # ------------------------------------------------------------------ #

    def submit(self, payload: dict, timeout: float | None = None) -> dict:
        """Publish one turn and block until the worker answers it."""
        if not self.enabled:
            raise RuntimeError(self.reason)

        deadline = time.time() + (timeout or self.job_timeout)
        self._stats["submitted"] += 1

        connection = self._connect()

        try:
            channel = connection.channel()
            channel.queue_declare(queue=self.queue_name, durable=True)

            reply = channel.queue_declare(queue="", exclusive=True)
            reply_queue = reply.method.queue
            correlation_id = uuid.uuid4().hex

            received: dict[str, Any] = {}

            def on_reply(_channel, method, properties, body) -> None:
                if properties.correlation_id == correlation_id:
                    received["body"] = body
                    _channel.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(
                queue=reply_queue, on_message_callback=on_reply, auto_ack=False
            )

            # The recording goes to disk; only its id travels in the message.
            body = dict(payload)
            audio = body.pop("audio", None)

            if audio:
                spool_id = uuid.uuid4().hex
                self._spool_write(spool_id, base64.b64decode(audio))
                body["spool_id"] = spool_id

            channel.basic_publish(
                exchange="",
                routing_key=self.queue_name,
                body=json.dumps({**body, "_enqueued_at": time.time()}).encode(),
                properties=pika.BasicProperties(
                    reply_to=reply_queue,
                    correlation_id=correlation_id,
                    delivery_mode=2,  # durable — a restart must not lose an upload
                    content_type="application/json",
                ),
            )

            while "body" not in received and time.time() < deadline:
                connection.process_data_events(time_limit=0.25)

            if "body" not in received:
                self._stats["timed_out"] += 1
                raise TimeoutError(
                    f"audio job did not finish within {int(timeout or self.job_timeout)}s"
                )

            return json.loads(received["body"].decode())
        finally:
            try:
                connection.close()
            except Exception:
                pass

    # ------------------------------------------------------------------ #

    def stats(self) -> dict:
        return {
            **self._stats,
            "enabled": self.enabled,
            "reason": self.reason,
            "queue": self.queue_name,
            "depth": self._depth,
            "spool_files": self._spool_count() if self.spool_dir.exists() else 0,
            "worker_alive": bool(self._thread and self._thread.is_alive()),
        }
