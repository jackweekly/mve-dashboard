# frozen_string_literal: true
module LogBroadcaster
  extend ActiveSupport::Concern

  def stream_log(message, level: :info)
    Turbo::StreamsChannel.broadcast_append_to(
      "jobs",
      target: "log",
      partial: "jobs/log_line",
      locals: { message:, level: }
    )
  end
end
