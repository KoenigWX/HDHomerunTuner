// history.js
// Fetch scan logs and render chart. Allow schedule updates.

document.addEventListener('DOMContentLoaded', () => {
  const chartDom = document.getElementById('history-chart');
  const chart = echarts.init(chartDom);

  function loadLogs() {
    fetch('/api/scan/logs')
      .then((res) => res.json())
      .then((data) => {
        const times = data.map((d) => d.time || d.timestamp);
        const values = data.map((d) => d.value || d.result || 0);
        const option = {
          xAxis: { type: 'category', data: times },
          yAxis: { type: 'value' },
          series: [{ type: 'line', data: values }],
        };
        chart.setOption(option);
      })
      .catch((err) => console.error('Failed to load logs', err));
  }

  document.getElementById('save-schedule').addEventListener('click', () => {
    const freq = parseInt(document.getElementById('freq-input').value, 10);
    fetch('/api/scan/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval_minutes: freq }),
    })
      .then((res) => res.json())
      .then(() => {
        loadLogs();
      })
      .catch((err) => console.error('Failed to update schedule', err));
  });

  loadLogs();
});
