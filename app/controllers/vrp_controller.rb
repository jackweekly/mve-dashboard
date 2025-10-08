class VrpController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:solve]

  def index
  end

  def solve
    params = vrp_params.to_h
    result = PythonClient.solve_vrp(params)
    render json: result
  end

  private

  def vrp_params
    params.require(:vrp).permit(locations: [], demands: [], vehicle_capacity: [], num_vehicles: [], depot: [])
  end
end
