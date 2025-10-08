import { Controller } from "@hotwired/stimulus"
import mapboxgl from "mapbox-gl"

const ROUTE_COLORS = ["#00B8D9", "#6366F1", "#22c55e", "#f97316", "#a855f7"]
const LAUNCH_DELAY_MS = 320
const METRIC_ANIMATION_MS = 650
const LOG_LIMIT = 80

// Connects to data-controller="vrp"
export default class extends Controller {
  static values = {
    accessToken: String,
  }

  static targets = [
    "canvas",
    "launchOverlay",
    "locationsInput",
    "vehicleCount",
    "vehicleCapacity",
    "maxDistance",
    "solverType",
    "autoReplay",
    "configForm",
    "launchButton",
    "launchLabel",
    "launchSpinner",
    "pauseButton",
    "statusBadge",
    "statusLabel",
    "progressBar",
    "progressValue",
    "metricDistance",
    "metricElapsed",
    "metricFleet",
    "metricViolations",
    "history",
    "log",
    "queuedCount",
    "runningCount",
    "runningProgress",
    "successCount",
    "successDelta",
    "failedCount",
  ]

  connect() {
    mapboxgl.accessToken = this.accessTokenValue

    this.defaults = {
      vehicleCount: 6,
      vehicleCapacity: 12,
      maxDistance: 160,
      solverType: "tabu",
      locations: `40.758, -73.985\n40.754, -73.980\n40.761, -73.977\n40.748, -73.985\n40.745, -73.990\n40.743, -73.982\n40.751, -73.974`,
    }

    this.metricValues = {
      distance: null,
      elapsed: null,
      fleet: null,
      violations: null,
    }

    this.historyEntries = []
    this.activeRouteIds = []
    this.lastRunRoutes = null
    this.successDeltaMessage = "Awaiting missions"

    this.queuedMissions = 0
    this.runningMissions = 0
    this.successMissions = 0
    this.failedMissions = 0

    this.timers = new Set()

    this.bootstrapFormDefaults()
    this.initializeMap()
    this.updateMissionSummary()
    this.appendLog("Command center ready. Launch a mission when you’re set.")
    this.setStatus("idle")
  }

  disconnect() {
    this.timers.forEach(id => window.clearTimeout(id))
    this.timers.clear()
    if (this.map) {
      this.map.remove()
    }
  }

  bootstrapFormDefaults() {
    if (this.hasVehicleCountTarget) this.vehicleCountTarget.value ||= this.defaults.vehicleCount
    if (this.hasVehicleCapacityTarget) this.vehicleCapacityTarget.value ||= this.defaults.vehicleCapacity
    if (this.hasMaxDistanceTarget) this.maxDistanceTarget.value ||= this.defaults.maxDistance
    if (this.hasSolverTypeTarget) this.solverTypeTarget.value ||= this.defaults.solverType
    if (this.hasLocationsInputTarget && !this.locationsInputTarget.value.trim()) {
      this.locationsInputTarget.value = this.defaults.locations
    }
  }

  initializeMap() {
    console.log("initializeMap called.")
    if (!this.hasCanvasTarget) {
      console.error("vrp controller: missing canvas target")
      return
    }

    this.map = new mapboxgl.Map({
      container: this.canvasTarget,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.985, 40.758],
      zoom: 12.5,
      pitch: 60,
      bearing: -20,
      antialias: true,
    })

    console.log("Canvas target dimensions:", this.canvasTarget.offsetWidth, this.canvasTarget.offsetHeight)

    this.map.on("style.load", () => {
      console.log("Mapbox style loaded.")
      this.ensureTerrain()
      if (this.autoReplayTarget?.checked && this.lastRunRoutes) {
        this.renderRoutes(this.lastRunRoutes)
      }
      this.schedule(() => this.map.resize(), 100)

      this.map.on("click", this.handleMapClick.bind(this))
      this.markers = []
    })
  }

  ensureTerrain() {
    if (!this.map) return

    if (!this.map.getSource("mapbox-dem")) {
      this.map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      })
    }

    this.map.setTerrain({ source: "mapbox-dem", exaggeration: 1.3 })

    if (!this.map.getLayer("sky")) {
      this.map.addLayer({
        id: "sky",
        type: "sky",
        paint: {
          "sky-type": "atmosphere",
          "sky-atmosphere-sun": [0.0, 0.0],
          "sky-atmosphere-sun-intensity": 10,
        },
      })
    }
  }

  serializeConfig() {
    const config = this.collectConfig();
    const locations = this.parseLocations();
    return { ...config, locations };
  }

  async solve(e) {
    e.preventDefault()

    const config = this.serializeConfig()

    if (config.locations.length === 0) {
      this.appendLog("Provide at least one coordinate pair to launch.", "warn")
      return
    }

    const token = document.querySelector('meta[name="csrf-token"]')?.content
    const payload = {
      job: {
        problem_type: "vrp",
        solver: config.solverType || "demo",
        seed: Math.floor(Math.random() * 10000),
        params: config
      }
    }

    this.showLaunchMoment()
    this.appendLog(`Launching ${payload.job.solver} mission…`)

    fetch("/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
        "Accept": "text/vnd.turbo-stream.html"
      },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    })
    .then(r => {
      if (!r.ok) {
        throw new Error(`Server responded with ${r.status}`)
      }
      return r.text()
    })
    .then(html => {
      if (html) {
          Turbo.renderStreamMessage(html)
      }
      this.appendLog("Mission queued.", "success")
    })
    .catch(err => {
      this.failMission(err)
    })
  }

  beginMission() {
    this.showLaunchMoment()
    this.toggleForm(true)
    this.setStatus("running")
    this.runningMissions += 1
    this.updateMissionSummary()
    this.updateProgress(8)
  }

  concludeMission() {
    this.runningMissions = Math.max(0, this.runningMissions - 1)
    this.toggleForm(false)
    this.updateMissionSummary()
  }

  completeMission({ routes, metrics, elapsedSeconds, config }) {
    if (Array.isArray(routes) && routes.length > 0) {
      this.renderRoutes(routes)
      this.lastRunRoutes = routes
    } else {
      this.appendLog("No routes returned. Check solver inputs.", "warn")
    }

    this.updateMetrics(metrics, elapsedSeconds)
    this.updateProgress(100)
    this.setStatus("success")

    const distanceText = metrics?.total_distance_km ?? metrics?.distance
    if (distanceText != null) {
      this.appendLog(`Mission complete • total distance ${this.formatNumber(distanceText, 2)} km.`, "success")
    } else {
      this.appendLog("Mission complete.", "success")
    }

    this.successMissions += 1
    const historyInfo = this.recordHistory({ routes, metrics, config, elapsedSeconds })
    this.successDeltaMessage = historyInfo?.successDeltaMessage || this.successDeltaMessage
    this.updateMissionSummary()

    if (config.autoReplay) {
      this.appendLog("Auto replay enabled — maintaining route on map.")
    }
  }

  failMission(error) {
    this.failedMissions += 1
    this.updateMissionSummary()
    this.setStatus("error")
    this.updateProgress(0)
    this.appendLog(`Mission error: ${error.message}`, "error")
  }

  collectConfig() {
    return {
      vehicleCount: parseInt(this.vehicleCountTarget?.value || this.defaults.vehicleCount, 10),
      vehicleCapacity: parseInt(this.vehicleCapacityTarget?.value || this.defaults.vehicleCapacity, 10),
      maxDistance: parseInt(this.maxDistanceTarget?.value || this.defaults.maxDistance, 10),
      solverType: this.solverTypeTarget?.value || this.defaults.solverType,
      autoReplay: this.autoReplayTarget?.checked || false,
    }
  }

  parseLocations() {
    if (!this.hasLocationsInputTarget) return []
    return this.locationsInputTarget.value
      .split(/\n/)
      .map(line => {
        const [lat, lng] = line.split(",").map(coord => parseFloat(coord.trim()))
        return [lng, lat]
      })
      .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]))
  }

  renderRoutes(routeCollection) {
    if (!this.map) return

    this.activeRouteIds.forEach(id => {
      if (this.map.getLayer(id)) this.map.removeLayer(id)
      if (this.map.getSource(id)) this.map.removeSource(id)
    })
    this.activeRouteIds = []

    const bounds = new mapboxgl.LngLatBounds()

    routeCollection.forEach((route, index) => {
      if (!Array.isArray(route) || route.length === 0) return

      const sourceId = `vrp-route-${Date.now()}-${index}`
      const layerId = `${sourceId}-layer`
      const color = ROUTE_COLORS[index % ROUTE_COLORS.length]

      const coordinates = route
        .map(point => {
          if (Array.isArray(point) && point.length >= 2) {
            bounds.extend(point)
            return point
          }
          return null
        })
        .filter(Boolean)

      if (coordinates.length === 0) return

      this.map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates,
          },
        },
      })

      this.map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": color,
          "line-width": 5,
          "line-opacity": 0.85,
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0, this.hexToRgba(color, 0.05),
            0.4, this.hexToRgba(color, 0.6),
            1, this.hexToRgba(color, 1),
          ],
        },
      })

      this.activeRouteIds.push(sourceId, layerId)
    })

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, { padding: 48, duration: 1100 })
    }
  }

  updateMetrics(metrics, elapsedSeconds) {
    const distance = metrics?.total_distance_km ?? metrics?.distance ?? null
    const fleetUsage = metrics?.vehicles_used ?? null
    const violations = metrics?.constraint_violations ?? 0
    const elapsed = elapsedSeconds ?? metrics?.elapsed_seconds ?? null

    this.animateMetric(this.metricDistanceTarget, "distance", distance, " km")
    this.animateMetric(this.metricElapsedTarget, "elapsed", elapsed, " s")
    this.animateMetric(this.metricFleetTarget, "fleet", fleetUsage, "")
    this.animateMetric(this.metricViolationsTarget, "violations", violations, "")
  }

  updateProgress(percent) {
    const value = Math.max(0, Math.min(100, percent))
    this.progressBarTarget.style.width = `${value}%`
    this.progressValueTarget.textContent = `${Math.round(value)}%`

    if (this.hasRunningProgressTarget) {
      const activeValue = this.runningMissions > 0 ? value : 0
      this.runningProgressTarget.style.width = `${activeValue}%`
    }
  }

  recordHistory({ routes, metrics, config, elapsedSeconds }) {
    const timestamp = new Date()
    const distance = metrics?.total_distance_km ?? metrics?.distance ?? null
    const entry = {
      timestamp,
      strategy: config?.solverType ?? "-",
      distance,
      runtime: elapsedSeconds ?? metrics?.elapsed_seconds ?? null,
      routes,
    }

    const previous = this.historyEntries[0]
    this.historyEntries.unshift(entry)
    this.renderHistory()

    let successDeltaMessage = "Baseline captured"
    if (previous && previous.distance != null && distance != null && previous.distance > 0) {
      const delta = distance - previous.distance
      const percent = ((previous.distance - distance) / previous.distance) * 100
      const direction = delta <= 0 ? "improved" : "regressed"
      const symbol = delta <= 0 ? "↑" : "↓"
      successDeltaMessage = `${symbol}${Math.abs(percent).toFixed(1)}% since last run (${direction})`
    } else if (!previous && distance != null) {
      successDeltaMessage = "Baseline captured"
    } else if (distance == null) {
      successDeltaMessage = "Awaiting metrics"
    }

    return { successDeltaMessage }
  }

  renderHistory() {
    if (!this.hasHistoryTarget) return

    if (this.historyEntries.length === 0) {
      this.historyTarget.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">No missions yet. Launch one or try the demo to see activity.</td></tr>`
      return
    }

    this.historyTarget.innerHTML = this.historyEntries
      .map((entry, index) => {
        const distanceText = entry.distance != null ? `${this.formatNumber(entry.distance, 1)} km` : "—"
        const runtimeText = entry.runtime != null ? `${this.formatNumber(entry.runtime, 1)} s` : "—"
        return `
                      <tr class="hover:bg-slate-900/60 transition ease-in-out duration-150">            <td class="px-4 py-3">${entry.timestamp.toLocaleTimeString()}</td>
            <td class="px-4 py-3 uppercase tracking-wide">${entry.strategy}</td>
            <td class="px-4 py-3">${distanceText}</td>
            <td class="px-4 py-3">${runtimeText}</td>
            <td class="px-4 py-3">
              <button data-history-index="${index}" class="text-[#00B8D9] transition hover:text-[#19d3f3]" data-action="vrp#replayHistory">Replay</button>
            </td>
          </tr>
        `
      })
      .join("")
  }

  appendLog(message, variant = "info") {
    if (!this.hasLogTarget) return

    const palette = {
      info: "text-slate-200",
      success: "text-emerald-300",
      warn: "text-amber-300",
      error: "text-rose-300",
    }
    const colorClass = palette[variant] || palette.info
    const timestamp = new Date().toLocaleTimeString()
    const entry = document.createElement("div")
    entry.className = `flex items-start gap-2 text-xs ${colorClass}`
    entry.innerHTML = `<span class="text-slate-500">${timestamp}</span><span>${message}</span>`
    this.logTarget.appendChild(entry)

    while (this.logTarget.children.length > LOG_LIMIT) {
      this.logTarget.removeChild(this.logTarget.firstChild)
    }

    this.logTarget.scrollTop = this.logTarget.scrollHeight
  }

  toggleForm(disabled) {
    if (!this.hasConfigFormTarget) return

    this.configFormTarget.querySelectorAll("input, select, textarea, button").forEach(element => {
      if (element === this.pauseButtonTarget) return
      element.disabled = disabled
    })

    if (disabled) {
      this.launchLabelTarget.textContent = "Launching…"
      this.launchSpinnerTarget.classList.remove("hidden")
    } else {
      this.launchLabelTarget.textContent = "Launch Mission"
      this.launchSpinnerTarget.classList.add("hidden")
    }
  }

  setStatus(state) {
    const descriptors = {
      idle: {
        label: "Idle",
        badge: "Idle",
        badgeClass: "border-slate-600/40 bg-slate-800/60 text-slate-300",
        dotClass: "bg-slate-400",
      },
      running: {
        label: "Running",
        badge: "Running",
        badgeClass: "border-[#00B8D9]/40 bg-[#00B8D9]/10 text-[#00B8D9]",
        dotClass: "bg-[#00B8D9] animate-pulse",
      },
      success: {
        label: "Complete",
        badge: "Complete",
        badgeClass: "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
        dotClass: "bg-emerald-300",
      },
      error: {
        label: "Attention",
        badge: "Error",
        badgeClass: "border-rose-500/40 bg-rose-500/10 text-rose-200",
        dotClass: "bg-rose-300 animate-pulse",
      },
    }

    const descriptor = descriptors[state] || descriptors.idle
    this.statusLabelTarget.textContent = descriptor.label
    this.statusBadgeTarget.className = `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${descriptor.badgeClass}`
    this.statusBadgeTarget.innerHTML = `<span class="h-2 w-2 rounded-full ${descriptor.dotClass}"></span>${descriptor.badge}`
  }

  resetConfig() {
    this.vehicleCountTarget.value = this.defaults.vehicleCount
    this.vehicleCapacityTarget.value = this.defaults.vehicleCapacity
    this.maxDistanceTarget.value = this.defaults.maxDistance
    this.solverTypeTarget.value = this.defaults.solverType
    this.locationsInputTarget.value = this.defaults.locations
    this.metricValues = { distance: null, elapsed: null, fleet: null, violations: null }
    this.updateProgress(0)
    this.setStatus("idle")
    this.appendLog("Configuration reset to defaults.", "info")

    // Clear existing markers from the map
    this.markers.forEach(marker => marker.remove())
    this.markers = []
  }

  pauseReplay() {
    this.appendLog("Pause functionality is on the roadmap.", "warn")
  }

  compareRuns() {
    if (this.historyEntries.length < 2) {
      this.appendLog("Need at least two runs to compare.", "warn")
      return
    }
    const [current, previous] = this.historyEntries
    const currentDistance = current.distance ?? 0
    const previousDistance = previous.distance ?? 0
    const delta = currentDistance - previousDistance
    const direction = delta <= 0 ? "improved" : "regressed"
    this.appendLog(
      `Current mission ${direction} by ${this.formatNumber(Math.abs(delta), 2)} km compared to previous.`,
      direction === "improved" ? "success" : "warn",
    )
  }

  clearHistory() {
    this.historyEntries = []
    this.renderHistory()
    this.appendLog("Mission history cleared.", "info")
    this.successDeltaMessage = "Awaiting missions"
    this.updateMissionSummary()
  }

  replayHistory(event) {
    const index = parseInt(event.target.dataset.historyIndex, 10)
    const entry = this.historyEntries[index]
    if (!entry) return

    this.appendLog(`Replaying mission from ${entry.timestamp.toLocaleTimeString()} (${entry.strategy}).`)
    this.renderRoutes(entry.routes)
    this.updateMetrics({ total_distance_km: entry.distance, vehicles_used: entry.routes?.length }, entry.runtime)
    this.updateProgress(100)
    this.setStatus("success")
  }

  demoRun() {
    const config = this.collectConfig()
    this.appendLog("Running demo mission to showcase the cockpit.")
    this.beginMission()

    const demoRoutes = [
      [
        [-74.001, 40.752],
        [-74.005, 40.742],
        [-73.995, 40.733],
        [-73.982, 40.739],
        [-73.973, 40.748],
      ],
      [
        [-74.012, 40.71],
        [-74.002, 40.72],
        [-73.99, 40.729],
        [-73.978, 40.735],
        [-73.97, 40.744],
      ],
    ]

    const metrics = {
      total_distance_km: 54.7,
      vehicles_used: demoRoutes.length,
      constraint_violations: 0,
    }

    this.updateProgress(40)
    this.schedule(() => {
      this.renderRoutes(demoRoutes)
      this.appendLog("Demo routes loaded.", "success")
      this.updateProgress(78)
    }, 360)

    this.schedule(() => {
      this.completeMission({ routes: demoRoutes, metrics, elapsedSeconds: 92, config })
      this.concludeMission()
      this.appendLog("Demo mission complete. Adjust parameters and launch your own run.", "success")
    }, 900)
  }

  showLaunchMoment() {
    if (this.hasLaunchOverlayTarget) {
      this.launchOverlayTarget.classList.remove("hidden")
      this.schedule(() => {
        this.launchOverlayTarget.classList.add("hidden")
      }, LAUNCH_DELAY_MS)
    }

    if (this.hasLaunchButtonTarget) {
      this.launchButtonTarget.classList.add("launch-pulse")
      this.schedule(() => {
        this.launchButtonTarget.classList.remove("launch-pulse")
      }, 600)
    }
  }

  updateMissionSummary() {
    if (this.hasQueuedCountTarget) this.queuedCountTarget.textContent = this.queuedMissions
    if (this.hasRunningCountTarget) this.runningCountTarget.textContent = this.runningMissions
    if (this.hasSuccessCountTarget) this.successCountTarget.textContent = this.successMissions
    if (this.hasFailedCountTarget) this.failedCountTarget.textContent = this.failedMissions

    if (this.hasSuccessDeltaTarget) {
      this.successDeltaTarget.textContent = this.successMissions > 0 ? this.successDeltaMessage : "Awaiting missions"
    }

    if (this.hasRunningProgressTarget && this.runningMissions === 0) {
      this.runningProgressTarget.style.width = "0%"
    }
  }

  animateMetric(target, key, newValue, suffix = "", decimals = 1) {
    if (!target) return

    if (newValue == null || Number.isNaN(newValue)) {
      target.textContent = "—"
      this.metricValues[key] = null
      return
    }

    const startValue = typeof this.metricValues[key] === "number" ? this.metricValues[key] : 0
    const endValue = Number(newValue)
    const diff = endValue - startValue

    if (Math.abs(diff) < 0.0001) {
      target.textContent = `${this.formatNumber(endValue, decimals)}${suffix}`
      this.metricValues[key] = endValue
      return
    }

    const startTime = performance.now()
    const animate = now => {
      const progress = Math.min(1, (now - startTime) / METRIC_ANIMATION_MS)
      const eased = Math.pow(progress, 0.65)
      const value = startValue + diff * eased
      target.textContent = `${this.formatNumber(value, decimals)}${suffix}`
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        target.textContent = `${this.formatNumber(endValue, decimals)}${suffix}`
      }
    }

    requestAnimationFrame(animate)
    this.metricValues[key] = endValue
  }

  schedule(callback, delay) {
    const id = window.setTimeout(() => {
      this.timers.delete(id)
      callback()
    }, delay)
    this.timers.add(id)
  }

  formatNumber(value, decimals = 1) {
    if (typeof value !== "number" || Number.isNaN(value)) return value
    return Number(value.toFixed(decimals))
  }

  hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "")
    const bigint = parseInt(clean, 16)
    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  handleMapClick(event) {
    this.addLocation(event.lngLat)
  }

  addLocation(lngLat) {
    const marker = new mapboxgl.Marker()
      .setLngLat(lngLat)
      .addTo(this.map)
    this.markers.push(marker)

    const newLocation = `${lngLat.lat.toFixed(3)}, ${lngLat.lng.toFixed(3)}`
    const currentLocations = this.locationsInputTarget.value.trim()
    this.locationsInputTarget.value = currentLocations ? `${currentLocations}\n${newLocation}` : newLocation
  }
}
