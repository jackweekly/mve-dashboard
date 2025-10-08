import { Controller } from "@hotwired/stimulus"
import mapboxgl from "mapbox-gl"

// Connects to data-controller="vrp"
export default class extends Controller {
  static values = {
    accessToken: String,
  }

  static targets = ["locationsInput", "canvas"]

  connect() {
    mapboxgl.accessToken = this.accessTokenValue

    if (!this.hasCanvasTarget) {
      console.error("vrp controller: missing canvas target")
      return
    }

    this.map = new mapboxgl.Map({
      container: this.canvasTarget,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-74.5, 40],
      zoom: 12,
      pitch: 60,
      bearing: -17.6,
      antialias: true,
    })

    this.map.on("style.load", () => {
      if (!this.map.getSource("mapbox-dem")) {
        this.map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        })
      }

      this.map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 })

      if (!this.map.getLayer("sky")) {
        this.map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun-intensity": 15,
          },
        })
      }
    })
  }

  async solve(event) {
    event.preventDefault()

    const locations = this.locationsInputTarget.value
      .split(/\n/)
      .map(line => {
        const [lat, lng] = line.split(",").map(coord => parseFloat(coord.trim()))
        return [lng, lat]
      })
      .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]))

    if (locations.length === 0) {
      alert("Please enter at least one location.")
      return
    }

    try {
      const response = await fetch("/vrp/solve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content,
        },
        body: JSON.stringify({ vrp: { locations } }),
      })

      const data = await response.json()

      if (data.status === "success") {
        console.log("VRP Solution:", data.routes)
        this.renderRoutes(data.routes)
      } else {
        alert("Error solving VRP: " + data.message)
      }
    } catch (error) {
      console.error("Error:", error)
      alert("An error occurred while communicating with the solver.")
    }
  }

  renderRoutes(locations) {
    if (this.map.getSource("route")) {
      this.map.removeLayer("route")
      this.map.removeSource("route")
    }

    this.map.addSource("route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: locations,
        },
      },
    })

    this.map.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#888",
        "line-width": 8,
      },
    })

    const bounds = new mapboxgl.LngLatBounds()
    for (const coord of locations) {
      bounds.extend(coord)
    }
    this.map.fitBounds(bounds, { padding: 20 })
  }
}
