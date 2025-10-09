// app/javascript/controllers/job_submission_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.element.addEventListener("turbo:submit-start", this.handleSubmitStart)
    this.element.addEventListener("turbo:submit-end", this.handleSubmitEnd)
  }

  disconnect() {
    this.element.removeEventListener("turbo:submit-start", this.handleSubmitStart)
    this.element.removeEventListener("turbo:submit-end", this.handleSubmitEnd)
  }

  handleSubmitStart(event) {
    const submitter = event.detail.form.querySelector("[type=\"submit\"]")
    if (submitter) {
      submitter.dataset.originalText = submitter.textContent
      submitter.textContent = submitter.dataset.turboSubmitsWith || "Submitting..."
      submitter.disabled = true
    }
  }

  handleSubmitEnd(event) {
    const submitter = event.detail.form.querySelector("[type=\"submit\"]")
    if (submitter) {
      submitter.textContent = submitter.dataset.originalText
      submitter.disabled = false
    }

    if (!event.detail.success) {
      // Log the error if the submission was not successful
      const logElement = document.getElementById("log")
      if (logElement) {
        const time = new Date().toLocaleTimeString()
        const errorMessage = event.detail.fetchResponse?.response?.statusText || "Unknown error"
        logElement.insertAdjacentHTML("beforeend", `
          <div class="flex items-start gap-2 text-xs text-red-300">
            <span class="text-slate-500">${time}</span>
            <span>Launch failed (${errorMessage}).</span>
          </div>
        `)
      }
    }
  }
}
