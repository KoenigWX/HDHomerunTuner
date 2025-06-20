// Utility to set an element’s text + badge color class
  function setBadge(id, text, colorClass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = text;
    el.className = el.className
      .split(" ")
      .filter((c) => !c.startsWith("text-bg-") && !c.startsWith("badge-"))
      .join(" ");
    el.classList.add("badge", colorClass);
  }

  // Helper to reset any bg/text-bg classes, then apply the new one
  function setBg(el, newClass) {
    Array.from(el.classList).forEach((c) => {
      if (c.startsWith("bg-") || c.startsWith("text-bg-")) {
        el.classList.remove(c);
      }
    });
    el.classList.add(newClass);
  }

  // Color‐selection helpers based on thresholds
  function ssColorClass(v) {
    if (v >= 97) return "bg-danger";
    else if (v >= 70) return "bg-success";
    else if (v >= 50) return "bg-warning";
    else return "bg-danger";
  }
  function snqColorClass(v) {
    if (v >= 90) return "bg-success";
    else if (v >= 65) return "bg-warning";
    else return "bg-danger";
  }
  function seqColorClass(v) {
    if (v === 100) return "bg-success";
    else if (v === 99) return "bg-warning";
    else return "bg-danger";
  }

  // Update a progress bar (barId/textId) given a numeric value and a color‐selector
  function updateProgressBar(barId, textId, value, colorFn) {
    const bar = document.getElementById(barId);
    const txt = document.getElementById(textId);
    if (!bar || !txt) return;

    if (value === null || value === undefined) {
      bar.style.width = "0%";
      bar.setAttribute("aria-valuenow", 0);
      txt.innerText = "--%";
      bar.classList.remove("bg-success", "bg-warning", "bg-danger");
      bar.classList.add("bg-secondary");
    } else {
      bar.style.width = value + "%";
      bar.setAttribute("aria-valuenow", value);
      txt.innerText = value + "%";
      bar.classList.remove("bg-success", "bg-warning", "bg-danger", "bg-secondary");
      bar.classList.add(colorFn(value));
    }
  }

  // Update TS bitrate bar
  function updateTSBar(barId, textId, bitrate, maxBitrate) {
    const bar = document.getElementById(barId);
    const txt = document.getElementById(textId); // displays mbps value
    const pctEl = bar.querySelector("strong");
    if (!bar || !txt || !pctEl) return;

    // Reset color classes on each update to avoid duplicates
    bar.className = "progress-bar progress-bar-striped progress-bar-animated";

    if (bitrate === null || maxBitrate === null || maxBitrate <= 0) {
      bar.style.width = "0%";
      txt.innerText = "--/-- mbps";
      pctEl.innerText = "--%";
      bar.classList.add("bg-primary");
    } else {
      const mbps = bitrate / 1_000_000;
      const mbpsMax = maxBitrate / 1_000_000;
      const pct = Math.max(0, Math.floor((mbps / mbpsMax) * 100));
      bar.style.width = pct + "%";
      txt.innerText = `${mbps.toFixed(2)}/${mbpsMax.toFixed(2)} mbps`;
      pctEl.innerText = `${pct}%`;
      bar.classList.add("bg-primary");
    }
  }

  // Clear all three primary progress bars to gray
  function clearAllProgressBars() {
    updateProgressBar("ss-progress-bar", "ss-percentage-text", null, () => {});
    updateProgressBar("snq-progress-bar", "snq-percentage-text", null, () => {});
    updateProgressBar("seq-progress-bar", "seq-percentage-text", null, () => {});
  }

  // Toggle the "Scan Again" button into a spinner state
  let scanningActive = false; // shared flag updated by setScanning()
  function setScanning(isScanning) {
    const btn = document.getElementById("scan-again-btn");
    if (!btn) return;

    if (isScanning) {
      scanningActive = true;
      btn.disabled = true;
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        &nbsp;Scanning…
      `;
    } else {
      scanningActive = false;
      btn.disabled = false;
      btn.innerHTML = "Scan Again";
    }
  }

  // Display a Bootstrap toast message
  function showToast(msg, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const wrapper = document.createElement("div");
    wrapper.className = `toast align-items-center text-bg-${
      isError ? "danger" : "success"
    } border-0`;
    wrapper.role = "alert";
    wrapper.ariaLive = "assertive";
    wrapper.ariaAtomic = "true";
    wrapper.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;

    container.appendChild(wrapper);
    const t = new bootstrap.Toast(wrapper, { delay: 3000 });
    t.show();
    wrapper.addEventListener("hidden.bs.toast", () => wrapper.remove());
  }

  document.addEventListener("DOMContentLoaded", () => {
    let selectedTuner = null;
    let pollingEnabled = true; // controls whether realtime points are added
    let tunedChannel = null;
    let tunedProgram = null;
    let tunedProgramId = null;
    let lastScanResults = [];

    // Track interval IDs so we can fully stop polling when requested
    let chartInterval = null;
    let tunerInterval = null;
    let scanPollInterval = null;
    let programInfoInterval = null;

    // ───────────────────────────────────────────────────────────
    // Apache ECharts setup for realtime updates
    // ───────────────────────────────────────────────────────────
    const chartEl = document.getElementById("signal-chart");
    const signalChart = echarts.init(chartEl);

    const chartSeries = [
      { name: "SS", type: "line", data: [] },
      { name: "SNQ", type: "line", data: [] },
      { name: "SEQ", type: "line", data: [] },
    ];

    signalChart.setOption({
      animation: false,
      legend: { bottom: 0 },
      title: { text: "" },
      xAxis: { type: "time" },
      yAxis: { type: "value", min: 0, max: 100 },
      series: chartSeries,
    });

    function updateChartTitle() {
      const parts = [];
      if (tunedChannel !== null) parts.push(`CH ${tunedChannel}`);
      if (tunedProgram) parts.push(`Prog ${tunedProgram}`);
      signalChart.setOption({ title: { text: parts.join(" - ") } });
    }

    function pushPoint(arr, pt) {
      arr.push(pt);
    }

    function appendChartPoint() {
      if (!pollingEnabled || scanningActive || selectedTuner === null) return;
      fetch("api/tuners")
        .then((r) => r.json())
        .then((tuners) => {
          const t = tuners.find((x) => x.index === selectedTuner);
          if (!t || !t.locked) return;
          const now = Date.now();
          pushPoint(chartSeries[0].data, [now, t.ss]);
          pushPoint(chartSeries[1].data, [now, t.snq]);
          pushPoint(chartSeries[2].data, [now, t.seq]);
          signalChart.setOption({ series: chartSeries });
        })
        .catch(() => {});
    }

    function startPolling() {
      if (pollingEnabled) return;
      pollingEnabled = true;
      pollButton.classList.remove("btn-outline-success");
      pollButton.classList.add("btn-outline-danger");
      pollButton.innerHTML = '<i class="bi bi-sign-stop-fill"></i> Polling';
      if (!chartInterval) chartInterval = setInterval(appendChartPoint, 1000);
      if (!tunerInterval) tunerInterval = setInterval(fetchAndUpdateTuners, 1000);
      if (tunedProgramId !== null && !programInfoInterval)
        programInfoInterval = setInterval(fetchAndUpdateProgramInfo, 1000);
      fetchAndUpdateTuners();
      if (tunedProgramId !== null) fetchAndUpdateProgramInfo();
    }

    function stopPolling() {
      if (!pollingEnabled) return;
      pollingEnabled = false;
      pollButton.classList.remove("btn-outline-danger");
      pollButton.classList.add("btn-outline-success");
      pollButton.innerHTML = '<i class="bi bi-play-fill"></i> Paused';
      clearInterval(chartInterval);
      clearInterval(tunerInterval);
      clearInterval(programInfoInterval);
      chartInterval = null;
      tunerInterval = null;
      programInfoInterval = null;
      if (scanPollInterval) {
        clearInterval(scanPollInterval);
        scanPollInterval = null;
      }
    }

    chartInterval = setInterval(appendChartPoint, 1000);

    const pollButton = document.getElementById("poll-button");
    pollButton.addEventListener("click", () => {
      if (pollingEnabled) stopPolling();
      else startPolling();
    });
    // ───────────────────────────────────────────────────────────
    // 1) Populate Status badge once
    // ───────────────────────────────────────────────────────────
    fetch("api/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setBadge("status-badge", "Connected", "text-bg-success");
          document.getElementById("device-id-badge").innerText = data.device_id;
          document.getElementById("device-ip-badge").innerText = data.device_ip;
          document.getElementById("tuner-count-badge").innerText = data.tuner_count;
        } else {
          setBadge("status-badge", "Disconnected", "text-bg-danger");
          clearAllProgressBars();
        }
      })
      .catch((err) => {
        console.error(err);
        setBadge("status-badge", "Error", "text-bg-danger");
        clearAllProgressBars();
      });

    // ───────────────────────────────────────────────────────────
    // 2) Fetch & update tuner list badges (poll every second)
    // ───────────────────────────────────────────────────────────

    function fetchAndUpdateTuners() {
      if (!pollingEnabled) return;
      fetch("api/tuners")
        .then((r) => r.json())
        .then((tuners) => {
          tuners.forEach((t) => {
            const idx = t.index;
            const lockEl = document.getElementById(`tuner-${idx}-lock-badge`);
            const modEl = document.getElementById(`tuner-${idx}-modulation`);
            const ssEl = document.getElementById(`tuner-${idx}-ss-badge`);
            const snqEl = document.getElementById(`tuner-${idx}-snq-badge`);
            const seqEl = document.getElementById(`tuner-${idx}-seq-badge`);

            // 1) Update lock badge
            if (t.locked) {
              lockEl.innerText = `In-Use (${t.lock})`;
              setBg(lockEl, "text-bg-danger");
            } else {
              lockEl.innerText = "Available";
              setBg(lockEl, "text-bg-success");
            }

            // 2) Update “modulation/channel” badge
            if (t.channel !== null) {
              modEl.innerText = `CH: ${t.channel}`;
              setBg(modEl, "text-bg-info");
            } else {
              modEl.innerText = "--";
              setBg(modEl, "text-bg-secondary");
            }

            // 3) Update SS/SNQ/SEQ badges (always reset then recolor)
            ssEl.innerText = `SS: ${t.ss}%`;
            setBg(ssEl, ssColorClass(t.ss));

            snqEl.innerText = `SNQ: ${t.snq}%`;
            setBg(snqEl, snqColorClass(t.snq));

            seqEl.innerText = `SEQ: ${t.seq}%`;
            setBg(seqEl, seqColorClass(t.seq));
          });

          // If a tuner is selected, still update its progress bars:
          if (selectedTuner !== null) {
            const chosen = tuners.find((x) => x.index === selectedTuner);
            if (!chosen) {
              clearAllProgressBars();
              document.getElementById("ts-info").hidden = true;
            } else {
              updateProgressBar("ss-progress-bar", "ss-percentage-text", chosen.ss, ssColorClass);
              updateProgressBar(
                "snq-progress-bar",
                "snq-percentage-text",
                chosen.snq,
                snqColorClass
              );
              updateProgressBar(
                "seq-progress-bar",
                "seq-percentage-text",
                chosen.seq,
                seqColorClass
              );
            }
          }
        })
        .catch((err) => {
          console.error(err);
          // On error, reset everything back to “--” with gray badges
          for (let i = 0; i < 4; i++) {
            ["lock-badge", "modulation", "ss-badge", "snq-badge", "seq-badge"].forEach((suffix) => {
              const el = document.getElementById(`tuner-${i}-${suffix}`);
              if (el) {
                el.innerText = "--";
                el.className = "badge text-bg-secondary";
              }
            });
          }
          clearAllProgressBars();
          document.getElementById("ts-info").hidden = true;
        });
    }

    fetchAndUpdateTuners();
    tunerInterval = setInterval(fetchAndUpdateTuners, 1000);

    function fetchAndUpdateProgramInfo() {
      if (!pollingEnabled) return;
      if (selectedTuner === null || tunedProgramId === null) return;
      fetch("api/program_info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tuner: selectedTuner, program: tunedProgramId }),
      })
        .then((r) => r.json())
        .then((info) => {
          tsInfo.hidden = false;
          updateTSBar(
            "ts-progress-bar",
            "ts-bitrate-text",
            info.bitrate,
            info.max_bitrate
          );
          updateChartTitle();
        })
        .catch((err) => {
          console.error(err);
          tsInfo.hidden = true;
        });
    }

    // ───────────────────────────────────────────────────────────
    // 3) Tuner selection click handler
    // ───────────────────────────────────────────────────────────
    const tunerItems = document.querySelectorAll(".list-group-item[id^='tuner-']");
    tunerItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        tunerItems.forEach((el) => el.classList.remove("active"));
        item.classList.add("active");

        selectedTuner = parseInt(item.id.split("-")[1], 10);

        // Hide TS info & program dropdown until tune
        document.getElementById("ts-info").hidden = true;
        clearInterval(programInfoInterval);
        programInfoInterval = null;
        tunedProgramId = null;
        tunedProgram = null;
        const programSelect = document.getElementById("program-select");
        programSelect.disabled = true;
        programSelect.hidden = true;
        programSelect.innerHTML = '<option value="" disabled selected>Select Program…</option>';
        document.getElementById("tune-button").classList.add("disabled");

        // Clear progress bars right away for this tuner
        fetch("api/tuners")
          .then((r) => r.json())
          .then((tuners) => {
            const chosen = tuners.find((x) => x.index === selectedTuner);
            if (!chosen || !chosen.locked) {
              clearAllProgressBars();
            } else {
              updateProgressBar("ss-progress-bar", "ss-percentage-text", chosen.ss, ssColorClass);
              updateProgressBar(
                "snq-progress-bar",
                "snq-percentage-text",
                chosen.snq,
                snqColorClass
              );
              updateProgressBar(
                "seq-progress-bar",
                "seq-percentage-text",
                chosen.seq,
                seqColorClass
              );
            }
          })
          .catch((err) => {
            console.error(err);
            clearAllProgressBars();
          });

        // **Reset the chart entirely** whenever you switch tuners:
        chartSeries.forEach((s) => {
          s.data.length = 0;
        });
        signalChart.setOption({ series: chartSeries });
        updateChartTitle();
      });
    });

    // ───────────────────────────────────────────────────────────
    // 4) "Scan Again" button behavior: run actual scan and populate table
    // ───────────────────────────────────────────────────────────
    document.getElementById("scan-again-btn").addEventListener("click", () => {
      setScanning(true);

      // Update “Last Run” immediately
      const now = new Date();
      document.getElementById("last-run-caption").innerText =
        "Last Run: " +
        now.toLocaleDateString() +
        " " +
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      fetch("api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tuner: selectedTuner }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.scan_id) throw new Error("Scan start failed");
          const scanId = data.scan_id;
          scanPollInterval = setInterval(() => {
            if (!pollingEnabled) return;
            fetch(`api/scan/status/${scanId}`)
              .then((r) => r.json())
              .then((resp) => {
                if (Array.isArray(resp.results)) {
                  renderScanRows(resp.results);
                }
                if (resp.finished) {
                  clearInterval(scanPollInterval);
                  scanPollInterval = null;
                  scanHasRun = true;
                  setScanning(false);
                  collapseAllScanRows();
                }
              })
              .catch((err) => {
                console.error(err);
                clearInterval(scanPollInterval);
                scanPollInterval = null;
                setScanning(false);
              });
          }, 3000);
        })
        .catch((err) => {
          console.error(err);
          setScanning(false);
          document.getElementById("scan-table-body").innerHTML = "";
        });
    });

    // ───────────────────────────────────────────────────────────────────
    // Helper: renderScanRows(arrayOf { physical, ss, snq, subchannels:[…] })
    // ───────────────────────────────────────────────────────────────────
function renderScanRows(rows) {
      lastScanResults = Array.isArray(rows) ? rows.slice() : [];
      const tbody = document.getElementById("scan-table-body");
      tbody.innerHTML = "";

      rows.forEach((ch, idx) => {
        // ─── First Row: physical channel, SS cell, SNQ cell ───
        const row1 = document.createElement("tr");
        row1.style.cursor = "pointer";

        const collapseId = `collapse-${idx}`;
        row1.setAttribute("data-bs-toggle", "collapse");
        row1.setAttribute("data-bs-target", `#${collapseId}`);
        row1.setAttribute("aria-expanded", "false");
        row1.setAttribute("aria-controls", collapseId);

        // Column 1: physical channel #
        const th = document.createElement("th");
        th.scope = "row";
        th.innerText = ch.physical;
        row1.appendChild(th);

        // Column 2: empty (no lock/info text here)
        const tdInfo = document.createElement("td");
        tdInfo.innerText = "";
        row1.appendChild(tdInfo);

        // Column 3: SS cell (apply color to <td> directly)
        const tdSS = document.createElement("td");
        tdSS.classList.add("text-center");
        const ssVal = ch.ss ?? 0;
        const ssClass = ssColorClass(ssVal).replace("bg-", "table-");
        tdSS.classList.add(ssClass);
        tdSS.innerText = ssVal + "%";
        row1.appendChild(tdSS);

        // Column 4: SNQ cell (apply color to <td> directly)
        const tdSNQ = document.createElement("td");
        tdSNQ.classList.add("text-center");
        const snqVal = ch.snq ?? 0;
        const snqClass = snqColorClass(snqVal).replace("bg-", "table-");
        tdSNQ.classList.add(snqClass);
        tdSNQ.innerText = snqVal + "%";
        row1.appendChild(tdSNQ);

        tbody.appendChild(row1);

        // ─── Second Row: subchannel list (if any) ───
        if (Array.isArray(ch.subchannels) && ch.subchannels.length > 0) {
          const row2 = document.createElement("tr");
          row2.classList.add("collapse");
          row2.id = collapseId;

          const tdNested = document.createElement("td");
          tdNested.colSpan = 4;

          const list = document.createElement("ul");
          list.className = "list-unstyled subchannel-list mb-0 ps-4";

          ch.subchannels.forEach((sub) => {
            const li = document.createElement("li");
            li.innerHTML = `<strong>${sub.num}</strong> ${sub.name}`;
            list.appendChild(li);
          });

          tdNested.appendChild(list);
          row2.appendChild(tdNested);
          tbody.appendChild(row2);
        }
      });
}

  // Collapse any expanded subchannel rows in the scan table
  function collapseAllScanRows() {
    document
      .querySelectorAll('#scan-table-body .collapse.show')
      .forEach((el) => {
        const inst = bootstrap.Collapse.getOrCreateInstance(el);
        inst.hide();
      });
  }

  // Export the last scan results as labeled JSON and copy to clipboard
  document.getElementById("export-scan-btn").addEventListener("click", () => {
    if (!lastScanResults.length) {
      showToast("No scan results to export", true);
      return;
    }
    const exportData = lastScanResults.map((ch) => ({
      physical_channel: ch.physical,
      signal_strength_percent: ch.ss,
      signal_noise_quality_percent: ch.snq,
      subchannels: Array.isArray(ch.subchannels)
        ? ch.subchannels.map((s) => ({ number: s.num, name: s.name }))
        : [],
    }));
    const text = JSON.stringify(exportData, null, 2);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("Scan results copied to clipboard");
      })
      .catch((err) => {
        console.error("Clipboard error", err);
        showToast("Failed to copy results", true);
      });
  });

    // ───────────────────────────────────────────────────────────
    // 5) Force‐clear all tuner locks via POST /api/clear_locks
    // ───────────────────────────────────────────────────────────
    document.getElementById("force-clear-btn").addEventListener("click", () => {
      fetch("api/clear_locks", { method: "POST" })
        .then((r) => {
          if (r.ok) {
            showToast("All tuner locks cleared");
          } else {
            showToast("Failed to clear tuner locks", true);
            console.error("Failed to clear tuner locks");
          }
          return r.json();
        })
        .catch((err) => {
          console.error("Error clearing locks:", err);
          showToast("Error clearing tuner locks", true);
        });
    });

    // ───────────────────────────────────────────────────────────
    // 6) Tuning logic: fetch subchannels, populate program‐select, reset chart
    // ───────────────────────────────────────────────────────────
    const channelInput = document.getElementById("channel-input");
    const programSelect = document.getElementById("program-select");
    const tuneButton = document.getElementById("tune-button");
    const tsInfo = document.getElementById("ts-info");

    // Initially hide the program dropdown
    programSelect.hidden = true;
    programSelect.disabled = true;

    function validateTuneForm() {
      const chVal = parseInt(channelInput.value, 10);
      const channelOK =
        !isNaN(chVal) &&
        chVal >= parseInt(channelInput.min, 10) &&
        chVal <= parseInt(channelInput.max, 10);
      if (channelOK && selectedTuner !== null) {
        tuneButton.classList.remove("disabled");
      } else {
        tuneButton.classList.add("disabled");
        programSelect.hidden = true;
        programSelect.disabled = true;
        programSelect.innerHTML =
          '<option value="" disabled selected>Select Program…</option>';
        tsInfo.hidden = true;
      }
    }

    channelInput.addEventListener("input", validateTuneForm);
    validateTuneForm();

    tuneButton.addEventListener("click", () => {
      if (tuneButton.classList.contains("disabled")) return;
      if (selectedTuner === null) return;

      // Reset the chart data right when you hit “Tune”
      chartSeries.forEach((s) => {
        s.data.length = 0;
      });
      signalChart.setOption({ series: chartSeries });

      const chVal = parseInt(channelInput.value, 10);
      tunedChannel = chVal;
      tunedProgram = null;
      tunedProgramId = null;
      clearInterval(programInfoInterval);
      programInfoInterval = null;
      updateChartTitle();
      programSelect.hidden = true;
      programSelect.innerHTML = '<option value="" disabled selected>Select Program…</option>';
      programSelect.disabled = true;
      tsInfo.hidden = true;

      fetch("api/tune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tuner: selectedTuner, channel: chVal }),
      })
        .then((r) => r.json())
        .then((data) => {
          // data.subchannels = [ { id, num, name }, … ]
          if (Array.isArray(data.subchannels) && data.subchannels.length > 0) {
            programSelect.hidden = false;
            programSelect.disabled = false;
            programSelect.innerHTML =
              '<option value="" disabled selected>Select Program…</option>';
            data.subchannels.forEach((p) => {
              const opt = document.createElement("option");
              opt.value = p.id;
              opt.dataset.vchannel = p.num;
              opt.innerText = `${p.num} | ${p.name}`;
              programSelect.appendChild(opt);
            });
          } else {
            showToast("No subchannels found", true);
            programSelect.hidden = true;
            programSelect.disabled = true;
          }
          updateChartTitle();
        })
        .catch((err) => {
          console.error(err);
          programSelect.disabled = true;
          programSelect.hidden = true;
          tsInfo.hidden = true;
        });
    });

    // ───────────────────────────────────────────────────────────
    // 7) When a program is chosen, fetch its TS info
    // ───────────────────────────────────────────────────────────
    programSelect.addEventListener("change", () => {
      const progIdStr = programSelect.value;
      const progId = parseInt(progIdStr, 10);
      const selectedOpt = programSelect.options[programSelect.selectedIndex];
      const vchan = selectedOpt ? selectedOpt.dataset.vchannel : "";
      if (isNaN(progId)) {
        tsInfo.hidden = true;
        clearInterval(programInfoInterval);
        programInfoInterval = null;
        tunedProgramId = null;
        tunedProgram = null;
        updateChartTitle();
        return;
      }
      tunedProgram = vchan;
      tunedProgramId = progId;
      clearInterval(programInfoInterval);
      programInfoInterval = setInterval(fetchAndUpdateProgramInfo, 1000);
      fetchAndUpdateProgramInfo();
    });

    // ───────────────────────────────────────────────────────────
    // 8) Initially clear all progress bars
    // ───────────────────────────────────────────────────────────
    clearAllProgressBars();
  });
