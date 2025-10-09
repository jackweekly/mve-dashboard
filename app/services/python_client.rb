require "ostruct"
require "net/http"
require "json"

# PythonClient encapsulates communication with the optimization engine.
class PythonClient
  DEFAULT_BASE_URL = ENV.fetch("PY_SERVICE_URL", "http://localhost:8001").freeze

  class << self\n    # Let jobs ask for the normalized payload *without* doing the HTTP call\n    def prepare_payload_for_preview(params)\n      new(nil).prepare_payload(params)\n    end\n\n    def solve_vrp(params)\n      new(nil).solve_vrp(params)\n    end\n  end\n\n  def self.fetch_results(job)\n    new(job).fetch_results_instance\n  end\n\n  def initialize(job)\n    @job = job\n    @base_url = DEFAULT_BASE_URL\n  end\n\n  def solve_vrp(params)\n    uri = URI(\"#{@base_url}/solve_vrp\")\n    http = Net::HTTP.new(uri.host, uri.port)\n\n    payload = prepare_payload(params)  # <-- transform here\n\n    request = Net::HTTP::Post.new(uri.path, \"Content-Type\" => \"application/json\")\n    request.body = payload.to_json\n\n    Rails.logger.info(\"[PythonClient] POST #{uri} with params: #{payload.to_json}\")\n    Turbo::StreamsChannel.broadcast_append_to(\"jobs\",\n      target: \"log\",\n      partial: \"jobs/log_line\",\n      locals: { message: \"POST #{uri} (\#{payload[:locations]&.size || 0} locations)\", level: :info }\n    )\n    response = http.request(request)\n\n    Turbo::StreamsChannel.broadcast_append_to(\"jobs\",\n      target: \"log\",\n      partial: \"jobs/log_line\",\n      locals: { message: \"Python <= \#{response.code} \#{response.message}\", level: response.is_a?(Net::HTTPSuccess) ? :info : :error }\n    )\n    Rails.logger.info(\"[PythonClient] <= \#{response.code} \#{response.message} content-type=\#{response[\'Content-Type\']}\")\n    Rails.logger.info(\"[PythonClient] body: \#{response.body}\")

    unless response.is_a?(Net::HTTPSuccess)
      raise "Python service returned #{response.code}: #{response.body}"
    end

    raw = parse_json(response.body)
    normalize_result(raw)
  rescue => e
    Rails.logger.error("[PythonClient] Error solving VRP: #{e.message}")
    raise
  end

  def fetch_results_instance
    uri = URI("#{@base_url}/results/#{@job.external_id}")
    http = Net::HTTP.new(uri.host, uri.port)
    request = Net::HTTP::Get.new(uri.path)

    Rails.logger.info("[PythonClient] GET #{uri}")
    response = http.request(request)

    Rails.logger.info("[PythonClient] <= #{response.code} #{response.message} content-type=#{response['Content-Type']}")
    Rails.logger.info("[PythonClient] body: #{response.body}")

    unless response.is_a?(Net::HTTPSuccess)
      raise "Python results returned #{response.code}: #{response.body}"
    end

    raw = parse_json(response.body)
    normalize_result(raw)
  rescue => e
    Rails.logger.error("[PythonClient] Error fetching results: #{e.message}")
    raise
  end

  private

  # Convert camelCase -> snake_case, and array coords -> {lat, lng}
  def prepare_payload(p)
    p ||= {}

    # allow both top-level and nested under :params/:'params'
    src = p.is_a?(Hash) ? p : {}
    src = src[:params] || src['params'] || src

    # snake_case keys the Python service likely expects
    mapped = {
      vehicle_count:    src[:vehicleCount]    || src[:vehicle_count]    || src['vehicleCount']    || src['vehicle_count'],
      vehicle_capacity: src[:vehicleCapacity] || src[:vehicle_capacity] || src['vehicleCapacity'] || src['vehicle_capacity'],
      max_distance:     src[:maxDistance]     || src[:max_distance]     || src['maxDistance']     || src['max_distance'],
      solver:           src[:solverType]      || src[:solver]           || src['solverType']      || src['solver'],
      auto_replay:      src[:autoReplay]      || src[:auto_replay]      || src['autoReplay']      || src['auto_replay']
    }.compact

    # locations: accept [[lon,lat], ...] or [{lat:, lng:}, ...] and normalize to [{lat:, lng:}, ...]
    locs = src[:locations] || src['locations'] || []
    locs = Array(locs).map do |pt|
      if pt.is_a?(Array) && pt.size >= 2
        lon, lat = pt
        { lat: lat.to_f, lng: lon.to_f }
      elsif pt.is_a?(Hash)
        {
          lat: (pt[:lat] || pt['lat']).to_f,
          lng: (pt[:lng] || pt['lng'] || pt[:lon] || pt['lon']).to_f
        }
      else
        nil
      end
    end.compact

    mapped[:locations] = locs

    # basic validation so we fail fast with a clear message if something is off
    if mapped[:locations].length < 2
      raise "Prepared payload has < 2 locations; mapped keys=#{mapped.keys.inspect} src_keys=#{src.keys.inspect}"
    end

    mapped
  end

  def parse_json(body)
    return {} if body.nil? || body.strip.empty?
    JSON.parse(body, symbolize_names: true)
  rescue JSON::ParserError => e
    raise "Invalid JSON from Python service: #{e.message} (body=#{body.inspect})"
  end

  # Accepts a Vrp::Result or a Hash with several possible shapes and returns Vrp::Result
  def normalize_result(raw)
    return raw if raw.is_a?(Vrp::Result) || raw.is_a?(::Result)

    h = case raw
        when Hash
          # unwrap common envelopes
          raw[:result] || raw[:data] || raw
        else
          raise TypeError, "Result expected, got #{raw.class}"
        end

    # try multiple common keys the Python service might use
    metrics   = h[:metrics]   || h.dig(:summary, :metrics)
    routes    = h[:routes]    || h[:solutions] || h[:plan]
    waypoints = h[:waypoints] || h[:stops]     || h[:nodes]

    # If literally nothing mapped, raise with keys for fast diagnosis
    if metrics.nil? && routes.nil? && waypoints.nil?
      raise "Unexpected result payload shape. Keys: #{h.keys.inspect} Payload: #{h.inspect}"
    end

    Vrp::Result.new(metrics: metrics, routes: routes, waypoints: waypoints)
  end
end

