import { Controller } from "@hotwired/stimulus"
import mapboxgl from "mapbox-gl"

const ROUTE_COLORS = [
  "#22d3ee",
  "#f97316",
  "#a855f7",
  "#22c55e",
  "#facc15",
]

// Connects to data-controller="vrp"
export default class extends Controller {
  static values = {
    accessToken: String,
  }

  static targets = [
    "canvas",
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

    this.historyEntries = []
    this.activeRouteIds = []
    this.lastRunRoutes = null

    this.bootstrapFormDefaults()
    this.initializeMap()
    this.appendLog("Ready for launch. Configure parameters or run with defaults.")
    this.setStatus("idle")
  }

  disconnect() {
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

    this.map.on("style.load", () => {
      this.ensureTerrain()
      if (this.autoReplayTarget?.checked && this.lastRunRoutes) {
        this.renderRoutes(this.lastRunRoutes)
      }
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

  async solve(event) {
    event.preventDefault()
    this.clearGhostRoutes()
    const config = this.collectConfig()
    const locations = this.parseLocations()

    if (locations.length === 0) {
      this.appendLog("Provide at least one coordinate pair to launch.", "warn")
      return
    }

    this.setStatus("running")
    this.toggleForm(true)
    this.appendLog(`Launching solver (${config.solverType}) with ${config.vehicleCount} vehicles…`)

    try {
      const response = await fetch("/vrp/solve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content,
        },
        body: JSON.stringify({
          vrp: {
            locations,
            vehicle_count: config.vehicleCount,
            vehicle_capacity: config.vehicleCapacity,
            max_distance: config.maxDistance,
            solver_type: config.solverType,
          },
        }),
      })

      if (!response.ok) throw new Error(`Server responded with ${response.status}`)

      const data = await response.json()
      this.handleSolverSuccess(data, config)
    } catch (error) {
      console.error(error)
      this.handleSolverError(error)
    } finally {
      this.toggleForm(false)
    }
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

  handleSolverSuccess(data, config) {
    if (!data) return

    const { routes = [], metrics = {}, elapsed_seconds: elapsedSeconds } = data

    this.appendLog("Solver completed. Updating visualization…", "success")
    if (routes.length > 0) {
      this.renderRoutes(routes)
      this.lastRunRoutes = routes
    } else {
      this.appendLog("No routes returned. Check solver inputs.", "warn")
    }

    this.updateMetrics(metrics, elapsedSeconds)
    this.updateProgress(100)
    this.setStatus("success")
    this.recordHistory({ routes, metrics, config, elapsedSeconds })

    if (config.autoReplay) {
      this.appendLog("Auto replay enabled — maintaining route on map.")
    }
  }

  handleSolverError(error) {
    this.appendLog(`Solver error: ${error.message}`, "error")
    this.setStatus("error")
    this.updateProgress(0)
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
      const color = ROUTE_COLORS[index % ROUTE_COLORS.length]

      const coordinates = route.map(point => {
        if (Array.isArray(point) && point.length >= 2) {
          bounds.extend(point)
          return point
        }
        return null
      }).filter(Boolean)

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
        id: sourceId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": color,
          "line-width": 5,
          "line-opacity": 0.9,
        },
      })

      this.activeRouteIds.push(sourceId)
    })

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, { padding: 40, duration: 1100 })
    }
  }

  clearGhostRoutes() {
    if (!this.map || !this.lastRunRoutes) return
    const ghostIds = this.activeRouteIds.filter(id => id.startsWith("ghost"))
    ghostIds.forEach(id => {
      if (this.map.getLayer(id)) this.map.removeLayer(id)
      if (this.map.getSource(id)) this.map.removeSource(id)
    })
  }

  updateMetrics(metrics, elapsedSeconds) {
    const distance = metrics?.total_distance_km ?? metrics?.distance ?? null
    const fleetUsage = metrics?.vehicles_used ?? null
    const violations = metrics?.constraint_violations ?? 0
    const elapsed = elapsedSeconds ?? metrics?.elapsed_seconds ?? null

    this.metricDistanceTarget.textContent = distance != null ? `${this.formatNumber(distance, 1)} km` : "—"
    this.metricElapsedTarget.textContent = elapsed != null ? `${this.formatNumber(elapsed, 1)} s` : "—"
    this.metricFleetTarget.textContent = fleetUsage != null ? `${fleetUsage}` : "—"
    this.metricViolationsTarget.textContent = violations != null ? `${violations}` : "—"
  }

  updateProgress(percent) {
    const value = Math.max(0, Math.min(100, percent))
    this.progressBarTarget.style.width = `${value}%`
    this.progressValueTarget.textContent = `${Math.round(value)}%`
  }

  recordHistory(entry) {
    const timestamp = new Date()
    this.historyEntries.unshift({
      timestamp,
      strategy: entry.config.solverType,
      distance: entry.metrics?.total_distance_km ?? entry.metrics?.distance ?? null,
      runtime: entry.elapsedSeconds,
      routes: entry.routes,
    })
    this.renderHistory()
  }

  renderHistory() {
    if (!this.hasHistoryTarget) return

    if (this.historyEntries.length === 0) {
      this.historyTarget.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">No runs yet. Launch the solver to populate history.</td></tr>`
      return
    }

    this.historyTarget.innerHTML = this.historyEntries
      .map((entry, index) => {
    const distanceText = entry.distance != null ? `${this.formatNumber(entry.distance, 1)} km` : "—"
    const runtimeText = entry.runtime != null ? `${this.formatNumber(entry.runtime, 1)} s` : "—"
        return `
          <tr class="hover:bg-slate-900/60">
            <td class="px-4 py-3">${entry.timestamp.toLocaleTimeString()}</td>
            <td class="px-4 py-3 uppercase tracking-wide">${entry.strategy}</td>
            <td class="px-4 py-3">${distanceText}</td>
            <td class="px-4 py-3">${runtimeText}</td>
            <td class="px-4 py-3">
              <button data-history-index="${index}" class="text-cyan-300 transition hover:text-cyan-100" data-action="vrp#replayHistory">Replay</button>
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
      this.launchLabelTarget.textContent = "Launch Solver"
      this.launchSpinnerTarget.classList.add("hidden")
    }
  }

  setStatus(state) {
    const descriptors = {
      idle: { label: "Idle", badge: "Idle", badgeClass: "bg-slate-700/50 text-slate-300" },
      running: { label: "Running", badge: "Running", badgeClass: "bg-amber-500/20 text-amber-300" },
      success: { label: "Complete", badge: "Complete", badgeClass: "bg-emerald-500/20 text-emerald-300" },
      error: { label: "Attention", badge: "Error", badgeClass: "bg-rose-500/20 text-rose-300" },
    }

    const descriptor = descriptors[state] || descriptors.idle
    this.statusLabelTarget.textContent = descriptor.label
    this.statusBadgeTarget.textContent = descriptor.badge
    this.statusBadgeTarget.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${descriptor.badgeClass}`
  }

  resetConfig() {
    this.vehicleCountTarget.value = this.defaults.vehicleCount
    this.vehicleCapacityTarget.value = this.defaults.vehicleCapacity
    this.maxDistanceTarget.value = this.defaults.maxDistance
    this.solverTypeTarget.value = this.defaults.solverType
    this.locationsInputTarget.value = this.defaults.locations
    this.updateProgress(0)
    this.setStatus("idle")
    this.appendLog("Configuration reset to defaults.", "info")
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
    const delta = (current.distance ?? 0) - (previous.distance ?? 0)
    const direction = delta <= 0 ? "improved" : "regressed"
    this.appendLog(
      `Current run ${direction} by ${this.formatNumber(Math.abs(delta), 2)} km compared to previous.`,
      direction === "improved" ? "success" : "warn",
    )
  }

  clearHistory() {
    this.historyEntries = []
    this.renderHistory()
    this.appendLog("History cleared.", "info")
  }

  replayHistory(event) {
    const index = parseInt(event.target.dataset.historyIndex, 10)
    const entry = this.historyEntries[index]
    if (!entry) return

    this.appendLog(`Replaying run from ${entry.timestamp.toLocaleTimeString()} (${entry.strategy}).`)
    this.renderRoutes(entry.routes)
    this.updateMetrics({ total_distance_km: entry.distance }, entry.runtime)
    this.updateProgress(100)
    this.setStatus("success")
  }

  formatNumber(value, decimals = 1) {
    if (typeof value !== "number" || Number.isNaN(value)) return value
    return Number(value.toFixed(decimals))
  }
}
