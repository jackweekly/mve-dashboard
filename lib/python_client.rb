require 'httparty'

module PythonClient
  BASE_URL = ENV.fetch("PYTHON_SERVICE_URL") { "http://localhost:8000" }

  def self.create_job(job)
    response = HTTParty.post("#{BASE_URL}/jobs",
                             body: job.to_json,
                             headers: { 'Content-Type' => 'application/json' })
    response.parsed_response
  end

  def self.get_job_status(job_id)
    response = HTTParty.get("#{BASE_URL}/jobs/#{job_id}")
    response.parsed_response
  end
end
