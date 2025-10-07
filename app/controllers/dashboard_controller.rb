class DashboardController < ApplicationController
  def index
    @jobs = Job.recent.limit(5)
    @counts = {
      queued: Job.queued.count,
      running: Job.running.count,
      succeeded: Job.succeeded.count,
      failed: Job.failed.count
    }
  end
end
