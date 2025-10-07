class RunJobWorker
  include Sidekiq::Worker

  sidekiq_options retry: 3

  def perform(job_id)
    job = Job.find(job_id)

    transition(job, status: :running, progress: 5)

    creation = PythonClient.create_job(job)
    transition(job, external_id: creation.external_id, progress: 25)

    3.times do |step|
      pause 0.75
      transition(job, progress: 40 + (step * 15))
    end

    PythonClient.fetch_results(job)
    transition(job, status: :succeeded, progress: 100)
  rescue StandardError => e
    Rails.logger.error("RunJobWorker failure: #{e.class} - #{e.message}")
    Rails.logger.error(e.backtrace.join("\n")) if e.backtrace

    job ||= Job.find_by(id: job_id)
    transition(job, status: :failed) if job&.persisted?
    raise
  end

  private

  def transition(job, attrs)
    sanitized = attrs.dup
    if sanitized.key?(:progress)
      sanitized[:progress] = sanitized[:progress].to_i.clamp(0, 100)
    end

    job.update!(sanitized)
    job.broadcast_status
  end

  def pause(seconds)
    return if Rails.env.test?

    sleep seconds
  end
end
