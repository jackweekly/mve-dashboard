require "digest"

class ApplicationController < ActionController::Base
  def health
    render json: { status: "ok" }
  end
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern
end
