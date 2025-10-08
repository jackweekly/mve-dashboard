require "ostruct"
require "net/http"
require "json"

# PythonClient encapsulates communication with the optimization engine.
class PythonClient
  DEFAULT_BASE_URL = ENV.fetch("PY_SERVICE_URL", "http://localhost:8001").freeze

  def self.solve_vrp(params)
    new(nil).solve_vrp(params)
  end

  def self.fetch_results(job)
    new(job).fetch_results_instance
  end

  def initialize(job)
    @job = job
    @base_url = DEFAULT_BASE_URL
  end

  def solve_vrp(params)
    uri = URI("#{@base_url}/solve_vrp")
    http = Net::HTTP.new(uri.host, uri.port)
    request = Net::HTTP::Post.new(uri.path, { 'Content-Type' => 'application/json' })
    request.body = params.to_json

    Rails.logger.info("[PythonClient] POST \#{uri} with params: \#{params.to_json}")
    response = http.request(request)

    JSON.parse(response.body)
  rescue StandardError => e
    Rails.logger.error("[PythonClient] Error solving VRP: \#{e.message}")
    { "status" => "error", "message" => e.message }
  end

  def fetch_results_instance
    uri = URI("#{@base_url}/results/#{@job.external_id}")
    http = Net::HTTP.new(uri.host, uri.port)
    request = Net::HTTP::Get.new(uri.path)

    Rails.logger.info("[PythonClient] GET \#{uri}")
    response = http.request(request)

    JSON.parse(response.body)
  rescue StandardError => e
    Rails.logger.error("[PythonClient] Error fetching results: \#{e.message}")
    { "status" => "error", "message" => e.message }
  end
end

