require "digest"

class ApplicationController < ActionController::Base
  before_action :require_basic_authentication
  skip_before_action :require_basic_authentication, only: [:health]

  def health
    render json: { status: "ok" }
  end
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  private

  def require_basic_authentication
    return if Rails.env.test?

    expected_username = ENV.fetch("BASIC_AUTH_USERNAME", "admin")
    expected_password = ENV.fetch("BASIC_AUTH_PASSWORD", "password")

    authenticate_or_request_with_http_basic do |provided_username, provided_password|
      secure_compare(provided_username, expected_username) &
        secure_compare(provided_password, expected_password)
    end
  end

  def secure_compare(provided, expected)
    ActiveSupport::SecurityUtils.secure_compare(
      ::Digest::SHA256.hexdigest(provided.to_s),
      ::Digest::SHA256.hexdigest(expected.to_s)
    )
  end
end
