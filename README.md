# HDHomerunTuner

A web-based manual tuner interface for SiliconDust HDHomeRun devices. The application is implemented in [Flask](https://flask.palletsprojects.com/) and includes a lightweight Bootstrap front end. It exposes several API endpoints for controlling tuners and viewing device status.

## Project Support

This project was created using OpenAI's Codex agent in a GitHub Codespace.
Ongoing maintenance and improvements are handled primarily through ChatGPT.

## Features

- Automatically discovers your HDHomeRun device on the network
- View the connection status and tuner information
- Tune a selected tuner to a physical channel and list available subchannels
- Retrieve bitrate information for a program
- Clear tuner locks directly from the interface
- View real-time signal quality using [Apache ECharts](https://echarts.apache.org)

## API Endpoints

The server exposes a simple JSON API used by the web UI. Useful endpoints include:

- `GET /api/status` – check device connectivity.
- `GET /api/tuners` – list status for all tuners.
- `POST /api/tune` – tune a tuner to a physical channel. Body `{tuner, channel}`.
- `POST /api/program_info` – return bitrate info for a specific program on a tuned tuner. Body `{tuner, program}`.
- `POST /api/scan/start` and `GET /api/scan/status/<id>` – run a channel scan asynchronously.

## Local Development

1. Install the required Python packages:

   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

   If you encounter `ModuleNotFoundError: No module named 'flask'`,
   ensure the above commands completed successfully and that your
   virtual environment is activated.

2. Ensure `hdhomerun_config` is installed on your system. On Debian-based systems:

   ```bash
   sudo apt-get install hdhomerun-config
   ```

3. Run the application for local development:

   ```bash
   python app.py
   ```

   The web UI will be available at <http://localhost:5070>.

   For production, use Gunicorn:

   ```bash
   gunicorn --bind 0.0.0.0:5070 app:app
   ```

Apache ECharts is loaded via CDN in `index.html`, so no additional
JavaScript build step is required.

## Docker Usage

The repository contains a `Dockerfile` and `docker-compose.yml` for running the tuner in a container. The container exposes port `5070` and runs the app with Gunicorn.

Build the image and run it with Docker:

```bash
docker build -t hdhomerun-tuner .
docker run --net=host --rm hdhomerun-tuner
```

Or use Docker Compose to pull the prebuilt image from GitHub Container Registry:

```bash
docker compose pull
docker compose up -d
```

The container must run in host networking mode so that `hdhomerun_config` can communicate with the device on your local network.

## Continuous Integration

A GitHub Actions workflow located at `.github/workflows/build-and-push.yml` automatically builds the Docker image and pushes it to GitHub Container Registry whenever changes are pushed to the `main` branch.

## Cloudflare Tunnels

Channel scans now run asynchronously via `/api/scan/start` and `/api/scan/status/<id>`.
This avoids timeouts that can occur when accessing the app through a Cloudflare Tunnel.

