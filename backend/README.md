# Virtual FabLab Backend

## Run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

`python run.py` binds the API to `0.0.0.0:8000`, so another PC on the same
network can reach it at `http://YOUR_PC_IP:8000`.

Equivalent uvicorn command:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Default admin:
- email: `admin@fablab.local`
- password: `Admin@123`

## MQTT Fake IoT Simulator

Install requirements (includes `paho-mqtt`):

```bash
cd backend
pip install -r requirements.txt
```

Run simulator:

```bash
python scripts/mqtt_simulator.py --broker-host localhost --broker-port 1883 --interval 4 --machines "3D_Printer_1,CNC_1"
```

MQTT topic pattern used by simulator and backend subscriber:

`fablab/machines/{machine_id}/data`

Payload format:

```json
{
  "machine_id": "3D_Printer_1",
  "temperature": 45.2,
  "vibration": 2.1,
  "usage_duration": 120,
  "motor_speed": 1500,
  "error": null,
  "timestamp": "2026-03-19T12:00:00Z"
}
```
