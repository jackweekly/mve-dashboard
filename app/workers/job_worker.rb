class JobWorker
  include Sidekiq::Worker

  def perform(job_id)
    job = Job.find(job_id)
    job.update(status: 'running')

    puts "Calling Python service to create job"
    # response = PythonClient.create_job(job)
    puts "Python service responded: #{response.inspect}"

    # For now, just simulate a long-running job
    sleep 10

    puts "Calling Python service to get job status"
    # status_response = PythonClient.get_job_status(job.id)
    puts "Python service responded with status: #{status_response.inspect}"

    job.update(status: 'succeeded')
  end
end
