module JobsHelper
  def status_badge_class(job)
    case job.status
    when "queued"
      "bg-gray-100 text-gray-700"
    when "running"
      "bg-blue-100 text-blue-700"
    when "succeeded"
      "bg-green-100 text-green-700"
    when "failed"
      "bg-red-100 text-red-700"
    else
      "bg-gray-100 text-gray-700"
    end
  end
end
