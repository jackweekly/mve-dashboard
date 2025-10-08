require "sidekiq/web"
require "digest"

sidekiq_username = ENV.fetch("SIDEKIQ_WEB_USERNAME", "admin")
sidekiq_password = ENV.fetch("SIDEKIQ_WEB_PASSWORD", "password")



Rails.application.routes.draw do
  resources :benchmarks, only: [:index]

  resources :jobs, only: [:index, :new, :create, :show] do
    post :duplicate, on: :member
  end

  mount Sidekiq::Web => "/sidekiq"
  get "health", to: "application#health"

  get "up" => "rails/health#show", as: :rails_health_check

  resources :vrp, only: [:index] do
    post :solve, on: :collection
  end

  root "dashboard#index"
end
