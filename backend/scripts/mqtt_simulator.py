from __future__ import annotations

import argparse
import json
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum

try:
    import paho.mqtt.client as mqtt
except ModuleNotFoundError:  # Allows local generation tests without MQTT installed.
    mqtt = None


class MachineStatus(StrEnum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    WARNING = "WARNING"
    ERROR = "ERROR"
    MAINTENANCE = "MAINTENANCE"


@dataclass(frozen=True)
class MetricRange:
    temperature: tuple[float, float]
    vibration: tuple[float, float]
    motor_speed: tuple[float, float]


@dataclass(frozen=True)
class MachineProfile:
    temperature_bias: float = 0.0
    vibration_bias: float = 0.0
    motor_speed_bias: float = 0.0
    temperature_delta: tuple[float, float] = (-1.0, 1.5)
    vibration_delta: tuple[float, float] = (-0.2, 0.3)
    motor_speed_delta: tuple[float, float] = (-50.0, 50.0)
    speed_instability: float = 1.0


BASE_RANGES: dict[MachineStatus, MetricRange] = {
    MachineStatus.IDLE: MetricRange((25.0, 35.0), (0.0, 1.5), (0.0, 100.0)),
    MachineStatus.RUNNING: MetricRange((40.0, 65.0), (2.0, 6.0), (800.0, 1800.0)),
    MachineStatus.WARNING: MetricRange((65.0, 80.0), (6.0, 8.5), (1200.0, 2200.0)),
    MachineStatus.ERROR: MetricRange((80.0, 95.0), (8.5, 12.0), (0.0, 2500.0)),
    MachineStatus.MAINTENANCE: MetricRange((25.0, 40.0), (0.0, 2.0), (0.0, 300.0)),
}

ABSOLUTE_RANGE = MetricRange((20.0, 100.0), (0.0, 12.0), (0.0, 2500.0))


PROFILES: dict[str, MachineProfile] = {
    "3D_Printer_1": MachineProfile(
        temperature_bias=-2.0,
        vibration_bias=-0.7,
        motor_speed_bias=-220.0,
        temperature_delta=(-0.7, 1.0),
        vibration_delta=(-0.12, 0.16),
        motor_speed_delta=(-30.0, 30.0),
        speed_instability=0.65,
    ),
    "CNC_1": MachineProfile(
        temperature_bias=3.0,
        vibration_bias=0.8,
        motor_speed_bias=280.0,
        temperature_delta=(-1.2, 1.7),
        vibration_delta=(-0.25, 0.35),
        motor_speed_delta=(-70.0, 70.0),
        speed_instability=1.35,
    ),
}

DEFAULT_PROFILE = MachineProfile()
ERROR_CODES = ["OVERHEAT", "HIGH_VIBRATION", "MOTOR_FAULT", "EMERGENCY_STOP"]


def clamp(value: float, value_range: tuple[float, float]) -> float:
    low, high = value_range
    return max(low, min(high, value))


def shifted_range(value_range: tuple[float, float], bias: float, limit: tuple[float, float]) -> tuple[float, float]:
    low, high = value_range
    shifted_low = clamp(low + bias, limit)
    shifted_high = clamp(high + bias, limit)
    if shifted_low > shifted_high:
        return limit
    return shifted_low, shifted_high


def profile_for(machine_id: str) -> MachineProfile:
    if machine_id in PROFILES:
        return PROFILES[machine_id]
    if "cnc" in machine_id.lower():
        return PROFILES["CNC_1"]
    if "printer" in machine_id.lower():
        return PROFILES["3D_Printer_1"]
    return DEFAULT_PROFILE


def ranges_for(status: MachineStatus, profile: MachineProfile) -> MetricRange:
    base = BASE_RANGES[status]
    return MetricRange(
        temperature=shifted_range(base.temperature, profile.temperature_bias, base.temperature),
        vibration=shifted_range(base.vibration, profile.vibration_bias, base.vibration),
        motor_speed=shifted_range(base.motor_speed, profile.motor_speed_bias, base.motor_speed),
    )


def smooth_metric(
    current: float,
    target_range: tuple[float, float],
    delta_range: tuple[float, float],
    hard_range: tuple[float, float],
    pull_strength: float = 0.15,
) -> float:
    low, high = target_range
    target = random.uniform(low, high)
    drift = (target - current) * pull_strength
    jitter = random.uniform(*delta_range)
    max_step = max(abs(delta_range[0]), abs(delta_range[1]))
    next_value = current + clamp(drift + jitter, (-max_step, max_step))
    return clamp(next_value, hard_range)


@dataclass
class MachineTelemetryState:
    machine_id: str
    profile: MachineProfile
    status: MachineStatus = MachineStatus.IDLE
    usage_duration: int = field(default_factory=lambda: random.randint(0, 60))
    temperature: float = 0.0
    vibration: float = 0.0
    motor_speed: float = 0.0
    cycles_in_status: int = 0
    error_cycles_remaining: int = 0
    maintenance_cycles_remaining: int = 0

    def __post_init__(self) -> None:
        initial_status = MachineStatus.RUNNING if random.random() < 0.7 else MachineStatus.IDLE
        self.status = initial_status
        ranges = ranges_for(self.status, self.profile)
        self.temperature = random.uniform(*ranges.temperature)
        self.vibration = random.uniform(*ranges.vibration)
        self.motor_speed = random.uniform(*ranges.motor_speed)

    def next_payload(self) -> dict:
        self._transition_state()
        self._advance_metrics()
        self._advance_usage()

        error = None
        if self.status == MachineStatus.ERROR and random.random() < 0.75:
            error = random.choice(ERROR_CODES)
        elif self.status == MachineStatus.WARNING and random.random() < 0.12:
            error = random.choice(["OVERHEAT", "HIGH_VIBRATION"])

        return {
            "machine_id": self.machine_id,
            "temperature": round(self.temperature, 2),
            "vibration": round(self.vibration, 2),
            "usage_duration": self.usage_duration,
            "motor_speed": round(self.motor_speed, 2),
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": self.status.value,
        }

    def _transition_state(self) -> None:
        self.cycles_in_status += 1

        if self.status == MachineStatus.IDLE:
            if self.cycles_in_status >= 4 and random.random() < 0.28:
                self._set_status(MachineStatus.RUNNING)
            return

        if self.status == MachineStatus.RUNNING:
            if self.cycles_in_status < 8:
                return
            roll = random.random()
            if roll < 0.08:
                self._set_status(MachineStatus.WARNING)
            elif roll < 0.11:
                self._set_status(MachineStatus.IDLE)
            elif roll < 0.13:
                self._set_status(MachineStatus.MAINTENANCE)
            return

        if self.status == MachineStatus.WARNING:
            if self.cycles_in_status < 4:
                return
            roll = random.random()
            if roll < 0.14:
                self.error_cycles_remaining = random.randint(3, 6)
                self._set_status(MachineStatus.ERROR)
            elif roll < 0.42:
                self._set_status(MachineStatus.RUNNING)
            return

        if self.status == MachineStatus.ERROR:
            if self.error_cycles_remaining > 0:
                self.error_cycles_remaining -= 1
                return
            next_status = MachineStatus.MAINTENANCE if random.random() < 0.65 else MachineStatus.IDLE
            if next_status == MachineStatus.MAINTENANCE:
                self.maintenance_cycles_remaining = random.randint(4, 8)
            self._set_status(next_status)
            return

        if self.status == MachineStatus.MAINTENANCE:
            if self.maintenance_cycles_remaining > 0:
                self.maintenance_cycles_remaining -= 1
                return
            next_status = MachineStatus.IDLE if random.random() < 0.65 else MachineStatus.RUNNING
            self._set_status(next_status)

    def _set_status(self, status: MachineStatus) -> None:
        self.status = status
        self.cycles_in_status = 0

    def _advance_metrics(self) -> None:
        ranges = ranges_for(self.status, self.profile)
        speed_delta = self.profile.motor_speed_delta

        if self.status == MachineStatus.ERROR:
            speed_delta = (
                speed_delta[0] * self.profile.speed_instability * 3,
                speed_delta[1] * self.profile.speed_instability * 3,
            )

        self.temperature = smooth_metric(
            self.temperature,
            ranges.temperature,
            self.profile.temperature_delta,
            ABSOLUTE_RANGE.temperature,
        )
        self.vibration = smooth_metric(
            self.vibration,
            ranges.vibration,
            self.profile.vibration_delta,
            ABSOLUTE_RANGE.vibration,
        )
        self.motor_speed = smooth_metric(
            self.motor_speed,
            ranges.motor_speed,
            speed_delta,
            ABSOLUTE_RANGE.motor_speed,
            pull_strength=0.12,
        )

    def _advance_usage(self) -> None:
        if self.status in {MachineStatus.RUNNING, MachineStatus.WARNING, MachineStatus.ERROR}:
            self.usage_duration += random.randint(1, 4)
        elif self.status == MachineStatus.MAINTENANCE:
            self.usage_duration += random.randint(0, 1)


def build_payload(state: MachineTelemetryState) -> dict:
    return state.next_payload()


def build_machine_states(machine_ids: list[str]) -> dict[str, MachineTelemetryState]:
    return {
        machine_id: MachineTelemetryState(machine_id=machine_id, profile=profile_for(machine_id))
        for machine_id in machine_ids
    }


def publish_loop(client: mqtt.Client, machine_ids: list[str], interval: int) -> None:
    machine_states = build_machine_states(machine_ids)
    while True:
        for machine_id, state in machine_states.items():
            payload = build_payload(state)
            topic = f"fablab/machines/{machine_id}/data"
            client.publish(topic, json.dumps(payload), qos=0)
            print(f"Published -> {topic}: {payload}")
        time.sleep(interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="FabLab MQTT realistic IoT telemetry simulator")
    parser.add_argument("--broker-host", default="localhost")
    parser.add_argument("--broker-port", type=int, default=1883)
    parser.add_argument("--interval", type=int, default=4, help="Publish interval in seconds")
    parser.add_argument(
        "--machines",
        default="3D_Printer_1,CNC_1,Laser_1",
        help="Comma separated machine instance names",
    )
    return parser.parse_args()


def main() -> None:
    if mqtt is None:
        raise SystemExit("paho-mqtt is not installed. Run `pip install -r backend/requirements.txt` first.")

    args = parse_args()
    machine_ids = [item.strip() for item in args.machines.split(",") if item.strip()]
    client = mqtt.Client()
    client.connect(args.broker_host, args.broker_port, keepalive=60)
    client.loop_start()
    print(f"Connected to broker {args.broker_host}:{args.broker_port}")
    print(f"Simulating machines: {', '.join(machine_ids)}")
    publish_loop(client, machine_ids=machine_ids, interval=args.interval)


if __name__ == "__main__":
    main()
