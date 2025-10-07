class JobsController < ApplicationController
  def index
    @jobs = Job.all
  end

  def show
    @job = Job.find(params[:id])
  end

  def new
    @job = Job.new
  end

  def create
    @job = Job.new(job_params)
    @job.status = "queued"

    if @job.save
      JobWorker.perform_async(@job.id)
      redirect_to jobs_path, notice: "Job was successfully created."
    else
      render :new
    end
  end

  def duplicate
    @original_job = Job.find(params[:id])
    @job = Job.new(@original_job.attributes.except("id", "created_at", "updated_at"))
    @job.status = "queued"

    if @job.save
      JobWorker.perform_async(@job.id)
      redirect_to jobs_path, notice: "Job was successfully duplicated."
    else
      render :show
    end
  end

  private

  def job_params
    params.require(:job).permit(:problem_type, :params, :solver, :seed)
  end
end