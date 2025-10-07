class Job < ApplicationRecord
  include ActionView::RecordIdentifier

  attr_accessor :params_json

  belongs_to :user
  has_one :result, dependent: :destroy

  enum :status, { queued: 0, running: 1, succeeded: 2, failed: 3 }, default: :queued

  validates :problem_type, :solver, presence: true
  validates :progress, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
  validates :seed, numericality: { only_integer: true }, allow_nil: true

  scope :recent, -> { order(created_at: :desc) }

  def broadcast_status
    broadcast_replace_later_to self,
                               target: dom_id(self, :status),
                               partial: "jobs/status",
                               locals: { job: self }

    broadcast_replace_later_to :jobs,
                               target: dom_id(self),
                               partial: "jobs/job_row",
                               locals: { job: self }
  end

  def params_pretty
    JSON.pretty_generate(params || {})
  rescue JSON::GeneratorError
    params.to_s
  end
end
