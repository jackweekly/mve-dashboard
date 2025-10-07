require "ostruct"

# PythonClient encapsulates communication with the optimization engine.
# For now we stub the responses so the Rails UI has a realistic flow while
# the Python service is being developed.
class PythonClient
  DEFAULT_BASE_URL = ENV.fetch("PY_SERVICE_URL", "http://localhost:8000").freeze

  def self.create_job(job)
    new(job).create_job
  end

  def self.fetch_results(job)
    new(job).fetch_results
  end

  def initialize(job)
    @job = job
    @base_url = DEFAULT_BASE_URL
  end

  def create_job
    Rails.logger.info("[PythonClient] POST #{@base_url}/jobs for job ##{@job.id}")
    OpenStruct.new(external_id: "py-#{@job.id}-#{@job.created_at.to_i}")
  end

  def fetch_results(job = @job)
    Rails.logger.info("[PythonClient] GET #{@base_url}/jobs/#{job.external_id || job.id}/results")

    result = job.result || job.build_result
    result.update!(
      metrics: fake_metrics(job),
      artifacts: fake_artifacts(job),
      duration: 1.5,
      cost: 12.34
    )
    result
  end

  private

  def fake_metrics(job)
    random = Random.new(job.id)
    {
      "objective_value" => 1_000 + random.rand(250),
      "iterations" => 20 + random.rand(15),
      "routes" => (job.params || {}).fetch("locations", 1)
    }
  end

  def fake_artifacts(job)
    id = job.external_id || job.id
    [
      {
        "name" => "Solution (JSON)",
        "url" => "#{@base_url}/jobs/#{id}/artifacts/solution.json"
      },
      {
        "name" => "Run log",
        "url" => "#{@base_url}/jobs/#{id}/logs"
      }
    ]
  end
end
