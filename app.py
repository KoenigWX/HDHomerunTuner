import time
import subprocess
import re
import threading
import uuid

try:
    from flask import Flask, jsonify, request, send_from_directory
except ImportError as exc:  # pragma: no cover - runtime guard only
    raise ImportError(
        "Flask is required to run this application."
        " Please install dependencies with 'pip install -r requirements.txt'."
    ) from exc

app = Flask(__name__, static_folder=".", static_url_path="")

# Store scan progress keyed by UUID
scans = {}

# Mapping from frequency (Hz) to physical channel
FREQ_TO_CHANNEL = {
    57000000: 2,
    63000000: 3,
    69000000: 4,
    79000000: 5,
    85000000: 6,
    177000000: 7,
    183000000: 8,
    189000000: 9,
    195000000: 10,
    201000000: 11,
    207000000: 12,
    213000000: 13,
    473000000: 14,
    479000000: 15,
    485000000: 16,
    491000000: 17,
    497000000: 18,
    503000000: 19,
    509000000: 20,
    515000000: 21,
    521000000: 22,
    527000000: 23,
    533000000: 24,
    539000000: 25,
    545000000: 26,
    551000000: 27,
    557000000: 28,
    563000000: 29,
    569000000: 30,
    575000000: 31,
    581000000: 32,
    587000000: 33,
    593000000: 34,
    599000000: 35,
    605000000: 36,
    617000000: 38,
    623000000: 39,
    629000000: 40,
    635000000: 41,
    641000000: 42,
    647000000: 43,
    653000000: 44,
    659000000: 45,
    665000000: 46,
    671000000: 47,
    677000000: 48,
    683000000: 49,
    689000000: 50,
    695000000: 51,
}


def run_scan(scan_id, device_id, tuner_index):
    """Background thread to perform a channel scan."""
    cmd = ["hdhomerun_config", device_id, "scan", f"/tuner{tuner_index}"]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except OSError:
        scans[scan_id] = {"finished": True, "results": []}
        return

    results: list[dict] = []
    current_group = None
    capturing = False

    for raw in proc.stdout:
        line = raw.strip()

        if line.startswith("SCANNING:"):
            if current_group is not None and (
                current_group.get("lock") is not None
                or current_group.get("subchannels")
            ):
                results.append(current_group)
                scans[scan_id]["results"] = list(results)
            capturing = False

            parts = line.split()
            freq = None
            try:
                freq = int(parts[1])
            except (IndexError, ValueError):
                pass

            m = re.search(r"\((?:us-bcast:)?(\d+)\)", line)
            phys = int(m.group(1)) if m else None
            if phys is None and freq is not None:
                phys = FREQ_TO_CHANNEL.get(freq)

            current_group = {
                "physical": phys,
                "lock": None,
                "ss": 0,
                "snq": 0,
                "subchannels": [],
            }

        elif line.startswith("LOCK:") and current_group is not None:
            # Example: "LOCK: 8vsb (ss=85 snq=88 seq=100)" or "LOCK: none (ss=0 snq=0 seq=0)"
            m = re.search(r"LOCK:\s+(\S+)(?:\s+\(ss=(\d+)\s+snq=(\d+)\s+seq=(\d+)\))?", line)
            if m:
                lock_val, ss_val, snq_val, _ = m.groups()
                current_group["lock"] = lock_val if lock_val.lower() != "none" else None
                capturing = lock_val.lower() != "none"
                if ss_val is not None:
                    try:
                        current_group["ss"] = int(ss_val)
                    except ValueError:
                        current_group["ss"] = 0
                if snq_val is not None:
                    try:
                        current_group["snq"] = int(snq_val)
                    except ValueError:
                        current_group["snq"] = 0

        elif line.startswith("PROGRAM") and capturing and current_group is not None:
            after_colon = line.split(":", 1)[1].strip()
            for m in re.finditer(r"(\d+\.\d+)\s+(.+?)(?=\s+\d+\.\d+|$)", after_colon):
                num = m.group(1).strip()
                name = m.group(2).strip()
                current_group["subchannels"].append({"num": num, "name": name})
            scans[scan_id]["results"] = list(results) + [current_group]

    proc.wait()

    if current_group is not None and (
        current_group.get("lock") is not None or current_group.get("subchannels")
    ):
        results.append(current_group)

    scans[scan_id]["results"] = results
    scans[scan_id]["finished"] = True


def discover_device():
    """
    Run `hdhomerun_config discover` and return (device_id, device_ip).
    If no device is found, return (None, None).
    """
    try:
        out = subprocess.check_output(
            ["hdhomerun_config", "discover"], stderr=subprocess.DEVNULL
        ).decode()
    except subprocess.CalledProcessError:
        return None, None

    # Look for lines like "hdhomerun device 10B137F8 found at 10.0.20.10"
    for line in out.splitlines():
        match = re.search(r"hdhomerun device (\w+) found at ([\d\.]+)", line)
        if match:
            return match.group(1), match.group(2)

    return None, None


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/api/status")
def api_status():
    """
    Returns device status: connected, device_id, device_ip, tuner_count.
    """
    device_id, _ = discover_device()
    if not device_id:
        return (
            jsonify(
                {"connected": False, "device_id": None, "device_ip": None, "tuner_count": None}
            ),
            503,
        )

    # Verify the device is reachable by querying sys/version
    try:
        subprocess.check_output(
            ["hdhomerun_config", device_id, "get", "/sys/version"], stderr=subprocess.DEVNULL
        )
        # Fetch local IP to display
        ip_output = subprocess.getoutput("hostname -I").split()
        device_ip = ip_output[0] if ip_output else "unknown"
        # Assume 4 tuners (adjust if necessary)
        tuner_count = 4
        return jsonify(
            {
                "connected": True,
                "device_id": device_id,
                "device_ip": device_ip,
                "tuner_count": tuner_count,
            }
        )
    except subprocess.CalledProcessError:
        return (
            jsonify(
                {"connected": False, "device_id": None, "device_ip": None, "tuner_count": None}
            ),
            503,
        )


@app.route("/api/tuners")
def api_tuners():
    """
    Returns a list of 4 tuner-status objects.
    Each object: { index, locked, lock, channel, ss, snq, seq }.
    """
    device_id, _ = discover_device()
    if not device_id:
        return jsonify([]), 503

    tuners = []
    for idx in range(4):
        # Fetch raw status line
        status_line = subprocess.getoutput(
            f"hdhomerun_config {device_id} get /tuner{idx}/status"
        ).strip()
        parts = status_line.split()

        lockkey = "none"
        ss = snq = seq = 0
        raw_ch_value = None

        for part in parts:
            if part.startswith("lock="):
                lockkey = part.split("=", 1)[1]
            elif part.startswith("ss="):
                try:
                    ss = int(part.split("=", 1)[1])
                except ValueError:
                    ss = 0
            elif part.startswith("snq="):
                try:
                    snq = int(part.split("=", 1)[1])
                except ValueError:
                    snq = 0
            elif part.startswith("seq="):
                try:
                    seq = int(part.split("=", 1)[1])
                except ValueError:
                    seq = 0
            elif part.startswith("ch="):
                # part = "ch=8vsb:10" or "ch=8vsb:485000000" or "ch=none"
                raw = part.split("=", 1)[1]
                if raw != "none":
                    try:
                        raw_ch_value = raw.split(":", 1)[1]
                    except IndexError:
                        raw_ch_value = None

        locked = lockkey.lower() != "none"

        # Determine physical channel
        channel = None
        if raw_ch_value:
            val_str = raw_ch_value.strip()
            if val_str.isdigit():
                if len(val_str) <= 2:
                    try:
                        channel = int(val_str)
                    except ValueError:
                        channel = None
                else:
                    try:
                        freq = int(val_str)
                        channel = FREQ_TO_CHANNEL.get(freq)
                    except ValueError:
                        channel = None

        tuners.append(
            {
                "index": idx,
                "locked": locked,
                "lock": lockkey,
                "channel": channel,
                "ss": ss,
                "snq": snq,
                "seq": seq,
            }
        )

    return jsonify(tuners)


@app.route("/api/scan/start", methods=["POST"])
def api_scan_start():
    """Start a channel scan asynchronously."""
    data = request.json or {}
    tuner_index = int(data.get("tuner", 0))

    device_id, _ = discover_device()
    if not device_id:
        return jsonify({"error": "No device found"}), 503

    scan_id = str(uuid.uuid4())
    scans[scan_id] = {"finished": False, "results": []}
    thread = threading.Thread(target=run_scan, args=(scan_id, device_id, tuner_index))
    thread.daemon = True
    thread.start()
    return jsonify({"scan_id": scan_id})


@app.route("/api/scan/status/<scan_id>")
def api_scan_status(scan_id):
    """Return progress for a running scan."""
    data = scans.get(scan_id)
    if not data:
        return jsonify({"error": "Invalid scan id"}), 404
    return jsonify({"finished": data["finished"], "results": data["results"]})


@app.route("/api/scan", methods=["POST"])
def scan_channels():
    """
    Perform a channel scan on a given tuner index.
    Expects JSON { "tuner": <index> }.
    Returns JSON { "results": [ { physical, lock, ss, snq, subchannels: [ { num, name }, … ] }, … ] }.
    """
    data = request.json or {}
    tuner_index = int(data.get("tuner", 0))

    device_id, _ = discover_device()
    if not device_id:
        return jsonify({"status": "error", "message": "No device found"}), 503

    cmd = ["hdhomerun_config", device_id, "scan", f"/tuner{tuner_index}"]
    try:
        proc = subprocess.run(
            cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        lines = proc.stdout.splitlines()
    except subprocess.CalledProcessError as e:
        # Include scan log in error message
        return jsonify({"status": "error", "message": f"Scan failed: {e.stdout.strip()}"}), 500

    results: list[dict] = []
    current_group = None
    capturing = False

    for raw in lines:
        line = raw.strip()

        if line.startswith("SCANNING:"):
            if current_group is not None and (
                current_group.get("lock") is not None or current_group.get("subchannels")
            ):
                results.append(current_group)
            capturing = False

            parts = line.split()
            freq = None
            try:
                freq = int(parts[1])
            except (IndexError, ValueError):
                pass

            m = re.search(r"\((?:us-bcast:)?(\d+)\)", line)
            phys = int(m.group(1)) if m else None
            if phys is None and freq is not None:
                phys = FREQ_TO_CHANNEL.get(freq)

            current_group = {
                "physical": phys,
                "lock": None,
                "ss": 0,
                "snq": 0,
                "subchannels": [],
            }

        elif line.startswith("LOCK:") and current_group is not None:
            # Example: "LOCK: qam256 (ss=80 snq=90 seq=100)" or "LOCK: none (ss=0 snq=0 seq=0)"
            m = re.search(r"LOCK:\s+(\S+)(?:\s+\(ss=(\d+)\s+snq=(\d+)\s+seq=(\d+)\))?", line)
            if m:
                lock_val, ss_val, snq_val, _ = m.groups()
                current_group["lock"] = lock_val if lock_val.lower() != "none" else None
                capturing = lock_val.lower() != "none"
                if ss_val is not None:
                    try:
                        current_group["ss"] = int(ss_val)
                    except ValueError:
                        current_group["ss"] = 0
                if snq_val is not None:
                    try:
                        current_group["snq"] = int(snq_val)
                    except ValueError:
                        current_group["snq"] = 0

        elif line.startswith("PROGRAM") and capturing and current_group is not None:
            after_colon = line.split(":", 1)[1].strip()
            for m in re.finditer(r"(\d+\.\d+)\s+(.+?)(?=\s+\d+\.\d+|$)", after_colon):
                num = m.group(1).strip()
                name = m.group(2).strip()
                current_group["subchannels"].append({"num": num, "name": name})

    if current_group is not None and (
        current_group.get("lock") is not None or current_group.get("subchannels")
    ):
        results.append(current_group)

    return jsonify({"status": "success", "results": results})


@app.route("/api/tune", methods=["POST"])
def api_tune():
    """
    Tune a specified tuner to a physical channel and return its subchannels.
    Expects JSON { "tuner": <index>, "channel": <int> }.
    Returns { "subchannels": [ { num, name }, … ] }.
    """
    data = request.json or {}
    tuner = data.get("tuner")
    channel = data.get("channel")

    device_id, _ = discover_device()
    if not device_id or tuner is None or channel is None:
        return jsonify({"subchannels": []}), 400

    # 1) Clear lock
    subprocess.getoutput(f"hdhomerun_config {device_id} set /tuner{tuner}/lockkey none")
    time.sleep(0.1)

    # 2) Set channel to "8vsb:<channel>"
    subprocess.getoutput(f"hdhomerun_config {device_id} set /tuner{tuner}/channel 8vsb:{channel}")
    time.sleep(1)  # allow PSIP to populate

    # 3) Fetch streaminfo for subchannels
    streaminfo_raw = subprocess.getoutput(
        f"hdhomerun_config {device_id} get /tuner{tuner}/streaminfo"
    )
    subchannels = []
    for line in streaminfo_raw.strip().splitlines():
        parts = line.split()
        num = name = None
        for part in parts:
            if part.startswith("vchannel="):
                num = part.split("=", 1)[1]
            elif part.startswith("name="):
                name = part.split("=", 1)[1]
        if num and name:
            subchannels.append({"num": num, "name": name})

    return jsonify({"subchannels": subchannels})


@app.route("/api/program_info", methods=["POST"])
def api_program_info():
    """
    Return TS bitrate info for a specific subchannel on a tuned tuner.
    Expects JSON { "tuner": <index>, "program": "<major>.<minor>" }.
    Returns { "bitrate": <bps>, "max_bitrate": <bps> }.
    """
    data = request.json or {}
    tuner = data.get("tuner")
    program = data.get("program")

    device_id, _ = discover_device()
    if not device_id or tuner is None or not program:
        return jsonify({"bitrate": None, "max_bitrate": None}), 400

    streaminfo_raw = subprocess.getoutput(
        f"hdhomerun_config {device_id} get /tuner{tuner}/streaminfo"
    )
    bitrate = None
    max_bitrate = None

    for line in streaminfo_raw.strip().splitlines():
        parts = line.split()
        vchannel = bps = peakbps = None
        for part in parts:
            if part.startswith("vchannel="):
                vchannel = part.split("=", 1)[1]
            elif part.startswith("bps="):
                try:
                    bps = int(part.split("=", 1)[1])
                except ValueError:
                    bps = None
            elif part.startswith("peakbps="):
                try:
                    peakbps = int(part.split("=", 1)[1])
                except ValueError:
                    peakbps = None
        if vchannel == program:
            bitrate = bps
            max_bitrate = peakbps
            break

    return jsonify({"bitrate": bitrate, "max_bitrate": max_bitrate})


@app.route("/api/clear_locks", methods=["POST"])
def api_clear_locks():
    """
    Force-unlock all 4 tuners by setting lockkey to none.
    Returns each tuner’s raw response.
    """
    device_id, _ = discover_device()
    if not device_id:
        return jsonify({"results": []}), 503

    results = []
    for idx in range(4):
        raw = subprocess.getoutput(f"hdhomerun_config {device_id} set /tuner{idx}/lockkey none")
        results.append({"tuner": idx, "raw": raw})
    return jsonify({"results": results})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5070)
