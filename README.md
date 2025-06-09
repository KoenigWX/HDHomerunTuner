# HDHomerunTuner

A web-based manual tuner interface for SiliconDust HDHomeRun devices. The application is implemented in [Flask](https://flask.palletsprojects.com/) and includes a lightweight Bootstrap front end. It exposes several API endpoints for controlling tuners and viewing device status.

## Features

- Automatically discovers your HDHomeRun device on the network
- View the connection status and tuner information
- Tune a selected tuner to a physical channel and list available subchannels
- Retrieve bitrate information for a program
- Clear tuner locks directly from the interface

## Local Development

1. Install the required Python packages:

   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Ensure `hdhomerun_config` is installed on your system. On Debian-based systems:

   ```bash
   sudo apt-get install hdhomerun-config
   ```

3. Run the application:

   ```bash
   python app.py
   ```

   The web UI will be available at <http://localhost:5070>.

## Docker Usage

The repository contains a `Dockerfile` and `docker-compose.yml` for running the tuner in a container. The container exposes port `5070`.

Build the image and run it with Docker:

```bash
docker build -t hdhomerun-tuner .
docker run --net=host --rm hdhomerun-tuner
```

Or use Docker Compose:

```bash
docker compose up -d
```

The container must run in host networking mode so that `hdhomerun_config` can communicate with the device on your local network.

## Continuous Integration

A GitHub Actions workflow located at `.github/workflows/build-and-push.yml` automatically builds the Docker image and pushes it to GitHub Container Registry whenever changes are pushed to the `main` branch.

