# 1) Start from Debian slim
FROM debian:bookworm-slim

# 2) Install system packages, including python3-venv and hdhomerun-config
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      python3 python3-venv python3-pip curl ca-certificates \
      hdhomerun-config \
    && rm -rf /var/lib/apt/lists/*

# 3) Create a virtual environment under /opt/venv and activate its bin in $PATH
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# 4) Copy requirements.txt and install Flask into the venv
WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 5) Copy application code (app.py + static folder) into /app
COPY app.py /app/
COPY index.html /app/

# 6) Expose port 5070
EXPOSE 5070

# 7) Run the Flask app using the venv's python
CMD ["python", "app.py"]
