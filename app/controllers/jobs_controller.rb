class JobsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :create, if: -> { request.format.json? }
  before_action :set_job, only: [:show, :duplicate]

  def index
    @jobs = Job.recent
  end

  def show
  end

  def new
    @job = Job.new(seed: SecureRandom.random_number(10_000))
    @params_json = format_params(@job.params || default_params)
  end

  def create
    @job = Job.new(job_params)
    @job.user = current_user

    if @job.save
      RunJobWorker.perform_async(@job.id)
      respond_to do |format|
        format.turbo_stream
        format.html { redirect_to job_path(@job), notice: "Job was successfully queued." }
        format.json { render json: { id: @job.id }, status: :created }
      end
    else
      @params_json = params.dig(:job, :params_json)
      respond_to do |format|
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @job.errors, status: :unprocessable_entity }
      end
    end
  end

  def duplicate
    duplicated_job = @job.dup
    duplicated_job.assign_attributes(
      status: :queued,
      progress: 0,
      external_id: nil,
      user: @job.user
    )
    duplicated_job.params = @job.params.deep_dup if @job.params

    if duplicated_job.save
      duplicated_job.broadcast_status
      RunJobWorker.perform_async(duplicated_job.id)
      redirect_to job_path(duplicated_job), notice: "Job was duplicated and queued."
    else
      redirect_to job_path(@job), alert: duplicated_job.errors.full_messages.to_sentence
    end
  end

  private

  def set_job
    @job = Job.find(params[:id])
  end

  def job_params
    params.require(:job).permit(:problem_type, :solver, :seed).tap do |whitelisted|
      whitelisted[:params] = params.require(:job).fetch(:params, ActionController::Parameters.new).permit!
    end
  end

  def current_user
    User.first # Temporary: Implement proper user authentication and retrieval here.
  end

  def format_params(hash)
    JSON.pretty_generate(hash)
  end

  def default_params
    { "locations" => 10, "vehicle_capacity" => 15 }
  end
end
