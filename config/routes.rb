require "sidekiq/web"
require "digest"

sidekiq_username = ENV.fetch("SIDEKIQ_WEB_USERNAME", "admin")
sidekiq_password = ENV.fetch("SIDEKIQ_WEB_PASSWORD", "password")

Sidekiq::Web.use Rack::Auth::Basic do |username, password|
  secure_compare = ->(provided, expected) do
    ActiveSupport::SecurityUtils.secure_compare(
      ::Digest::SHA256.hexdigest(provided.to_s),
      ::Digest::SHA256.hexdigest(expected.to_s)
    )
  end

  secure_compare.call(username, sidekiq_username) &
    secure_compare.call(password, sidekiq_password)
end

Rails.application.routes.draw do
  resources :benchmarks, only: [:index]

  resources :jobs, only: [:index, :new, :create, :show] do
    post :duplicate, on: :member
  end

  mount Sidekiq::Web => "/sidekiq"
  get "health", to: "application#health"

  get "up" => "rails/health#show", as: :rails_health_check

  root "dashboard#index"
end
